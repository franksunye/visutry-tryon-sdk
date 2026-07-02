import type { GlassesPose, PoseSmoothingConfig } from "../types/index.js";
/** Default smoothing configuration (spec §15.6). */
export declare const DEFAULT_POSE_SMOOTHING_CONFIG: PoseSmoothingConfig;
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
export declare class PoseSmoother {
    private config;
    private lastPose;
    private lastSeenMs;
    private lost;
    constructor(config?: Partial<PoseSmoothingConfig>);
    configure(config: Partial<PoseSmoothingConfig>): void;
    reset(): void;
    /**
     * Produce a smoothed pose for the given raw pose and timestamp.
     *
     * @param raw     The freshly solved pose (may have `visible=false`).
     * @param nowMs   Current timestamp in milliseconds.
     */
    smooth(raw: GlassesPose, nowMs: number): GlassesPose;
    private smoothActive;
    private lerpIfSignificant;
    private lerpScale;
    private lerpRotation;
    get isLost(): boolean;
}
//# sourceMappingURL=PoseSmoothing.d.ts.map