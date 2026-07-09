import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type {
  GlassesAssetManifest,
  GlassesPose,
  IRenderer,
  RenderOptions,
  RenderTarget,
  SnapshotOptions,
  SnapshotResult,
} from "@visutry/tryon-core";
import { createSDKError, t } from "@visutry/tryon-core";

const UNIT_TO_MM: Record<GlassesAssetManifest["coordinateSystem"]["unit"], number> = {
  millimeter: 1,
  centimeter: 10,
  meter: 1000,
};

/**
 * Three.js renderer for the VisuTry web SDK.
 *
 * Coordinate contract: an orthographic camera is set up so that render-world
 * units map 1:1 to normalized image space (y ∈ [-0.5, 0.5], x scaled by aspect).
 * The glasses model is normalized to millimetres on load; `GlassesPose.scale`
 * (produced by the core solver, which already folds in `MM_TO_RENDER_WORLD`)
 * converts millimetres to render-world units.
 *
 * The canvas is transparent so it can overlay a CSS-positioned `<video>`.
 */
export class ThreeJsRenderer implements IRenderer {
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.OrthographicCamera | null = null;
  private glassesGroup: THREE.Group | null = null;
  private gltfLoader = new GLTFLoader();
  private currentAsset: GlassesAssetManifest | null = null;
  private width = 1;
  private height = 1;
  private canvas: HTMLCanvasElement | null = null;
  private contextLost = false;
  private disposed = false;
  private loadRetries = 0;
  private readonly maxLoadRetries = 2;

