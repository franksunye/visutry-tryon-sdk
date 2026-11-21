# Documentation

VisuTry SDK documentation is maintained in English. Start with the topic that matches your task;
the repository source and its exported types are the authority for implemented APIs.

## Start using the SDK

| Document                                                                   | What it answers                                                                                              |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| [Project README](../README.md)                                             | What is this project, what works, and how can I run it?                                                      |
| [Getting started](getting-started.md)                                      | How do I install dependencies, build packages, and choose an entry point?                                    |
| [Web integration](web-integration.md)                                      | How do I handle photo analysis, camera lifecycle, overlays, AR, and errors?                                  |
| [WeChat integration](wechat-integration.md)                                | What can the experimental adapter do, and what is still missing?                                             |
| [Generated API reference](https://franksunye.github.io/visutry-tryon-sdk/) | Which core, Web, recommender, and WeChat APIs are exported? Check the source/tag for your installed version. |

The TypeDoc configuration covers all four public package entry points. WeChat remains experimental;
documenting its types does not establish feature parity with Web. See the
[API reference introduction](api-reference.md) for entry-point guidance.

For upgrading an existing integration, read [Migrating to 0.3.0](migration-0.3.md).
A [standalone shared-core example](../examples/shared-core/README.md) demonstrates the platform-neutral contract.

## Understand behavior

| Document                                            | Authority                                                                                |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| [Face-shape algorithm](face-shape-algorithm.md)     | Geometry interpretation, heuristic scoring, quality limits, and algorithm history.       |
| [Glasses asset standard](glasses-asset-standard.md) | Manifest fields, coordinate conventions, validation, and reference assets.               |
| [Privacy](privacy.md)                               | Actual defaults, data returned to the host, network asset loads, and enforcement limits. |
| [Performance](performance.md)                       | Measurement procedure and implementation tradeoffs; not an unsupported device guarantee. |

## Understand direction and delivery

| Document                                           | Authority                                                                           |
| -------------------------------------------------- | ----------------------------------------------------------------------------------- |
| [Product positioning](product-positioning.md)      | Purpose, audiences, product boundaries, and open-source goals.                      |
| [Architecture](architecture.md)                    | Shared implementation ownership, adapters, compatibility, and migration acceptance. |
| [Integration status](integration-status.md)        | Dated evidence for application adoption and known divergence.                       |
| [Roadmap](roadmap.md)                              | Ordered work, dependencies, and completion criteria.                                |
| [Reference demo release](SDK_REFERENCE_RELEASE.md) | Reproduction, the recorded reference release, and remaining delivery/device checks. |

## Package references

- [Core](../packages/core/README.md)
- [Web](../packages/web/README.md)
- [Recommender](../packages/recommender/README.md)
- [WeChat](../packages/wechat/README.md)
- [Demo assets and provenance](../packages/demo-assets/README.md)

Package changelogs record version history. A package version in source, a successful build, and an
available registry release are different facts. Check the matching tag, package metadata, and
release evidence before depending on a new API.

## Contribute and maintain

- [Contribution guide](../CONTRIBUTING.md): setup, documentation standards, review, and releases.
- [Security policy](../SECURITY.md): private vulnerability reporting and privacy limitations.
- [Code of conduct](../CODE_OF_CONDUCT.md): contributor expectations.
- [Issue tracker](https://github.com/franksunye/visutry-tryon-sdk/issues): bugs and proposals.
- [MIT license](../LICENSE): SDK licensing; bundled assets retain their own terms.

## Keeping documents accurate

Use **implemented** for code that exists, **verified** only with named evidence, **experimental**
for incomplete adapters, and **planned** for work that has not shipped. A statement about another
repository must include its inspected revision. A historical algorithm port is not evidence of
ongoing parity with that application's current production build.

Update the owning document when a capability, default, export, or integration status changes.
Link to that document from other pages instead of maintaining competing inventories. Generated API
files under `docs/api/` are build outputs and must not be edited by hand.
