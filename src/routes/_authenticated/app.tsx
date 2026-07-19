import { createFileRoute, Outlet, Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { recordAnalyticsActivity } from "@/lib/analytics/api";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { appCanvasClass } from "@/lib/shell-styles";
import { WikiAppSidebar } from "@/components/wiki-app-sidebar";
import { WikiMobileMenu } from "@/components/wiki-mobile-menu";

export const Route = createFileRoute("/_authenticated/app")({
  component: AppShell,
});

const tabs = [
  { to: "/app/today", label: "今日", match: (path: string) => path.startsWith("/app/today") },
  { to: "/app/review", label: "复盘", match: (path: string) => path.startsWith("/app/review") },
  { to: "/app/learn", label: "辅学", match: (path: string) => path.startsWith("/app/learn") },
] as const;

function AppShell() {
  const { user, signOut } = useAuth();
  const nav = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [menuOpen, setMenuOpen] = useState(false);
  const isReviewChat =
    path.startsWith("/app/review") && !path.includes("/archive");

  const { isAdmin } = useIsAdmin();

  const handleSignOut = async () => {
    await signOut();
    window.location.href = "/";
  };

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
        isReviewChat && "h-dvh max-h-dvh overflow-hidden",
      )}
    >
      <aside className="wiki-sidebar fixed inset-y-0 left-0 z-30 hidden w-64 min-h-0 flex-col overflow-hidden p-5 md:flex">
        <WikiAppSidebar showAdmin={isAdmin} onSignOut={handleSignOut} />
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
          <div className="mx-auto grid max-w-lg grid-cols-4">
            {tabs.map((t) => {
              const active = t.match(path);
              return (
                <Link
                  key={t.to}
                  to={t.to}
                  search={t.to === "/app/learn" ? {} : undefined}
                  data-active={active}
                  className="wiki-mobile-tab"
                >
                  {t.label}
                </Link>
              );
            })}
            <button
              type="button"
              data-active={menuOpen ? "true" : undefined}
              className="wiki-mobile-tab"
              aria-label="我的"
              onClick={() => setMenuOpen(true)}
            >
              我的
            </button>
          </div>
        </nav>
      ) : null}

      {!isReviewChat ? (
        <WikiMobileMenu
          open={menuOpen}
          onOpenChange={setMenuOpen}
          showAdmin={isAdmin}
          onSignOut={handleSignOut}
        />
      ) : null}
    </div>
  );
}
