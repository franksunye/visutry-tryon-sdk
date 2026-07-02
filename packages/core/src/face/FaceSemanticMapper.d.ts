import type { FaceResultSource, FaceSemanticPoints, Point3D } from "../types/index.js";
/**
 * Mapping from a semantic point name to the index in the raw landmark array.
 * Adapters supply the index map appropriate for their tracker; the core ships a
 * default MediaPipe Face Landmarker map.
 */
export type SemanticIndexMap = Partial<Record<keyof FaceSemanticPoints, number>>;
/**
 * Default MediaPipe Face Landmarker (468/478 point topology) index map, as
 * specified in the SDK spec §10.1.
 */
export declare const MEDIAPIPE_SEMANTIC_INDEX_MAP: SemanticIndexMap;
export interface FaceSemanticMapperOptions {
    indexMap?: SemanticIndexMap;
    /** When true, derive eye centers / eyes center from outer+inner corners. Default true. */
    deriveCenters?: boolean;
}
/**
 * Maps raw tracker landmarks onto the stable `FaceSemanticPoints` contract.
 *
 * This class is intentionally side-effect free and tracker-agnostic: it only
 * needs an index map describing where each semantic point lives in the raw
 * array. The web adapter passes the MediaPipe map; the WeChat adapter passes a
 * custom map or relies on direct construction.
 */
export declare class FaceSemanticMapper {
    private readonly indexMap;
    private readonly deriveCenters;
    constructor(options?: FaceSemanticMapperOptions);
    /**
     * Build a `FaceSemanticPoints` from a raw normalized landmark array.
     * Missing indices or undefined landmarks are silently skipped — downstream
     * consumers must tolerate optional points.
     */
    map(landmarks: Point3D[]): FaceSemanticPoints;
    /**
     * Derive leftEyeCenter, rightEyeCenter and eyesCenter from the outer/inner
     * eye corners when they are available. These derived points are the backbone
     * of the glasses pose solver and face metrics.
     */
    private deriveEyeCenters;
    /**
     * Count how many of the *required* semantic points (for analysis) are present.
     * Used by the quality gate to emit `MISSING_KEY_POINTS`.
     */
    static countMissing(semantic: FaceSemanticPoints, required?: (keyof FaceSemanticPoints)[]): {
        missing: string[];
        present: number;
        total: number;
    };
    /** Convenience factory bound to a specific source's default map. */
    static forSource(source: FaceResultSource): FaceSemanticMapper;
}
//# sourceMappingURL=FaceSemanticMapper.d.ts.map