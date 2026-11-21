import { expect, test } from "@playwright/test";
import type { PhotoVerification } from "./analysis-harness";

declare global {
  interface Window { __photoCameraRequests: number }
}

test("real IMAGE-mode analysis uses intrinsic non-square geometry without camera or AR assets", async ({ page }, testInfo) => {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.addInitScript(() => {
    window.__photoCameraRequests = 0;
    navigator.mediaDevices.getUserMedia = async () => {
      window.__photoCameraRequests += 1;
      throw new Error("Photo analysis must not acquire a camera");
    };
  });
  await page.goto("/e2e/analysis-harness.html");
  for (const kind of ["landscape", "portrait"] as const) {
    const output = await page.evaluate((kind) => window.__analysisQa.analyze(kind), kind);
    expect(output).not.toHaveProperty("error");
    const result = output as PhotoVerification;
    await testInfo.attach(`${kind}-analysis.json`, {
      body: Buffer.from(JSON.stringify(result, null, 2)), contentType: "application/json",
    });
    expect(result.status).toBe("accepted");
    expect(result.faceCount).toBe(1);
    expect(result.imageSize).toEqual(kind === "landscape" ? { width: 640, height: 480 } : { width: 480, height: 640 });
    expect(result.result.metrics.geometryValid).toBe(true);
    expect(result.result.metrics.visutry!.faceAspectRatio).toBeCloseTo(result.pixelAspectRatio!, 3);
    expect(result.result.version).toBe("0.3.0");
  }
  expect(requests.some((url) => /\.glb(?:\?|$)|three(?:\.js|[-/])|ThreeJsRenderer/.test(url))).toBe(false);
  expect(await page.evaluate(() => window.__photoCameraRequests)).toBe(0);
  await page.evaluate(() => window.__analysisQa.destroy());
});

test("real IMAGE detector observes multiple faces and the shared analysis rejects the observation", async ({ page }) => {
  await page.goto("/e2e/analysis-harness.html");
  const output = await page.evaluate(() => window.__analysisQa.analyze("two-faces")) as PhotoVerification;
  expect(output.faceCount).toBeGreaterThan(1);
  expect(output.status).toBe("rejected");
  expect(output.result).toMatchObject({ primary: "unknown", confidence: 0, candidates: [] });
  expect(output.result.warnings).toContain("MULTIPLE_FACES");
  await page.evaluate(() => window.__analysisQa.destroy());
});

test("no-face photo has an explicit recoverable result and the same analyzer can retry", async ({ page }) => {
  await page.goto("/e2e/analysis-harness.html");
  expect(await page.evaluate(() => window.__analysisQa.analyze("blank"))).toEqual({ error: "FACE_NOT_DETECTED" });
  const output = await page.evaluate(() => window.__analysisQa.analyze("landscape")) as PhotoVerification;
  expect(output.status).toBe("accepted");
  await page.evaluate(() => window.__analysisQa.destroy());
});
