# Changelog

## 1.0.9

- Adopted the MIT License for the project.
- Replaced deployment-specific manifest URLs with the intended public GitHub repository, raw metadata and versioned release-asset locations.
- Expanded installation, permissions, usage, testing, packaging, version-history and security documentation.
- Added public-source ignore rules and responsible vulnerability-reporting guidance.
- Rebuilt the current package from sanitized source while preserving the original historical packages unchanged.

## 1.0.8

- Renamed and rebranded the plugin from Cloud Hub Device Icon Manager to Device Icon Manager across its user interface, manifest, documentation and runtime messages.
- Retained the stable `deviceiconmanager` plugin identifier so existing icons, permissions and upgrades remain compatible.

## 1.0.7

- Wait for the authenticated MeshCentral WebSocket before requesting the custom-icon catalogue.
- Make custom icons available in the device picker immediately after login without first opening the plugin page.

## 1.0.6

- Added a MariaDB compatibility layer for MeshCentral's missing plugin-permission storage methods.
- Added a configurable Manage device icons permission while preserving unconditional full-administrator access.

## 1.0.5

- Pressing Enter in the icon name field now performs the same save action as the Save icon button.

## 1.0.4

- Prevent duplicate icon names using case-insensitive, whitespace-normalised comparison.
- Permit an existing icon to retain its own name when it is replaced or renamed.

## 1.0.3

- Reset the icon name, selected ID, source file, and preview after a successful save.
- Preserve the completed form when a save fails so it can be corrected and retried.

## 1.0.2

- Replaced the checkerboard transparency indicator with a clean preview background.
- Made the administration page display the currently deployed plugin version immediately.

## 1.0.1

- Fixed MeshCentral event-envelope handling so saved icons appear in the management list and operation messages display correctly.

## 1.0.0

- Initial release.
- Supports custom device icon IDs 9 through 255.
- Administrator upload, replacement, rename, and deletion interface.
- Prevents deletion of icons that are assigned to devices.
- Integrates custom icons into classic and modern MeshCentral device selectors.
- Publishes persistent device-detail and browser-notification artwork.
