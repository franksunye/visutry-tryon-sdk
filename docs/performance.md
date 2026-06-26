# Performance Guide

This guide covers the VisuTry SDK's performance characteristics, tracker mode selection, expected FPS and latency by device class, low-end device degradation strategies, memory management, rendering optimization, and profiling with `PerformanceStats`.

---

## Table of Contents

- [Performance Budget Overview](#performance-budget-overview)
- [Tracker Modes Comparison](#tracker-modes-comparison)
- [Expected FPS & Latency by Device Class](#expected-fps--latency-by-device-class)
- [Recommended Camera Resolutions](#recommended-camera-resolutions)
- [Low-End Device Degradation Strategies](#low-end-device-degradation-strategies)
- [Memory Management](#memory-management)
- [Rendering Optimization](#rendering-optimization)
- [Pose Smoothing Tuning](#pose-smoothing-tuning)
- [Profiling with PerformanceStats](#profiling-with-performancestats)
- [Adaptive Quality Strategy](#adaptive-quality-strategy)
- [Benchmarking Methodology](#benchmarking-methodology)

---

## Performance Budget Overview

Real-time AR try-on has a tight per-frame budget. At 30 FPS, each frame must complete in ~33 ms. The VisuTry tracking/render loop divides this budget across four stages:

| Stage | Typical Cost | Budget (30 FPS) |
|---|---|---|
| Camera frame read | ~1 ms | 2 ms |
| MediaPipe face detection | 8-18 ms | 18 ms |
| Pose solve + smooth | < 1 ms | 2 ms |
| Three.js render | 2-6 ms | 8 ms |
| **Total** | **11-26 ms** | **33 ms** |

The dominant cost is MediaPipe face detection. The tracker mode and camera resolution are the two levers that most affect this cost.

```
Frame budget (30 FPS = 33ms)
├── detect    ████████████████████  ~18ms  (MediaPipe)
├── render    ████                  ~5ms   (Three.js)
├── solve     █                     ~0.5ms (core math)
└── overhead  █                     ~1ms   (camera + events)
```

---

## Tracker Modes Comparison

The MediaPipe tracker offers three modes. Each configures the compute delegate and detection confidence thresholds.

| Mode | Delegate | Min Detection | Min Presence | Min Tracking | Target FPS | Battery Impact |
|---|---|---|---|---|---|---|
| `realtime` | GPU | 0.4 | 0.4 | 0.4 | 30 | High |
| `balanced` | GPU | 0.5 | 0.5 | 0.5 | 24-30 | Medium |
| `batterySaver` | CPU | 0.5 | 0.5 | 0.5 | 15-24 | Low |

### Mode selection guide

| Scenario | Recommended Mode |
|---|---|
| High-end desktop / flagship phone, plugged in | `realtime` |
| Default for most devices | `balanced` |
| Low-end Android, older devices, long sessions | `batterySaver` |
| Devices without WebGL (GPU delegate unavailable) | `batterySaver` (CPU fallback) |

### How the delegate affects performance

- **GPU delegate** (`realtime`, `balanced`): Runs the MediaPipe inference graph on the GPU via WebGL. Faster inference (8-14 ms typical) but higher power draw. Requires WebGL support.
- **CPU delegate** (`batterySaver`): Runs inference on the CPU via WebAssembly threads. Slower per-frame (15-25 ms typical) but lower power draw and works without WebGL. Best for sustained sessions on battery.

### Confidence thresholds

Lower confidence thresholds (in `realtime` mode) detect faces more eagerly, reducing false negatives when the face is partially occluded or at an angle. Higher thresholds (in `balanced`/`batterySaver`) require more confident detections, reducing false positives but potentially dropping frames in poor lighting.

```ts
// Override individual thresholds
tracker: {
  mode: "balanced",
  minFaceDetectionConfidence: 0.6,  // stricter detection
  minFacePresenceConfidence: 0.6,   // stricter presence
  minTrackingConfidence: 0.6,       // stricter tracking
}
```

---

## Expected FPS & Latency by Device Class

These are representative figures measured with a 640x480 camera, a single ~50k-triangle glasses model, and `balanced` mode unless noted. Actual results vary by browser, OS version, and thermal state.

### Desktop / Laptop

| Device Class | Mode | FPS | Detect (ms) | Render (ms) | Total (ms) |
|---|---|---|---|---|---|
| High-end (M-series Mac, RTX GPU) | realtime | 30 | 6-9 | 2-3 | 9-13 |
| High-end (M-series Mac, RTX GPU) | balanced | 30 | 7-10 | 2-3 | 10-14 |
| Mid-range (integrated GPU) | balanced | 28-30 | 10-14 | 3-5 | 14-20 |
| Low-end (old integrated GPU) | batterySaver | 20-24 | 16-22 | 4-6 | 22-30 |

### Mobile (iOS)

| Device Class | Mode | FPS | Detect (ms) | Render (ms) | Total (ms) |
|---|---|---|---|---|---|
| iPhone 13+ (A15+) | realtime | 30 | 8-11 | 3-4 | 12-16 |
| iPhone 13+ (A15+) | balanced | 30 | 9-12 | 3-4 | 13-17 |
| iPhone 11-12 (A13-A14) | balanced | 24-30 | 12-16 | 4-5 | 17-22 |
| iPhone X / 8 (A11) | batterySaver | 18-24 | 18-24 | 5-7 | 25-33 |

### Mobile (Android)

| Device Class | Mode | FPS | Detect (ms) | Render (ms) | Total (ms) |
|---|---|---|---|---|---|
| Flagship (Snapdragon 8 Gen 2+) | realtime | 30 | 9-12 | 3-5 | 13-18 |
| Flagship (Snapdragon 8 Gen 2+) | balanced | 28-30 | 11-14 | 4-5 | 16-20 |
| Mid-range (Snapdragon 7xx) | balanced | 22-28 | 14-20 | 5-7 | 20-28 |
| Low-end (Snapdragon 4xx) | batterySaver | 15-20 | 22-30 | 6-9 | 30-40 |

> **Note:** Android figures are more variable than iOS due to the wide hardware diversity. Always test on your target devices. Low-end Android devices may drop below 15 FPS even in `batterySaver` mode.

---

## Recommended Camera Resolutions

Camera resolution directly affects detection latency (more pixels = more work for MediaPipe). Higher resolution does **not** materially improve tracking accuracy for face try-on — the 478-point mesh is already dense enough at 640x480.

| Resolution | Detect Cost | Recommendation |
|---|---|---|
| 640x480 (VGA) | Lowest | Default for low/mid-range devices |
| 1280x720 (720p) | Medium | Default; good quality/latency balance |
| 1920x1080 (1080p) | High | Only for snapshot quality; not recommended for real-time |

```ts
// Low-end device: use VGA
camera: { width: 640, height: 480, frameRate: 30 }

// Default: 720p
camera: { width: 1280, height: 720, frameRate: 30 }

// Snapshot-focused (analysis then capture)
camera: { width: 1920, height: 1080, frameRate: 30 }
```

> **Tip:** The `frameRate` constraint is a hint. Some devices cap at 30 FPS regardless. Requesting `frameRate: 60` rarely helps try-on (MediaPipe detection is the bottleneck, not the camera) and increases power draw.

---

## Low-End Device Degradation Strategies

When the SDK detects sustained low performance (FPS < 20), apply these strategies in order:

### 1. Switch to batterySaver mode

```ts
// Monitor performance and degrade
sdk.on("performanceUpdated", (stats) => {
  if (stats.fps < 20 && stats.mode === "balanced") {
    console.warn("Degrading to batterySaver mode");
    // Restart tracker with batterySaver (requires re-initialization)
  }
});
```

### 2. Reduce camera resolution

```ts
camera: { width: 640, height: 480 }  // drop from 720p to VGA
```

Halving the resolution can cut detection latency by 30-40% on CPU-bound devices.

### 3. Cap pixel ratio

On high-DPI devices, the renderer may be drawing at 3x or 4x the CSS resolution. Cap it:

```ts
renderer: { pixelRatio: Math.min(window.devicePixelRatio, 2) }
```

On a 3x device (e.g. iPhone Pro), this reduces the fill rate by ~56% (from 9x to 4x area).

### 4. Reduce model complexity

Use lower-poly glasses models on low-end devices. A 10k-triangle model renders in ~2 ms; a 50k-triangle model may take ~5 ms. Provide LOD (level-of-detail) variants in your asset pipeline.

### 5. Disable antialiasing

```ts
renderer: { antialias: false }
```

MSAA can cost 1-3 ms per frame on mobile GPUs. The visual difference is minor for glasses models with smooth edges.

### 6. Throttle the render loop

If detection is the bottleneck (not rendering), you can render at full camera FPS but the glasses will still update smoothly thanks to pose smoothing. If rendering is also a bottleneck, consider rendering every other frame:

```ts
// In a custom loop: render only on even frames
let frameCount = 0;
sdk.on("poseUpdated", (pose) => {
  frameCount++;
  if (frameCount % 2 === 0) {
    // apply pose and render
  }
});
```

### Degradation ladder summary

| FPS | Action |
|---|---|
| 25-30 | No action needed |
| 20-25 | Cap pixelRatio at 2 |
| 15-20 | Switch to batterySaver + VGA camera |
| < 15 | Disable antialiasing; use LOD models; consider showing a static snapshot instead |

---

## Memory Management

### GPU memory

Each loaded glasses model allocates GPU buffers (vertex, index, texture). The renderer disposes the previous model before loading a new one:

```ts
// Internally, on switchGlasses:
this.disposeObject(this.glassesGroup); // frees GPU buffers
this.glassesGroup = newModel;
```

Always use `switchGlasses()` or `loadGlasses()` to change models — never load GLB files manually and add them to the scene without disposing the old one.

### CPU memory

- MediaPipe keeps the WASM model in memory (~5-10 MB) for the session lifetime. This is freed on `destroy()`.
- The pose smoother and quality gate keep small rolling buffers (60 frames). These are negligible.
- Face shape analysis buffers up to `sampleFrames` (default 8) `NormalizedFaceResult` objects during collection, then releases them.

### Disposal checklist

Always call `destroy()` when the try-on view is unmounted:

```ts
// React
useEffect(() => {
  return () => sdk.destroy();
}, []);

// Vue
onUnmounted(() => sdk.destroy());

// Vanilla
window.addEventListener("beforeunload", () => sdk.destroy());
```

`destroy()` performs:
1. Cancels the `requestAnimationFrame` loop
2. Stops camera tracks (`MediaStreamTrack.stop()`)
3. Disposes the glasses model GPU resources
4. Disposes the Three.js renderer, scene, camera, lights
5. Releases the WebGL context (`forceContextLoss()`)
6. Clears all event listeners

### iOS Safari memory pressure

iOS Safari is aggressive about killing tabs with high GPU memory. To avoid crashes:

- Keep glasses models under 2 MB and 50k triangles
- Dispose models on `switchGlasses` (the SDK does this automatically)
- Call `destroy()` when navigating away
- Avoid loading multiple models simultaneously

---

## Rendering Optimization

### Orthographic camera

The `ThreeJsRenderer` uses an **orthographic camera** (not perspective). This is a deliberate optimization:

- No perspective divide per vertex
- Render-world units map 1:1 to normalized image space, so the glasses pose position lands directly on the face
- Simpler frustum culling

The camera is configured so that:
- `y` spans `[-0.5, +0.5]` (frame height = 1.0 unit)
- `x` spans `[-aspect/2, +aspect/2]` (scaled by aspect ratio)

### Lighting

The renderer sets up two lights:
- Ambient light: intensity 0.9 (base illumination)
- Directional light: intensity 0.8, position `(0, 0.5, 1)` (simulates front-facing room light)

This minimal lighting setup avoids per-pixel shadow computation. If your models need richer lighting, add lights to the scene via the renderer's exposed scene object.

### preserveDrawingBuffer

The renderer creates the WebGL context with `preserveDrawingBuffer: true` to enable reliable `toDataURL()` for snapshots. This has a small performance cost (the GPU must preserve the back buffer). If you never use snapshots, you could create a custom renderer with `preserveDrawingBuffer: false` for a small FPS gain.

### Texture compression

For production, use KTX2/Basis-compressed textures in your GLB models. Three.js `GLTFLoader` supports KTX2 via the `KTX2Loader` extension. Compressed textures reduce GPU memory by 4-6x and upload time by 3-5x compared to uncompressed PNG/JPEG.

---

## Pose Smoothing Tuning

The `PoseSmoother` is critical for perceived performance. Even if detection runs at 15 FPS, good smoothing makes the glasses appear stable at the display refresh rate.

| Parameter | Default | Effect of Increasing | Effect of Decreasing |
|---|---|---|---|
| `positionLerp` | 0.35 | More lag, more stable | Snappier, more jitter |
| `rotationLerp` | 0.30 | More lag, more stable | Snappier, more jitter |
| `scaleLerp` | 0.25 | More lag | Snappier |
| `jitterThreshold` | 0.003 | Ignores larger deltas (more lag) | Kills smaller jitter |
| `lostTrackingDelayMs` | 250 | Holds pose longer on loss | Fades out sooner |

### Tuning for low FPS

On low-FPS devices, increase the lerp factors slightly so the glasses interpolate more aggressively between sparse detections:

```ts
smoothing: {
  positionLerp: 0.45,  // more interpolation between sparse frames
  rotationLerp: 0.40,
  scaleLerp: 0.35,
  lostTrackingDelayMs: 300,
}
```

### Tuning for high FPS

On high-FPS devices, decrease the lerp factors for snappier response:

```ts
smoothing: {
  positionLerp: 0.25,
  rotationLerp: 0.22,
  scaleLerp: 0.20,
  jitterThreshold: 0.002,
}
```

### Jitter threshold

The `jitterThreshold` (default 0.003 in render-world units) suppresses sub-threshold deltas. This is the single most effective parameter for eliminating glasses "shimmer" when the face is stationary. If your glasses shimmer, increase it to 0.005. If the glasses feel laggy when the user moves, decrease it to 0.002.

---

## Profiling with PerformanceStats

The SDK tracks performance internally and exposes it via `getPerformanceStats()` and the `performanceUpdated` event.

```ts
interface PerformanceStats {
  fps: number;                 // frames per second (rolling 60-frame window)
  detectLatencyMs: number;     // average MediaPipe detection time
  renderLatencyMs: number;     // average Three.js render time
  trackingLostCount: number;   // cumulative lost-tracking events this session
  mode: TrackingMode;          // current tracker mode
  memoryMB?: number;           // optional, when JS heap is available
}
```

### Reading stats

```ts
// Poll on demand
const stats = sdk.getPerformanceStats();
console.log(`FPS: ${stats.fps}, detect: ${stats.detectLatencyMs}ms`);

// Or subscribe to periodic updates (~1/sec)
sdk.on("performanceUpdated", (stats) => {
  updatePerfHUD(stats);
});
```

### Building a performance HUD

```ts
function updatePerfHUD(stats: PerformanceStats) {
  const totalMs = stats.detectLatencyMs + stats.renderLatencyMs;
  const budgetMs = 33.3; // 30 FPS budget
  const utilization = (totalMs / budgetMs * 100).toFixed(0);

  document.getElementById("hud").innerHTML = `
    <div>FPS: <strong>${stats.fps}</strong></div>
    <div>Detect: ${stats.detectLatencyMs}ms</div>
    <div>Render: ${stats.renderLatencyMs}ms</div>
    <div>Budget: ${utilization}%</div>
    <div>Lost: ${stats.trackingLostCount}</div>
    <div>Mode: ${stats.mode}</div>
  `;

  // Color-code by utilization
  const color = utilization > 90 ? "red" : utilization > 70 ? "orange" : "green";
  document.getElementById("hud").style.color = color;
}
```

### How stats are computed

- **FPS**: Computed from the span between the first and last frame timestamp in a 60-frame rolling window: `fps = (count - 1) / (lastTs - firstTs) * 1000`.
- **detectLatencyMs**: Average of the last 60 detection durations (performance.now() before and after `detectForVideo()`).
- **renderLatencyMs**: Average of the last 60 render durations (before and after `renderer.render()`).
- **trackingLostCount**: Incremented each time tracking transitions from present to lost (after the smoother's delay).

---

## Adaptive Quality Strategy

For the best user experience across diverse hardware, implement an adaptive quality controller that adjusts mode and resolution based on observed performance:

```ts
class AdaptiveQuality {
  private lowFpsStreak = 0;
  private highFpsStreak = 0;

  constructor(private sdk: VisuTrySDK) {
    sdk.on("performanceUpdated", (stats) => this.onStats(stats));
  }

  private onStats(stats: PerformanceStats) {
    if (stats.fps < 20) {
      this.lowFpsStreak++;
      this.highFpsStreak = 0;
      if (this.lowFpsStreak >= 3) this.degrade();
    } else if (stats.fps >= 28) {
      this.highFpsStreak++;
      this.lowFpsStreak = 0;
      if (this.highFpsStreak >= 10) this.upgrade();
    } else {
      this.lowFpsStreak = 0;
      this.highFpsStreak = 0;
    }
  }

  private degrade() {
    console.log("[AdaptiveQuality] Degrading...");
    // Step 1: cap pixel ratio
    // Step 2: switch to batterySaver
    // Step 3: reduce camera resolution to VGA
    this.lowFpsStreak = 0;
  }

  private upgrade() {
    console.log("[AdaptiveQuality] Upgrading...");
    // Reverse steps if sustained high FPS
    this.highFpsStreak = 0;
  }
}
```

### Hysteresis

Use hysteresis (require N consecutive low-FPS readings before degrading, and M consecutive high-FPS readings before upgrading) to avoid oscillation. The example above uses 3 low readings to degrade and 10 high readings to upgrade.

---

## Benchmarking Methodology

When measuring performance on your target devices:

1. **Warm up.** Run the SDK for 10 seconds before measuring to let JIT compilation and GPU shader caching settle.
2. **Measure sustained, not peak.** Collect stats for at least 30 seconds. Mobile devices throttle under thermal load; peak FPS in the first 5 seconds is not representative.
3. **Use the same glasses model.** Model complexity (triangle count, texture size) significantly affects render latency. Use a representative model across tests.
4. **Test thermal states.** Run a 5-minute session to observe thermal throttling. Flagship phones may drop from 30 FPS to 20 FPS after 3-4 minutes of continuous tracking.
5. **Check power.** Use the device's built-in battery profiler. `realtime` mode can drain 1.5-2x faster than `batterySaver`.
6. **Isolate the bottleneck.** Compare `detectLatencyMs` vs `renderLatencyMs`:
   - If detect >> render: the tracker is the bottleneck. Switch mode or reduce resolution.
   - If render >> detect: the model is the bottleneck. Use a lower-poly model or cap pixel ratio.

### Quick benchmark script

```ts
async function benchmark(sdk: VisuTrySDK, durationMs = 30000) {
  const samples: PerformanceStats[] = [];
  const handler = (s: PerformanceStats) => samples.push(s);
  sdk.on("performanceUpdated", handler);

  await new Promise((r) => setTimeout(r, durationMs));
  sdk.off("performanceUpdated", handler);

  const fpsValues = samples.map((s) => s.fps).filter((f) => f > 0);
  const avgFps = fpsValues.reduce((a, b) => a + b, 0) / fpsValues.length;
  const minFps = Math.min(...fpsValues);
  const p95Fps = fpsValues.sort((a, b) => a - b)[Math.floor(fpsValues.length * 0.05)];

  console.log(`Benchmark (${durationMs / 1000}s)`);
  console.log(`  Avg FPS: ${avgFps.toFixed(1)}`);
  console.log(`  Min FPS: ${minFps.toFixed(1)}`);
  console.log(`  P95 FPS: ${p95Fps.toFixed(1)}`);
  console.log(`  Avg detect: ${(samples.reduce((a, s) => a + s.detectLatencyMs, 0) / samples.length).toFixed(1)}ms`);
  console.log(`  Avg render: ${(samples.reduce((a, s) => a + s.renderLatencyMs, 0) / samples.length).toFixed(1)}ms`);

  return { avgFps, minFps, p95Fps, samples };
}
```

Run this on each target device class to build your own performance matrix, then use the adaptive quality strategy to select the right configuration automatically.
