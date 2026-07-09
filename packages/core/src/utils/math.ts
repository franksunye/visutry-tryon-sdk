import type { Point2D, Point3D, Vector3 } from "../types/index.js";

// ---------------------------------------------------------------------------
// Vector arithmetic (Point3D / Vector3 share the same {x,y,z} shape)
// ---------------------------------------------------------------------------

export function add(a: Vector3, b: Vector3): Vector3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function sub(a: Vector3, b: Vector3): Vector3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function scale(v: Vector3, s: number): Vector3 {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp01(t);
}

export function lerpVec3(a: Vector3, b: Vector3, t: number): Vector3 {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t) };
}

export function dot(a: Vector3, b: Vector3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function cross(a: Vector3, b: Vector3): Vector3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function length(v: Vector3): number {
  return Math.hypot(v.x, v.y, v.z);
}

export function length2D(v: Point2D): number {
  return Math.hypot(v.x, v.y);
}

export function normalize(v: Vector3): Vector3 {
  const len = length(v);
  if (len < 1e-9) return { x: 0, y: 0, z: 0 };
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

export function distance2D(a: Point2D, b: Point2D): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function distance3D(a: Point3D, b: Point3D): number {
  return Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));
}

/** Midpoint of two 3D points. */
export function midpoint(a: Point3D, b: Point3D): Point3D {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: ((a.z ?? 0) + (b.z ?? 0)) / 2 };
}

// ---------------------------------------------------------------------------
// Angle helpers
// ---------------------------------------------------------------------------

export const PI = Math.PI;
export const TWO_PI = Math.PI * 2;
export const HALF_PI = Math.PI / 2;
export const DEG2RAD = Math.PI / 180;
export const RAD2DEG = 180 / Math.PI;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

export function clampAngle(radians: number): number {
  // Wrap to [-PI, PI)
  let r = radians % TWO_PI;
  if (r < -PI) r += TWO_PI;
  if (r >= PI) r -= TWO_PI;
  return r;
}

/** Signed angle (radians) of the 2D vector from `a` to `b` around the origin. */
export function signedAngle2D(a: Point2D, b: Point2D): number {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Trimmed mean — drops `trimFraction` from both ends before averaging. */
export function trimmedMean(values: number[], trimFraction = 0.2): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const trimCount = Math.floor(sorted.length * trimFraction);
  const trimmed = sorted.slice(trimCount, sorted.length - trimCount);
  if (trimmed.length === 0) return median(sorted);
  return mean(trimmed);
}

export function standardDeviation(values: number[]): number {
  if (values.length === 0) return 0;
  const m = mean(values);
  let variance = 0;
  for (const v of values) variance += (v - m) * (v - m);
  return Math.sqrt(variance / values.length);
}

// ---------------------------------------------------------------------------
// Softmax / normalization
// ---------------------------------------------------------------------------

/**
 * Softmax that is numerically stable. Returns values summing to 1.
 * Temperature > 1 flattens the distribution; < 1 sharpens it.
 */
export function softmax(values: number[], temperature = 1): number[] {
  if (values.length === 0) return [];
  const max = Math.max(...values);
  const exps = values.map((v) => Math.exp((v - max) / temperature));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

/** Min-max normalize an array to [0,1]. */
export function minMaxNormalize(values: number[]): number[] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  if (range < 1e-9) return values.map(() => 1);
  return values.map((v) => (v - min) / range);
}

/** Linear map from one range to another. */
export function mapRange(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
): number {
  if (Math.abs(inMax - inMin) < 1e-9) return outMin;
  const t = (value - inMin) / (inMax - inMin);
  return outMin + t * (outMax - outMin);
}
