# Device Icon Manager

A MeshCentral plugin for managing additional device icons numbered 9 through 255.

Current version: **1.0.9**

## Features

- Full-administrator management page under **My Server > Plugins**.
- PNG upload with browser-side normalisation to transparent 256x256 and 128x128 images.
- Automatic allocation of the next available ID or explicit replacement by ID.
- Device usage counts and deletion protection.
- Persistent assets in the MeshCentral web override.
- Classic and modern MeshCentral interface support.

## Storage

The catalogue and source images are stored beneath the plugin directory in
`meshcentral-data/plugins/deviceiconmanager/data`. Published images are copied to
the persistent `meshcentral-web/public` override using the filenames expected by
MeshCentral.

## Compatibility

Requires MeshCentral 1.2.5 or later. MeshCentral plugins are community
extensions; verify the management page and both icon selectors after MeshCentral
upgrades.

## Installation

1. Download the ZIP asset for the required release.
2. Extract it into the MeshCentral plugins directory so that `config.json` and
   `deviceiconmanager.js` are directly inside the `deviceiconmanager` plugin
   directory.
3. Restart MeshCentral using the normal service-management procedure for the
   installation.
4. Sign in as a full administrator and open **My Server > Plugins > Device Icon
   Manager**.
5. Confirm that the catalogue loads before uploading an icon.

Preserve the plugin's `data` directory during upgrades. It contains the icon
catalogue and source PNG files. Back up the MeshCentral data and web-override
locations before replacing an installed copy.

## Configuration And Permissions

The plugin has no embedded deployment endpoint or credential. Runtime paths are
provided by MeshCentral. Full administrators may manage icons automatically.
Other users require the delegated `manage_device_icons` plugin permission.

The plugin stores private working data in `data/` and publishes the active 256px
and 128px PNG files into MeshCentral's persistent web override. Do not add the
runtime `data/` directory to a source checkout or release package.

## Usage

- Upload a PNG of up to 5 MB. The browser normalises it to transparent 256×256
  and 128×128 images.
- Choose **Next Available Automatically** or replace a specific ID from 9 to
  255.
- Names must be unique after case and whitespace normalisation.
- An icon cannot be deleted while any device uses it.

## Testing

Run the self-contained Node.js test suite from the repository root:

```powershell
node tests\test.js
```

The test creates an isolated temporary MeshCentral-like directory, exercises
permission, upload, duplicate-name, replacement and deletion behavior, and
removes the temporary directory when it finishes.

Syntax-check the JavaScript files before packaging:

```powershell
node --check deviceiconmanager.js
node --check includes\admin.js
node --check tests\test.js
```

## Packaging

Release ZIPs contain these paths at archive root:

```text
config.json
deviceiconmanager.js
LICENSE
README.md
SECURITY.md
changelog.md
includes/admin.css
includes/admin.js
tests/test.js
views/admin.handlebars
```

Exclude runtime data, temporary files, dependency folders, local control files
and repository metadata. After creating an archive, inspect its file list,
extract it to a temporary directory, rerun the test suite from that directory,
scan its complete contents for secrets and private infrastructure references,
and record a SHA-256 checksum.

## Version History

The retained changelog and package metadata identify built versions 1.0.0
through 1.0.8. Version 1.0.9 is the first MIT-licensed, sanitized public build.
See [changelog.md](changelog.md) for the evidence-backed feature history.
Historical release dates and Git provenance are not asserted because the
surviving files do not establish them.

## Security

See [SECURITY.md](SECURITY.md) for supported-version and private-reporting
guidance. Do not publish credentials, MeshCentral configuration, runtime data,
private URLs, local paths or device information in an issue.

## Licence

This project is licensed under the MIT License. See [LICENSE](LICENSE).
