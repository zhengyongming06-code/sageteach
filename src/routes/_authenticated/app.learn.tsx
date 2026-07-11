import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, PlayCircle } from "lucide-react";
import { LearnHubPanel } from "@/components/learn-hub-panel";
import { LearnConsolidationBanner } from "@/components/learn-consolidation-banner";
import { KnowledgeTopicRail } from "@/components/knowledge-topic-rail";
import { LearnSubjectMobileBar } from "@/components/learn-subject-mobile-bar";
import { KnowledgeTopicTree } from "@/components/knowledge-topic-tree";
import { useAuth } from "@/lib/auth";
import {
  getKnowledgeTopicEntry,
  isValidLearnSubject,
  resolveLearnTopic,
} from "@/lib/knowledge-topics";
import type { KnowledgeTopicEntry } from "@/lib/knowledge-topics/topic-types";
import { buildKnowledgeRemediation } from "@/lib/knowledge-topics/recommend";
import {
  fetchLatestPhotoContextForTopic,
  fetchLearnHubTopicsEnriched,
  learnHubQueryKeys,
} from "@/lib/knowledge-tracking/learn-hub";
import {
  fetchLearnTopicProgressMerged,
  readLearnTopicProgress,
  recordLearnTopicProgress,
  type RemediationAction,
} from "@/lib/knowledge-tracking/remediation-progress";
import { type Subject } from "@/lib/subjects";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/learn")({
  validateSearch: (raw) => {
    const parsed = z
      .object({
        subject: z.string().optional(),
        topic: z.string().optional(),
      })
      .parse(raw);
    return {
      subject: isValidLearnSubject(parsed.subject) ? parsed.subject : undefined,
      topic: parsed.topic?.trim() || undefined,
    };
  },
  component: LearnPage,
});

function formatPhotoContextDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
}

function mergeTopicEntry(
  catalog: KnowledgeTopicEntry | null,
  remediation: ReturnType<typeof buildKnowledgeRemediation>,
  topic: string,
  subject: Subject,
): KnowledgeTopicEntry {
  if (!remediation) {
    if (catalog) return catalog;
    return {
      subject,
      name: topic,
      slug: topic,
      gradeBand: "高三",
      eyebrow: `${subject} · 我的考点`,
      summary: `来自复盘识点的「${topic}」补学路径。`,
      sections: [],
      videos: [],
      practiceQuestions: [],
      relatedNames: [],
    };
  }

  const base = catalog ?? {
    subject,
    name: topic,
    slug: topic,
    gradeBand: "高三" as const,
    eyebrow: `${subject} · 我的考点`,
    summary:
      remediation.questionSummary ??
      `来自复盘识点的「${topic}」补学路径。`,
    sections: [] as KnowledgeTopicEntry["sections"],
    videos: remediation.videos,
    practiceQuestions: remediation.practiceQuestions,
    relatedNames: remediation.knowledgePoints.slice(1),
  };

  return {
    ...base,
    videos: remediation.videos.length > 0 ? remediation.videos : base.videos,
    practiceQuestions:
      remediation.practiceQuestions.length > 0
        ? remediation.practiceQuestions
        : base.practiceQuestions,
    relatedNames:
      base.relatedNames.length > 0
        ? base.relatedNames
        : remediation.knowledgePoints.slice(1),
  };
}

