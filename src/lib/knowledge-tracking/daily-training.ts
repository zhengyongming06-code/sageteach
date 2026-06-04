import type { Subject } from "@/lib/subjects";
import type { DailyTrainingItem, WeaknessTreeNode } from "@/lib/knowledge-tracking/types";
import { weaknessPriority } from "@/lib/knowledge-tracking/mastery";
import { flattenWeakLeaves } from "@/lib/knowledge-tracking/graph";

const MAX_DAILY_ITEMS = 5;
const MINUTES_BY_PRIORITY = [25, 20, 15, 15, 10];

export type GenerateDailyTrainingInput = {
  userId: string;
  trainingDate: string;
  treesBySubject: Partial<Record<Subject, WeaknessTreeNode>>;
  recentWrongSubjects?: Subject[];
};

/**
 * 每日训练生成策略：
 * 1. 从各科目弱点树取叶子，按 weaknessPriority 降序
 * 2. 优先最近拍照错题科目
 * 3. 每日最多 5 条，覆盖 1–3 个科目
 */
export function generateDailyTrainingItems(
  input: GenerateDailyTrainingInput,
): Omit<DailyTrainingItem, "id">[] {
  const candidates: {
    subject: Subject;
    knowledge_point: string;
    priority: number;
    wrong_count: number;
  }[] = [];

  for (const [subject, tree] of Object.entries(input.treesBySubject) as [
    Subject,
    WeaknessTreeNode,
  ][]) {
    if (!tree) continue;
    for (const leaf of flattenWeakLeaves(tree)) {
      candidates.push({
        subject,
        knowledge_point: leaf.name,
        priority: weaknessPriority({
          mastery_score: leaf.mastery_score,
          wrong_count: leaf.wrong_count,
          last_wrong_at: null,
        }),
        wrong_count: leaf.wrong_count,
      });
    }
  }

  if (candidates.length === 0) return [];

  const recentBoost = new Set(input.recentWrongSubjects ?? []);
  for (const c of candidates) {
    if (recentBoost.has(c.subject)) c.priority = Math.min(100, c.priority + 15);
  }

  candidates.sort((a, b) => b.priority - a.priority);

  const picked: typeof candidates = [];
  const subjectCount = new Map<Subject, number>();

  for (const c of candidates) {
    if (picked.length >= MAX_DAILY_ITEMS) break;
    const sc = subjectCount.get(c.subject) ?? 0;
    if (sc >= 2 && picked.length >= 3) continue;
    picked.push(c);
    subjectCount.set(c.subject, sc + 1);
  }

  return picked.map((c, i) => ({
    training_date: input.trainingDate,
    subject: c.subject,
    knowledge_point: c.knowledge_point,
    priority: c.priority,
    reason:
      c.wrong_count > 0
        ? `近期拍照错题涉及「${c.knowledge_point}」`
        : `掌握度偏低（${c.priority.toFixed(0)} 优先级）`,
    task_type: c.wrong_count > 0 ? ("错题重做" as const) : ("同类练习" as const),
    estimated_minutes: MINUTES_BY_PRIORITY[i] ?? 15,
    status: "pending" as const,
  }));
}
