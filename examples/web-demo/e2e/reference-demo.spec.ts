import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import type { RendererQa } from "./renderer-harness";

interface CameraAudit {
  requests: number;
  streams: MediaStream[];
  denyNext: boolean;
  events: Array<{
    operation: "getUserMedia" | "play";
    outcome: "start" | "success" | "error" | "injected-error";
    name?: string;
    message?: string;
    trackCount?: number;
  }>;
}
declare global {
  interface Window { __cameraAudit: CameraAudit }
}
type RendererWindow = Window & { __rendererQa: RendererQa };
const browserMessages = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const messages: string[] = [];
  browserMessages.set(page, messages);
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") messages.push(`${message.type()}: ${message.text()}`);
  });
  page.on("pageerror", (error) => messages.push(`pageerror: ${error.message}`));
});

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status === testInfo.expectedStatus) return;
  const diagnostics = await page.evaluate(() => {
    const audit = window.__cameraAudit;
    const video = document.querySelector<HTMLVideoElement>("#camera-video");
    return {
      state: document.querySelector<HTMLElement>("#stage")?.dataset.state,
      message: document.querySelector("#error-message")?.textContent,
      camera: audit ? {
        requests: audit.requests,
        streamCount: audit.streams.length,
        events: audit.events,
        tracks: audit.streams.map((stream) => stream.getTracks().map((track) => ({ kind: track.kind, readyState: track.readyState }))),
      } : null,
      video: video ? {
        readyState: video.readyState, width: video.videoWidth, height: video.videoHeight,
        attached: video.srcObject !== null,
        error: video.error ? { code: video.error.code, message: video.error.message } : null,
      } : null,
    };
  }).catch((error: unknown) => ({ diagnosticError: String(error) }));
  const messages = browserMessages.get(page) ?? [];
  await testInfo.attach("browser-diagnostics.json", {
    body: Buffer.from(JSON.stringify({ ...diagnostics, messages }, null, 2)), contentType: "application/json",
  });
  // Keep the original browser failure visible in CI logs, without requiring
  // a large trace download. No device IDs, labels, or captured pixels are logged.
  console.error("Browser failure diagnostics:", JSON.stringify(diagnostics));
  for (const message of messages.slice(-8)) console.error(message);
});

async function recordCamera(page: Page, denyFirst = false): Promise<void> {
  await page.addInitScript(({ denyFirst }) => {
    const audit: CameraAudit = { requests: 0, streams: [], denyNext: denyFirst, events: [] };
    window.__cameraAudit = audit;
    const acquire = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      audit.requests++;
      audit.events.push({ operation: "getUserMedia", outcome: "start" });
      // Only this failure-path test injects a permission error. Every success
      // still calls Chromium's real getUserMedia with its file-backed device.
      if (audit.denyNext) {
        audit.denyNext = false;
        audit.events.push({ operation: "getUserMedia", outcome: "injected-error", name: "NotAllowedError" });
        throw new DOMException("Camera permission denied for recovery test", "NotAllowedError");
      }
      try {
        const stream = await acquire(constraints);
        audit.streams.push(stream);
        audit.events.push({ operation: "getUserMedia", outcome: "success", trackCount: stream.getTracks().length });
        return stream;
      } catch (error) {
        audit.events.push({ operation: "getUserMedia", outcome: "error", name: error instanceof Error ? error.name : "unknown", message: error instanceof Error ? error.message : String(error) });
        throw error;
      }
    };
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = async function (this: HTMLMediaElement): Promise<void> {
      if (this.id !== "camera-video") return play.call(this);
      audit.events.push({ operation: "play", outcome: "start" });
      try {
        await play.call(this);
        audit.events.push({ operation: "play", outcome: "success" });
      } catch (error) {
        audit.events.push({ operation: "play", outcome: "error", name: error instanceof Error ? error.name : "unknown", message: error instanceof Error ? error.message : String(error) });
        throw error;
      }
    };
  }, { denyFirst });
}

async function expectTracking(page: Page): Promise<void> {
  const stage = page.locator("#stage");
  await expect.poll(() => stage.getAttribute("data-state"), {
    timeout: 90000, message: "Demo initialization must settle into ready or report its error",
  }).toMatch(/^(ready|error)$/);
  expect(await stage.getAttribute("data-state"), `Initialization failed: ${await page.locator("#error-message").textContent()}`).toBe("ready");
  await expect(stage).toHaveAttribute("data-glasses-loaded", "true");
  await expect.poll(async () => Number(await stage.getAttribute("data-pose-count")), {
    timeout: 45000, message: "Actual MediaPipe must emit multiple poses from the camera fixture",
  }).toBeGreaterThan(3);
  await expect(page.locator("#face-hint")).toBeHidden();
  await expect(page.locator("#btn-snapshot")).toBeEnabled();
  await expect.poll(() => page.locator("#camera-video").evaluate((element) => {
    const video = element as HTMLVideoElement;
    return video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0 &&
      video.srcObject instanceof MediaStream && video.srcObject.getVideoTracks().some((track) => track.readyState === "live");
  })).toBe(true);
}

