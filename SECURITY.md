# Security policy

## Processing and privacy boundary

The SDK's implemented face-processing paths run locally. The SDK does not implement a transport
that uploads face images, frames, landmarks, or geometry. Model/WASM downloads and glasses-asset
requests still use the network unless those assets are already locally available.

`PrivacyGuard` is a policy helper, not a network sandbox. Its upload-policy methods return `false`,
but it cannot intercept arbitrary requests made by a host application or remove data the application
already received. The current Web facade enforces its snapshot permission check. It does not expose
a public `sdk.privacy` property, and there is no `redactLandmarks` option.

Current defaults are:

- `processOnDeviceOnly: true`;
- `allowSnapshotExport: true`;
- `allowAnalytics: false`;
- `analyticsLevel: "none"`.

Set `allowSnapshotExport: false` when constructing the Web SDK if exports must be blocked. The
image analyzer returns landmarks to its caller, and WeChat does not share the Web facade's privacy
configuration. Host applications own consent, access to returned data, uploads, logs, and retention.
See [the privacy guide](docs/privacy.md) for exact behavior and enforcement limits.

## Reporting a vulnerability

Email **security@visutry.com** with a description, affected package/source revision, impact, and a
minimal reproduction. Do not post an undisclosed vulnerability or private face data in a public
issue. Maintainers will assess the report and coordinate the response and disclosure.

Relevant reports include camera access outside the documented lifecycle, unintended data
transmission, bypass of an implemented export restriction, asset-loading vulnerabilities, and
exploitable dependency problems. Reports are welcome for every package, including experimental
adapters; experimental status is not a reason to ignore a security defect.

For ordinary usage questions, feature requests, and performance reports, use
[GitHub Issues](https://github.com/franksunye/visutry-tryon-sdk/issues).

## Version scope

The repository currently develops the 0.2.x package line. Include the exact package version and,
when using repository source, the full commit SHA in a report. An old version may require an upgrade;
a version number alone does not establish that a security fix has been published or adopted.

## Dependencies and assets

Use locked dependencies and verified asset provenance. Preserve third-party licenses and notices.
Do not disable TLS or integrity checks to make runtime/model loading succeed. Consult the
[reference-release procedure](docs/SDK_REFERENCE_RELEASE.md) when replacing shipped runtime assets.
