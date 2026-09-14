"use strict";

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');

function crc32(buffer) {
    let crc = 0xFFFFFFFF;
    for (const byte of buffer) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xEDB88320 : 0);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
    const name = Buffer.from(type, 'ascii');
    const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
    const checksum = Buffer.alloc(4); checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
    return Buffer.concat([length, name, data, checksum]);
}

function makePng(size) {
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const header = Buffer.alloc(13);
    header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4);
    header[8] = 8; header[9] = 6;
    const rows = [];
    for (let y = 0; y < size; y++) {
        const row = Buffer.alloc(1 + (size * 4));
        for (let x = 0; x < size; x++) {
            const p = 1 + (x * 4); row[p] = 23; row[p + 1] = 63; row[p + 2] = 158; row[p + 3] = 255;
        }
        rows.push(row);
    }
    return Buffer.concat([signature, chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
}

function dataUrl(size) { return 'data:image/png;base64,' + makePng(size).toString('base64'); }
function wait(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }

async function main() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deviceiconmanager-'));
    const pluginRoot = path.resolve(__dirname, '..');
    const testPlugin = path.join(root, 'deviceiconmanager');
    fs.cpSync(pluginRoot, testPlugin, { recursive: true, filter: function (source) { return !source.includes(path.sep + 'data' + path.sep); } });

    let nodes = [];
    const events = [];
    const meshServer = {
        webPublicOverridePath: path.join(root, 'web', 'public'),
        db: { GetAllType: function (type, callback) { callback(null, nodes); } },
        DispatchEvent: function (targets, source, event) { events.push(event); }
    };
    let registeredPermissions = null;
    const handler = {
        parent: meshServer,
        registerPermissions: function (pluginName, permissions) { registeredPermissions = { pluginName: pluginName, permissions: permissions }; },
        checkPluginPermission: function (user, pluginName, permission) {
            return user && user._id === 'user/test/delegate' && pluginName === 'deviceiconmanager' && permission === 'manage_device_icons';
        }
    };
    const plugin = require(path.join(testPlugin, 'deviceiconmanager.js')).deviceiconmanager(handler);
    plugin.server_startup();
    assert(registeredPermissions && registeredPermissions.permissions.manage_device_icons);

    const admin = { user: { _id: 'user/test/admin', siteadmin: 4294967295 } };
    const user = { user: { _id: 'user/test/user', siteadmin: 0 } };

    plugin.serveraction({ pluginaction: 'upload', iconId: 'auto', name: 'Network switch', png256: dataUrl(256), png128: dataUrl(128) }, admin);
    await wait(25);
    assert(fs.existsSync(path.join(meshServer.webPublicOverridePath, 'images', 'icons256-9-1.png')));
    assert(fs.existsSync(path.join(meshServer.webPublicOverridePath, 'images', 'notify', 'icons128-9.png')));
    assert(events.some(function (event) { return event.success === true && /saved/.test(event.message); }));

    events.length = 0;
    plugin.serveraction({ pluginaction: 'upload', iconId: 'auto', name: '  network   SWITCH  ', png256: dataUrl(256), png128: dataUrl(128) }, admin);
    assert(events.some(function (event) { return event.success === false && /already exists/.test(event.message); }));

    events.length = 0;
    plugin.serveraction({ pluginaction: 'upload', iconId: 9, name: 'Network switch', png256: dataUrl(256), png128: dataUrl(128) }, admin);
    assert(events.some(function (event) { return event.success === true && /saved/.test(event.message); }));

    events.length = 0;
    plugin.serveraction({ pluginaction: 'upload', iconId: 8, name: 'Bad', png256: dataUrl(256), png128: dataUrl(128) }, admin);
    assert(events.some(function (event) { return event.success === false && /9 and 255/.test(event.message); }));

    events.length = 0;
    plugin.serveraction({ pluginaction: 'upload', iconId: 10, name: 'Forbidden', png256: dataUrl(256), png128: dataUrl(128) }, user);
    assert(events.some(function (event) { return event.success === false && /Permission/.test(event.message); }));

    events.length = 0;
    nodes = [{ icon: 9 }];
    plugin.serveraction({ pluginaction: 'delete', iconId: 9 }, admin);
    await wait(25);
    assert(events.some(function (event) { return event.success === false && /assigned/.test(event.message); }));

    events.length = 0;
    nodes = [];
    plugin.serveraction({ pluginaction: 'delete', iconId: 9 }, admin);
    await wait(25);
    assert(!fs.existsSync(path.join(meshServer.webPublicOverridePath, 'images', 'icons256-9-1.png')));
    assert(events.some(function (event) { return event.success === true && /deleted/.test(event.message); }));

    fs.rmSync(root, { recursive: true, force: true });
    console.log('Device Icon Manager tests passed.');
}

main().catch(function (error) { console.error(error); process.exit(1); });
