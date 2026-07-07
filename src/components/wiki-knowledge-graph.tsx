/** Compact knowledge graph for Today page right rail (Physics Wiki Graph View style). */
export function WikiKnowledgeGraph() {
  const nodes = [
    { x: 72, y: 48, r: 5, active: false },
    { x: 118, y: 36, r: 6, active: false },
    { x: 148, y: 72, r: 7, active: true },
    { x: 96, y: 98, r: 5, active: false },
    { x: 52, y: 88, r: 4, active: false },
    { x: 132, y: 108, r: 4, active: false },
  ];

  const edges: Array<[number, number, number, number]> = [
    [72, 48, 118, 36],
    [118, 36, 148, 72],
    [148, 72, 96, 98],
    [96, 98, 52, 88],
    [72, 48, 96, 98],
    [148, 72, 132, 108],
    [118, 36, 132, 108],
  ];

  return (
    <div className="wiki-rail-graph" aria-hidden>
      <svg viewBox="0 0 180 130" className="h-full w-full">
        <g stroke="var(--wiki-border)" strokeWidth="1">
          {edges.map(([x1, y1, x2, y2], i) => (
            <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />
          ))}
        </g>
        {nodes.map((n, i) => (
          <circle
            key={i}
            cx={n.x}
            cy={n.y}
            r={n.r}
            fill={n.active ? "var(--wiki-heading)" : "var(--wiki-muted)"}
            opacity={n.active ? 1 : 0.45}
          />
        ))}
      </svg>
    </div>
  );
}
