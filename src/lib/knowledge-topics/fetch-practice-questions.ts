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

/**
 * 从 learning_resources 按科目 + 知识点取已发布练题。
 * 目前种子数据优先灌数学；表结构全科通用。
 */
export async function fetchPracticeQuestions(
  subject: Subject | string,
  knowledgePoint: string,
  limit = 3,
): Promise<KnowledgeTopicQuestion[]> {
  const kp = knowledgePoint.trim();
  if (!kp) return [];

  try {
    const { data: tags, error: tagErr } = await db
      .from("resource_knowledge_tags")
      .select("resource_id, sort_order")
      .eq("subject", subject)
      .eq("knowledge_point", kp)
      .order("sort_order", { ascending: true })
      .limit(24);
    if (tagErr) throw tagErr;
    if (!tags?.length) return [];

    const ids = [...new Set(tags.map((t: { resource_id: string }) => t.resource_id))];
    const { data: rows, error: rowErr } = await db
      .from("learning_resources")
      .select("id, title, stem, answer_hint, source_label, difficulty, status, resource_type")
      .in("id", ids)
      .eq("resource_type", "question")
      .eq("status", "published");
    if (rowErr) throw rowErr;

    const byId = new Map(
      (rows ?? []).map((r: { id: string }) => [r.id, r] as const),
    );
    const out: KnowledgeTopicQuestion[] = [];
    for (const tag of tags) {
      const row = byId.get(tag.resource_id) as
        | {
            id: string;
            stem: string | null;
            answer_hint: string | null;
            source_label: string | null;
            title: string | null;
            difficulty: number | null;
          }
        | undefined;
      if (!row?.stem?.trim()) continue;
      out.push({
        id: row.id,
        stem: row.stem.trim(),
        source: (row.source_label ?? row.title ?? `${subject}题库`).trim(),
        difficulty: clampDifficulty(row.difficulty),
        answerHint: row.answer_hint?.trim() || undefined,
      });
      if (out.length >= limit) break;
    }
    return out;
  } catch (e) {
    console.warn("[practice-questions] fetch", e);
    return [];
  }
}

export const practiceQuestionsQueryKey = (
  subject: string,
  knowledgePoint: string,
) => ["practice-questions", subject, knowledgePoint] as const;
