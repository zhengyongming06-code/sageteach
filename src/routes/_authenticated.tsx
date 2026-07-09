import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { weakArchiveQueryOptions } from "@/lib/weak-archive";

export const Route = createFileRoute("/_authenticated")({
  component: Guard,
});

function Guard() {
  const { session, loading } = useAuth();
  const qc = useQueryClient();
  const [checked, setChecked] = useState(false);
  const [authTimedOut, setAuthTimedOut] = useState(false);

  useEffect(() => {
    if (!loading) return;
    const t = window.setTimeout(() => setAuthTimedOut(true), 5000);
    return () => window.clearTimeout(t);
  }, [loading]);

  useEffect(() => {
    if (loading && !authTimedOut) return;
    if (!session) {
      window.location.replace("/login");
      return;
    }
    setChecked(true);
  }, [loading, session, authTimedOut]);

  useEffect(() => {
    const uid = session?.user?.id;
    if (loading || !uid) return;
    void qc.prefetchQuery(weakArchiveQueryOptions(uid));
  }, [loading, session?.user?.id, qc]);

  if ((loading && !authTimedOut) || !checked) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-6">
        <div className="h-2 w-2 animate-pulse rounded-full bg-muted-foreground/60" aria-hidden />
        <p className="text-sm text-muted-foreground">加载中…</p>
      </div>
    );
  }
  return <Outlet />;
}
