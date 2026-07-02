import type { Point2D, Point3D, Vector3 } from "../types/index.js";
export declare function add(a: Vector3, b: Vector3): Vector3;
export declare function sub(a: Vector3, b: Vector3): Vector3;
export declare function scale(v: Vector3, s: number): Vector3;
export declare function lerp(a: number, b: number, t: number): number;
export declare function lerpVec3(a: Vector3, b: Vector3, t: number): Vector3;
export declare function dot(a: Vector3, b: Vector3): number;
export declare function cross(a: Vector3, b: Vector3): Vector3;
export declare function length(v: Vector3): number;
export declare function length2D(v: Point2D): number;
export declare function normalize(v: Vector3): Vector3;
export declare function distance2D(a: Point2D, b: Point2D): number;
export declare function distance3D(a: Point3D, b: Point3D): number;
/** Midpoint of two 3D points. */
export declare function midpoint(a: Point3D, b: Point3D): Point3D;
export declare const PI: number;
export declare const TWO_PI: number;
export declare const HALF_PI: number;
export declare const DEG2RAD: number;
export declare const RAD2DEG: number;
export declare function clamp(value: number, min: number, max: number): number;
export declare function clamp01(value: number): number;
export declare function clampAngle(radians: number): number;
/** Signed angle (radians) of the 2D vector from `a` to `b` around the origin. */
export declare function signedAngle2D(a: Point2D, b: Point2D): number;
export declare function mean(values: number[]): number;
export declare function median(values: number[]): number;
/** Trimmed mean — drops `trimFraction` from both ends before averaging. */
export declare function trimmedMean(values: number[], trimFraction?: number): number;
export declare function standardDeviation(values: number[]): number;
/**
 * Softmax that is numerically stable. Returns values summing to 1.
 * Temperature > 1 flattens the distribution; < 1 sharpens it.
 */
export declare function softmax(values: number[], temperature?: number): number[];
/** Min-max normalize an array to [0,1]. */
export declare function minMaxNormalize(values: number[]): number[];
/** Linear map from one range to another. */
export declare function mapRange(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number;
//# sourceMappingURL=math.d.ts.map