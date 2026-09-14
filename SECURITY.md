# Security Policy

## Supported Version

Security fixes are prepared for the current version, 1.0.9. Earlier retained
packages are historical evidence and should not be assumed to receive fixes.

## Reporting A Vulnerability

Use GitHub's private vulnerability-reporting or Security Advisory interface for
this repository when it is available. Include the affected version, impact,
reproduction conditions and the smallest safe proof needed to understand the
problem.

Do not disclose exploit details, credentials, MeshCentral configuration,
private hostnames, URLs, addresses, device data or filesystem paths in a public
issue. If GitHub does not offer a private reporting option, open a minimal public
issue asking the maintainer to establish a private contact channel without
including vulnerability details.

Receipt and remediation times are not guaranteed. A report will be assessed
against the current source and supported MeshCentral version range before a fix
or release is promised.

## Security Boundaries

- Icon management requires full-administrator access or the delegated
  `manage_device_icons` plugin permission.
- Image payloads must be PNG data at the expected 256×256 and 128×128 sizes and
  within the enforced payload limit.
- Runtime catalogue and source images are installation data and must not be
  committed or attached to public reports.
- Operators remain responsible for MeshCentral authentication, authorization,
  backups, TLS, updates and host security.
