import { createFileRoute, Outlet, Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Calendar, MessageCircle, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/app")({
  component: AppShell,
});

const tabs = [
  { to: "/app/today", label: "Today", icon: Calendar },
  { to: "/app/review", label: "Review", icon: MessageCircle },
] as const;

function AppShell() {
  const { user, signOut } = useAuth();
  const nav = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (!user) return;
    void supabase
      .from("profiles")
      .select("onboarded")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data && !data.onboarded) nav({ to: "/onboarding" });
      })
      .catch((err) => {
        console.warn("[app-shell] profile onboarded check failed", err);
      });
  }, [user, nav]);

  useEffect(() => {
    if (path === "/app" || path === "/app/") nav({ to: "/app/today", replace: true });
  }, [path, nav]);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-sidebar-border bg-sidebar p-4 text-sidebar-foreground md:flex">
        <Link to="/app/today" className="mb-8 flex items-center gap-2.5 px-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-sidebar-primary text-sm font-semibold text-sidebar-primary-foreground">
            S
          </span>
          <span className="text-lg font-semibold tracking-tight text-sidebar-foreground">Sage</span>
        </Link>
        <nav className="flex flex-col gap-0.5">
          {tabs.map((t) => {
            const active = path.startsWith(t.to);
            const className = `flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition ${
              active
                ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
            }`;
            return (
              <Link key={t.to} to={t.to} className={className}>
                <t.icon className="h-4 w-4 opacity-90" /> {t.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto">
          <button
            type="button"
            onClick={async () => {
              await signOut();
              window.location.href = "/";
            }}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </aside>

      <main className="flex min-h-0 flex-1 flex-col md:pl-60">
        <div className="mx-auto flex min-h-0 max-w-5xl flex-1 flex-col px-5 pb-28 pt-6 md:pb-12 md:pt-10">
          <Outlet />
        </div>
      </main>

      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur md:hidden">
        <div className="mx-auto grid max-w-lg grid-cols-2">
          {tabs.map((t) => {
            const active = path.startsWith(t.to);
            const className = `flex flex-col items-center gap-1 px-1 py-2.5 text-[11px] ${
              active ? "font-medium text-primary" : "text-muted-foreground"
            }`;
            return (
              <Link key={t.to} to={t.to} className={className}>
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
