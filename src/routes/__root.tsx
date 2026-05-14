import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth";
import { Toaster } from "@/components/ui/sonner";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-semibold text-foreground">404</h1>
        <p className="mt-4 text-base text-muted-foreground">这里什么都没有。</p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
          >
            回首页
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold text-foreground">页面加载失败</h1>
        <p className="mt-2 text-sm text-muted-foreground">先深呼吸，再试一次。</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => { router.invalidate(); reset(); }}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            重试
          </button>
          <a href="/" className="rounded-xl border border-border bg-background px-4 py-2 text-sm">回首页</a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "Sage — AI study coach for Gaokao" },
      { name: "description", content: "Sage helps Chinese high school students reflect, plan, and improve—with calm, focused coaching." },
      { name: "theme-color", content: "#f8f9fa" },
      { property: "og:title", content: "Sage — AI study coach" },
      { name: "twitter:title", content: "Sage — AI study coach" },
      { property: "og:description", content: "Calm, focused AI coaching for Chinese high school students." },
      { name: "twitter:description", content: "Calm, focused AI coaching for Chinese high school students." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/993ce899-269e-492e-9eda-49c003579246/id-preview-9e6f7dc8--aa51c74e-0e9e-4603-a9f1-17eb8bdb139e.lovable.app-1778502320658.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/993ce899-269e-492e-9eda-49c003579246/id-preview-9e6f7dc8--aa51c74e-0e9e-4603-a9f1-17eb8bdb139e.lovable.app-1778502320658.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <head><HeadContent /></head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

/** Sonner touches `document` / portals; mount only on client to avoid SSR/hydration glitches on Workers. */
function ClientToaster() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return <Toaster position="top-center" />;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Outlet />
        <ClientToaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}
