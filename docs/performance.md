# Performance and Validation

Performance depends on device, browser, camera stream, model and settings. This repository does not establish guaranteed FPS, memory limits or a supported physical-device range.

The reference gate uses Chromium, real MediaPipe and WebGL with a recorded fake-camera fixture. It verifies selected functional paths, not live-camera quality, sustained phone performance or WeChat rendering. See [Reference Release](./SDK_REFERENCE_RELEASE.md).

## Configuration

| Control                      | Current behavior                     | Assessment                                   |
| ---------------------------- | ------------------------------------ | -------------------------------------------- |
| Camera dimensions/frame rate | Requests browser constraints         | Record actual video size and behavior        |
| `tracker.mode`               | Selects delegate/confidence defaults | Compare on target devices                    |
| Renderer `pixelRatio`        | Controls drawing-buffer resolution   | Compare clarity, latency and memory pressure |
| Renderer `antialias`         | Set at renderer construction         | Compare edge quality and cost                |
| Model geometry/textures      | Loaded by the renderer               | Measure startup and sustained work           |
| Pose smoothing               | Filters pose changes                 | Compare jitter and lag with repeatable input |

Live-tracker defaults:

| Mode           | Delegate | Detection / presence / tracking confidence |
| -------------- | -------- | ------------------------------------------ |
| `realtime`     | GPU      | 0.4 / 0.4 / 0.4                            |
| `balanced`     | GPU      | 0.5 / 0.5 / 0.5                            |
| `batterySaver` | CPU      | 0.5 / 0.5 / 0.5                            |

The image-only path creates a separate IMAGE-mode tracker using its configured mode. `createVisuTryImageAnalyzer()` constructs it in `balanced` mode, so its current default delegate is GPU. That factory accepts asset/mapping options, not a tracking-mode option.

There is no public facade runtime mode setter or FPS limiter. To change construction settings, destroy and recreate the instance. An adaptive host policy should use sustained measurements and avoid repeated restarts.

`TrackerConfig.worker` and `RenderOptions.maxTextureSize` exist in types, but the current adapter does not implement a worker pipeline or automatic texture resizing from those fields.

## Local statistics

```ts
import type { PerformanceStats, VisuTrySDK } from "@visutry/tryon-core";

export function observePerformance(sdk: VisuTrySDK, onSample: (stats: PerformanceStats) => void) {
  sdk.on("performanceUpdated", onSample);
  return () => sdk.off("performanceUpdated", onSample);
}
```

`getPerformanceStats()` returns the same shape on demand:

| Field               | Meaning                                              |
| ------------------- | ---------------------------------------------------- |
| `fps`               | Frame timestamp rate over up to 60 recent samples    |
| `detectLatencyMs`   | Mean of up to 60 recent detection durations          |
| `renderLatencyMs`   | Mean of up to 60 recent render-call durations        |
| `trackingLostCount` | Count tracked by this instance                       |
| `mode`              | Configured live mode                                 |
| `memoryMB`          | Optional type field; not populated by the web facade |

Render-call timing is JavaScript-side timing, not complete GPU execution time. FPS can be zero before enough samples exist. Events occur roughly once per second while the loop runs and do not upload analytics.

## Tuning and lifecycle

Start with the reference configuration: modest camera dimensions, one face and a restrained pixel ratio. Change one variable at a time with the same device, browser, lighting, asset and input.

Reduce drawing resolution or model complexity when rendering dominates; investigate tracker work when detection dominates. CPU mode can improve compatibility in a particular environment but does not guarantee lower power or higher speed.

The renderer uses `preserveDrawingBuffer: false` and re-renders for snapshots. Existing snapshot paths do not require changing that setting.

Larger pose lerp factors generally follow new input faster; smaller ones smooth more and add lag. Verify movement, jitter and tracking loss before choosing a preset.

Reuse an analyzer for a sequence, then destroy it. Release a try-on SDK when leaving the view. `stopTryOn()` alone does not release capture; use `stopCamera()` or `destroy()`.

The renderer disposes replaced model resources. The host still owns snapshots, object URLs, image bitmaps, retained callback values and its own listeners. Release those separately.

The active facade pauses camera work while hidden and attempts to resume when visible. Exercise revocation, removal, hidden/visible transitions, context loss and teardown during pending loads.

## Release measurement

For each claimed environment record device, OS/browser, SDK commit/package version, runtime assets, camera settings, actual video size, model hash and renderer settings. Separate cold loading from warm interaction.

Use repeatable stationary, moving, absent/reappearing face, replacement and capture scenarios. Record sustained statistics, startup time, alignment and failures. For longer sessions report duration, heat and memory observations.

Keep automated functional evidence separate from physical-device evidence. Set product targets before measurement; report failures and untested environments. A fake-camera gate does not establish device support or optical accuracy.
