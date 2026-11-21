# Product positioning

- **Status:** Active product direction
- **Reviewed:** 2026-11-21
- **Owner:** Product and Engineering
- **Scope:** SDK purpose, audiences, capability ownership, and relationship to VisuTry products.

## Purpose

VisuTry SDK is an open-source, reusable visual capability layer for face geometry, local eyewear
recommendation, and AR glasses rendering. It serves VisuTry's own product surfaces and external
developers who need these capabilities in their applications.

The SDK is the intended shared visual foundation of the VisuTry product system. This is an
architectural direction, not a claim that every existing application already imports the SDK.
[Integration status](integration-status.md) records the current adoption evidence.

## Current operating decision: develop the SDK independently

The product owner's 2026-11-21 decision is to preserve the stable main site's
existing algorithms. Main-site work remains focused on operations and improving
access and the visitor experience. SDK development does not authorize an
algorithm rewrite, dependency switch, or automatic backport into that site.

Develop and qualify the SDK independently for a period first: improve analysis
quality, reusable contracts, examples, developer experience and supported adapters.
Then evaluate demonstrated benefits and integration costs. Only after that review
should a separately approved replacement/cutover plan be considered. Passing tests
or reducing code duplication alone is not a decision to migrate a stable product.

Standalone development is compatible with the long-term shared-foundation goal;
it does not create a separate SDK licensing business or require immediate adoption
by existing VisuTry products.

## Relationship to the product platform

VisuTry remains a platform for both consumers and merchants. Consumer products help people discover
and evaluate eyewear; merchant products help businesses present inventory and capture commerce
intent. Both can consume shared visual capabilities while retaining their own product behavior.

| Layer                                           | Responsibility                                                                                                           |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| SDK core and recommender                        | Reusable geometry, classification, quality rules, pose, smoothing, manifest contracts, and generic inventory ranking.    |
| SDK platform adapters                           | Camera and image input, landmark-runtime integration, coordinate normalization, rendering, and platform lifecycle.       |
| Consumer, Mobile, Store, and other applications | User journeys, UI, catalog selection, accessibility, consent, product-specific policies, and calls to platform services. |
| VisuTry platform services                       | Identity, payments, entitlements, saved history, hosted AI requests, merchant tenancy, and commerce workflows.           |

Shared code does not require identical interfaces or commercial offers. Each application owns how
it presents and grants access to a capability; it should not independently reimplement the same
geometry or scoring rule.

## Product boundaries

### Local geometry and paid Face Analysis

The SDK computes geometric features and heuristic face-shape results from local landmarks. Its
generic recommender ranks an inventory supplied by the calling application.

VisuTry's paid Face Analysis / Advisor experience includes platform-owned reports, personalization,
entitlements, and product workflows. Sharing geometry does not authorize exposing a paid report or
moving server prompts, account data, or entitlement rules into the open-source packages. Changes to
free versus paid product access require a separate product decision.

### AR rendering and AI-generated try-on

The SDK's AR path renders a 3D frame against tracked face geometry. Hosted AI image generation uses
separate server workflows and provider integrations. A working AR reference demo does not establish
the reliability, cost, or availability of hosted generation.

### Estimates and physical fit

Geometry confidence and recommendation scores are heuristics. In 0.3.0, physical
sizing rules require explicit measured or calibrated host input; normalized image
geometry does not produce millimeters. These rules are not prescriptions or proof
of physical frame fit. The reference GLB demonstrates the technical pipeline and
is not a digitized retail product.

## Audiences

| Audience                          | Intended value                                                             | Current adoption evidence                                                             |
| --------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| VisuTry Web                       | Reuse shared geometry and analysis through an explicit migration contract. | [Main-site status](integration-status.md).                                            |
| VisuTry Mobile                    | Use browser adapters and shared algorithms in a camera-first application.  | [Mobile status](integration-status.md).                                               |
| WeChat and future app surfaces    | Reuse core rules through platform-specific input and rendering adapters.   | WeChat is experimental; native app adapters are not established by this repository.   |
| Merchant and embedded experiences | Consume visual primitives without duplicating commerce or tenant rules.    | Planned uses, not claims of verified deployment.                                      |
| External developers               | Inspect, build, integrate, and contribute to a documented MIT project.     | Public source and contribution workflow; package and platform limits remain explicit. |

## Open-source and discovery goals

Open-source distribution is a current project goal, supported by the MIT license, public source,
package structure, documentation, and contribution process. It is not deferred until every internal
application has migrated.

Useful examples and accurate technical documentation should help developers and brands discover and
evaluate the project, including through search and AI discovery. These are intended outcomes, not
measured growth claims. SDK adoption, relevant referrals, and working integrations are stronger
evidence than badges or repository traffic alone.

Product landing pages, editorial SEO/GEO work, pricing, and lead conversion remain owned by the
VisuTry applications. This repository owns clear technical content and truthful links to those
products. Publishing documentation does not guarantee rankings, AI citations, or commercial demand.

No separate SDK licensing business model is established by this document. Any future commercial
support or hosted offering must have its own explicit scope and terms.

## Operating principles

1. **One implementation for each SDK rule.** New SDK adapters and approved migrations consume
   core packages. The stable main site's existing implementation remains intentional during the
   standalone phase; an algorithm port is not a completed integration or migration authorization.
2. **Platform-neutral algorithms, platform-specific adapters.** Camera APIs, model loading, canvas,
   and presentation belong at the adapter boundary.
3. **Explicit current state.** Distinguish source availability, automated evidence, deployment,
   package publication, consumer adoption, and physical-device acceptance.
4. **Local processing with honest limits.** The SDK does not upload faces, but it loads runtime
   assets and returns data to its host. Privacy configuration is not a sandbox around host code.
5. **Versioned behavior.** Changes to geometry definitions, thresholds, warnings, or rankings require
   compatibility evidence and release notes.
6. **English documentation.** README files, guides, public API explanations, roadmap entries, and
   project-facing issue and pull-request text use English.

## Execution

The [architecture contract](architecture.md) defines package ownership and shared-core rules.
[Integration status](integration-status.md) records observed state and evidence. The
[roadmap](roadmap.md) sequences the work and defines acceptance criteria. These documents must stay
linked; product aspirations must not silently become claims of shipped integration.

## Revision history

| Date       | Change                                                                                                                    |
| ---------- | ------------------------------------------------------------------------------------------------------------------------- |
| 2026-07-08 | Initial SDK positioning and commercial boundary.                                                                          |
| 2026-11-21 | Clarified shared-core adoption, external open-source use, product boundaries, discovery goals, and evidence-based status. |
