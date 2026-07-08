# VisuTry Try-On SDK Product Positioning

**Status:** Active positioning document  
**Created:** 2026-07-08  
**Owner:** Product / Engineering  
**Review cadence:** Monthly, or when SDK scope changes  
**Scope:** Role of `visutry-tryon-sdk` within the broader VisuTry product system.

---

## 1. Purpose

This document defines what the VisuTry Try-On SDK is, what it owns, and what it should not own.

The SDK is part of the broader VisuTry product system. It is not a separate commercial product platform.

Working model:

> The SDK is the reusable eyewear intelligence and try-on capability layer behind VisuTry.

---

## 2. Relationship to VisuTry

VisuTry is the product platform and commercial system.

The SDK powers reusable capabilities used by VisuTry Web, VisuTry Mobile, future mini-program surfaces, and future merchant / widget flows.

Short version:

```text
VisuTry             = product platform and commercial system
VisuTry Try-On SDK  = reusable face, recommendation, and try-on capability layer
VisuTry Mobile      = camera-first mobile surface using platform APIs and SDK capabilities
```

---

## 3. What the SDK Owns

The SDK should own stable, reusable, platform-aware capability primitives.

Current and intended ownership:

- face geometry types and utilities;
- MediaPipe / landmark integration;
- face-shape analysis algorithm;
- geometric measurements and ratios;
- confidence scoring;
- landmark mesh overlays;
- glasses recommendation logic;
- normalized glasses asset manifest;
- AR glasses try-on rendering;
- pose solving;
- smoothing and quality gating;
- Web / H5 adapter;
- WeChat Mini Program adapter;
- testable algorithmic behavior shared across product surfaces.

The SDK should be narrow and excellent.

It should focus on:

```text
face analysis + eyewear recommendation + AR / try-on capability
```

---

## 4. What the SDK Does Not Own

The SDK should not own the commercial system.

Out of scope:

- user authentication;
- user accounts;
- Stripe payments;
- credits and quota logic;
- product pricing;
- SEO pages;
- blog/content strategy;
- dashboard history;
- merchant dashboard;
- lead capture;
- B2B pilot workflow;
- product roadmap priority;
- customer support flow;
- app-store / Shopify / WooCommerce commercial distribution.

Those belong to the main VisuTry platform or future platform-specific products.

---

## 5. Primary Consumers

The SDK should serve these consumers:

| Consumer | How it uses the SDK |
| --- | --- |
| VisuTry Web | Face shape detector, local / on-device analysis, possible future recommendation and AR capability. |
| VisuTry Mobile | Camera-first face analysis, mobile try-on, future mini-program adaptation. |
| Future WeChat Mini Program | Uses platform-neutral core plus WeChat adapter. |
| Future Store / Widget | May use SDK capabilities for local face analysis, recommendation, and try-on where appropriate. |
| External developers | Possible later audience if the SDK is intentionally packaged and documented for public use. |

---

## 6. Product Principles

### 6.1 On-device first

Face images, video frames, and landmarks should stay on device by default.

If a product surface uploads images to the VisuTry platform for generation or storage, that behavior should be explicit and owned by that product surface, not hidden inside the SDK.

### 6.2 Core / adapter separation

Core algorithmic logic should remain platform-independent.

Adapters should handle platform-specific APIs such as browser camera, canvas, WebGL, WeChat runtime, or mobile shell constraints.

### 6.3 Numerical consistency

Where VisuTry Web and Mobile use the SDK for face analysis, results should remain consistent enough for product decisions and user trust.

Breaking changes to face-shape scoring, geometry definitions, or recommendation rules should be versioned and documented.

### 6.4 Capability, not business workflow

The SDK should expose capabilities. It should not decide commercial workflow.

For example:

- SDK can analyze a face shape.
- SDK should not decide whether the user has enough credits.
- SDK can recommend frames based on geometry and preferences.
- SDK should not decide how a merchant lead is captured.

---

## 7. Interface Direction

The SDK should expose capabilities in a way that can be used by Web, Mobile, and future platform adapters.

Representative capability groups:

```text
analyzeFaceShape()
extractFaceGeometry()
recommendFrames()
startTryOn()
loadGlasses()
snapshot()
renderLandmarks()
```

Future capability direction may include:

```text
compareFrameFit()
scoreFrameForFace()
normalizeFrameManifest()
validateFrameAsset()
```

Do not add account, billing, payment, or merchant concepts into SDK APIs.

---

## 8. Integration with Main Platform

The main VisuTry platform may call or embed SDK capabilities, but platform-owned concerns should stay in the platform.

| Concern | Owner |
| --- | --- |
| Face geometry algorithm | SDK |
| Face-shape scoring | SDK |
| AR rendering | SDK |
| Credits / quota | Main platform |
| Stripe checkout | Main platform |
| Saved history | Main platform |
| Merchant validation | Main platform |
| SEO/GEO | Main platform |
| Mobile camera UX | Mobile app |

---

## 9. Roadmap Boundaries

### Near term

- Keep SDK focused on face geometry, face analysis, recommendation, AR try-on, and platform adapters.
- Maintain test coverage and API stability.
- Ensure VisuTry Web and Mobile can consume the same stable capabilities.

### Medium term

- Improve recommendation and frame asset validation.
- Align SDK outputs with VisuTry product surfaces and reports.
- Support mini-program adaptation through clean adapter boundaries.

### Long term

- Consider public developer-facing SDK packaging only after internal product surfaces prove stable usage.
- Avoid over-expanding into business workflows that belong to VisuTry platform or merchant products.

---

## 10. Related Repositories

- `franksunye/VisuTry` — main product platform and commercial source of truth.
- `franksunye/visutry-mobile` — camera-first mobile surface using platform APIs and SDK capabilities.

---

## 11. Change Log

| Date | Change |
| --- | --- |
| 2026-07-08 | Created SDK product positioning and scope boundary document. |
