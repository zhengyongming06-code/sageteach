import type { ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  LANDING_GRAPH_EDGES,
  LANDING_GRAPH_NODES,
  landingLinkProps,
  type LandingTarget,
} from "@/lib/landing-content";

function GraphNode({
  target,
  ariaLabel,
  transform,
  animationDelay,
  children,
}: {
  target: LandingTarget;
  ariaLabel: string;
  transform: string;
  animationDelay: string;
  children: ReactNode;
}) {
  const navigate = useNavigate();

  const go = () => {
    const props = landingLinkProps(target);
    if (props.to === "/signup") {
      void navigate({ to: "/signup" });
      return;
    }
    void navigate({ to: "/demo", hash: props.hash });
  };

  return (
    <g
      className="sy-node sy-graph-node-link"
      style={{ animationDelay, cursor: "pointer" }}
      transform={transform}
      role="link"
      tabIndex={0}
      aria-label={ariaLabel}
      onClick={go}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          go();
        }
      }}
    >
      {children}
    </g>
  );
}

/** Sage capability network — Syllagrid graph-panel layout, clickable nodes. */
export function LandingCapabilityGraph() {
  return (
    <div className="sy-graph-panel" aria-label="Sage 学习能力网络">
      <div className="sy-graph-meta sy-latin">
        <span>学习网络</span>
        <span>高考 · 全学科</span>
      </div>
      <svg className="sy-knowledge-graph" viewBox="0 0 760 560" role="img">
        <title>Sage 连接学科复盘、AI 教练与知识追踪 — 点击节点查看示例</title>
        <g stroke="currentColor" strokeOpacity="0.22" strokeWidth="1.55" className="text-[#334155] dark:text-white/20">
          {LANDING_GRAPH_EDGES.map(([x1, y1, x2, y2], i) => (
            <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />
          ))}
        </g>
        <GraphNode
          target={{ to: "/signup" }}
          ariaLabel="注册 Sage"
          transform="translate(380 280)"
          animationDelay="0s"
        >
          <circle
            r="58"
            className="sy-graph-hub fill-[#172554] stroke-[rgba(37,99,235,0.24)] dark:fill-[#2a2a2a] dark:stroke-white/12"
            strokeWidth="2"
          />
          <text className="fill-white pointer-events-none" fontSize="16" fontWeight="700" textAnchor="middle" dominantBaseline="middle">
            Sage
          </text>
        </GraphNode>
        {LANDING_GRAPH_NODES.map((node, i) => {
          const active = node.kind === "active";
          return (
            <GraphNode
              key={node.label}
              target={node.target}
              ariaLabel={`${node.label} — 查看示例`}
              transform={`translate(${node.x} ${node.y})`}
              animationDelay={`${-(i % 3) * 2.2}s`}
            >
              <circle
                r={active ? 44 : 40}
                className={
                  active
                    ? "fill-white/90 stroke-[rgba(37,99,235,0.72)] dark:fill-[#2a2a2a] dark:stroke-[#8ca0b3]/55"
                    : "fill-white/70 stroke-[rgba(15,159,143,0.72)] dark:fill-[#222] dark:stroke-white/20"
                }
                strokeWidth={active ? 2.6 : 1.8}
                strokeDasharray={active ? undefined : "4 5"}
              />
              <text
                className={
                  active
                    ? "fill-[#0f172a] pointer-events-none dark:fill-[#d4d4d4]"
                    : "fill-[#334155] pointer-events-none dark:fill-[#737373]"
                }
                fontSize={active ? 13.5 : 12}
                fontWeight="700"
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {node.label.length > 4 ? (
                  <>
                    <tspan x="0" dy="-0.45em">
                      {node.label.slice(0, 2)}
                    </tspan>
                    <tspan x="0" dy="1.1em">
                      {node.label.slice(2)}
                    </tspan>
                  </>
                ) : (
                  node.label
                )}
              </text>
            </GraphNode>
          );
        })}
      </svg>
    </div>
  );
}
