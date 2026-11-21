import { describe, expect, it } from "vitest";
import type {
  FaceShape,
  FaceShapeResult,
  GlassesShape,
  PhysicalFaceMeasurements,
  RecommendationInput,
  UserPreferences,
} from "@visutry/tryon-core";
import {
  FACE_SHAPE_FRAME_MATCH,
  Recommender,
  estimateEyeCenterDistanceMm,
  estimateFaceWidthMm,
  recommendSize,
} from "./index.js";
import {
  buildFaceShapeResult,
  buildGlassesItem,
  buildItemsByShape,
  buildMetrics,
} from "./__fixtures__/fixtures.js";

const recommender = new Recommender();
const imageMetrics = buildMetrics(0.3);
const ovalFace = buildFaceShapeResult("oval", imageMetrics);
const physicalMeasurements: PhysicalFaceMeasurements = {
  faceWidthMm: 140,
  source: "measured",
};

function recommendOval(
  inventory: RecommendationInput["inventory"],
  preferences?: UserPreferences,
  measurements?: PhysicalFaceMeasurements,
) {
  return recommender.recommend({
    faceShape: ovalFace,
    inventory,
    preferences,
    measurements,
  });
}

describe("face-shape rules require an explicitly valid analysis", () => {
  it.each<[FaceShape, GlassesShape, GlassesShape]>([
    ["oval", "rectangle", "cat-eye"],
    ["round", "rectangle", "round"],
    ["square", "round", "rectangle"],
    ["heart", "rectangle", "round"],
    ["diamond", "oval", "rectangle"],
    ["oblong", "round", "rectangle"],
    ["triangle", "aviator", "rectangle"],
  ])("applies the %s rule without inventing physical size", (face, match, other) => {
    const results = recommender.recommend({
      faceShape: buildFaceShapeResult(face, imageMetrics),
      inventory: buildItemsByShape([other, match]),
    });
    // Matching shape 40 + neutral size 15 + known price 10.
    expect(results[0].item.shapeCategory).toBe(match);
    expect(results[0].score).toBe(0.65);
    expect(results[1].score).toBe(0.25);
    expect(results.every((r) => r.faceShapeApplied)).toBe(true);
    expect(results.every((r) => r.size.status === "unavailable")).toBe(true);
    expect(results[0].reasons.join(" ")).toContain("heuristic rule table");
    expect(results[1].cautions?.join(" ")).toContain("not selected");
  });

  const unavailableAnalyses: Array<[string, FaceShapeResult | undefined]> = [
    ["missing analysis", undefined],
    ["unknown shape", buildFaceShapeResult("unknown", imageMetrics)],
    [
      "blocking analysis warning with valid geometry",
      { ...ovalFace, warnings: ["LOW_CONFIDENCE"] },
    ],
    [
      "blocking geometry warning despite a valid flag",
      buildFaceShapeResult(
        "oval",
        buildMetrics(0.3, {
          geometryValid: true,
          geometryWarnings: ["FACE_TOO_SMALL"],
        }),
      ),
    ],
    [
      "rejected geometry",
      buildFaceShapeResult(
        "oval",
        buildMetrics(0.3, {
          geometryValid: false,
          measurementQuality: 0,
        }),
      ),
    ],
    [
      "legacy metrics without validity",
      buildFaceShapeResult(
        "oval",
        buildMetrics(0.3, {
          geometryValid: undefined,
        }),
      ),
    ],
    ...[0, -1, NaN, Infinity, 1.1].map((confidence): [string, FaceShapeResult] => [
      "invalid or absent confidence " + confidence,
      { ...ovalFace, confidence },
    ]),
  ];

  it.each(unavailableAnalyses)("%s uses generic preference ranking", (_name, faceShape) => {
    const results = recommender.recommend({
      faceShape,
      inventory: buildItemsByShape(["rectangle", "cat-eye"]),
      preferences: { preferredShapes: ["cat-eye"] },
    });
    expect(results[0].item.shapeCategory).toBe("cat-eye");
    // Neutral shape 20 + explicit preference 20 + neutral size 15 + price 10.
    expect(results[0].score).toBe(0.65);
    expect(results[1].score).toBe(0.45);
    expect(results.every((r) => !r.faceShapeApplied)).toBe(true);
    expect(
      results.every((r) =>
        r.cautions?.some((c) => c.includes("face-shape rules were not applied")),
      ),
    ).toBe(true);
    expect(results.flatMap((r) => r.reasons).join(" ")).not.toContain("for a oval face");
  });

  it("does not turn heuristic confidence into a probability cutoff", () => {
    const inventory = buildItemsByShape(["rectangle", "cat-eye"]);
    const run = (confidence: number) =>
      recommender.recommend({
        faceShape: { ...ovalFace, confidence },
        inventory,
      });
    expect(run(0.01)).toEqual(run(0.9));
  });

  it("exposes inspectable rules and respects an explicit shape preference", () => {
    expect(FACE_SHAPE_FRAME_MATCH.oval).toContain("rectangle");
    expect(FACE_SHAPE_FRAME_MATCH.unknown).toEqual([]);
    const inventory = buildItemsByShape(["cat-eye"]);
    expect(recommendOval(inventory)[0].score).toBe(0.25);
    expect(recommendOval(inventory, { preferredShapes: ["cat-eye"] })[0].score).toBe(0.45);
  });
});

