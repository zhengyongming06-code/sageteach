import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { DiagnosticTest } from "@/components/diagnostic-test";

/** Standalone entry for diagnostic flow (Step 4 will also open from Today banner). */
export const Route = createFileRoute("/_authenticated/app/diagnostic")({
  component: DiagnosticPage,
});

function DiagnosticPage() {
  const { user } = useAuth();

  if (!user?.id) return null;

  return (
    <div className="mx-auto max-w-lg space-y-4 pb-8">
      <Link
        to="/app/today"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        返回 Today
      </Link>
      <DiagnosticTest userId={user.id} onClose={() => window.history.back()} />
    </div>
  );
}
