import { describe, it, expect } from "vitest";
import type {
  RecommendationInput,
  UserPreferences,
} from "@visutry/tryon-core";
import {
  Recommender,
  FACE_SHAPE_FRAME_MATCH,
  estimateFaceWidthMm,
  estimateEyeCenterDistanceMm,
  recommendSize
} from "./index.js";
import {
  buildGlassesItem,
  buildItemsByShape,
  buildMetrics,
  buildFaceShapeResult,
} from "./__fixtures__/fixtures.js";

const recommender = new Recommender();

/** Medium face: normalized faceWidth 0.3 -> ~140mm -> medium tier. */
const mediumMetrics = buildMetrics(0.3);
const ovalFace = buildFaceShapeResult("oval", mediumMetrics);

/** Helper to run recommend with the oval/medium baseline. */
function recommendOval(
  inventory: RecommendationInput["inventory"],
  preferences?: UserPreferences,
) {
  return recommender.recommend({
    faceShape: ovalFace,
    inventory,
    preferences,
  });
}

// ---------------------------------------------------------------------------
// Shape x frame matching (spec §16.3 / §16.5)
// ---------------------------------------------------------------------------

describe("Recommender — shape matching", () => {
  it("matches an oval face: rectangle scores higher than a non-matching shape", () => {
    const results = recommendOval(
      buildItemsByShape(["rectangle", "cat-eye"]),
    );
    const rect = results.find((r) => r.item.shapeCategory === "rectangle")!;
    const catEye = results.find((r) => r.item.shapeCategory === "cat-eye")!;

    // shape 40 + size 30 + price 10 = 80 -> 0.8 (rectangle, match)
    expect(rect.score).toBeCloseTo(0.8, 5);
    // shape 0 + size 30 + price 10 = 40 -> 0.4 (cat-eye, no match)
    expect(catEye.score).toBeCloseTo(0.4, 5);
    expect(results[0].item.shapeCategory).toBe("rectangle");
  });

  it("round face: angular frames (rectangle) beat round frames", () => {
    const results = recommender.recommend({
      faceShape: buildFaceShapeResult("round", mediumMetrics),
      inventory: buildItemsByShape(["rectangle", "round"]),
    });
    const rect = results.find((r) => r.item.shapeCategory === "rectangle")!;
    const round = results.find((r) => r.item.shapeCategory === "round")!;
    expect(rect.score).toBeCloseTo(0.8, 5);
    expect(round.score).toBeCloseTo(0.4, 5);
  });

  it("square face: round frames beat rectangle frames", () => {
    const results = recommender.recommend({
      faceShape: buildFaceShapeResult("square", mediumMetrics),
      inventory: buildItemsByShape(["round", "rectangle"]),
    });
    const round = results.find((r) => r.item.shapeCategory === "round")!;
    const rect = results.find((r) => r.item.shapeCategory === "rectangle")!;
    expect(round.score).toBeCloseTo(0.8, 5);
    expect(rect.score).toBeCloseTo(0.4, 5);
  });

  it("heart face: rectangle beats round", () => {
    const results = recommender.recommend({
      faceShape: buildFaceShapeResult("heart", mediumMetrics),
      inventory: buildItemsByShape(["rectangle", "round"]),
    });
    const rect = results.find((r) => r.item.shapeCategory === "rectangle")!;
    const round = results.find((r) => r.item.shapeCategory === "round")!;
    expect(rect.score).toBeCloseTo(0.8, 5);
    expect(round.score).toBeCloseTo(0.4, 5);
  });

  it("diamond face: oval beats rectangle", () => {
    const results = recommender.recommend({
      faceShape: buildFaceShapeResult("diamond", mediumMetrics),
      inventory: buildItemsByShape(["oval", "rectangle"]),
    });
    const oval = results.find((r) => r.item.shapeCategory === "oval")!;
    const rect = results.find((r) => r.item.shapeCategory === "rectangle")!;
    expect(oval.score).toBeCloseTo(0.8, 5);
    expect(rect.score).toBeCloseTo(0.4, 5);
  });

  it("oblong face: round beats rectangle", () => {
    const results = recommender.recommend({
      faceShape: buildFaceShapeResult("oblong", mediumMetrics),
      inventory: buildItemsByShape(["round", "rectangle"]),
    });
    const round = results.find((r) => r.item.shapeCategory === "round")!;
    const rect = results.find((r) => r.item.shapeCategory === "rectangle")!;
    expect(round.score).toBeCloseTo(0.8, 5);
    expect(rect.score).toBeCloseTo(0.4, 5);
  });

  it("unknown face: every frame gets a neutral medium weight", () => {
    const results = recommender.recommend({
      faceShape: buildFaceShapeResult("unknown", mediumMetrics),
      inventory: buildItemsByShape(["rectangle", "cat-eye"]),
    });
    const rect = results.find((r) => r.item.shapeCategory === "rectangle")!;
    const catEye = results.find((r) => r.item.shapeCategory === "cat-eye")!;
    // shape 20 + size 30 + price 10 = 60 -> 0.6 for both
    expect(rect.score).toBeCloseTo(0.6, 5);
    expect(catEye.score).toBeCloseTo(0.6, 5);
  });

  it("non-matching shape produces a shape caution", () => {
    const results = recommendOval(buildItemsByShape(["cat-eye"]));
    const catEye = results[0];
    expect(catEye.cautions).toBeDefined();
    expect(catEye.cautions!.some((c) => c.includes("not typically recommended"))).toBe(true);
  });

  it("preferredShapes lifts a non-matching frame to a medium weight", () => {
    // cat-eye does not match an oval face (0) -> with preference it becomes 20.
    const withPref = recommendOval(buildItemsByShape(["cat-eye"]), {
      preferredShapes: ["cat-eye"],
    });
    const withoutPref = recommendOval(buildItemsByShape(["cat-eye"]));
    expect(withoutPref[0].score).toBeCloseTo(0.4, 5);
    // shape 20 + size 30 + price 10 = 60 -> 0.6
    expect(withPref[0].score).toBeCloseTo(0.6, 5);
  });

  it("exposes the FACE_SHAPE_FRAME_MATCH table", () => {
    expect(FACE_SHAPE_FRAME_MATCH.oval).toContain("rectangle");
    expect(FACE_SHAPE_FRAME_MATCH.unknown).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Size recommendation (spec §16.4)
// ---------------------------------------------------------------------------

describe("Recommender — size recommendation", () => {
  it("estimateFaceWidthMm converts normalized faceWidth to mm (0.3 -> 140)", () => {
    expect(estimateFaceWidthMm(buildMetrics(0.3))).toBeCloseTo(140, 5);
  });

  it("estimateFaceWidthMm falls back to average when metric is invalid", () => {
    expect(estimateFaceWidthMm(buildMetrics(0))).toBeCloseTo(140, 5);
    expect(estimateFaceWidthMm(buildMetrics(0.3, { faceWidth: -1 }))).toBeCloseTo(140, 5);
  });

  it("classifies the three size tiers correctly", () => {
    const small = recommendSize(buildMetrics(0.25)); // ~116.7mm
    const medium = recommendSize(buildMetrics(0.3)); // ~140mm
    const large = recommendSize(buildMetrics(0.34)); // ~158.7mm

    expect(small.tier).toBe("small");
    expect(small.lensWidthRange).toEqual([38, 46]);
    expect(small.faceWidthMm).toBeLessThan(130);

    expect(medium.tier).toBe("medium");
    expect(medium.lensWidthRange).toEqual([46, 52]);
    expect(medium.faceWidthMm).toBeGreaterThanOrEqual(130);
    expect(medium.faceWidthMm).toBeLessThanOrEqual(145);

    expect(large.tier).toBe("large");
    expect(large.lensWidthRange).toEqual([52, 58]);
    expect(large.faceWidthMm).toBeGreaterThan(145);
  });

  it("awards full size score for a perfect medium-face fit", () => {
    // frameWidth 140 (==face) + lensWidth 50 (in 46-52) -> size 30
    const results = recommendOval([
      buildGlassesItem("perfect", {
        shapeCategory: "rectangle",
        dimensions: { frameWidthMm: 140, lensWidthMm: 50 },
      }),
    ]);
    // shape 40 + size 30 + price 10 = 80 -> 0.8
    expect(results[0].score).toBeCloseTo(0.8, 5);
    expect(results[0].cautions).toBeUndefined();
  });

  it("uses input.faceMetrics override when provided", () => {
    // faceShape carries medium metrics, but faceMetrics overrides to large.
    const results = recommender.recommend({
      faceShape: ovalFace,
      faceMetrics: buildMetrics(0.34), // large face ~158.7mm
      inventory: [
        buildGlassesItem("large-fit", {
          shapeCategory: "rectangle",
          dimensions: { frameWidthMm: 159, lensWidthMm: 55 }, // perfect for large
        }),
      ],
    });
    // shape 40 + size 30 (perfect on large tier) + price 10 = 80 -> 0.8
    expect(results[0].score).toBeCloseTo(0.8, 5);
    expect(results[0].cautions).toBeUndefined();
  });

  it("estimates eye-center distance in mm", () => {
    // 0.3 * 0.53 = 0.159 normalized -> * (140/0.3) ~= 74.2mm
    const mm = estimateEyeCenterDistanceMm(buildMetrics(0.3));
    expect(mm).toBeGreaterThan(70);
    expect(mm).toBeLessThan(80);
  });
});

// ---------------------------------------------------------------------------
// Brand / color / material preferences (spec §16.5)
// ---------------------------------------------------------------------------

describe("Recommender — preferences", () => {
  it("adds a brand preference bonus", () => {
    const results = recommendOval(
      [
        buildGlassesItem("branded", { shapeCategory: "rectangle", brand: "Ray-Ban" }),
        buildGlassesItem("plain", { shapeCategory: "rectangle" }),
      ],
      { brands: ["Ray-Ban"] },
    );
    const branded = results.find((r) => r.item.id === "branded")!;
    const plain = results.find((r) => r.item.id === "plain")!;
    // branded: 40 + 30 + 10 + 10 = 90 -> 0.9 ; plain: 40 + 30 + 10 = 80 -> 0.8
    expect(branded.score).toBeCloseTo(0.9, 5);
    expect(plain.score).toBeCloseTo(0.8, 5);
    expect(results[0].item.id).toBe("branded");
  });

  it("adds color and material preference bonuses", () => {
    const results = recommendOval(
      [
        buildGlassesItem("styled", {
          shapeCategory: "rectangle",
          material: "acetate",
          colors: ["black", "tortoise"],
        }),
      ],
      { preferredMaterials: ["acetate"], preferredColors: ["black"] },
    );
    // 40 + 30 + 5 (material) + 5 (color) + 10 = 90 -> 0.9
    expect(results[0].score).toBeCloseTo(0.9, 5);
    expect(results[0].reasons.some((r) => r.includes("acetate"))).toBe(true);
    expect(results[0].reasons.some((r) => r.includes("black"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Price (spec §16.5)
// ---------------------------------------------------------------------------

describe("Recommender — price", () => {
  it("filters out items exceeding maxPrice", () => {
    const results = recommendOval(
      [
        buildGlassesItem("cheap", { shapeCategory: "rectangle", price: 100 }),
        buildGlassesItem("expensive", { shapeCategory: "rectangle", price: 500 }),
      ],
      { maxPrice: 200 },
    );
    expect(results).toHaveLength(1);
    expect(results[0].item.id).toBe("cheap");
    expect(results.find((r) => r.item.id === "expensive")).toBeUndefined();
  });

  it("keeps items without a price even when maxPrice is set", () => {
    const results = recommendOval(
      [buildGlassesItem("no-price", { shapeCategory: "rectangle", price: undefined })],
      { maxPrice: 200 },
    );
    expect(results).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Output ordering & edge cases
// ---------------------------------------------------------------------------

describe("Recommender — ordering & edge cases", () => {
  it("returns results sorted by score descending", () => {
    const results = recommendOval([
      buildGlassesItem("cat-eye", { shapeCategory: "cat-eye" }), // 0.4
      buildGlassesItem("rect-nodims", { shapeCategory: "rectangle", dimensions: undefined }), // 0.65
      buildGlassesItem("rect", { shapeCategory: "rectangle" }), // 0.8
    ]);
    const scores = results.map((r) => r.score);
    const sorted = [...scores].sort((a, b) => b - a);
    expect(scores).toEqual(sorted);
    // strictly decreasing in this fixture
    expect(results[0].score).toBeGreaterThan(results[1].score);
    expect(results[1].score).toBeGreaterThan(results[2].score);
    expect(results[0].item.id).toBe("rect");
    expect(results[1].item.id).toBe("rect-nodims");
    expect(results[2].item.id).toBe("cat-eye");
  });

  it("returns an empty array for an empty inventory", () => {
    expect(recommendOval([])).toEqual([]);
  });

  it("generates cautions when the size does not match", () => {
    const results = recommendOval([
      buildGlassesItem("too-big", {
        shapeCategory: "rectangle",
        dimensions: { frameWidthMm: 180, lensWidthMm: 60 }, // both way off for 140mm
      }),
    ]);
    expect(results[0].cautions).toBeDefined();
    expect(results[0].cautions!.length).toBeGreaterThan(0);
    const text = results[0].cautions!.join(" ");
    expect(text.includes("Frame width") || text.includes("Lens width")).toBe(true);
    // shape 40 + size 0 + price 10 = 50 -> 0.5
    expect(results[0].score).toBeCloseTo(0.5, 5);
  });

  it("always returns reasons for every recommended item", () => {
    const results = recommendOval(buildItemsByShape(["rectangle", "cat-eye"]));
    for (const r of results) {
      expect(r.reasons.length).toBeGreaterThan(0);
    }
  });
});
