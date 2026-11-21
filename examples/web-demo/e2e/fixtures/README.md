# Browser camera fixture

`astronaut.png` is the unmodified 512 × 512 test image from the official
[scikit-image v0.26.0 source](https://github.com/scikit-image/scikit-image/blob/v0.26.0/src/skimage/data/astronaut.png).
Its SHA-256 is:

```text
88431cd9653ccd539741b555fb0a46b61558b301d4110412b5bc28b5e3ea6cb5
```

The [scikit-image image documentation](https://scikit-image.org/docs/0.26.x/api/skimage.data.html#skimage.data.astronaut)
credits the NASA Great Images database and identifies the photograph as public
domain with no known copyright restrictions. The depicted person is astronaut
Eileen Collins. Attribution here records the source; it does not imply NASA or
the subject endorses VisuTry.

This image is **test-only**. It is not copied to `public/` or shipped as a demo
shopper, and the browser tests send no photograph to an AI provider. MediaPipe
face detection runs locally in Chromium against a file-backed video device.

## Create the local video

From the repository root, with FFmpeg installed. The fixture command downloads
the pinned source and checks the SHA-256 above; the PNG and generated video
remain outside Git:

```bash
pnpm demo:fixture

ffmpeg -hide_banner -loglevel error -y -loop 1 \
  -i examples/web-demo/e2e/fixtures/astronaut.png \
  -vf 'crop=320:320:60:0,scale=480:480,pad=640:480:80:0' \
  -r 15 -t 2 -pix_fmt yuv420p /tmp/visutry-reference.y4m

VISUTRY_FAKE_VIDEO=/tmp/visutry-reference.y4m pnpm demo:test
```

The derivative is a 640 × 480, 15 fps Y4M sequence. Chromium loops the still
sequence as a real `getUserMedia` video source. The crop makes the face large
enough for repeatable landmark detection; it does not represent head motion or
multiple face/lighting cases. The generated Y4M remains outside the repository.

The default uses Playwright's installed full Chromium in new headless mode
(`channel: "chromium"`) with a simulated media-permission UI for the file-backed
device. Native `getUserMedia`, video playback, MediaPipe, and WebGL still run;
only the permission-error case deliberately injects one `NotAllowedError`.
For a local system browser,
add `PLAYWRIGHT_EXECUTABLE_PATH=/usr/bin/chromium`. The config fails immediately
if `VISUTRY_FAKE_VIDEO` is absent or not an existing absolute path; no test skips
or CDN-failure passes are used.

On failure, the gate attaches `browser-diagnostics.json` and prints the native
camera/playback stage and original error name/message in CI logs. It fails
immediately when the demo enters its error state instead of waiting for the
initialization timeout.

## What the gate verifies

- Real GLTFLoader and WebGL projected geometry, including the 140 mm frame's
  expected pixel width at `MM_TO_RENDER_WORLD = 1 / 200`.
- Explicit camera start, actual MediaPipe face detection and pose updates.
- A downloaded opaque PNG that contains the camera photograph and a nonempty
  glasses overlay, with matching mirroring.
- Stopped media tracks and stopped pose emissions.
- Recovery after a blocked GLB and one deliberately injected
  `getUserMedia` `NotAllowedError`; success then uses the native camera API.
- Video/overlay registration and overflow at a 430 × 932 viewport.

These are desktop Chromium tests with a recorded input and software WebGL.
They do **not** certify a real mobile camera, Safari, physical fit, moving-head
occlusion, multiple faces, low light, or target-device frame rate. Those remain
separate live-device acceptance tasks.

The renderer harness is served only by the development server under `e2e/`;
it is not a production Vite build entry. Historical `demo.spec.ts` assertions
describe the former auto-start/five-CDN-item UI and are outside this reference
release gate.