async function expectStopped(page: Page): Promise<void> {
  await page.locator("#btn-stop").click();
  await expect(page.locator("#stage")).toHaveAttribute("data-state", "idle");
  await expect.poll(() => page.evaluate(() => {
    const streams = window.__cameraAudit.streams;
    const video = document.querySelector<HTMLVideoElement>("#camera-video")!;
    return streams.length > 0 && streams.every((stream) => stream.getTracks().every((track) => track.readyState === "ended")) && video.srcObject === null;
  })).toBe(true);
  const poses = await page.locator("#stage").getAttribute("data-pose-count");
  // Leave enough time for an already-running asynchronous detector to return.
  // stop must also prevent that late result from emitting another pose.
  await page.waitForTimeout(700);
  await expect(page.locator("#stage")).toHaveAttribute("data-pose-count", poses ?? "0");
  await expect(page.locator("#btn-start")).toBeEnabled();
}

test("real GLB + WebGL preserve 140 mm geometry at the 1/200 calibration", async ({ page }, testInfo) => {
  await page.goto("/e2e/renderer-harness.html");
  await expect(page.locator("#renderer-result")).toHaveAttribute("data-state", "ready", { timeout: 30000 });
  const native = await page.evaluate(() => {
    const qa = (window as RendererWindow).__rendererQa;
    return { calibration: qa.calibration, size: qa.nativeSize, names: qa.meshNames, lenses: qa.transparentLensCount };
  });
  expect(native.calibration).toBe(1 / 200);
  expect(native.size[0]).toBeCloseTo(140, 5);
  expect(native.names).toHaveLength(9);
  expect(native.lenses).toBe(2);

  const front = await page.evaluate(() => (window as RendererWindow).__rendererQa.capture());
  expect(front.bounds).not.toBeNull();
  // Orthographic viewport height = 1 world unit. At 600 px high, the 140 mm
  // frame must span 140 / 200 * 600 = 420 px, not 84,000 px or 2.1 px.
  expect(front.bounds!.width).toBeGreaterThanOrEqual(418);
  expect(front.bounds!.width).toBeLessThanOrEqual(422);
  expect(front.bounds!.height).toBeGreaterThanOrEqual(124);
  expect(front.bounds!.height).toBeLessThanOrEqual(128);
  expect(front.bounds!.pixelCount).toBeGreaterThan(3000);
  await testInfo.attach("reference-front.png", { body: Buffer.from(front.dataUrl.split(",")[1]!, "base64"), contentType: "image/png" });

  const smaller = await page.evaluate(() => (window as RendererWindow).__rendererQa.capture({ scale: { x: 0.5, y: 0.5, z: 0.5 } }));
  expect(smaller.bounds!.width).toBeGreaterThanOrEqual(208);
  expect(smaller.bounds!.width).toBeLessThanOrEqual(212);
  const shifted = await page.evaluate(() => (window as RendererWindow).__rendererQa.capture({ position: { x: 0.1, y: 0, z: 0 } }));
  expect(shifted.bounds!.x - front.bounds!.x).toBeCloseTo(60, 0);
  const angled = await page.evaluate(() => (window as RendererWindow).__rendererQa.capture({ rotation: { x: -0.12, y: 0.5, z: 0 } }));
  expect(angled.bounds!.pixelCount).toBeGreaterThan(3000);
  await testInfo.attach("reference-three-quarter.png", { body: Buffer.from(angled.dataUrl.split(",")[1]!, "base64"), contentType: "image/png" });
});

