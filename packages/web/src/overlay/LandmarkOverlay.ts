/**
 * LandmarkOverlay — Canvas renderer for face landmark mesh visualization.
 *
 * Exact port of visutry's FaceLandmarkMeshOverlay component.
 * Draws three layers on a 2D canvas:
 *   1. Tesselation (mesh grid) — light blue thin lines
 *   2. Contours (face/eye/lip outlines) — dark blue thicker lines
 *   3. Irises — purple lines
 *   4. Highlight points (10 key landmarks) — blue dots with white border
 */

import type {
  LandmarkConnection,
  LandmarkConnections,
  NormalizedFaceResult,
  Point3D,
} from "@visutry/tryon-core";

/** Key landmark indices to highlight as dots (same as visutry). */
const HIGHLIGHT_POINTS = [10, 152, 234, 454, 33, 263, 61, 291, 1, 199];

export interface LandmarkOverlayOptions {
  /** Tesselation line color. Default: rgba(56, 189, 248, 0.34) */
  tesselationColor?: string;
  /** Tesselation line width. Default: 0.65 */
  tesselationWidth?: number;
  /** Tesselation draw step (skip every N connections for performance). Default: 1 */
  tesselationStep?: number;
  /** Contour line color. Default: rgba(37, 99, 235, 0.9) */
  contourColor?: string;
  /** Contour line width. Default: 1.2 */
  contourWidth?: number;
  /** Iris line color. Default: rgba(124, 58, 237, 0.72) */
  irisColor?: string;
  /** Iris line width. Default: 1.0 */
  irisWidth?: number;
  /** Highlight point color. Default: #2563eb */
  highlightColor?: string;
  /** Highlight point radius. Default: 2.5 */
  highlightRadius?: number;
  /** Whether to draw highlight points. Default: true */
  showHighlights?: boolean;
  /** Whether to draw tesselation. Default: true */
  showTesselation?: boolean;
}

export interface LandmarkOverlayRenderInput {
  /** Raw landmark points (normalized 0..1 coordinates). */
  landmarks: Point3D[];
  /** Connection data from MediaPipe. */
  connections: LandmarkConnections;
  /** Natural width of the source image/video. */
  naturalWidth: number;
  /** Natural height of the source image/video. */
  naturalHeight: number;
}

/**
 * Creates a coordinate mapper that maps normalized landmark coordinates
 * to canvas pixels, using "cover" fit (same as visutry's createCoverMapper).
 */
function createCoverMapper(
  naturalWidth: number,
  naturalHeight: number,
  containerWidth: number,
  containerHeight: number,
): (point: { x: number; y: number }) => { x: number; y: number } {
  const scale = Math.max(containerWidth / naturalWidth, containerHeight / naturalHeight);
  const renderedWidth = naturalWidth * scale;
  const renderedHeight = naturalHeight * scale;
  const offsetX = (containerWidth - renderedWidth) / 2;
  const offsetY = (containerHeight - renderedHeight) / 2;

  return (point) => ({
    x: offsetX + point.x * renderedWidth,
    y: offsetY + point.y * renderedHeight,
  });
}

/**
 * Draw a set of connections (line segments) on the canvas.
 * Exact port of visutry's drawConnections().
 */
