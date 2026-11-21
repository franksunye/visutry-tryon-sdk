import { existsSync } from "node:fs";
import { isAbsolute } from "node:path";
import { defineConfig, devices } from "@playwright/test";

const fakeVideo = process.env.VISUTRY_FAKE_VIDEO;
if (!fakeVideo || !isAbsolute(fakeVideo) || !existsSync(fakeVideo)) {
  throw new Error("VISUTRY_FAKE_VIDEO must name an existing absolute Y4M path. See e2e/fixtures/README.md.");
}
const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH;

export default defineConfig({
  testDir: "./e2e",
  // The old demo.spec.ts describes five unreachable legacy CDN entries and
  // skips camera failures. This release gate exercises the reference demo.
  testMatch: ["reference-demo.spec.ts", "photo-analysis.spec.ts"],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 120000,
  expect: { timeout: 15000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:5173",
    // Full Chromium's new headless mode supplies the browser media delegate;
    // the default headless shell does not implement the same permission UI.
    channel: "chromium",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    permissions: ["camera"],
    acceptDownloads: true,
    launchOptions: {
      ...(executablePath ? { executablePath } : {}),
      args: [
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
        `--use-file-for-fake-video-capture=${fakeVideo}`,
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
      ],
    },
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 } },
  ],
  webServer: {
    command: "pnpm dev --host 127.0.0.1 --port 5173",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
  },
});
