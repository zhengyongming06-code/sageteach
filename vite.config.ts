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
          const cleanLinks = links.map((l) => l.replace(/ crossorigin/g, ""));
          out = out.replace("</head>", `${cleanLinks.join("\n    ")}\n  </head>`);
        }
        if (scripts.length > 0) {
          const cleanScripts = scripts.map((s) => s.replace(/ crossorigin/g, ""));
          const preload = cleanScripts
            .map((s) => {
              const href = s.match(/src="([^"]+)"/)?.[1];
              return href ? `    <link rel="modulepreload" href="${href}" />\n` : "";
            })
            .join("");
          if (preload) {
            out = out.replace("</head>", `${preload}  </head>`);
          }
          out = out.replace("</body>", `${cleanScripts.join("\n    ")}\n  </body>`);
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
    // Single bundle ? avoids lazy chunk MIME failures when SPA fallback serves index.html for /assets/*.
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
