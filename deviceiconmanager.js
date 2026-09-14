/**
 * Device Icon Manager for MeshCentral.
 * Copyright (c) 2026 The Tech Wizard.
 * SPDX-License-Identifier: MIT
 */
"use strict";

module.exports.deviceiconmanager = function (parent) {
    const obj = {};
    const PLUGIN = 'deviceiconmanager';
    const MIN_ICON_ID = 9;
    const MAX_ICON_ID = 255;
    const MAX_PNG_BYTES = 512 * 1024;
    const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

    obj.parent = parent;
    obj.meshServer = parent.parent;
    obj.fs = require('fs');
    obj.path = require('path');
    obj.dataPath = obj.path.join(__dirname, 'data');
    obj.sourcePath = obj.path.join(obj.dataPath, 'icons');
    obj.catalogPath = obj.path.join(obj.dataPath, 'catalog.json');
    obj.webOverridePath = obj.meshServer.webPublicOverridePath || null;
    obj.exports = ['onWebUIStartupEnd', 'deviceIconCatalogUpdated', 'deviceIconOperationResult'];

    function installPermissionDatabaseCompatibility() {
        const db = obj.meshServer.db;
        if (!db || (typeof db.getPluginPermissions === 'function' && typeof db.setPluginPermissions === 'function')) return;
        const connectionOptions = obj.meshServer.args && obj.meshServer.args.mariadb;
        if (!connectionOptions) return;

        const modulePath = require.resolve('mariadb', { paths: [obj.path.dirname(require.main.filename)] });
        const mariadb = require(modulePath);
        obj.permissionDatabasePool = mariadb.createPool(Object.assign({}, connectionOptions, { connectionLimit: 2 }));

        db.getPluginPermissions = function (pluginName, callback) {
            const id = 'pluginpermission//' + pluginName;
            obj.permissionDatabasePool.query('SELECT doc FROM pluginpermissions WHERE id = ?', [id]).then(function (rows) {
                if (!rows || rows.length === 0 || !rows[0].doc) { callback(null, []); return; }
                let doc = rows[0].doc;
                if (Buffer.isBuffer(doc)) doc = doc.toString('utf8');
                if (typeof doc === 'string') doc = JSON.parse(doc);
                callback(null, [doc]);
            }).catch(function (error) { callback(error, []); });
        };

        db.setPluginPermissions = function (pluginName, data, callback) {
            const id = 'pluginpermission//' + pluginName;
            const document = Object.assign({}, data);
            delete document._id;
            obj.permissionDatabasePool.query(
                'INSERT INTO pluginpermissions (id, doc) VALUES (?, ?) ON DUPLICATE KEY UPDATE doc = VALUES(doc)',
                [id, JSON.stringify(document)]
            ).then(function () { if (callback) callback(null); }).catch(function (error) { if (callback) callback(error); });
        };
    }

    installPermissionDatabaseCompatibility();
    if (typeof obj.parent.registerPermissions === 'function') {
        obj.parent.registerPermissions(PLUGIN, {
            manage_device_icons: {
                title: 'Manage device icons',
                desc: 'Upload, replace, rename, and delete global custom device icons.',
                default: 'denied'
            }
        });
    }

    function ensureDirectories() {
        obj.fs.mkdirSync(obj.sourcePath, { recursive: true });
        if (obj.webOverridePath) {
            obj.fs.mkdirSync(obj.path.join(obj.webOverridePath, 'images'), { recursive: true });
            obj.fs.mkdirSync(obj.path.join(obj.webOverridePath, 'images', 'notify'), { recursive: true });
        }
    }

    function defaultCatalog() {
        return { schemaVersion: 1, updated: new Date().toISOString(), icons: [] };
    }

    function loadCatalog() {
        try {
            const parsed = JSON.parse(obj.fs.readFileSync(obj.catalogPath, 'utf8'));
            if (!parsed || !Array.isArray(parsed.icons)) return defaultCatalog();
            parsed.icons = parsed.icons.filter(function (icon) {
                return Number.isInteger(icon.id) && icon.id >= MIN_ICON_ID && icon.id <= MAX_ICON_ID && typeof icon.name === 'string';
            });
            parsed.icons.sort(function (a, b) { return a.id - b.id; });
            return parsed;
        } catch (ex) {
            return defaultCatalog();
        }
    }

    function saveCatalog(catalog) {
        catalog.schemaVersion = 1;
        catalog.updated = new Date().toISOString();
        catalog.icons.sort(function (a, b) { return a.id - b.id; });
        const tempPath = obj.catalogPath + '.tmp';
        obj.fs.writeFileSync(tempPath, JSON.stringify(catalog, null, 2) + '\n', { mode: 0o600 });
        obj.fs.renameSync(tempPath, obj.catalogPath);
    }

    function isFullAdmin(user) {
        if (!user) return false;
        return user.siteadmin === 0xFFFFFFFF || user.siteadmin === -1 || Number(user.siteadmin) === 4294967295;
    }

    function canManageIcons(user) {
        if (isFullAdmin(user)) return true;
        if (!user || typeof obj.parent.checkPluginPermission !== 'function') return false;
        try { return obj.parent.checkPluginPermission(user, PLUGIN, 'manage_device_icons') === true; } catch (ex) { return false; }
    }

    function cleanName(value) {
        if (typeof value !== 'string') return null;
        const name = value.replace(/[\u0000-\u001F\u007F]/g, '').trim();
        if (name.length < 1 || name.length > 64) return null;
        return name;
    }

    function normalizedName(value) {
        return String(value).replace(/\s+/g, ' ').trim().toLowerCase();
    }

    function ensureUniqueName(catalog, name, excludeId) {
        const key = normalizedName(name);
        const duplicate = catalog.icons.find(function (icon) {
            return icon.id !== excludeId && normalizedName(icon.name) === key;
        });
        if (duplicate) throw new Error('An icon named "' + duplicate.name + '" already exists as icon ' + duplicate.id + '.');
    }

    function parseIconId(value, allowAuto) {
        if (allowAuto && (value === null || value === undefined || value === '' || value === 'auto')) return null;
        const id = Number(value);
        if (!Number.isInteger(id) || id < MIN_ICON_ID || id > MAX_ICON_ID) return false;
        return id;
    }

    function decodePng(dataUrl, expectedSize) {
        if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/png;base64,')) throw new Error('Only PNG image data is accepted.');
        const encoded = dataUrl.substring('data:image/png;base64,'.length);
        if (encoded.length < 16 || encoded.length > Math.ceil(MAX_PNG_BYTES * 4 / 3) + 8 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
            throw new Error('The PNG data is invalid or too large.');
        }
        const buffer = Buffer.from(encoded, 'base64');
        if (buffer.length > MAX_PNG_BYTES || buffer.length < 24 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('The uploaded file is not a valid PNG.');
        if (buffer.toString('ascii', 12, 16) !== 'IHDR') throw new Error('The PNG header is invalid.');
        const width = buffer.readUInt32BE(16);
        const height = buffer.readUInt32BE(20);
        if (width !== expectedSize || height !== expectedSize) throw new Error('Expected a ' + expectedSize + 'x' + expectedSize + ' PNG.');
        return buffer;
    }

    function sourceFile(id, size) {
        return obj.path.join(obj.sourcePath, 'icon-' + id + '-' + size + '.png');
    }

    function publishedFile(id, size) {
        if (!obj.webOverridePath) return null;
        if (size === 256) return obj.path.join(obj.webOverridePath, 'images', 'icons256-' + id + '-1.png');
        return obj.path.join(obj.webOverridePath, 'images', 'notify', 'icons128-' + id + '.png');
    }

    function atomicWrite(filePath, buffer) {
        const tempPath = filePath + '.tmp';
        obj.fs.writeFileSync(tempPath, buffer, { mode: 0o644 });
        obj.fs.renameSync(tempPath, filePath);
    }

    function publishIcon(id) {
        if (!obj.webOverridePath) throw new Error('MeshCentral web override storage is unavailable.');
        for (const size of [256, 128]) {
            const source = sourceFile(id, size);
            if (!obj.fs.existsSync(source)) throw new Error('The source image for icon ' + id + ' is missing.');
            atomicWrite(publishedFile(id, size), obj.fs.readFileSync(source));
        }
    }

    function unpublishIcon(id) {
        for (const size of [256, 128]) {
            for (const filePath of [sourceFile(id, size), publishedFile(id, size)]) {
                if (filePath && obj.fs.existsSync(filePath)) obj.fs.unlinkSync(filePath);
            }
        }
    }

    function publishAll() {
        const catalog = loadCatalog();
        for (const icon of catalog.icons) {
            try { publishIcon(icon.id); } catch (ex) { console.log('Device Icon Manager: ' + ex.message); }
        }
    }

    function getUsageCounts(callback) {
        const counts = {};
        obj.meshServer.db.GetAllType('node', function (err, nodes) {
            if (!err && Array.isArray(nodes)) {
                for (const node of nodes) {
                    if (Number.isInteger(node.icon)) counts[node.icon] = (counts[node.icon] || 0) + 1;
                }
            }
            callback(counts);
        });
    }

    function publicCatalog(callback) {
        const catalog = loadCatalog();
        getUsageCounts(function (counts) {
            callback(catalog.icons.map(function (icon) {
                return {
                    id: icon.id,
                    name: icon.name,
                    updated: icon.updated,
                    usage: counts[icon.id] || 0,
                    url256: '/images/icons256-' + icon.id + '-1.png?v=' + encodeURIComponent(icon.updated || ''),
                    url128: '/images/notify/icons128-' + icon.id + '.png?v=' + encodeURIComponent(icon.updated || '')
                };
            }));
        });
    }

    function dispatchToUser(myparent, pluginaction, payload) {
        const event = Object.assign({
            nolog: true,
            action: 'plugin',
            plugin: PLUGIN,
            pluginaction: pluginaction
        }, payload || {});
        obj.meshServer.DispatchEvent([myparent.user._id], obj, event);
    }

    function sendCatalog(myparent, operation) {
        publicCatalog(function (icons) {
            dispatchToUser(myparent, 'deviceIconCatalogUpdated', { icons: icons, operation: operation || null });
        });
    }

    function sendResult(myparent, success, message) {
        dispatchToUser(myparent, 'deviceIconOperationResult', { success: success, message: message });
    }

    obj.server_startup = function () {
        ensureDirectories();
        publishAll();
        console.log('Device Icon Manager v1.0.9 loaded (' + loadCatalog().icons.length + ' custom icon(s)).');
    };

    obj.serveraction = function (command, myparent) {
        if (!command || !myparent || !myparent.user) return;

        if (command.pluginaction === 'list') {
            sendCatalog(myparent);
            return;
        }

        if (!canManageIcons(myparent.user)) {
            sendResult(myparent, false, 'Permission to manage device icons is required.');
            return;
        }

        try {
            if (command.pluginaction === 'upload') {
                const name = cleanName(command.name);
                if (!name) throw new Error('Enter an icon name between 1 and 64 characters.');
                const catalog = loadCatalog();
                let id = parseIconId(command.iconId, true);
                if (id === false) throw new Error('Icon ID must be between 9 and 255.');
                if (id === null) {
                    const used = new Set(catalog.icons.map(function (icon) { return icon.id; }));
                    for (let candidate = MIN_ICON_ID; candidate <= MAX_ICON_ID; candidate++) {
                        if (!used.has(candidate)) { id = candidate; break; }
                    }
                    if (id === null) throw new Error('All custom icon IDs are in use.');
                }

                ensureUniqueName(catalog, name, id);

                const png256 = decodePng(command.png256, 256);
                const png128 = decodePng(command.png128, 128);
                const now = new Date().toISOString();
                atomicWrite(sourceFile(id, 256), png256);
                atomicWrite(sourceFile(id, 128), png128);
                publishIcon(id);

                const existing = catalog.icons.find(function (icon) { return icon.id === id; });
                if (existing) {
                    existing.name = name;
                    existing.updated = now;
                } else {
                    catalog.icons.push({ id: id, name: name, created: now, updated: now });
                }
                saveCatalog(catalog);
                sendResult(myparent, true, 'Icon ' + id + ' saved successfully.');
                sendCatalog(myparent, 'upload');
                return;
            }

            if (command.pluginaction === 'rename') {
                const id = parseIconId(command.iconId, false);
                const name = cleanName(command.name);
                if (id === false || !name) throw new Error('The icon ID or name is invalid.');
                const catalog = loadCatalog();
                const existing = catalog.icons.find(function (icon) { return icon.id === id; });
                if (!existing) throw new Error('Icon ' + id + ' does not exist.');
                ensureUniqueName(catalog, name, id);
                existing.name = name;
                existing.updated = new Date().toISOString();
                saveCatalog(catalog);
                sendResult(myparent, true, 'Icon ' + id + ' renamed.');
                sendCatalog(myparent, 'rename');
                return;
            }

            if (command.pluginaction === 'delete') {
                const id = parseIconId(command.iconId, false);
                if (id === false) throw new Error('The icon ID is invalid.');
                getUsageCounts(function (counts) {
                    try {
                        if ((counts[id] || 0) > 0) throw new Error('Icon ' + id + ' is assigned to ' + counts[id] + ' device(s) and cannot be deleted.');
                        const catalog = loadCatalog();
                        if (!catalog.icons.some(function (icon) { return icon.id === id; })) throw new Error('Icon ' + id + ' does not exist.');
                        unpublishIcon(id);
                        catalog.icons = catalog.icons.filter(function (icon) { return icon.id !== id; });
                        saveCatalog(catalog);
                        sendResult(myparent, true, 'Icon ' + id + ' deleted.');
                        sendCatalog(myparent, 'delete');
                    } catch (ex) {
                        sendResult(myparent, false, ex.message);
                    }
                });
                return;
            }

            throw new Error('Unsupported Device Icon Manager operation.');
        } catch (ex) {
            sendResult(myparent, false, ex.message);
        }
    };

    obj.handleAdminReq = function (req, res, user) {
        if (!canManageIcons(user)) { res.sendStatus(403); return; }
        if (req.query.include === '1' && typeof req.query.path === 'string') {
            const allowed = { 'admin.css': 'text/css', 'admin.js': 'text/javascript' };
            if (!allowed[req.query.path]) { res.sendStatus(404); return; }
            res.type(allowed[req.query.path]);
            res.sendFile(obj.path.join(__dirname, 'includes', req.query.path));
            return;
        }
        res.render(obj.path.join(__dirname, 'views', 'admin'), { pluginVersion: '1.0.9' });
    };

    obj.handleAdminPostReq = function (req, res, user) {
        if (!canManageIcons(user)) { res.sendStatus(403); return; }
        res.status(405).send('Use the authenticated MeshCentral plugin channel.');
    };

    // The functions below are serialized by MeshCentral and execute in the main browser page.
    obj.onWebUIStartupEnd = function () {
        var attempts = 0;
        function requestDeviceIconCatalog() {
            attempts++;
            if ((typeof meshserver !== 'undefined') && meshserver && (meshserver.State === 2)) {
                meshserver.send({ action: 'plugin', plugin: 'deviceiconmanager', pluginaction: 'list' });
                return;
            }
            if (attempts < 120) window.setTimeout(requestDeviceIconCatalog, 250);
        }
        requestDeviceIconCatalog();
    };

    obj.deviceIconCatalogUpdated = function (message) {
        message = (message && message.event) ? message.event : (message || {});
        window.__deviceIconManagerIcons = Array.isArray(message.icons) ? message.icons : [];

        var oldStyle = document.getElementById('deviceIconManagerStyles');
        if (oldStyle) oldStyle.remove();
        var css = '';
        for (var i = 0; i < window.__deviceIconManagerIcons.length; i++) {
            var icon = window.__deviceIconManagerIcons[i];
            var url = String(icon.url256).replace(/["'()\\]/g, '');
            css += '.i' + icon.id + '{background-image:url("' + url + '")!important;background-position:center!important;background-repeat:no-repeat!important;background-size:contain!important;width:50px;height:50px;cursor:pointer;border:0;}';
            css += '.j' + icon.id + '{background-image:url("' + url + '")!important;background-position:center!important;background-repeat:no-repeat!important;background-size:contain!important;width:16px;height:16px;cursor:pointer;border:0;}';
        }
        var style = document.createElement('style');
        style.id = 'deviceIconManagerStyles';
        style.textContent = css;
        document.head.appendChild(style);

        if (!window.__deviceIconManagerSelectorInstalled && typeof window.p10showiconselector === 'function') {
            window.__deviceIconManagerOriginalSelector = window.p10showiconselector;
            window.p10showiconselector = function () {
                window.__deviceIconManagerOriginalSelector.apply(this, arguments);
                window.setTimeout(function () {
                    var anchor = document.querySelector('.i8');
                    if (!anchor || !anchor.parentElement || document.getElementById('deviceIconManagerExtraIcons')) return;
                    var holder = document.createElement('div');
                    holder.id = 'deviceIconManagerExtraIcons';
                    holder.style.cssText = 'display:flex;flex-wrap:wrap;justify-content:center;gap:10px;margin:12px auto 4px;max-width:560px;';
                    var icons = window.__deviceIconManagerIcons || [];
                    for (var x = 0; x < icons.length; x++) {
                        (function (item) {
                            var button = document.createElement('div');
                            button.className = 'i' + item.id;
                            button.tabIndex = 0;
                            button.title = item.name + ' (Icon ' + item.id + ')';
                            button.setAttribute('role', 'button');
                            button.onclick = function () { p10setIcon(item.id); };
                            button.onkeypress = function (event) { if (event.key === 'Enter') p10setIcon(item.id); };
                            holder.appendChild(button);
                        })(icons[x]);
                    }
                    anchor.parentElement.appendChild(holder);
                }, 0);
            };
            window.__deviceIconManagerSelectorInstalled = true;
        }

        var iframe = document.getElementById('p43iframe');
        if (iframe && iframe.contentWindow && iframe.contentWindow.DeviceIconManagerAdmin) {
            iframe.contentWindow.DeviceIconManagerAdmin.receiveCatalog(window.__deviceIconManagerIcons);
        }
    };

    obj.deviceIconOperationResult = function (message) {
        message = (message && message.event) ? message.event : (message || {});
        var iframe = document.getElementById('p43iframe');
        if (iframe && iframe.contentWindow && iframe.contentWindow.DeviceIconManagerAdmin) {
            iframe.contentWindow.DeviceIconManagerAdmin.receiveResult(Boolean(message.success), String(message.message || ''));
        }
    };

    return obj;
};
