import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { LearnSubjectMobileBar } from "@/components/learn-subject-mobile-bar";
import { KnowledgeTopicTree } from "@/components/knowledge-topic-tree";
import {
  fetchLearnHubTopicsEnriched,
  learnHubQueryKeys,
} from "@/lib/knowledge-tracking/learn-hub";
import { SAGE_KNOWLEDGE_REFRESH_EVENT } from "@/lib/knowledge-tracking/ingest-client";
import { consolidationNextStep } from "@/lib/knowledge-tracking/remediation-progress";
import { LearnConsolidationBadge } from "@/components/learn-consolidation-badge";
import { subjectAccentTaskClass } from "@/lib/subject-accent";
import type { Subject } from "@/lib/subjects";
import { cn } from "@/lib/utils";

type LearnHubPanelProps = {
  userId: string;
  subjectFilter?: Subject;
};

function formatHubDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
}

export function LearnHubPanel({ userId, subjectFilter }: LearnHubPanelProps) {
  const qc = useQueryClient();

  useEffect(() => {
    const refresh = () => {
      void qc.invalidateQueries({ queryKey: ["learn-hub-topics", userId] });
    };
    window.addEventListener(SAGE_KNOWLEDGE_REFRESH_EVENT, refresh);
    return () => window.removeEventListener(SAGE_KNOWLEDGE_REFRESH_EVENT, refresh);
  }, [qc, userId]);

  const { data: topics = [], isLoading } = useQuery({
    queryKey: learnHubQueryKeys.topics(userId, subjectFilter),
    queryFn: () => fetchLearnHubTopicsEnriched(userId, subjectFilter),
    staleTime: 30_000,
  });

  return (
    <div className={cn("wiki-learn-layout", !subjectFilter && "wiki-learn-layout-hub-only")}>
      {subjectFilter ? <KnowledgeTopicTree subject={subjectFilter} hubMode /> : null}

      <article className="wiki-prose wiki-prose-sheet">
        <LearnSubjectMobileBar subject={subjectFilter} showAllTab />

        <nav className="wiki-breadcrumb" aria-label="面包屑">
          <Link to="/app/today">今日</Link>
          <span className="wiki-breadcrumb-sep">›</span>
          {subjectFilter ? (
            <>
              <Link to="/app/learn">我的考点</Link>
              <span className="wiki-breadcrumb-sep">›</span>
              <span className="text-[var(--wiki-nav-fg)]">{subjectFilter}</span>
            </>
          ) : (
            <span className="text-[var(--wiki-nav-fg)]">我的考点</span>
          )}
        </nav>

        <header className="wiki-prose-section !mt-0">
          <h1 className="wiki-page-title">
            {subjectFilter ? `${subjectFilter} · 我的考点` : "我的考点"}
          </h1>
        </header>

        {isLoading ? (
          <p className="wiki-prose-sub">加载中…</p>
        ) : topics.length === 0 ? (
          <section className="wiki-prose-section">
            <div className="wiki-callout">
              <p className="text-sm leading-relaxed">
                {subjectFilter
                  ? `还没有${subjectFilter}识点记录。`
                  : "考点来自复盘：在「复盘」里拍错题，解析完成后会自动识点入库（无需额外操作）。"}
              </p>
              {!subjectFilter ? (
                <p className="mt-2 text-sm leading-relaxed text-[var(--wiki-muted)]">
                  入库后为「待巩固」；看完视频或练完题可标记进度，练完即「已掌握」。
                </p>
              ) : null}
              <Link
                to="/app/review"
                search={subjectFilter ? { subject: subjectFilter } : undefined}
                className="wiki-link-text mt-3 inline-flex text-sm"
              >
                去复盘拍第一道错题 →
              </Link>
            </div>
          </section>
        ) : (
          <section className="wiki-prose-section">
            <ul className="wiki-prose-list">
              {topics.map((t) => {
                const dateLabel = formatHubDate(t.last_wrong_at ?? t.last_event_at);
                const nextStep = consolidationNextStep(t.consolidation_phase);
                return (
                  <li key={`${t.subject}-${t.name}`} className={cn(subjectAccentTaskClass(t.subject))}>
                    <Link
                      to="/app/learn"
                      search={{ subject: t.subject, topic: t.name }}
                      className="flex items-start justify-between gap-3 no-underline"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="wiki-tag">{t.subject}</span>
                          <LearnConsolidationBadge phase={t.consolidation_phase} />
                          {dateLabel ? (
                            <time className="wiki-prose-sub text-xs tabular-nums">{dateLabel}</time>
                          ) : null}
                        </div>
                        <p className="mt-1.5 text-sm font-medium leading-snug text-[var(--wiki-fg)]">
                          {t.name}
                        </p>
                        <p className="mt-1 text-xs text-[var(--wiki-nav-fg)]">
                          {nextStep ?? "巩固已完成"}
                          {t.mastery_score != null ? ` · 掌握度 ${Math.round(t.mastery_score)}` : ""}
                        </p>
                      </div>
                      <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-[var(--wiki-muted)]" aria-hidden />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </article>
    </div>
  );
}
