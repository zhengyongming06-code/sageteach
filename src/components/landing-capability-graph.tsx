/** Sage capability network — Syllagrid graph-panel layout, Sage-specific labels. */
export function LandingCapabilityGraph() {
  const nodes = [
    { x: 178, y: 150, label: "学科复盘", kind: "active" as const },
    { x: 380, y: 100, label: "AI 教练", kind: "active" as const },
    { x: 582, y: 150, label: "提分规划", kind: "active" as const },
    { x: 646, y: 282, label: "知识追踪", kind: "active" as const },
    { x: 582, y: 414, label: "拍照识题", kind: "active" as const },
    { x: 380, y: 470, label: "每日一题", kind: "planned" as const },
    { x: 178, y: 414, label: "诊断测评", kind: "planned" as const },
    { x: 114, y: 282, label: "复盘档案", kind: "planned" as const },
  ];

  const edges: Array<[number, number, number, number]> = [
    [380, 280, 178, 150],
    [380, 280, 380, 100],
    [380, 280, 582, 150],
    [380, 280, 646, 282],
    [380, 280, 582, 414],
    [380, 280, 380, 470],
    [380, 280, 178, 414],
    [380, 280, 114, 282],
  ];

  return (
    <div className="sy-graph-panel" aria-label="Sage 学习能力网络">
      <div className="sy-graph-meta sy-latin">
        <span>学习网络</span>
        <span>中高考 · 全学科</span>
      </div>
      <svg className="sy-knowledge-graph" viewBox="0 0 760 560" role="img">
        <title>Sage 连接学科复盘、AI 教练与知识追踪</title>
        <g stroke="currentColor" strokeOpacity="0.22" strokeWidth="1.55" className="text-[#334155] dark:text-white/20">
          {edges.map(([x1, y1, x2, y2], i) => (
            <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />
          ))}
        </g>
        <g className="sy-node">
          <g transform="translate(380 280)">
            <circle
              r="58"
              className="sy-graph-hub fill-[#172554] stroke-[rgba(37,99,235,0.24)] dark:fill-[#2a2a2a] dark:stroke-white/12"
              strokeWidth="2"
            />
            <text className="fill-white" fontSize="16" fontWeight="700" textAnchor="middle" dominantBaseline="middle">
              Sage
            </text>
          </g>
        </g>
        {nodes.map((node, i) => {
          const active = node.kind === "active";
          return (
            <g
              key={node.label}
              className="sy-node"
              style={{ animationDelay: `${-(i % 3) * 2.2}s` }}
              transform={`translate(${node.x} ${node.y})`}
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
                className={active ? "fill-[#0f172a] dark:fill-[#d4d4d4]" : "fill-[#334155] dark:fill-[#737373]"}
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
            </g>
          );
        })}
      </svg>
    </div>
  );
}
