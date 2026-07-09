import { Link } from "@tanstack/react-router";
import { ArrowRight, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { KnowledgeTopicEntry } from "@/lib/knowledge-topics/catalog";
import { topicRailSections } from "@/components/knowledge-topic-tree";

type KnowledgeTopicRailProps = {
  entry: KnowledgeTopicEntry;
  activeSection?: string;
  onSectionClick?: (id: string) => void;
};

export function KnowledgeTopicRail({ entry, activeSection, onSectionClick }: KnowledgeTopicRailProps) {
  const sections = topicRailSections(entry);

  return (
    <aside className="wiki-rail" aria-label="页面导航">
      <div className="wiki-rail-block !mt-0 !border-t-0 !pt-0">
        <p className="wiki-rail-title">On this page</p>
        <nav className="wiki-rail-toc">
          {sections.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              data-depth={s.depth ?? 1}
              className={cn(activeSection === s.id && "is-active")}
              onClick={(e) => {
                if (onSectionClick) {
                  e.preventDefault();
                  onSectionClick(s.id);
                }
              }}
            >
              {s.label}
            </a>
          ))}
        </nav>
      </div>

      <div className="wiki-rail-block">
        <p className="wiki-rail-title">继续学习</p>
        <p className="wiki-rail-body">
          听课或练题仍卡壳？去复盘拍错题或描述卡点，Sage 会追问「真不懂的那一步」。
        </p>
        <Link
          to="/app/review"
          search={{ subject: entry.subject }}
          className="wiki-learn-rail-cta"
        >
          <MessageCircle className="h-4 w-4 shrink-0" aria-hidden />
          去{entry.subject}复盘
          <ArrowRight className="ml-auto h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden />
        </Link>
      </div>

      {entry.relatedNames.length > 0 ? (
        <div className="wiki-rail-block">
          <p className="wiki-rail-title">相关考点</p>
          <nav className="wiki-rail-links">
            {entry.relatedNames.map((name) => (
              <Link
                key={name}
                to="/app/learn"
                search={{ subject: entry.subject, topic: name }}
              >
                {name}
              </Link>
            ))}
          </nav>
        </div>
      ) : null}
    </aside>
  );
}