function drawConnections(
  ctx: CanvasRenderingContext2D,
  landmarks: Point3D[],
  connections: LandmarkConnection[],
  mapPoint: (point: { x: number; y: number }) => { x: number; y: number },
  style: { color: string; width: number; step?: number },
): void {
  if (connections.length === 0) return;
  ctx.save();
  ctx.strokeStyle = style.color;
  ctx.lineWidth = style.width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  const step = style.step ?? 1;
  for (let index = 0; index < connections.length; index += step) {
    const connection = connections[index];
    const start = landmarks[connection.start];
    const end = landmarks[connection.end];
    if (!start || !end) continue;
    const a = mapPoint(start);
    const b = mapPoint(end);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();
  ctx.restore();
}

/**
 * Draw highlight points as filled circles with white border.
 * Exact port of visutry's drawHighlightPoints().
 */
function drawHighlightPoints(
  ctx: CanvasRenderingContext2D,
  landmarks: Point3D[],
  mapPoint: (point: { x: number; y: number }) => { x: number; y: number },
  radius: number,
  color: string,
): void {
  ctx.save();
  for (const index of HIGHLIGHT_POINTS) {
    const point = landmarks[index];
    if (!point) continue;
    const { x, y } = mapPoint(point);
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = radius * 0.54;
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * LandmarkOverlay — renders face landmark mesh on a canvas.
 *
 * Usage:
 * ```ts
 * const overlay = new LandmarkOverlay(canvas);
 * // After face detection:
 * overlay.render({
 *   landmarks: face.landmarks.raw,
 *   connections: face.landmarks.connections,
 *   naturalWidth: video.videoWidth,
 *   naturalHeight: video.videoHeight,
 * });
 * ```
 */
export class LandmarkOverlay {
  private canvas: HTMLCanvasElement;
  private options: Required<LandmarkOverlayOptions>;

  constructor(canvas: HTMLCanvasElement, options?: LandmarkOverlayOptions) {
    this.canvas = canvas;
    this.options = {
      tesselationColor: options?.tesselationColor ?? "rgba(56, 189, 248, 0.34)",
      tesselationWidth: options?.tesselationWidth ?? 0.65,
      tesselationStep: options?.tesselationStep ?? 1,
      contourColor: options?.contourColor ?? "rgba(37, 99, 235, 0.9)",
      contourWidth: options?.contourWidth ?? 1.2,
      irisColor: options?.irisColor ?? "rgba(124, 58, 237, 0.72)",
      irisWidth: options?.irisWidth ?? 1.0,
      highlightColor: options?.highlightColor ?? "#2563eb",
      highlightRadius: options?.highlightRadius ?? 2.5,
      showHighlights: options?.showHighlights ?? true,
      showTesselation: options?.showTesselation ?? true,
    };
  }

  /**
   * Render the landmark mesh overlay on the canvas.
   * The canvas is resized to match its CSS display size (with DPR scaling).
   */
  render(input: LandmarkOverlayRenderInput): void {
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;

    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);

    const { landmarks, connections, naturalWidth, naturalHeight } = input;
    if (!landmarks.length || !naturalWidth || !naturalHeight) return;

    const mapper = createCoverMapper(naturalWidth, naturalHeight, rect.width, rect.height);
    const isCompact = rect.width < 260;

    // Layer 1: Tesselation (mesh grid)
    if (this.options.showTesselation && connections.tesselation.length > 0) {
      drawConnections(ctx, landmarks, connections.tesselation, mapper, {
        color: isCompact
          ? this.options.tesselationColor.replace(/[\d.]+\)$/, "0.28)")
          : this.options.tesselationColor,
        width: isCompact ? this.options.tesselationWidth * 0.85 : this.options.tesselationWidth,
        step: isCompact ? Math.max(2, this.options.tesselationStep) : this.options.tesselationStep,
      });
    }

    // Layer 2: Contours (face outline, eyes, lips, brows)
    if (connections.contours.length > 0) {
      drawConnections(ctx, landmarks, connections.contours, mapper, {
        color: this.options.contourColor,
        width: isCompact ? this.options.contourWidth * 0.88 : this.options.contourWidth,
      });
    }

    // Layer 3: Irises
    if (connections.irises.length > 0) {
      drawConnections(ctx, landmarks, connections.irises, mapper, {
        color: this.options.irisColor,
        width: isCompact ? this.options.irisWidth * 0.9 : this.options.irisWidth,
      });
    }

    // Layer 4: Highlight points
    if (this.options.showHighlights) {
      drawHighlightPoints(
        ctx,
        landmarks,
        mapper,
        isCompact ? this.options.highlightRadius * 0.86 : this.options.highlightRadius,
        this.options.highlightColor,
      );
    }
  }

  /**
   * Render directly from a NormalizedFaceResult.
   * Convenience method — extracts landmarks + connections automatically.
   */
  renderFromFace(
    face: NormalizedFaceResult,
    naturalWidth: number,
    naturalHeight: number,
  ): void {
    const connections = face.landmarks.connections;
    if (!connections) {
      // No connection data — draw points only
      this.render({
        landmarks: face.landmarks.raw,
        connections: { tesselation: [], contours: [], irises: [] },
        naturalWidth,
        naturalHeight,
      });
      return;
    }
    this.render({
      landmarks: face.landmarks.raw,
      connections,
      naturalWidth,
      naturalHeight,
    });
  }

  /** Clear the canvas. */
  clear(): void {
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;
    const rect = this.canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
  }
}