test("explicit start runs real face tracking, exports camera + glasses, and stops tracks and poses", async ({ page }, testInfo) => {
  await recordCamera(page);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/");
  await expect(page.locator("#stage")).toHaveAttribute("data-state", "idle");
  await expect(page.locator("#btn-start")).toBeEnabled();
  expect(await page.evaluate(() => window.__cameraAudit.requests)).toBe(0);
  await expect(page.locator("#btn-snapshot")).toBeDisabled();

  await page.locator("#btn-start").click();
  await expectTracking(page);
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#btn-snapshot").click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).not.toBeNull();
  const bytes = await readFile(path!);
  expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  await testInfo.attach("camera-plus-glasses.png", { body: bytes, contentType: "image/png" });

  const pixels = await page.evaluate(async (png) => {
    const image = new Image(); image.src = png; await image.decode();
    const video = document.querySelector<HTMLVideoElement>("#camera-video")!;
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d")!;
    context.drawImage(image, 0, 0);
    const actual = context.getImageData(0, 0, canvas.width, canvas.height).data;
    context.clearRect(0, 0, canvas.width, canvas.height);
    const mirrored = new DOMMatrixReadOnly(getComputedStyle(video).transform).a < 0;
    if (mirrored) { context.translate(canvas.width, 0); context.scale(-1, 1); }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const camera = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let opaque = 0; let changed = 0; let dark = 0; let bright = 0;
    for (let i = 0; i < actual.length; i += 4) {
      if (actual[i + 3]! > 250) opaque++;
      const difference = Math.max(Math.abs(actual[i]! - camera[i]!), Math.abs(actual[i + 1]! - camera[i + 1]!), Math.abs(actual[i + 2]! - camera[i + 2]!));
      if (difference > 20) changed++;
      if (camera[i]! + camera[i + 1]! + camera[i + 2]! < 100) dark++;
      if (camera[i]! + camera[i + 1]! + camera[i + 2]! > 650) bright++;
    }
    return { width: canvas.width, height: canvas.height, count: actual.length / 4, opaque, changed, dark, bright };
  }, `data:image/png;base64,${bytes.toString("base64")}`);
  expect(pixels.width).toBe(640);
  expect(pixels.height).toBe(480);
  expect(pixels.opaque / pixels.count).toBeGreaterThan(0.99);
  expect(pixels.dark).toBeGreaterThan(1000);
  expect(pixels.bright).toBeGreaterThan(1000);
  expect(pixels.changed).toBeGreaterThan(200);
  expect(pixels.changed / pixels.count).toBeLessThan(0.2);
  expect(pageErrors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("desktop-tracking.png"), fullPage: true });
  await expectStopped(page);
});

test("a blocked GLB fails visibly before camera use and succeeds on explicit retry", async ({ page }) => {
  await recordCamera(page);
  const model = "**/reference/v1/reference-frame-v1.glb";
  await page.route(model, (route) => route.abort("failed"));
  await page.goto("/");
  await page.locator("#btn-start").click();
  await expect(page.locator("#stage")).toHaveAttribute("data-state", "error", { timeout: 90000 });
  await expect(page.locator("#error-panel")).toBeVisible();
  expect(await page.evaluate(() => window.__cameraAudit.requests)).toBe(0);
  await expect(page.locator("#btn-retry")).toBeEnabled();
  await page.unroute(model);
  await page.locator("#btn-retry").click();
  await expectTracking(page);
  await expectStopped(page);
});

test("a getUserMedia permission failure can retry into the real camera pipeline", async ({ page }) => {
  await recordCamera(page, true);
  await page.goto("/");
  await page.locator("#btn-start").click();
  await expect(page.locator("#stage")).toHaveAttribute("data-state", "error", { timeout: 90000 });
  await expect(page.locator("#error-panel")).toBeVisible();
  expect(await page.evaluate(() => window.__cameraAudit.streams.length)).toBe(0);
  await page.locator("#btn-retry").click();
  await expectTracking(page);
  expect(await page.evaluate(() => window.__cameraAudit.requests)).toBe(2);
  await expectStopped(page);
});

test("430 × 932 viewport keeps video and overlay aligned while tracking", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 430, height: 932 });
  await recordCamera(page);
  await page.goto("/");
  await page.locator("#btn-start").click();
  await expectTracking(page);
  const boxes = await page.evaluate(() => {
    const video = document.querySelector<HTMLVideoElement>("#camera-video")!;
    const canvas = document.querySelector<HTMLCanvasElement>("#tryon-canvas")!;
    const v = video.getBoundingClientRect(); const c = canvas.getBoundingClientRect();
    return { video: { x: v.x, y: v.y, width: v.width, height: v.height }, canvas: { x: c.x, y: c.y, width: c.width, height: c.height }, videoMirror: getComputedStyle(video).transform, canvasMirror: getComputedStyle(canvas).transform, scrollWidth: document.documentElement.scrollWidth, viewport: innerWidth };
  });
  for (const key of ["x", "y", "width", "height"] as const) expect(boxes.video[key]).toBeCloseTo(boxes.canvas[key], 0);
  expect(boxes.video.width / boxes.video.height).toBeCloseTo(4 / 3, 2);
  expect(boxes.videoMirror).toBe(boxes.canvasMirror);
  expect(boxes.scrollWidth).toBeLessThanOrEqual(boxes.viewport);
  await page.screenshot({ path: testInfo.outputPath("mobile-viewport-tracking.png"), fullPage: true });
  await expectStopped(page);
});