function LearnTopicPage({
  subject,
  topic,
  userId,
}: {
  subject: Subject;
  topic: string;
  userId: string;
}) {
  const qc = useQueryClient();
  const catalogEntry = useMemo(
    () => getKnowledgeTopicEntry(subject, topic) ?? resolveLearnTopic(subject, topic),
    [subject, topic],
  );

  const { data: hubTopics = [], isLoading: accessLoading } = useQuery({
    queryKey: learnHubQueryKeys.topics(userId, subject),
    queryFn: () => fetchLearnHubTopicsEnriched(userId, subject),
    staleTime: 30_000,
  });

  const hubTopic = hubTopics.find((t) => t.name === topic);
  const hasAccess = Boolean(hubTopic);

  const { data: learnProgress = { video_watched: false, practice_done: false } } = useQuery({
    queryKey: learnHubQueryKeys.topicProgress(userId, subject, topic),
    queryFn: () => fetchLearnTopicProgressMerged(userId, subject, topic),
    enabled: hasAccess,
    staleTime: 15_000,
    initialData: () => readLearnTopicProgress(subject, topic),
  });

  const { data: photoContext } = useQuery({
    queryKey: learnHubQueryKeys.photoContext(userId, subject, topic),
    queryFn: () => fetchLatestPhotoContextForTopic(userId, subject, topic),
    enabled: hasAccess,
    staleTime: 60_000,
  });

  const remediation = useMemo(() => {
    if (!hasAccess) return null;
    return buildKnowledgeRemediation({
      subject,
      knowledge_points: [topic],
      question_type: photoContext?.question_type,
      question_summary: photoContext?.question_summary,
      difficulty: photoContext?.difficulty,
    });
  }, [hasAccess, subject, topic, photoContext]);

  const entry = useMemo(
    () => (hasAccess ? mergeTopicEntry(catalogEntry, remediation, topic, subject) : null),
    [hasAccess, catalogEntry, remediation, topic, subject],
  );

  const [activeSection, setActiveSection] = useState("summary");

  useEffect(() => {
    setActiveSection("summary");
  }, [topic]);

  const markLearnProgress = useCallback(
    async (action: RemediationAction) => {
      const next = await recordLearnTopicProgress({
        subject,
        topic,
        knowledgePoint: topic,
        action,
        current: learnProgress,
      });
      void qc.invalidateQueries({ queryKey: learnHubQueryKeys.topicProgress(userId, subject, topic) });
      void qc.invalidateQueries({ queryKey: learnHubQueryKeys.topics(userId, subject) });
      void qc.invalidateQueries({ queryKey: learnHubQueryKeys.topics(userId) });
      return next;
    },
    [subject, topic, learnProgress, qc, userId],
  );

  const scrollToSection = useCallback((id: string) => {
    setActiveSection(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  if (accessLoading) {
    return (
      <div className="wiki-learn-layout">
        <KnowledgeTopicTree subject={subject} activeName={topic} />
        <article className="wiki-prose wiki-prose-sheet">
          <p className="wiki-prose-sub">加载中…</p>
        </article>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="wiki-learn-layout">
        <KnowledgeTopicTree subject={subject} activeName={topic} />
        <article className="wiki-prose wiki-prose-sheet">
          <LearnSubjectMobileBar subject={subject} />
          <nav className="wiki-breadcrumb" aria-label="面包屑">
            <Link to="/app/today">Home</Link>
            <span className="wiki-breadcrumb-sep">›</span>
            <Link to="/app/learn">我的考点</Link>
            <span className="wiki-breadcrumb-sep">›</span>
            <span className="text-[var(--wiki-nav-fg)]">{topic}</span>
          </nav>
          <header className="wiki-prose-section !mt-0">
            <h1 className="wiki-page-title">{topic}</h1>
            <div className="wiki-meta-row">
              <span>{subject}</span>
            </div>
          </header>
          <section className="wiki-prose-section">
            <div className="wiki-callout">
              <p className="text-sm leading-relaxed">
                此考点需先在复盘里拍题识点，才会生成推荐视频与练题。
              </p>
              <Link
                to="/app/review"
                search={{ subject }}
                className="wiki-link-text mt-3 inline-flex text-sm"
              >
                去{subject}复盘拍题 →
              </Link>
            </div>
          </section>
        </article>
      </div>
    );
  }

  if (!entry) return null;

  return (
    <div className="wiki-learn-layout">
      <KnowledgeTopicTree subject={subject} activeName={entry.name} />

      <article className="wiki-prose wiki-prose-sheet">
        <LearnSubjectMobileBar subject={subject} />
        <nav className="wiki-breadcrumb" aria-label="面包屑">
          <Link to="/app/today">Home</Link>
          <span className="wiki-breadcrumb-sep">›</span>
          <Link to="/app/learn" search={{ subject: entry.subject }}>
            我的考点
          </Link>
          <span className="wiki-breadcrumb-sep">›</span>
          <span className="text-[var(--wiki-nav-fg)]">{entry.name}</span>
        </nav>

        <header id="summary" className="wiki-prose-section !mt-0 scroll-mt-24">
          <p className="wiki-eyebrow">{entry.eyebrow}</p>
          <h1 className="wiki-page-title">{entry.name}</h1>
          <div className="wiki-meta-row">
            <span>{entry.subject}</span>
            <span className="wiki-meta-sep">·</span>
            <span>{entry.gradeBand}</span>
          </div>
          {photoContext ? (
            <p className="mt-3 text-sm text-[var(--wiki-nav-fg)]">
              来自 {formatPhotoContextDate(photoContext.created_at)} 复盘
              {photoContext.question_type && photoContext.question_type !== "未分类"
                ? ` · ${photoContext.question_type}`
                : ""}
            </p>
          ) : null}
          <p className="mt-4 text-base leading-relaxed text-[var(--wiki-fg)]">{entry.summary}</p>
        </header>

        {hubTopic ? (
          <LearnConsolidationBanner
            phase={hubTopic.consolidation_phase}
            progress={learnProgress}
            status={hubTopic.status}
            masteryScore={hubTopic.mastery_score}
            onMark={markLearnProgress}
            className="wiki-prose-section scroll-mt-24"
          />
        ) : null}

        {entry.sections.map((section) => (
          <section
            key={section.id}
            id={section.id}
            className="wiki-prose-section scroll-mt-24"
          >
            <h2 className="wiki-section-title">{section.title}</h2>
            <p className="wiki-section-body">{section.body}</p>
          </section>
        ))}

        {entry.videos.length > 0 ? (
          <section id="videos" className="wiki-prose-section scroll-mt-24">
            <h2 className="wiki-section-title">推荐视频</h2>
            <ul className="wiki-learn-resource-list">
              {entry.videos.map((v) => (
                <li key={v.id}>
                  <a
                    href={v.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="wiki-learn-video-card"
                  >
                    <PlayCircle className="h-5 w-5 shrink-0 text-[#00a1d6]" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="wiki-learn-resource-title">{v.title}</p>
                      <p className="wiki-learn-resource-meta">
                        {v.teacher} · B站
                        {v.duration ? ` · ${v.duration}` : ""}
                        {v.note ? ` · ${v.note}` : ""}
                      </p>
                    </div>
                    <ExternalLink className="h-4 w-4 shrink-0 opacity-50" aria-hidden />
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {entry.practiceQuestions.length > 0 ? (
          <section id="practice" className="wiki-prose-section scroll-mt-24">
            <h2 className="wiki-section-title">同类练手</h2>
            <ol className="wiki-learn-practice-list">
              {entry.practiceQuestions.map((q, i) => (
                <li key={q.id} className="wiki-learn-practice-item">
                  <span className="wiki-learn-practice-num">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="wiki-learn-practice-stem">{q.stem}</p>
                    <p className="wiki-learn-practice-meta">
                      {q.source}
                      {q.difficulty ? ` · 难度 ${q.difficulty}` : ""}
                    </p>
                    {q.answerHint ? (
                      <p className="wiki-learn-practice-hint">提示：{q.answerHint}</p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        <footer className="wiki-prose-section wiki-learn-foot">
          <Link
            to="/app/review"
            search={{ subject: entry.subject }}
            className={cn("wiki-learn-rail-cta", "wiki-learn-foot-cta")}
          >
            去{entry.subject}复盘 · 继续问 Sage
          </Link>
        </footer>
      </article>

      <KnowledgeTopicRail
        entry={entry}
        activeSection={activeSection}
        onSectionClick={scrollToSection}
      />
    </div>
  );
}

function LearnPage() {
  const { subject: searchSubject, topic: searchTopic } = Route.useSearch();
  const { user } = useAuth();

  if (!searchTopic) {
    if (!user?.id) {
      return (
        <article className="wiki-prose wiki-prose-sheet">
          <p className="wiki-prose-sub">请先登录。</p>
        </article>
      );
    }
    return <LearnHubPanel userId={user.id} subjectFilter={searchSubject} />;
  }

  const subject: Subject = searchSubject ?? "数学";

  if (!user?.id) {
    return (
      <article className="wiki-prose wiki-prose-sheet">
        <p className="wiki-prose-sub">请先登录。</p>
      </article>
    );
  }

  return <LearnTopicPage subject={subject} topic={searchTopic} userId={user.id} />;
}
