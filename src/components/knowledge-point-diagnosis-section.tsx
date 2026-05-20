import { Link } from "@tanstack/react-router";
import {
  KNOWLEDGE_POINT_STATUSES,
  KNOWLEDGE_POINT_STATUS_DOT_CLASS,
  type KnowledgePointStatus,
} from "@/lib/knowledge-points";
import {
  groupKnowledgePointsBySubject,
  type UserKnowledgePointRow,
} from "@/lib/knowledge-points-db";
import { SUBJECTS } from "@/lib/subjects";
import { subjectBadgeClass } from "@/lib/subject-accent";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<KnowledgePointStatus, string> = {
  薄弱: "薄弱",
  掌握中: "掌握中",
  已掌握: "已掌握",
  未测试: "未测试",
};

type KnowledgePointDiagnosisSectionProps = {
  rows: UserKnowledgePointRow[];
  showDiagnosticLink?: boolean;
  className?: string;
};

export function KnowledgePointDiagnosisSection({
  rows,
  showDiagnosticLink = true,
  className,
}: KnowledgePointDiagnosisSectionProps) {
  const grouped = groupKnowledgePointsBySubject(rows);
  const hasAnyTested = rows.some((r) => r.status !== "未测试");

  return (
    <section
      className={cn(
        "rounded-3xl border border-border bg-card p-4 shadow-sm",
        className,
      )}
      aria-label="知识点诊断"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">知识点诊断</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            各科目知识点掌握情况（诊断与复盘会更新状态）
          </p>
        </div>
        {showDiagnosticLink ? (
          <Link
            to="/app/diagnostic"
            className="shrink-0 text-xs font-medium text-primary hover:underline"
          >
            {hasAnyTested ? "测其他科目 →" : "去做诊断 →"}
          </Link>
        ) : null}
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {KNOWLEDGE_POINT_STATUSES.map((status) => (
          <li key={status} className="flex items-center gap-1.5">
            <span
              className={cn("h-2 w-2 shrink-0 rounded-full", KNOWLEDGE_POINT_STATUS_DOT_CLASS[status])}
              aria-hidden
            />
            {STATUS_LABEL[status]}
          </li>
        ))}
      </ul>

      <div className="mt-4 space-y-4">
        {SUBJECTS.map((subject) => {
          const points = grouped[subject];
          if (points.length === 0) return null;
          return (
            <div key={subject}>
              <span className={cn(subjectBadgeClass(subject), "mb-2 inline-block")}>
                {subject}
              </span>
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {points.map((p) => (
                  <li
                    key={`${p.subject}-${p.name}`}
                    className="flex min-w-0 items-center gap-2 rounded-lg border border-border/60 bg-muted/20 px-2.5 py-1.5 text-sm"
                  >
                    <span
                      className={cn(
                        "h-2 w-2 shrink-0 rounded-full",
                        KNOWLEDGE_POINT_STATUS_DOT_CLASS[p.status],
                      )}
                      title={p.status}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate text-foreground">{p.name}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{p.status}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
