import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import type { Subject } from "@/lib/subjects";
import { listTopicsForSubject } from "@/lib/knowledge-topics/catalog";
import type { KnowledgeTopicEntry } from "@/lib/knowledge-topics/topic-types";

type KnowledgeTopicTreeProps = {
  subject: Subject;
  activeName?: string;
  /** 默认页：目录收在折叠区 */
  hubMode?: boolean;
};

export function KnowledgeTopicTree({ subject, activeName, hubMode = false }: KnowledgeTopicTreeProps) {
  const topics = listTopicsForSubject(subject);
  const withContent = topics;
  const planned: typeof topics = [];

  const treeList = (
    <ul className="wiki-learn-tree-list">
      {withContent.map((t) => (
        <li key={t.name}>
          <Link
            to="/app/learn"
            search={{ subject, topic: t.name }}
            className={cn(
              "wiki-learn-tree-link",
              activeName === t.name && "wiki-learn-tree-link-active",
            )}
            data-active={activeName === t.name ? "true" : undefined}
          >
            {t.name}
          </Link>
        </li>
      ))}
    </ul>
  );

  return (
    <aside className="wiki-learn-tree" aria-label={`${subject} 知识点目录`}>
      <div className="wiki-learn-tree-head">
        <p className="wiki-learn-tree-label">{hubMode ? "浏览目录" : "知识点"}</p>
        <p className="wiki-learn-tree-subject">{subject}</p>
      </div>
      <nav className="wiki-learn-tree-nav">
        {withContent.length > 0 ? (
          hubMode ? (
            <details className="wiki-learn-tree-planned">
              <summary>全部考点</summary>
              {treeList}
            </details>
          ) : (
            treeList
          )
        ) : (
          <p className="wiki-learn-tree-empty">该学科条目筹备中，可先使用复盘拍题识点。</p>
        )}
        {planned.length > 0 ? (
          <details className="wiki-learn-tree-planned">
            <summary>更多考点</summary>
            <ul className="wiki-learn-tree-list wiki-learn-tree-list-muted">
              {planned.slice(0, 12).map((t) => (
                <li key={t.name}>
                  <span className="wiki-learn-tree-link wiki-learn-tree-link-disabled">{t.name}</span>
                </li>
              ))}
              {planned.length > 12 ? (
                <li className="wiki-learn-tree-more">还有 {planned.length - 12} 个…</li>
              ) : null}
            </ul>
          </details>
        ) : null}
      </nav>
    </aside>
  );
}
export function topicRailSections(entry: KnowledgeTopicEntry) {
  const sections: { id: string; label: string; depth?: 1 | 2 }[] = [
    { id: "summary", label: "概览" },
    ...entry.sections.map((s) => ({ id: s.id, label: s.title, depth: 2 as const })),
  ];
  if (entry.videos.length > 0) {
    sections.push({ id: "videos", label: "推荐视频" });
  }
  if (entry.practiceQuestions.length > 0) {
    sections.push({ id: "practice", label: "同类练手" });
  }
  return sections;
}
