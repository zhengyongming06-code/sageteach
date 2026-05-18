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

  useEffect(() => {
    if (loading) return;
    if (!session) {
      // redirect to login
      window.location.replace("/login");
      return;
    }
    setChecked(true);
  }, [loading, session]);

  useEffect(() => {
    const uid = session?.user?.id;
    if (loading || !uid) return;
    void qc.prefetchQuery(weakArchiveQueryOptions(uid));
  }, [loading, session?.user?.id, qc]);

  if (loading || !checked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-sm text-muted-foreground">加载中…</div>
      </div>
    );
  }
  return <Outlet />;
}
