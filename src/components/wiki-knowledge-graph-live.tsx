import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchStudentKnowledgeMastery,
  knowledgeTrackingQueryKeys,
} from "@/lib/knowledge-tracking/api";
import { layoutWeaknessGraph } from "@/lib/wiki-knowledge-graph-layout";

type WikiKnowledgeGraphLiveProps = {
  userId: string;
};

export function WikiKnowledgeGraphLive({ userId }: WikiKnowledgeGraphLiveProps) {
  const { data: mastery = [], isLoading } = useQuery({
    queryKey: knowledgeTrackingQueryKeys.mastery(userId),
    queryFn: () => fetchStudentKnowledgeMastery(userId),
    staleTime: 60_000,
  });

  const weakPoints = useMemo(
    () =>
      [...mastery]
        .filter((m) => (m.mastery_score ?? 100) < 75 || m.wrong_count > 0)
        .sort((a, b) => (a.mastery_score ?? 100) - (b.mastery_score ?? 100))
        .slice(0, 8),
    [mastery],
  );

  const layout = useMemo(
    () => layoutWeaknessGraph(weakPoints.map((p) => ({ name: p.name, mastery_score: p.mastery_score }))),
    [weakPoints],
  );

  if (isLoading) {
    return (
      <div className="wiki-rail-graph wiki-rail-graph--empty" aria-hidden>
        <span className="wiki-prose-sub text-xs">加载图谱…</span>
      </div>
    );
  }

  if (weakPoints.length === 0) {
    return (
      <div className="wiki-rail-graph wiki-rail-graph--empty" aria-hidden>
        <span className="wiki-prose-sub text-xs">复盘后会显示薄弱知识点网络</span>
      </div>
    );
  }

  return (
    <div className="wiki-rail-graph" role="img" aria-label="薄弱知识点关系图">
      <svg viewBox="0 0 180 130" className="h-full w-full">
        <g stroke="var(--wiki-border)" strokeWidth="1">
          {layout.edges.map(([x1, y1, x2, y2], i) => (
            <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />
          ))}
        </g>
        <circle
          cx={layout.center.x}
          cy={layout.center.y}
          r={layout.center.r}
          fill="var(--wiki-heading)"
        />
        {layout.nodes.map((n, i) => (
          <circle
            key={i}
            cx={n.x}
            cy={n.y}
            r={n.r}
            fill={n.active ? "var(--wiki-heading)" : "var(--wiki-muted)"}
            opacity={n.active ? 1 : 0.55}
          />
        ))}
      </svg>
      <p className="wiki-rail-graph-caption">
        {weakPoints.length} 个薄弱点 · 中心为 Today
      </p>
    </div>
  );
}
