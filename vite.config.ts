import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

// Client-only SPA: single `dist/` with `index.html` + hashed assets (Cloudflare Pages).
export default defineConfig({
  /** Expose ERNIE_API_KEY to the client for Review photo analysis (see ernie-vl.ts). */
  envPrefix: ["VITE_", "ERNIE_"],
  plugins: [
    // Single bundle — WeChat webview often fails on lazy route chunks.
    TanStackRouterVite({ target: "react", autoCodeSplitting: false }),
    react(),
    tailwindcss(),
    tsconfigPaths(),
  ],
  build: {
    outDir: "dist",
    target: ["es2020", "chrome64", "safari12"],
  },
  publicDir: "public",
});
