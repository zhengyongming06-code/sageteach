import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { RootErrorBoundary } from "@/components/root-error-boundary";

import { getRouter } from "./router";
import "./styles.css";

const rootEl = document.getElementById("root");

function showBootError(message: string) {
  if (!rootEl) return;
  rootEl.innerHTML = `<div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;text-align:center;font-family:system-ui,sans-serif;background:#f8f9fa;color:#0f1b2d"><p style="font-size:18px;font-weight:600">无法启动应用</p><p style="margin-top:8px;font-size:14px;color:#5c6b7f">${message}</p><button type="button" onclick="location.reload()" style="margin-top:24px;padding:10px 20px;border:none;border-radius:12px;background:#0f1b2d;color:#fff;font-size:14px">刷新</button></div>`;
}

if (!rootEl) {
  throw new Error("Missing #root");
}

try {
  const router = getRouter();
  createRoot(rootEl).render(
    <StrictMode>
      <RootErrorBoundary>
        <RouterProvider router={router} />
      </RootErrorBoundary>
    </StrictMode>,
  );
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  showBootError(msg);
  console.error(e);
}
