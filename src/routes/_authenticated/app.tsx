import { createFileRoute, Outlet, Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Calendar, MessageCircle, NotebookPen, TrendingUp, BookOpen, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/app")({
  component: AppShell,
});

const tabs = [
  { to: "/app/today", label: "今日", icon: Calendar },
  { to: "/app/review", label: "复盘", icon: NotebookPen },
  { to: "/app/coach", label: "教练", icon: MessageCircle },
  { to: "/app/plan", label: "提分", icon: TrendingUp },
  { to: "/app/articles", label: "文章", icon: BookOpen },
] as const;

function AppShell() {
  const { user, signOut } = useAuth();
  const nav = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });

  // ensure onboarded
  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("onboarded").eq("id", user.id).maybeSingle().then(({ data }) => {
      if (data && !data.onboarded) nav({ to: "/onboarding" });
    });
  }, [user, nav]);

  // Redirect /app -> /app/today
  useEffect(() => {
    if (path === "/app" || path === "/app/") nav({ to: "/app/today", replace: true });
  }, [path, nav]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Desktop side nav */}
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-border bg-sidebar p-4 md:flex">
        <Link to="/app/today" className="mb-8 flex items-center gap-2 px-2 font-semibold">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-primary text-primary-foreground text-sm">学</span>
          Sage 学习教练
        </Link>
        <nav className="flex flex-col gap-1">
          {tabs.map((t) => {
            const active = path.startsWith(t.to);
            return (
              <Link key={t.to} to={t.to} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
                <t.icon className="h-4 w-4" /> {t.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto">
          <button onClick={async () => { await signOut(); window.location.href = "/"; }}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted-foreground hover:bg-muted">
            <LogOut className="h-4 w-4" /> 退出
          </button>
        </div>
      </aside>

      <main className="md:pl-60">
        <div className="mx-auto max-w-3xl px-5 pb-28 pt-6 md:pt-10 md:pb-12">
          <Outlet />
        </div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/90 backdrop-blur md:hidden safe-bottom">
        <div className="mx-auto grid max-w-md grid-cols-5">
          {tabs.map((t) => {
            const active = path.startsWith(t.to);
            return (
              <Link key={t.to} to={t.to} className={`flex flex-col items-center gap-1 px-1 py-2.5 text-[11px] ${active ? "text-primary" : "text-muted-foreground"}`}>
                <t.icon className="h-5 w-5" />
                {t.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
