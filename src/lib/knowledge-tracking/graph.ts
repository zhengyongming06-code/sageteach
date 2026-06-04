import type { Subject } from "@/lib/subjects";
import type { KgCatalogNode, StudentKnowledgePoint, WeaknessTreeNode } from "@/lib/knowledge-tracking/types";
import { MASTERY_PRIOR, scoreToStatus, weaknessPriority } from "@/lib/knowledge-tracking/mastery";

/**
 * Knowledge Graph 结构
 *
 * Subject (根)
 *   └── GradeBand 章节（depth=1，可选）
 *         └── KnowledgePoint 叶子（depth=2）
 *
 * edges: parent_id 构成树；后续可扩展 prerequisite 边表
 */

export function buildWeaknessTree(
  subject: Subject,
  catalog: KgCatalogNode[],
  mastery: StudentKnowledgePoint[],
): WeaknessTreeNode {
  const masteryByName = new Map(mastery.map((m) => [m.name, m]));
  const nodesById = new Map(catalog.map((n) => [n.id, n]));
  const childrenByParent = new Map<string | null, KgCatalogNode[]>();

  for (const node of catalog.filter((n) => n.subject === subject)) {
    const pid = node.parent_id;
    if (!childrenByParent.has(pid)) childrenByParent.set(pid, []);
    childrenByParent.get(pid)!.push(node);
  }

  for (const [, kids] of childrenByParent) {
    kids.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "zh"));
  }

  function leafNode(catalogNode: KgCatalogNode): WeaknessTreeNode {
    const m = masteryByName.get(catalogNode.name);
    const score = m?.mastery_score ?? null;
    return {
      id: catalogNode.id,
      name: catalogNode.name,
      subject,
      mastery_score: score,
      status: m?.status ?? scoreToStatus(score),
      wrong_count: m?.wrong_count ?? 0,
      children: [],
      min_score: score ?? MASTERY_PRIOR,
    };
  }

  function buildNode(catalogNode: KgCatalogNode): WeaknessTreeNode {
    const kids = childrenByParent.get(catalogNode.id) ?? [];
    if (kids.length === 0) return leafNode(catalogNode);

    const children = kids.map(buildNode);
    const min_score = Math.min(...children.map((c) => c.min_score));
    const agg = aggregateMastery(children);
    return {
      id: catalogNode.id,
      name: catalogNode.name,
      subject,
      mastery_score: agg.score,
      status: scoreToStatus(agg.score),
      wrong_count: children.reduce((s, c) => s + c.wrong_count, 0),
      children,
      min_score,
    };
  }

  const roots = childrenByParent.get(null) ?? [];
  const subjectRoot: WeaknessTreeNode = {
    id: `subject:${subject}`,
    name: subject,
    subject,
    mastery_score: null,
    status: "未测试",
    wrong_count: mastery.reduce((s, m) => s + m.wrong_count, 0),
    children: roots.map(buildNode),
    min_score: MASTERY_PRIOR,
  };

  if (subjectRoot.children.length === 0) {
    // 无目录时：扁平 listing
    subjectRoot.children = mastery
      .filter((m) => m.subject === subject)
      .map((m) => ({
        id: m.id,
        name: m.name,
        subject,
        mastery_score: m.mastery_score,
        status: m.status,
        wrong_count: m.wrong_count,
        children: [],
        min_score: m.mastery_score ?? MASTERY_PRIOR,
      }))
      .sort((a, b) => a.min_score - b.min_score);
    subjectRoot.min_score = subjectRoot.children.length
      ? Math.min(...subjectRoot.children.map((c) => c.min_score))
      : MASTERY_PRIOR;
  } else {
    subjectRoot.min_score = Math.min(...subjectRoot.children.map((c) => c.min_score));
    const agg = aggregateMastery(subjectRoot.children);
    subjectRoot.mastery_score = agg.score;
    subjectRoot.status = scoreToStatus(agg.score);
  }

  return pruneWeakBranches(subjectRoot);
}

function aggregateMastery(nodes: WeaknessTreeNode[]): { score: number } {
  if (nodes.length === 0) return { score: MASTERY_PRIOR };
  const scores = nodes.map((n) => n.mastery_score ?? n.min_score);
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  return { score: avg };
}

/** 只保留薄弱分支（min_score < 70 或 wrong_count > 0） */
export function pruneWeakBranches(root: WeaknessTreeNode): WeaknessTreeNode {
  function walk(node: WeaknessTreeNode): WeaknessTreeNode | null {
    if (node.children.length === 0) {
      const weak =
        (node.mastery_score ?? MASTERY_PRIOR) < 70 || node.wrong_count > 0;
      return weak ? node : null;
    }
    const children = node.children.map(walk).filter(Boolean) as WeaknessTreeNode[];
    if (children.length === 0 && node.min_score >= 70) return null;
    return { ...node, children };
  }
  const pruned = walk(root);
  return pruned ?? { ...root, children: [] };
}

export function flattenWeakLeaves(tree: WeaknessTreeNode): WeaknessTreeNode[] {
  const out: WeaknessTreeNode[] = [];
  function dfs(n: WeaknessTreeNode) {
    if (n.children.length === 0) {
      if ((n.mastery_score ?? MASTERY_PRIOR) < 70 || n.wrong_count > 0) out.push(n);
      return;
    }
    for (const c of n.children) dfs(c);
  }
  dfs(tree);
  return out.sort(
    (a, b) =>
      weaknessPriority({
        mastery_score: a.mastery_score,
        wrong_count: a.wrong_count,
        last_wrong_at: null,
      }) -
      weaknessPriority({
        mastery_score: b.mastery_score,
        wrong_count: b.wrong_count,
        last_wrong_at: null,
      }),
  );
}

/** 将 LLM 提取的自由文本 KP 映射到目录（精确 → 包含匹配） */
export function mapToCatalogNames(
  extracted: string[],
  catalogNames: readonly string[],
): string[] {
  const out = new Set<string>();
  for (const raw of extracted) {
    const t = raw.trim();
    if (!t) continue;
    const exact = catalogNames.find((n) => n === t);
    if (exact) {
      out.add(exact);
      continue;
    }
    const fuzzy = catalogNames.find((n) => t.includes(n) || n.includes(t));
    if (fuzzy) out.add(fuzzy);
    else out.add(t);
  }
  return [...out];
}

export function countWeakNodes(tree: WeaknessTreeNode): number {
  return flattenWeakLeaves(tree).length;
}

export function findCatalogNode(
  catalog: KgCatalogNode[],
  subject: Subject,
  name: string,
): KgCatalogNode | undefined {
  return catalog.find((n) => n.subject === subject && n.name === name);
}
