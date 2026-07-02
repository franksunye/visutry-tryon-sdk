# Security Policy

## On-Device Processing

VisuTry is designed with an **on-device-first** privacy contract. Face images, video frames, and landmark data are processed locally in the browser or on the device. By default, no face data is transmitted to any server.

The `PrivacyGuard` API (`@visutry/tryon-core`) enforces this contract at runtime:

- `processOnDeviceOnly: true` — prevents any network transmission of face data
- `allowSnapshotExport: false` — disables screenshot/snapshot functionality
- `redactLandmarks: true` — strips raw landmark coordinates from results

## Reporting a Vulnerability

If you discover a security vulnerability in VisuTry SDK, please report it responsibly:

1. **Do not** open a public GitHub issue
2. Email security@visutry.com with a description of the vulnerability and reproduction steps
3. You will receive an acknowledgment within 48 hours
4. We will investigate and provide a fix timeline within 7 days

## Scope

The following are considered security vulnerabilities:

- Bypass of the `PrivacyGuard` on-device-only contract
- Unauthorized access to camera streams or face data
- XSS vectors in the SDK's canvas or DOM rendering
- Supply chain risks (dependency vulnerabilities with known CVEs)

The following are **not** security vulnerabilities:

- Issues with the WeChat Mini Program adapter (experimental, not production-ready)
- Performance issues or feature requests
- Questions about usage (use GitHub Discussions)

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.2.x   | Yes       |
| < 0.2   | No        |
