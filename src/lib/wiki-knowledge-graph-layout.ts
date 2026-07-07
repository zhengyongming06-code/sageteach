export type GraphLayoutNode = {
  x: number;
  y: number;
  r: number;
  active: boolean;
  label?: string;
};

export function layoutWeaknessGraph(
  points: { name: string; mastery_score?: number | null }[],
  width = 180,
  height = 130,
): {
  center: GraphLayoutNode;
  nodes: GraphLayoutNode[];
  edges: Array<[number, number, number, number]>;
} {
  const cx = width / 2;
  const cy = height / 2;
  const center: GraphLayoutNode = { x: cx, y: cy, r: 7, active: true, label: "Today" };
  const limited = points.slice(0, 8);

  if (limited.length === 0) {
    return { center, nodes: [], edges: [] };
  }

  const radius = Math.min(width, height) * 0.34;
  const nodes = limited.map((p, i) => {
    const angle = (2 * Math.PI * i) / limited.length - Math.PI / 2;
    const weak = (p.mastery_score ?? 100) < 60;
    return {
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
      r: weak ? 6 : 4,
      active: i === 0,
      label: p.name,
    };
  });

  const edges: Array<[number, number, number, number]> = nodes.map((n) => [
    cx,
    cy,
    n.x,
    n.y,
  ]);

  for (let i = 0; i < nodes.length; i++) {
    const next = nodes[(i + 1) % nodes.length];
    edges.push([nodes[i].x, nodes[i].y, next.x, next.y]);
  }

  return { center, nodes, edges };
}
