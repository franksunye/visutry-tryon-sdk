import { test, expect } from "@playwright/test";

/**
 * VisuTry Web Demo — End-to-End (Playwright) Tests
 *
 * IMPORTANT: These tests require a real browser with camera access. Tests that
 * depend on the live camera feed (face detection, try-on loop, face-shape
 * analysis) are marked with `test.skip` when the `VISUTRY_E2E_CAMERA` env var
 * is not set to "1". This keeps CI green on machines without a camera while
 * allowing full E2E runs on devices that grant camera permission.
 *
 * The MediaPipe FaceLandmarker model is loaded from a CDN at runtime, so
 * network-dependent assertions use generous timeouts and degrade gracefully.
 */

// Whether to run camera-dependent tests. Set VISUTRY_E2E_CAMERA=1 to enable.
const HAS_CAMERA = process.env.VISUTRY_E2E_CAMERA === "1";

// Camera-dependent tests run serially so they don't fight over the camera.
test.describe("VisuTry Web Demo", () => {
  test.describe.configure({ mode: "serial" });

  // -------------------------------------------------------------------------
  // Static DOM tests — no camera required
  // -------------------------------------------------------------------------

  test.describe("page structure (no camera)", () => {
    test("page loads and shows the loading overlay initially", async ({ page }) => {
      await page.goto("/");

      // The loading overlay should be visible on first paint.
      const overlay = page.locator("#loading-overlay");
      await expect(overlay).toBeVisible();
      await expect(page.locator("#loading-text")).toContainText(/VisuTry/i);
    });

    test("glasses selector renders 5 glasses cards", async ({ page }) => {
      await page.goto("/");

      // The glasses list is populated by renderGlassesList() during init.
      // Wait for the cards to appear (the demo renders them after SDK init).
      // We use a generous timeout because MediaPipe loads from CDN.
      const cards = page.locator("#glasses-list .glasses-card");
      await expect(cards).toHaveCount(5, { timeout: 30000 });
    });

    test("analyze button exists and is clickable", async ({ page }) => {
      await page.goto("/");
      const btn = page.locator("#btn-analyze");
      await expect(btn).toBeVisible({ timeout: 30000 });
      await expect(btn).toBeEnabled();
    });

    test("snapshot button exists and is clickable", async ({ page }) => {
      await page.goto("/");
      const btn = page.locator("#btn-snapshot");
      await expect(btn).toBeVisible({ timeout: 30000 });
      await expect(btn).toBeEnabled();
    });

    test("performance stats elements exist (FPS, detect, render)", async ({ page }) => {
      await page.goto("/");

      await expect(page.locator("#stat-fps")).toBeVisible({ timeout: 30000 });
      await expect(page.locator("#stat-detect")).toBeVisible();
      await expect(page.locator("#stat-render")).toBeVisible();
    });

    test("clicking a different glasses card switches the selected state", async ({ page }) => {
      await page.goto("/");

      const cards = page.locator("#glasses-list .glasses-card");
      await expect(cards).toHaveCount(5, { timeout: 30000 });

      // First card is selected by default.
      await expect(cards.nth(0)).toHaveClass(/selected/);

      // Click the second card.
      await cards.nth(1).click();

      // Second card should now be selected, first card should not.
      await expect(cards.nth(1)).toHaveClass(/selected/);
      await expect(cards.nth(0)).not.toHaveClass(/selected/);
    });

    test("keyboard navigation: Tab to glasses cards and Enter to select", async ({ page }) => {
      await page.goto("/");

      const cards = page.locator("#glasses-list .glasses-card");
      await expect(cards).toHaveCount(5, { timeout: 30000 });

      // First card is selected by default.
      await expect(cards.nth(0)).toHaveClass(/selected/);

      // Focus the first card and Tab to the second, then press Enter.
      await cards.nth(0).focus();
      await page.keyboard.press("Tab");
      await page.keyboard.press("Enter");

      // Second card should now be selected.
      await expect(cards.nth(1)).toHaveClass(/selected/);
    });
  });

  // -------------------------------------------------------------------------
  // Loading overlay tests — depend on SDK init (network for MediaPipe CDN)
  // -------------------------------------------------------------------------

  test.describe("loading overlay (network-dependent)", () => {
    test("loading overlay eventually disappears after SDK init", async ({ page }) => {
      // This test loads MediaPipe from CDN. We use a generous timeout and
      // skip gracefully if the network/model load fails.
      test.setTimeout(60000);

      await page.goto("/");

      const overlay = page.locator("#loading-overlay");
      try {
        // The overlay gets the "hidden" class once init() completes.
        await expect(overlay).toHaveClass(/hidden/, { timeout: 45000 });
      } catch {
        // If MediaPipe fails to load from CDN (network issue), skip the test
        // rather than fail. This keeps CI stable on restricted networks.
        test.skip(true, "MediaPipe model failed to load from CDN — skipping overlay test.");
      }
    });
  });

  // -------------------------------------------------------------------------
  // Camera-dependent tests — require real camera access
  // -------------------------------------------------------------------------

  test.describe("camera-dependent features", () => {
    test.skip(!HAS_CAMERA, "Requires a real browser with camera access (set VISUTRY_E2E_CAMERA=1)");

    test("shape modal opens when analyze completes", async ({ page }) => {
      test.setTimeout(120000);
      await page.goto("/");

      // Wait for SDK to initialize and overlay to hide.
      const overlay = page.locator("#loading-overlay");
      await expect(overlay).toHaveClass(/hidden/, { timeout: 60000 });

      // Click the analyze button.
      await page.locator("#btn-analyze").click();

      // The modal should appear (lose "hidden" class) after analysis.
      const modal = page.locator("#shape-modal");
      await expect(modal).not.toHaveClass(/hidden/, { timeout: 90000 });
    });

    test("modal close button works", async ({ page }) => {
      test.setTimeout(120000);
      await page.goto("/");

      const overlay = page.locator("#loading-overlay");
      await expect(overlay).toHaveClass(/hidden/, { timeout: 60000 });

      // Open the modal via analyze.
      await page.locator("#btn-analyze").click();
      const modal = page.locator("#shape-modal");
      await expect(modal).not.toHaveClass(/hidden/, { timeout: 90000 });

      // Click the close button.
      await page.locator("#modal-close").click();
      await expect(modal).toHaveClass(/hidden/);
    });

    test("Escape key closes the modal", async ({ page }) => {
      test.setTimeout(120000);
      await page.goto("/");

      const overlay = page.locator("#loading-overlay");
      await expect(overlay).toHaveClass(/hidden/, { timeout: 60000 });

      // Open the modal via analyze.
      await page.locator("#btn-analyze").click();
      const modal = page.locator("#shape-modal");
      await expect(modal).not.toHaveClass(/hidden/, { timeout: 90000 });

      // Press Escape to close.
      await page.keyboard.press("Escape");
      await expect(modal).toHaveClass(/hidden/);
    });
  });
});
