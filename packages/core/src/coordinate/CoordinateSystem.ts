import type { CoordinateSystemType, Point2D, Point3D } from "../types/index.js";

/**
 * Coordinate system conversions for VisuTry SDK.
 *
 * Four coordinate systems are used throughout the SDK:
 *
 *  - `pixel-image`      origin top-left, x right, y down.   Raw video / image frames.
 *  - `normalized-image` origin top-left, x∈[0,1] right, y∈[0,1] down.  SDK-internal face results.
 *  - `render-world`     origin scene-center, x right, y up.  Glasses model rendering.
 *  - `glasses-local`    origin model origin, x right, y up, z temple.  Single glasses model.
 *
 * Adapters always emit `NormalizedFaceResult`. The core operates exclusively in
 * normalized-image space. The renderer only ever receives `GlassesPose`, never raw
 * landmarks.
 */
export class CoordinateSystem {
  /** Convert a pixel-space point to normalized image space. */
  static pixelToNormalized(
    point: Point2D | Point3D,
    width: number,
    height: number,
  ): Point3D {
    const w = width || 1;
    const h = height || 1;
    return {
      x: point.x / w,
      y: point.y / h,
      z: "z" in point && point.z !== undefined ? point.z / Math.max(w, h) : 0,
    };
  }

  /** Convert a batch of pixel points to normalized image space. */
  static pixelToNormalizedBatch(
    points: Point3D[],
    width: number,
    height: number,
  ): Point3D[] {
    return points.map((p) => this.pixelToNormalized(p, width, height));
  }

  /** Convert a normalized image point back to pixel space. */
  static normalizedToPixel(point: Point3D, width: number, height: number): Point3D {
    return {
      x: point.x * width,
      y: point.y * height,
      z: (point.z ?? 0) * Math.max(width, height),
    };
  }

  /**
   * Convert a normalized image point (y down) into render-world space (y up),
   * centering the origin at the image center. This is used when the renderer
   * needs to place auxiliary geometry; the primary glasses pose is produced by
   * `GlassesPoseSolver` which handles its own mapping.
   *
   * The mapping is:  x_w = (x_n - 0.5) * aspectScale,  y_w = (0.5 - y_n),  z kept.
   */
  static normalizedToRenderWorld(
    point: Point3D,
    aspectRatio = 1,
  ): Point3D {
    return {
      x: (point.x - 0.5) * aspectRatio,
      y: 0.5 - point.y,
      z: point.z,
    };
  }

  /**
   * Convert render-world (y up) back to normalized image (y down).
   */
  static renderWorldToNormalized(point: Point3D, aspectRatio = 1): Point3D {
    const sx = aspectRatio || 1;
    return {
      x: point.x / sx + 0.5,
      y: 0.5 - point.y,
      z: point.z,
    };
  }

  /**
   * Validate that a value lies within the normalized unit square.
   * Returns the clamped value and whether clamping was needed.
   */
  static clampNormalized(value: number): { value: number; clamped: boolean } {
    if (value < 0) return { value: 0, clamped: true };
    if (value > 1) return { value: 1, clamped: true };
    return { value, clamped: false };
  }

  static describe(type: CoordinateSystemType): string {
    switch (type) {
      case "pixel-image":
        return "Pixel Image — origin top-left, x right, y down. Raw frames.";
      case "normalized-image":
        return "Normalized Image — origin top-left, x∈[0,1] right, y∈[0,1] down. SDK internal.";
      case "render-world":
        return "Render World — origin scene-center, x right, y up. Glasses rendering.";
      case "glasses-local":
        return "Glasses Local — origin model origin, x right, y up, z temple. Single model.";
    }
  }
}
