import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

/** CSS in head, single JS module at end of body; strip crossorigin for WeChat webview. */
function wechatBuildCompat(): Plugin {
  return {
    name: "wechat-build-compat",
    transformIndexHtml: {
      order: "post",
      handler(html) {
        const links = [...html.matchAll(/<link rel="stylesheet"[^>]+>/g)].map((m) => m[0]);
        const scripts = [...html.matchAll(/<script type="module"[^>]+><\/script>/g)].map(
          (m) => m[0],
        );

        let out = html.replace(/ crossorigin/g, "");
        out = out.replace(/<link rel="stylesheet"[^>]+>\n?/g, "");
        out = out.replace(/<script type="module"[^>]+><\/script>\n?/g, "");

        if (links.length > 0) {
          const cleanLink = links[links.length - 1]!.replace(/ crossorigin/g, "");
          out = out.replace("</head>", `    ${cleanLink}\n  </head>`);
        }
        if (scripts.length > 0) {
          const cleanScript = scripts[scripts.length - 1]!.replace(/ crossorigin/g, "");
          out = out.replace("</body>", `    ${cleanScript}\n  </body>`);
        }
        return out;
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
    wechatBuildCompat(),
  ],
  build: {
    outDir: "dist",
    // Conservative targets for WeChat in-app browser (iOS WKWebView / Android X5).
    target: "es2018",
    cssTarget: "chrome61",
    modulePreload: false,
  },
  publicDir: "public",
});
