import { createFileRoute, Outlet, Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { recordAnalyticsActivity } from "@/lib/analytics/api";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { ThemeToggle } from "@/components/theme-toggle";
import { appCanvasClass } from "@/lib/shell-styles";
import { WikiAppSidebar } from "@/components/wiki-app-sidebar";

export const Route = createFileRoute("/_authenticated/app")({
  component: AppShell,
});

const tabs = [
  { to: "/app/today", label: "今日" },
  { to: "/app/review", label: "复盘" },
] as const;

function AppShell() {
  const { user, signOut } = useAuth();
  const nav = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const isReviewChat =
    path.startsWith("/app/review") && !path.includes("/archive");

  const { isAdmin } = useIsAdmin();

  useEffect(() => {
    if (!user?.id) return;
    void recordAnalyticsActivity();
  }, [user?.id]);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      try {
        const { data } = await supabase
          .from("profiles")
          .select("onboarded")
          .eq("id", user.id)
          .maybeSingle();
        if (data && !data.onboarded) nav({ to: "/onboarding" });
      } catch (err) {
        console.warn("[app-shell] profile onboarded check failed", err);
      }
    })();
  }, [user, nav]);

  useEffect(() => {
    if (path === "/app" || path === "/app/") nav({ to: "/app/today", replace: true });
  }, [path, nav]);

  return (
    <div
      className={cn(
        appCanvasClass,
        "flex min-h-screen",
        isReviewChat && "h-screen max-h-screen overflow-hidden",
      )}
    >
      <aside className="wiki-sidebar fixed inset-y-0 left-0 z-30 hidden w-64 min-h-0 flex-col overflow-hidden p-5 md:flex">
        <WikiAppSidebar
          showAdmin={isAdmin}
          onSignOut={async () => {
            await signOut();
            window.location.href = "/";
          }}
        />
      </aside>

      <main className={cn("wiki-main md:pl-64", isReviewChat && "flex min-h-0 flex-col overflow-hidden")}>
        <div
          className={cn(
            isReviewChat
              ? "mx-auto flex h-full min-h-0 w-full max-w-none flex-1 flex-col"
              : "wiki-page-wrap",
          )}
        >
          <Outlet />
        </div>
      </main>

      {!isReviewChat ? (
        <nav className="wiki-mobile-nav safe-bottom fixed inset-x-0 bottom-0 z-40 md:hidden">
          <div className={cn("mx-auto grid max-w-lg", isAdmin ? "grid-cols-3" : "grid-cols-2")}>
            {tabs.map((t) => {
              const active = path.startsWith(t.to);
              return (
                <Link
                  key={t.to}
                  to={t.to}
                  data-active={active}
                  className="wiki-mobile-tab"
                >
                  {t.label}
                </Link>
              );
            })}
            {isAdmin ? (
              <Link
                to="/app/admin/analytics"
                data-active={path.startsWith("/app/admin")}
                className="wiki-mobile-tab"
              >
                分析
              </Link>
            ) : null}
          </div>
        </nav>
      ) : null}

      {!isReviewChat ? (
        <div className="pointer-events-none fixed right-4 top-4 z-20 md:hidden">
          <div className="pointer-events-auto">
            <ThemeToggle />
          </div>
        </div>
      ) : null}
    </div>
  );
}
