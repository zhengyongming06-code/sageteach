import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

/** Load stylesheet before the module script so first paint is styled. */
function cssBeforeJs(): Plugin {
  return {
    name: "css-before-js",
    transformIndexHtml: {
      order: "post",
      handler(html) {
        const link = html.match(/<link rel="stylesheet"[^>]+>/);
        const script = html.match(/<script type="module"[^>]+><\/script>/);
        if (!link || !script) return html;
        return html
          .replace(link[0], "")
          .replace(script[0], "")
          .replace("</head>", `    ${link[0]}\n    ${script[0]}\n  </head>`);
      },
    },
  };
}

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
    cssBeforeJs(),
  ],
  build: {
    outDir: "dist",
    target: ["es2020", "chrome64", "safari12"],
    modulePreload: false,
  },
  publicDir: "public",
});
