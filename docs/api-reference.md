# VisuTry SDK API reference

This reference is generated from the public exports of the SDK source. Use the module navigation to
inspect classes, functions, interfaces, and types. It covers core, Web, recommender, and the
experimental WeChat adapter.

## Choose an entry point

| Module                  | Purpose                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------- |
| `@visutry/tryon-core`   | Shared geometry, classification, pose, quality, manifests, and contracts.             |
| `@visutry/tryon-web`    | Browser camera, MediaPipe tracking, Three.js rendering, photo analysis, and overlays. |
| `@visutry/recommender`  | Rule-based inventory ranking and heuristic sizing.                                    |
| `@visutry/tryon-wechat` | Experimental WeChat adapters with a separate facade and incomplete AR rendering.      |

For Web, construct the SDK with `createVisuTryWebSDK`. For photo-only analysis, use
`createVisuTryImageAnalyzer` from `@visutry/tryon-web/analyzer`. WeChat's `createWechatSDK` has a
different method set; it is not interchangeable with the Web facade.

## Read before integrating

- [Getting started](https://github.com/franksunye/visutry-tryon-sdk/blob/main/docs/getting-started.md)
- [Web integration](https://github.com/franksunye/visutry-tryon-sdk/blob/main/docs/web-integration.md)
- [WeChat scope and limitations](https://github.com/franksunye/visutry-tryon-sdk/blob/main/docs/wechat-integration.md)
- [Privacy defaults and enforcement limits](https://github.com/franksunye/visutry-tryon-sdk/blob/main/docs/privacy.md)
- [Architecture and shared-core contract](https://github.com/franksunye/visutry-tryon-sdk/blob/main/docs/architecture.md)
- [Current application adoption](https://github.com/franksunye/visutry-tryon-sdk/blob/main/docs/integration-status.md)
- [Complete documentation index](https://github.com/franksunye/visutry-tryon-sdk/blob/main/docs/README.md)

These pages describe repository source. Published npm packages can differ from `main`; inspect the
matching tag and installed declarations before using a new API. Generated documentation is not
evidence of package publication, application deployment, or physical-device acceptance.

Confidence and size estimates are heuristic. Privacy helpers cannot sandbox host code, and the
current Web default permits snapshots. Refer to the guides for behavior and limitations that are not
expressed by TypeScript signatures alone.
