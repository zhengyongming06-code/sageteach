import { supabase } from "@/integrations/supabase/client";
import type { KnowledgeTopicQuestion } from "@/lib/knowledge-topics/topic-types";
import type { Subject } from "@/lib/subjects";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

function clampDifficulty(n: number | null | undefined): 1 | 2 | 3 | undefined {
  if (n == null || Number.isNaN(n)) return undefined;
  const v = Math.round(n);
  if (v <= 1) return 1;
  if (v >= 3) return 3;
  return 2;
}

type ResourceRow = {
  id: string;
  stem: string | null;
  answer_hint: string | null;
  source_label: string | null;
  title: string | null;
  difficulty: number | null;
  status?: string;
  resource_type?: string;
};

type TagJoinRow = {
  resource_id?: string;
  sort_order: number;
  knowledge_point?: string;
  learning_resources: ResourceRow | ResourceRow[] | null;
};

function unwrapResource(raw: ResourceRow | ResourceRow[] | null): ResourceRow | null {
  if (!raw) return null;
  return Array.isArray(raw) ? (raw[0] ?? null) : raw;
}

function toQuestion(
  subject: string,
  row: ResourceRow,
): KnowledgeTopicQuestion | null {
  if (!row.stem?.trim()) return null;
  if (row.status && row.status !== "published") return null;
  if (row.resource_type && row.resource_type !== "question") return null;
  return {
    id: row.id,
    stem: row.stem.trim(),
    source: (row.source_label ?? row.title ?? `${subject}题库`).trim(),
    difficulty: clampDifficulty(row.difficulty),
    answerHint: row.answer_hint?.trim() || undefined,
  };
}

function mapJoinRows(subject: string, rows: TagJoinRow[], limit: number): KnowledgeTopicQuestion[] {
  const out: KnowledgeTopicQuestion[] = [];
  const seen = new Set<string>();
  const sorted = [...rows].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  for (const tag of sorted) {
    const resource = unwrapResource(tag.learning_resources);
    if (!resource) continue;
    const q = toQuestion(subject, resource);
    if (!q || seen.has(q.id)) continue;
    seen.add(q.id);
    out.push(q);
    if (out.length >= limit) break;
  }
  return out;
}

async function fetchByExactKnowledgePoint(
  subject: string,
  knowledgePoint: string,
  limit: number,
): Promise<KnowledgeTopicQuestion[]> {
  const { data, error } = await db
    .from("resource_knowledge_tags")
    .select(
      `
      sort_order,
      knowledge_point,
      learning_resources!inner (
        id, title, stem, answer_hint, source_label, difficulty, status, resource_type
      )
    `,
    )
    .eq("subject", subject)
    .eq("knowledge_point", knowledgePoint)
    .eq("learning_resources.resource_type", "question")
    .eq("learning_resources.status", "published")
    .order("sort_order", { ascending: true })
    .limit(Math.max(limit * 4, 12));

  if (error) throw error;
  return mapJoinRows(subject, (data ?? []) as TagJoinRow[], limit);
}

/** 软匹配：标签包含考点名，或考点名包含标签（如「抛物线焦点弦」→「抛物线」） */
async function fetchBySoftKnowledgePoint(
  subject: string,
  knowledgePoint: string,
  limit: number,
): Promise<KnowledgeTopicQuestion[]> {
  const { data, error } = await db
    .from("resource_knowledge_tags")
    .select(
      `
      sort_order,
      knowledge_point,
      learning_resources!inner (
        id, title, stem, answer_hint, source_label, difficulty, status, resource_type
      )
    `,
    )
    .eq("subject", subject)
    .eq("learning_resources.resource_type", "question")
    .eq("learning_resources.status", "published")
    .limit(80);

  if (error) throw error;

  const kp = knowledgePoint.trim();
  const filtered = ((data ?? []) as TagJoinRow[]).filter((row) => {
    const tag = (row.knowledge_point ?? "").trim();
    if (!tag) return false;
    return tag === kp || tag.includes(kp) || kp.includes(tag);
  });

  return mapJoinRows(subject, filtered, limit);
}

/**
 * 从 learning_resources 按科目 + 知识点取已发布练题。
 * 表结构全科通用；当前种子以数学为主。
 */
export async function fetchPracticeQuestions(
  subject: Subject | string,
  knowledgePoint: string,
  limit = 3,
): Promise<KnowledgeTopicQuestion[]> {
  const kp = knowledgePoint.trim();
  if (!kp) return [];

  try {
    const exact = await fetchByExactKnowledgePoint(subject, kp, limit);
    if (exact.length > 0) return exact;
    return await fetchBySoftKnowledgePoint(subject, kp, limit);
  } catch (e) {
    console.warn("[practice-questions] fetch", e);
    return [];
  }
}

export const practiceQuestionsQueryKey = (
  subject: string,
  knowledgePoint: string,
) => ["practice-questions", subject, knowledgePoint] as const;
