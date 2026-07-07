import { createFileRoute, Link } from "@tanstack/react-router";
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
    <div className="wiki-page-wrap pb-10">
      <article className="wiki-prose wiki-prose-sheet mx-auto max-w-2xl">
        <nav className="wiki-breadcrumb" aria-label="面包屑">
          <Link to="/app/today">首页</Link>
          <span className="wiki-breadcrumb-sep">›</span>
          <span className="text-[var(--wiki-nav-fg)]">知识点诊断</span>
        </nav>
        <DiagnosticTest userId={user.id} />
      </article>
    </div>
  );
}
