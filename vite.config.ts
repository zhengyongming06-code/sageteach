// @lovable.dev/vite-tanstack-config already includes the following ? do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// TanStack Start SSR: Vite builds `dist/client` (static) + `dist/server` (Worker).
// Production wrangler.json uses compatibility_date >= 2024-09-23 (required for nodejs_compat v2 in @cloudflare/vite-plugin).
// Local dev still uses `tanstackStart.server.entry` ? src/server.ts via the Cloudflare Vite plugin.
// Default Vite `assets/` matches browser requests to `/assets/...` for the ASSETS binding.
export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    build: {
      outDir: "dist",
    },
    publicDir: "public",
  },
});