  async initialize(target: RenderTarget, options?: RenderOptions): Promise<void> {
    const canvas = this.resolveCanvas(target);
    if (!canvas) {
      throw createSDKError("RENDERER_INIT_FAILED", t("error.renderer_init_failed"));
    }
    const opts: Required<RenderOptions> = {
      width: options?.width ?? canvas.clientWidth ?? 640,
      height: options?.height ?? canvas.clientHeight ?? 480,
      mirror: options?.mirror ?? false,
      background: options?.background ?? "transparent",
      pixelRatio: options?.pixelRatio ?? window.devicePixelRatio ?? 1,
      antialias: options?.antialias ?? true,
      maxTextureSize: options?.maxTextureSize ?? 4096,
    };

    this.width = opts.width;
    this.height = opts.height;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: opts.background === "transparent",
      antialias: opts.antialias,
      preserveDrawingBuffer: true, // required for snapshot via toDataURL
    });
    this.renderer.setPixelRatio(opts.pixelRatio);
    this.renderer.setSize(opts.width, opts.height, false);
    this.renderer.setClearColor(0x000000, opts.background === "transparent" ? 0 : 1);

    // WebGL context loss / restore handling.
    this.canvas = canvas;
    canvas.addEventListener("webglcontextlost", this.onContextLost);
    canvas.addEventListener("webglcontextrestored", this.onContextRestored);

    this.scene = new THREE.Scene();
    this.setupCamera(opts.width, opts.height);
    this.setupLights();
  }

  async loadGlasses(asset: GlassesAssetManifest): Promise<void> {
    if (this.disposed) {
      throw createSDKError("RENDERER_INIT_FAILED", t("error.renderer_disposed"));
    }
    if (!this.scene) {
      throw createSDKError("RENDERER_INIT_FAILED", t("error.renderer_init_failed"));
    }
    this.currentAsset = asset;
    // Reset retry counter for this new load attempt.
    this.loadRetries = 0;

    // Retry glTF loading with a fixed 500ms delay between attempts.
    let gltf;
    let lastErr: unknown;
    while (true) {
      try {
        gltf = await this.gltfLoader.loadAsync(asset.modelUrl);
        this.loadRetries = 0;
        break;
      } catch (err) {
        lastErr = err;
        if (this.loadRetries < this.maxLoadRetries) {
          await this.delay(500);
          this.loadRetries++;
          continue;
        }
        throw createSDKError("GLASSES_LOAD_FAILED", `${t("error.glasses_load_failed")} ${asset.modelUrl}`, lastErr);
      }
    }

    // Normalize the model to millimetres.
    const unitFactor = UNIT_TO_MM[asset.coordinateSystem.unit];
    const root = gltf.scene;
    root.scale.setScalar(unitFactor);
    // Apply default rotation/scale from the manifest as the baseline; the
    // per-frame pose from the solver multiplies on top via the group.
    root.rotation.set(
      asset.fitting.defaultRotation.x,
      asset.fitting.defaultRotation.y,
      asset.fitting.defaultRotation.z,
    );

    if (this.glassesGroup) {
      this.disposeObject(this.glassesGroup);
      this.scene.remove(this.glassesGroup);
    }
    this.glassesGroup = new THREE.Group();
    this.glassesGroup.add(root);
    this.glassesGroup.visible = false;
    this.scene.add(this.glassesGroup);
  }

  applyPose(pose: GlassesPose): void {
    if (this.disposed || !this.glassesGroup) return;
    this.glassesGroup.visible = pose.visible;
    if (!pose.visible) return;
    this.glassesGroup.position.set(pose.position.x, pose.position.y, pose.position.z);
    this.glassesGroup.rotation.set(pose.rotation.x, pose.rotation.y, pose.rotation.z);
    // The model was normalized to mm; pose.scale converts mm → render-world.
    this.glassesGroup.scale.setScalar(pose.scale.x);
  }

  setVisible(visible: boolean): void {
    if (this.disposed) return;
    if (this.glassesGroup) this.glassesGroup.visible = visible;
  }

  /**
   * Render a single frame. Called by the SDK facade's tracking loop on every
   * animation frame. Safe to call when no glasses are loaded (renders an empty
   * transparent scene). Becomes a no-op while the WebGL context is lost or
   * after disposal.
   */
  renderFrame(): void {
    if (this.disposed || this.contextLost || !this.renderer || !this.scene || !this.camera) return;
    this.renderer.render(this.scene, this.camera);
  }

  async snapshot(options?: SnapshotOptions): Promise<SnapshotResult> {
    if (this.disposed) {
      throw createSDKError("SNAPSHOT_FAILED", t("error.renderer_disposed"));
    }
    if (this.contextLost) {
      throw createSDKError("SNAPSHOT_FAILED", t("error.snapshot_failed"));
    }
    if (!this.renderer) {
      throw createSDKError("SNAPSHOT_FAILED", t("error.snapshot_failed"));
    }
    const format = options?.format ?? "image/png";
    const quality = options?.quality ?? 0.92;
    const w = options?.width ?? this.width;
    const h = options?.height ?? this.height;

    if (!this.renderer || !this.scene || !this.camera) {
      throw createSDKError("SNAPSHOT_FAILED", t("error.snapshot_failed"));
    }
    // Render at requested resolution.
    const needResize = w !== this.width || h !== this.height;
    if (needResize) this.renderer.setSize(w, h, false);
    this.renderer.render(this.scene, this.camera);
    const dataUrl = this.renderer.domElement.toDataURL(format, quality);
    if (needResize) this.renderer.setSize(this.width, this.height, false);

    return {
      dataUrl,
      width: w,
      height: h,
      timestamp: Date.now(),
    };
  }

  resize(width: number, height: number): void {
    if (this.disposed || !this.renderer || !this.camera) return;
    this.width = width;
    this.height = height;
    this.renderer.setSize(width, height, false);
    this.setupCamera(width, height);
  }

  isContextLost(): boolean {
    return this.contextLost;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.canvas) {
      this.canvas.removeEventListener("webglcontextlost", this.onContextLost);
      this.canvas.removeEventListener("webglcontextrestored", this.onContextRestored);
      this.canvas = null;
    }
    if (this.glassesGroup) {
      this.disposeObject(this.glassesGroup);
      this.glassesGroup = null;
    }
    this.renderer?.dispose();
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.currentAsset = null;
    this.contextLost = false;
  }

  get currentGlassesAsset(): GlassesAssetManifest | null {
    return this.currentAsset;
  }

  // -----------------------------------------------------------------------

  private onContextLost = (event: Event): void => {
    event.preventDefault();
    this.contextLost = true;
    console.warn("[VisuTrySDK]", "ThreeJsRenderer: WebGL context lost.");
  };

  private onContextRestored = (): void => {
    this.contextLost = false;
    console.info("[VisuTrySDK]", "ThreeJsRenderer: WebGL context restored.");
    // Re-setup the scene (camera, lights) after context loss.
    this.scene = new THREE.Scene();
    this.setupCamera(this.width, this.height);
    this.setupLights();
    // Reload glasses if a model was previously loaded.
    if (this.currentAsset) {
      this.glassesGroup = null;
      this.loadGlasses(this.currentAsset).catch((err) => {
        console.warn("[VisuTrySDK]", "ThreeJsRenderer: failed to reload glasses after context restore:", err);
      });
    }
  };

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private setupCamera(width: number, height: number): void {
    const aspect = width / height || 1;
    // Render-world: x ∈ [-aspect/2, aspect/2], y ∈ [-0.5, 0.5].
    this.camera = new THREE.OrthographicCamera(
      -aspect / 2,
      aspect / 2,
      0.5,
      -0.5,
      -10,
      10,
    );
    this.camera.position.set(0, 0, 5);
    this.camera.lookAt(0, 0, 0);
  }

  private setupLights(): void {
    if (!this.scene) return;
    const ambient = new THREE.AmbientLight(0xffffff, 0.9);
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(0, 0.5, 1);
    this.scene.add(ambient);
    this.scene.add(dir);
  }

  private resolveCanvas(target: RenderTarget): HTMLCanvasElement | null {
    if (typeof target === "string") {
      return document.querySelector(target);
    }
    const resolved = target as { __brand?: string; el?: unknown };
    if (resolved && resolved.__brand === "HTMLCanvasElement" && resolved.el instanceof HTMLCanvasElement) {
      return resolved.el;
    }
    if (target instanceof HTMLCanvasElement) return target;
    return null;
  }

  private disposeObject(obj: THREE.Object3D): void {
    obj.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const material = mesh.material as THREE.Material | THREE.Material[];
      if (Array.isArray(material)) {
        material.forEach((m) => this.disposeMaterial(m));
      } else if (material) {
        this.disposeMaterial(material);
      }
    });
  }

  private disposeMaterial(material: THREE.Material): void {
    // Dispose all texture maps attached to the material to prevent GPU memory leaks.
    const mat = material as THREE.Material & Record<string, THREE.Texture | null | undefined>;
    const textureProps = ["map", "normalMap", "roughnessMap", "metalnessMap", "aoMap", "emissiveMap", "bumpMap", "displacementMap", "alphaMap", "envMap"];
    for (const prop of textureProps) {
      const tex = mat[prop];
      if (tex) tex.dispose();
    }
    material.dispose();
  }
}
