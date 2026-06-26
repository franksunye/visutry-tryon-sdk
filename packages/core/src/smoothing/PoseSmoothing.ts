import type { GlassesPose, PoseSmoothingConfig } from "../types/index.js";
import { clamp01, lerp, lerpVec3, clampAngle } from "../utils/math.js";

/** Default smoothing configuration (spec §15.6). */
export const DEFAULT_POSE_SMOOTHING_CONFIG: PoseSmoothingConfig = {
  enabled: true,
  positionLerp: 0.35,
  rotationLerp: 0.3,
  scaleLerp: 0.25,
  jitterThreshold: 0.003,
  lostTrackingDelayMs: 250,
};

/**
 * Smooths a stream of `GlassesPose` values to suppress tracker jitter and
 * gracefully handle brief tracking loss.
 *
 * Behaviour (spec §15.6 / §15.7):
 *  - When tracking is active, position / rotation / scale are lerped toward the
 *    new target. Sub-threshold deltas are ignored to kill micro-jitter.
 *  - On brief loss (< `lostTrackingDelayMs`) the last pose is held so the
 *    glasses do not flicker.
 *  - After the delay, the glasses fade out (visible=false) smoothly.
 *  - On recovery the lerp resumes, preventing an instantaneous jump.
 */
export class PoseSmoother {
  private config: PoseSmoothingConfig;
  private lastPose: GlassesPose | null = null;
  private lastSeenMs = 0;
  private lost = false;

  constructor(config: Partial<PoseSmoothingConfig> = {}) {
    this.config = { ...DEFAULT_POSE_SMOOTHING_CONFIG, ...config };
  }

  configure(config: Partial<PoseSmoothingConfig>): void {
    this.config = { ...this.config, ...config };
  }

  reset(): void {
    this.lastPose = null;
    this.lost = false;
    this.lastSeenMs = 0;
  }

  /**
   * Produce a smoothed pose for the given raw pose and timestamp.
   *
   * @param raw     The freshly solved pose (may have `visible=false`).
   * @param nowMs   Current timestamp in milliseconds.
   */
  smooth(raw: GlassesPose, nowMs: number): GlassesPose {
    if (!this.config.enabled) {
      return raw;
    }

    // First observation ever: adopt directly.
    if (!this.lastPose) {
      this.lastPose = { ...raw };
      this.lastSeenMs = raw.visible ? nowMs : this.lastSeenMs;
      this.lost = !raw.visible;
      return { ...raw };
    }

    if (raw.visible) {
      this.lastSeenMs = nowMs;
      this.lost = false;
      return this.smoothActive(raw);
    }

    // Raw says not visible — decide based on time since last sighting.
    const elapsed = nowMs - this.lastSeenMs;
    if (elapsed < this.config.lostTrackingDelayMs) {
      // Hold the last pose, keep it visible (no flicker).
      this.lost = false;
      return { ...this.lastPose, visible: true };
    }

    // Grace period over: fade out.
    this.lost = true;
    const fade = clamp01(1 - (elapsed - this.config.lostTrackingDelayMs) / 200);
    if (fade <= 0) {
      return { ...this.lastPose, visible: false };
    }
    return { ...this.lastPose, visible: true, confidence: this.lastPose.confidence * fade };
  }

  private smoothActive(raw: GlassesPose): GlassesPose {
    const last = this.lastPose!;
    const t = this.config;

    const position = this.lerpIfSignificant(last.position, raw.position, t.positionLerp, t.jitterThreshold);
    const scale = this.lerpScale(last.scale, raw.scale, t.scaleLerp, t.jitterThreshold);
    const rotation = this.lerpRotation(last.rotation, raw.rotation, t.rotationLerp, t.jitterThreshold);

    const smoothed: GlassesPose = {
      position,
      rotation,
      scale,
      visible: true,
      confidence: lerp(last.confidence, raw.confidence, t.rotationLerp),
      reason: raw.reason,
    };

    this.lastPose = { ...smoothed };
    return smoothed;
  }

  private lerpIfSignificant(a: GlassesPose["position"], b: GlassesPose["position"], t: number, threshold: number) {
    const dx = Math.abs(b.x - a.x);
    const dy = Math.abs(b.y - a.y);
    const dz = Math.abs(b.z - a.z);
    if (dx < threshold && dy < threshold && dz < threshold) {
      return { ...a };
    }
    return lerpVec3(a, b, t);
  }

  private lerpScale(a: GlassesPose["scale"], b: GlassesPose["scale"], t: number, threshold: number) {
    const dx = Math.abs(b.x - a.x);
    if (dx < threshold) return { ...a };
    return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t) };
  }

  private lerpRotation(a: GlassesPose["rotation"], b: GlassesPose["rotation"], t: number, threshold: number) {
    // Use shortest-angle lerp for each Euler component.
    const dl = Math.abs(clampAngle(b.x - a.x));
    const dr = Math.abs(clampAngle(b.y - a.y));
    const dp = Math.abs(clampAngle(b.z - a.z));
    if (dl < threshold && dr < threshold && dp < threshold) {
      return { ...a };
    }
    return {
      x: a.x + clampAngle(b.x - a.x) * t,
      y: a.y + clampAngle(b.y - a.y) * t,
      z: a.z + clampAngle(b.z - a.z) * t,
    };
  }

  get isLost(): boolean {
    return this.lost;
  }
}
