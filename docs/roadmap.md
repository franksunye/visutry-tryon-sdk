# SDK roadmap

- **Reviewed:** 2026-11-21
- **Status:** Ordered implementation plan; acceptance evidence determines completion.

The immediate objective is a credible, reusable foundation: accurate documentation, one shared
implementation for local visual rules, reproducible integrations, and explicit platform limits.
This roadmap does not change paid-product access or complete a production migration by itself.

## 1. Establish an accurate documentation baseline

- **Priority:** First
- **Owner:** SDK maintainers
- **Scope:** README, positioning, architecture, integration status, guides, package references, and
  contribution/release instructions.

Completion requires:

- English documentation with a clear entry point and subject ownership.
- Examples that match current exports and actual default behavior.
- Separate descriptions of source, npm release, demo deployment, application adoption, and device
  acceptance.
- Correct privacy, heuristic-sizing, and experimental-platform limitations.
- Checked links and API documentation generation, with any remaining validation limits recorded in
  the change review.

Documentation completion does not change runtime capability or complete the stages below.

## 2. Converge the main site's local detector on the shared core

- **Priority:** Next
- **Owner:** SDK and main-site maintainers
- **Dependency:** The architecture and integration baseline in stage 1.

1. Inventory the two classifiers and warning/geometry definitions at exact revisions.
2. Build a small, representative parity corpus, including boundary and invalid-input cases.
3. Decide each observed mismatch deliberately; do not assume either implementation is correct
   merely because it shipped first.
4. Implement the thin main-site adapter over the versioned SDK core or analyzer entry point,
   choosing the least runtime/bundle impact for the existing application.
5. Remove active duplicate rules after acceptance and record deployed adoption evidence.

Acceptance is defined by [the shared-core contract](architecture.md#completion-criteria): one active
implementation, versioned inputs/outputs, approved behavior, measured load impact, application-path
verification, and a rollback route. Paid AI reports, billing, and hosted image generation remain
outside this migration.

## 3. Make Mobile consumption reproducible

- **Priority:** Alongside or immediately after the shared-core contract is proven
- **Owner:** Mobile and SDK maintainers

- Reconcile the pinned SDK submodule, workspace dependencies, and build instructions into a
  reproducible dependency/release strategy.
- Repair photo-input delivery, the gated analyzer path, and complete result mapping before claiming
  an accepted Mobile integration; see [the source baseline](integration-status.md).
- Keep application translations and UI adapters separate from core scoring; remove duplicated rules
  where they represent the same shared behavior.
- Verify photo and camera flows against the agreed core fixtures and actual supported devices.
- Record exact SDK/application versions and distinguish local development from deployed use.

Completion requires a fresh checkout/build to resolve the intended SDK version and a recorded
application acceptance result. An SDK import alone is not sufficient evidence.

## 4. Qualify the Web AR experience and its assets

- **Priority:** Before claiming production device support or retail fitting readiness
- **Owner:** Web adapter and asset maintainers

- Retain the reproducible reference demo and its real tracker/renderer browser gate.
- Test physical iOS and Android hardware, permission denial, Stop/restart, resource cleanup,
  background/resume, changing lighting, head movement, and snapshot alignment.
- Measure frame time, memory, thermal behavior, and model-loading failure under named conditions.
- Validate real catalog asset provenance, units, anchors, and fit separately from the technical
  reference GLB.

Same-origin reference assets already provide a baseline. A dedicated R2 asset domain is optional
delivery work and must pass integrity, HTTPS, CORS, and browser-load checks before becoming a
dependency. See the [reference-release record](SDK_REFERENCE_RELEASE.md).

## 5. Complete and validate WeChat adaptation

- **Priority:** After shared contracts and platform scope are explicit
- **Owner:** WeChat adapter maintainers

- Verify native landmark mapping and normalization against the shared contract.
- Implement the complete frame-to-tracking-to-pose-to-render loop and real model rendering.
- Define the facade's supported feature subset, lifecycle, snapshot, and privacy behavior.
- Validate in the WeChat runtime and on named physical devices; mocked unit tests are insufficient.

Keep the package marked experimental until these checks pass. A native-app adapter is a separate
future proposal, not a capability provided by the existing WeChat package.

## 6. Grow external adoption from verified use

- **Priority:** Ongoing, with claims limited to accepted capabilities
- **Owner:** SDK maintainers and product owners

- Keep versioned install instructions, examples, release notes, and public API references usable.
- Collect reproducible external integration issues and improve supported paths.
- Track working integrations and relevant referrals before claiming acquisition or SEO/GEO impact.
- Add platform or commercial offerings only after their scope, support requirements, and evidence
  are explicit.

## Updating this plan

Use GitHub issues and pull requests for implementation details. Mark a stage complete only with
links to the accepted change and required evidence; update [integration status](integration-status.md)
for adoption changes. Do not infer dates, production readiness, or package publication from a checked
roadmap item alone.