describe("physical size requires host-supplied measurements", () => {
  it("does not infer millimeters or an average from any image-space width", () => {
    for (const width of [0, -1, 0.15, 0.3, 0.6, NaN, Infinity]) {
      const metrics = buildMetrics(width, { eyeCenterDistance: width });
      expect(estimateFaceWidthMm(metrics)).toBeUndefined();
      expect(estimateEyeCenterDistanceMm(metrics)).toBeUndefined();
      // A pre-migration JavaScript call must fail closed, not turn pixels into mm.
      expect(recommendSize(metrics as unknown as PhysicalFaceMeasurements)).toEqual({
        status: "unavailable",
        reason: "invalid-measurements",
      });
    }
    expect(recommendSize()).toEqual({
      status: "unavailable",
      reason: "measurements-required",
    });
  });

  it.each<[number, string, number[]]>([
    [120, "small", [38, 46]],
    [130, "medium", [46, 52]],
    [140, "medium", [46, 52]],
    [145, "medium", [46, 52]],
    [146, "large", [52, 58]],
  ])("applies explicit %s mm input to the documented tier rules", (faceWidthMm, tier, range) => {
    const size = recommendSize({ faceWidthMm, source: "measured" });
    expect(size).toMatchObject({
      status: "available",
      faceWidthMm,
      idealFrameWidthMm: faceWidthMm,
      source: "measured",
      tier,
      lensWidthRange: range,
    });
    expect(size).not.toHaveProperty("eyeCenterDistanceMm");
  });

  it.each(["measured", "calibrated"] as const)(
    "preserves the host's %s source and optional distance",
    (source) => {
      expect(
        recommendSize({
          faceWidthMm: 140,
          eyeCenterDistanceMm: 62,
          source,
        }),
      ).toMatchObject({
        status: "available",
        source,
        faceWidthMm: 140,
        eyeCenterDistanceMm: 62,
      });
    },
  );

  it.each([
    { faceWidthMm: 0, source: "measured" },
    { faceWidthMm: -1, source: "measured" },
    { faceWidthMm: NaN, source: "measured" },
    { faceWidthMm: Infinity, source: "calibrated" },
    { faceWidthMm: "140", source: "measured" },
    { faceWidthMm: 140, source: "estimated" },
    { faceWidthMm: 140 },
    {},
    { faceWidthMm: 140, source: "measured", eyeCenterDistanceMm: 0 },
    { faceWidthMm: 140, source: "measured", eyeCenterDistanceMm: -1 },
    { faceWidthMm: 140, source: "measured", eyeCenterDistanceMm: NaN },
    { faceWidthMm: 140, source: "measured", eyeCenterDistanceMm: Infinity },
    { faceWidthMm: 140, source: "measured", eyeCenterDistanceMm: null },
    { faceWidthMm: 140, source: "measured", eyeCenterDistanceMm: "63" },
  ])("rejects invalid physical input: %j", (input) => {
    const measurements = input as unknown as PhysicalFaceMeasurements;
    expect(recommendSize(measurements)).toEqual({
      status: "unavailable",
      reason: "invalid-measurements",
    });
    const [result] = recommendOval([buildGlassesItem("frame")], undefined, measurements);
    expect(result.size.status).toBe("unavailable");
    expect(result.score).toBe(0.65);
    expect(result.cautions?.join(" ")).toContain("measurements are invalid");
    expect(result.reasons.join(" ")).not.toContain("supplied face width");
  });

  const sizeCatalog = [
    buildGlassesItem("small", { dimensions: { frameWidthMm: 120, lensWidthMm: 44 } }),
    buildGlassesItem("medium", { dimensions: { frameWidthMm: 140, lensWidthMm: 50 } }),
    buildGlassesItem("large", { dimensions: { frameWidthMm: 160, lensWidthMm: 55 } }),
  ];

  it("photo scaling cannot change an unavailable size or invent a size ranking", () => {
    const run = (width: number) =>
      recommender.recommend({
        faceShape: buildFaceShapeResult("oval", buildMetrics(width)),
        inventory: sizeCatalog,
      });
    expect(run(0.15)).toEqual(run(0.3));
    expect(run(0.6)).toEqual(run(0.3));
    expect(run(0.3).map((r) => r.score)).toEqual([0.65, 0.65, 0.65]);
    expect(run(0.3).map((r) => r.item.id)).toEqual(["small", "medium", "large"]);
    for (const result of run(0.3)) {
      expect(result.size).toEqual({ status: "unavailable", reason: "measurements-required" });
      expect(result.size).not.toHaveProperty("faceWidthMm");
      expect(result.size).not.toHaveProperty("tier");
    }
  });

  it("explicit measurements stay independent of photo scale and legacy metric overrides", () => {
    const run = (width: number) =>
      recommender.recommend({
        faceShape: buildFaceShapeResult("oval", buildMetrics(width)),
        faceMetrics: buildMetrics(NaN),
        measurements: physicalMeasurements,
        inventory: sizeCatalog,
      });
    expect(run(0.15)).toEqual(run(0.6));
    expect(run(0.3)[0].item.id).toBe("medium");
    expect(run(0.3)[0].score).toBe(0.8);
    expect(run(0.3)[0].size).toMatchObject({ status: "available", faceWidthMm: 140 });

    const noPhysicalInput = recommender.recommend({
      faceShape: ovalFace,
      faceMetrics: buildMetrics(0.9),
      inventory: sizeCatalog,
    });
    expect(noPhysicalInput.map((r) => r.score)).toEqual([0.65, 0.65, 0.65]);
  });

  it("can use independent physical measurements when face shape is unknown", () => {
    const results = recommender.recommend({
      faceShape: buildFaceShapeResult("unknown", buildMetrics(0.3, { geometryValid: false })),
      measurements: physicalMeasurements,
      inventory: sizeCatalog,
    });
    expect(results[0].item.id).toBe("medium");
    expect(results[0].score).toBe(0.6);
    expect(results[0].faceShapeApplied).toBe(false);
    expect(results[0].size.status).toBe("available");
  });

  it("uses neutral weights for missing or invalid catalog dimensions", () => {
    for (const dimensions of [
      undefined,
      {},
      { frameWidthMm: NaN, lensWidthMm: Infinity },
      { frameWidthMm: 0, lensWidthMm: -1 },
    ]) {
      const [result] = recommendOval(
        [buildGlassesItem("unknown", { dimensions })],
        undefined,
        physicalMeasurements,
      );
      expect(result.score).toBe(0.65);
      expect(result.cautions?.join(" ")).toContain("Valid glasses dimensions unavailable");
    }
    for (const dimensions of [
      { frameWidthMm: 140 },
      { lensWidthMm: 50 },
      { frameWidthMm: 140, lensWidthMm: NaN },
    ]) {
      const [result] = recommendOval(
        [buildGlassesItem("partial", { dimensions })],
        undefined,
        physicalMeasurements,
      );
      expect(result.score).toBe(0.725);
    }
  });

  it("explains mismatches against supplied physical measurements", () => {
    const [result] = recommendOval(
      [buildGlassesItem("too-big", { dimensions: { frameWidthMm: 180, lensWidthMm: 60 } })],
      undefined,
      physicalMeasurements,
    );
    expect(result.score).toBe(0.5);
    expect(result.cautions?.join(" ")).toContain("20mm rule tolerance");
    expect(result.cautions?.join(" ")).toContain("above the rule's 46-52mm range");
  });

  it("uses eye-center distance only when explicitly supplied, without changing its score", () => {
    const inventory = [
      buildGlassesItem("wide-lens", {
        dimensions: { frameWidthMm: 140, lensWidthMm: 70 },
      }),
    ];
    const [withoutEye] = recommendOval(inventory, undefined, physicalMeasurements);
    const [withEye] = recommendOval(inventory, undefined, {
      ...physicalMeasurements,
      eyeCenterDistanceMm: 62,
    });
    expect(withEye.score).toBe(withoutEye.score);
    expect(withoutEye.cautions?.join(" ")).not.toContain("eye-center");
    expect(withEye.cautions?.join(" ")).toContain("supplied eye-center distance (62mm)");
  });
});

