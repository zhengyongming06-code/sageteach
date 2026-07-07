import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { WikiKnowledgeGraphLive } from "@/components/wiki-knowledge-graph-live";

export type TodayTocSection = {
  id: string;
  label: string;
  depth?: 1 | 2;
};

type TodayPageRailProps = {
  userId?: string;
  sections: TodayTocSection[];
  activeSection?: string;
  progressLine: string;
  progressLoading?: boolean;
};

export function TodayPageRail({
  userId,
  sections,
  activeSection,
  progressLine,
  progressLoading,
}: TodayPageRailProps) {
  return (
    <aside className="wiki-rail" aria-label="页面导航">
      <div className="wiki-rail-block !mt-0 !border-t-0 !pt-0">
        <p className="wiki-rail-title">Graph View</p>
        {userId ? (
          <WikiKnowledgeGraphLive userId={userId} />
        ) : (
          <div className="wiki-rail-graph wiki-rail-graph--empty" aria-hidden>
            <span className="wiki-prose-sub text-xs">登录后显示知识图谱</span>
          </div>
        )}
      </div>

      <div className="wiki-rail-block">
        <p className="wiki-rail-title">Today</p>
        <p className="wiki-rail-body">
          {progressLoading ? "加载进度…" : progressLine}
        </p>
      </div>

      {sections.length > 0 ? (
        <div className="wiki-rail-block">
          <p className="wiki-rail-title">On this page</p>
          <nav className="wiki-rail-toc">
            {sections.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                data-active={activeSection === s.id}
                data-depth={s.depth === 2 ? "2" : undefined}
                className={cn(activeSection === s.id && "is-active")}
              >
                {s.label}
              </a>
            ))}
          </nav>
        </div>
      ) : null}

      <div className="wiki-rail-block">
        <p className="wiki-rail-title">Links</p>
        <nav className="wiki-rail-links">
          <Link to="/app/review">去复盘</Link>
          <Link to="/app/diagnostic">知识点诊断</Link>
        </nav>
      </div>
    </aside>
  );
}
