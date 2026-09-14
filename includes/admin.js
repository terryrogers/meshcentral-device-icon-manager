(function () {
    'use strict';

    var currentIcons = [];
    var sourceImage = null;
    var busy = false;

    function parentSend(message) {
        if (!window.parent || !window.parent.meshserver) {
            showStatus(false, 'The MeshCentral connection is unavailable. Refresh the page.');
            return false;
        }
        window.parent.meshserver.send(message);
        return true;
    }

    function pluginCommand(pluginaction, values) {
        return parentSend(Object.assign({ action: 'plugin', plugin: 'deviceiconmanager', pluginaction: pluginaction }, values || {}));
    }

    // MeshCentral wraps plugin event payloads in an outer event message.
    // Accept both wrapped and direct forms, including on an already-running server.
    function installParentEventCompatibility() {
        var handler = window.parent && window.parent.pluginHandler && window.parent.pluginHandler.deviceiconmanager;
        if (!handler || handler.__deviceIconManagerEventCompatibility) return;
        ['deviceIconCatalogUpdated', 'deviceIconOperationResult'].forEach(function (name) {
            var original = handler[name];
            if (typeof original !== 'function') return;
            handler[name] = function (message) {
                var payload = message && message.event ? message.event : message;
                return original.call(this, payload || {});
            };
        });
        handler.__deviceIconManagerEventCompatibility = true;
    }

    function showStatus(success, message) {
        var status = document.getElementById('status');
        status.className = success ? 'success' : 'error';
        status.textContent = message;
    }

    function setBusy(value) {
        busy = value;
        document.getElementById('uploadButton').disabled = value;
        document.getElementById('refreshButton').disabled = value;
    }

    function drawContained(image, size) {
        var canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        var context = canvas.getContext('2d');
        context.clearRect(0, 0, size, size);
        var scale = Math.min(size / image.naturalWidth, size / image.naturalHeight);
        var width = Math.max(1, Math.round(image.naturalWidth * scale));
        var height = Math.max(1, Math.round(image.naturalHeight * scale));
        var x = Math.round((size - width) / 2);
        var y = Math.round((size - height) / 2);
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';
        context.drawImage(image, x, y, width, height);
        return canvas;
    }

    function updatePreview() {
        var preview = document.getElementById('iconPreview');
        var context = preview.getContext('2d');
        context.clearRect(0, 0, preview.width, preview.height);
        if (sourceImage) context.drawImage(drawContained(sourceImage, 128), 0, 0);
    }

    function resetUploadForm() {
        document.getElementById('iconName').value = '';
        document.getElementById('iconId').value = 'auto';
        document.getElementById('iconFile').value = '';
        sourceImage = null;
        updatePreview();
    }

    function selectFile(event) {
        var file = event.target.files && event.target.files[0];
        sourceImage = null;
        updatePreview();
        if (!file) return;
        if (file.type !== 'image/png' && !file.name.toLowerCase().endsWith('.png')) {
            showStatus(false, 'Please select a PNG image.');
            event.target.value = '';
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            showStatus(false, 'The source PNG must be 5 MB or smaller.');
            event.target.value = '';
            return;
        }
        var reader = new FileReader();
        reader.onload = function () {
            var image = new Image();
            image.onload = function () { sourceImage = image; updatePreview(); };
            image.onerror = function () { showStatus(false, 'The selected PNG could not be decoded.'); };
            image.src = reader.result;
        };
        reader.onerror = function () { showStatus(false, 'The selected file could not be read.'); };
        reader.readAsDataURL(file);
    }

    function upload() {
        if (busy) return;
        var name = document.getElementById('iconName').value.trim();
        var iconId = document.getElementById('iconId').value;
        if (!name) { showStatus(false, 'Enter a descriptive icon name.'); return; }
        if (!sourceImage) { showStatus(false, 'Select a PNG image.'); return; }

        var selectedId = iconId === 'auto' ? null : Number(iconId);
        var nameKey = name.replace(/\s+/g, ' ').toLowerCase();
        var duplicate = currentIcons.find(function (icon) {
            return icon.id !== selectedId && String(icon.name).replace(/\s+/g, ' ').trim().toLowerCase() === nameKey;
        });
        if (duplicate) {
            showStatus(false, 'An icon named "' + duplicate.name + '" already exists as icon ' + duplicate.id + '.');
            return;
        }

        var png256 = drawContained(sourceImage, 256).toDataURL('image/png');
        var png128 = drawContained(sourceImage, 128).toDataURL('image/png');
        if (png256.length > 700000 || png128.length > 700000) {
            showStatus(false, 'The normalised PNG is too complex. Try a simpler icon image.');
            return;
        }
        setBusy(true);
        if (!pluginCommand('upload', { iconId: iconId, name: name, png256: png256, png128: png128 })) setBusy(false);
    }

    function requestRefresh() {
        if (busy) return;
        setBusy(true);
        if (!pluginCommand('list')) setBusy(false);
    }

    function renameIcon(icon) {
        var name = window.prompt('New name for icon ' + icon.id + ':', icon.name);
        if (name === null) return;
        name = name.trim();
        if (!name) { showStatus(false, 'The icon name cannot be empty.'); return; }
        setBusy(true);
        pluginCommand('rename', { iconId: icon.id, name: name });
    }

    function deleteIcon(icon) {
        if (icon.usage > 0) { showStatus(false, 'Icon ' + icon.id + ' is assigned to ' + icon.usage + ' device(s).'); return; }
        if (!window.confirm('Delete icon ' + icon.id + ' (' + icon.name + ')?')) return;
        setBusy(true);
        pluginCommand('delete', { iconId: icon.id });
    }

    function replaceIcon(icon) {
        document.getElementById('iconId').value = String(icon.id);
        document.getElementById('iconName').value = icon.name;
        document.getElementById('iconFile').focus();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function renderCatalog() {
        var grid = document.getElementById('iconGrid');
        var empty = document.getElementById('emptyState');
        var capacity = document.getElementById('capacity');
        var idSelect = document.getElementById('iconId');
        grid.replaceChildren();
        empty.style.display = currentIcons.length ? 'none' : 'block';
        capacity.textContent = currentIcons.length + ' of 247 custom icon slots used';

        var selectedValue = idSelect.value;
        idSelect.replaceChildren();
        var automatic = document.createElement('option');
        automatic.value = 'auto';
        automatic.textContent = 'Next available automatically';
        idSelect.appendChild(automatic);
        for (var id = 9; id <= 255; id++) {
            var found = currentIcons.find(function (item) { return item.id === id; });
            var option = document.createElement('option');
            option.value = String(id);
            option.textContent = found ? id + ' — replace ' + found.name : String(id);
            idSelect.appendChild(option);
        }
        if (Array.from(idSelect.options).some(function (option) { return option.value === selectedValue; })) idSelect.value = selectedValue;

        currentIcons.forEach(function (icon) {
            var card = document.createElement('article');
            card.className = 'icon-card';
            var image = document.createElement('img');
            image.src = icon.url256;
            image.alt = '';
            var content = document.createElement('div');
            var title = document.createElement('div');
            title.className = 'icon-title';
            title.textContent = icon.name;
            var meta = document.createElement('div');
            meta.className = 'icon-meta';
            meta.textContent = 'Icon ' + icon.id + ' · ' + icon.usage + ' device' + (icon.usage === 1 ? '' : 's');
            var actions = document.createElement('div');
            actions.className = 'icon-actions';

            var replace = document.createElement('button');
            replace.type = 'button'; replace.className = 'secondary'; replace.textContent = 'Replace';
            replace.onclick = function () { replaceIcon(icon); };
            var rename = document.createElement('button');
            rename.type = 'button'; rename.className = 'secondary'; rename.textContent = 'Rename';
            rename.onclick = function () { renameIcon(icon); };
            var remove = document.createElement('button');
            remove.type = 'button'; remove.className = 'danger'; remove.textContent = 'Delete';
            remove.disabled = icon.usage > 0;
            remove.title = icon.usage > 0 ? 'This icon is assigned to devices.' : '';
            remove.onclick = function () { deleteIcon(icon); };

            actions.append(replace, rename, remove);
            content.append(title, meta, actions);
            card.append(image, content);
            grid.appendChild(card);
        });
    }

    window.DeviceIconManagerAdmin = {
        receiveCatalog: function (icons) {
            currentIcons = Array.isArray(icons) ? icons.slice().sort(function (a, b) { return a.id - b.id; }) : [];
            renderCatalog();
            setBusy(false);
        },
        receiveResult: function (success, message) {
            showStatus(success, message);
            if (success && /saved successfully/i.test(message)) resetUploadForm();
            setBusy(false);
        }
    };

    document.getElementById('iconFile').addEventListener('change', selectFile);
    document.getElementById('iconName').addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
            event.preventDefault();
            upload();
        }
    });
    document.getElementById('uploadButton').addEventListener('click', upload);
    document.getElementById('refreshButton').addEventListener('click', requestRefresh);
    var versionBadge = document.querySelector('.version');
    if (versionBadge) versionBadge.textContent = 'v1.0.9';
    installParentEventCompatibility();
    requestRefresh();
})();