describe("generic preferences and output contract", () => {
  it("ranks preferences without requiring a fabricated face analysis", () => {
    const results = recommender.recommend({
      inventory: [
        buildGlassesItem("plain"),
        buildGlassesItem("preferred", {
          shapeCategory: "cat-eye",
          brand: "Example",
          material: "acetate",
          colors: ["black"],
          price: 100,
        }),
        buildGlassesItem("over-budget", { brand: "Example", price: 400 }),
      ],
      preferences: {
        brands: ["example"],
        preferredShapes: ["cat-eye"],
        preferredMaterials: ["ACETATE"],
        preferredColors: ["BLACK"],
        maxPrice: 200,
      },
    });
    expect(results.map((r) => r.item.id)).toEqual(["preferred", "plain"]);
    expect(results[0].score).toBe(0.85);
    expect(results[0].faceShapeApplied).toBe(false);
    expect(results[0].size.status).toBe("unavailable");
    expect(results[0].reasons.join(" ")).toContain("preferred brand");
    expect(results[0].reasons.join(" ")).toContain("acetate");
    expect(results[0].reasons.join(" ")).toContain("black");
  });

  it("keeps unknown prices with a budget caution and neutral price weight", () => {
    const [result] = recommender.recommend({
      inventory: [buildGlassesItem("unknown-price", { price: undefined })],
      preferences: { maxPrice: 200 },
    });
    expect(result.score).toBe(0.4);
    expect(result.cautions?.join(" ")).toContain("cannot be verified against your budget");
  });

  it("preserves inventory order for ties, returns explanations and does not mutate inputs", () => {
    const inventory = buildItemsByShape(["cat-eye", "rectangle", "aviator"]);
    const before = structuredClone(inventory);
    const results = recommender.recommend({ inventory });
    expect(results.map((r) => r.item.id)).toEqual(inventory.map((r) => r.id));
    expect(inventory).toEqual(before);
    for (const result of results) {
      expect(result.reasons.length).toBeGreaterThan(0);
      expect(Number.isFinite(result.score)).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
    }
  });

  it("returns an empty array for an empty inventory", () => {
    expect(recommender.recommend({ inventory: [] })).toEqual([]);
  });
});
