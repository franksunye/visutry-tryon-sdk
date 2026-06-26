import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  root: resolve(__dirname),
  server: {
    port: 5173,
    open: true,
    host: true,
    headers: {
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    },
  },
  build: {
    outDir: "dist",
    target: "es2020",
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          "three-vendor": ["three"],
          "mediapipe-vendor": ["@mediapipe/tasks-vision"],
        },
      },
    },
  },
  optimizeDeps: {
    exclude: ["@visutry/tryon-core", "@visutry/tryon-web"],
  },
  resolve: {
    alias: {
      "@visutry/tryon-core": resolve(__dirname, "../../packages/core/src"),
      "@visutry/tryon-web": resolve(__dirname, "../../packages/web/src"),
      "@visutry/recommender": resolve(__dirname, "../../packages/recommender/src"),
      "@visutry/demo-assets": resolve(__dirname, "../../packages/demo-assets"),
    },
  },
});
