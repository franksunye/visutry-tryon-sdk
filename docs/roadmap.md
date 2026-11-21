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

## 2. Develop and qualify the SDK independently

- **Priority:** Current development phase
- **Owner:** SDK maintainers
- **Decision:** The stable main-site algorithms remain unchanged. Existing-site work focuses on
  operations and access/visitor improvements; it does not include SDK replacement.

The 0.3.0 implementation and local compatibility evidence are recorded in
[integration status](integration-status.md#030-implementation-and-migration-gate).
The candidate main-site adapter is retained only as assessment material; its PR
was closed without merging. There is no active cutover schedule.

1. Refine detection/geometry/analysis quality and explicit rejected-result behavior using
   reproducible fixtures, representative images and named runtime/device conditions.
2. Stabilize public contracts, versioned behavior, lifecycle handling and package installation.
3. Improve standalone examples and documentation so developers and brands can integrate the
   supported capabilities without relying on the VisuTry main application.
4. Demonstrate reuse in isolated examples or separately approved prototypes. Do not use a stable
   production application as the default test vehicle.
5. Record integration effort, runtime/bundle impact, maintenance cost, working adoption and
   relevant discovery/referral evidence. Repository traffic or passing tests alone is insufficient.

After a period of independent development, assess whether measured quality and reuse benefits
justify migration cost and risk. A main-site replacement/cutover plan comes only after that
assessment and an explicit owner decision. That later plan must cover compatibility, staged
acceptance, observation and rollback under the [architecture contract](architecture.md#completion-criteria).
No SDK algorithm change is automatically backported to the main site.

## 3. Make Mobile consumption reproducible

- **Priority:** Later, following standalone qualification and a separately approved integration
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
