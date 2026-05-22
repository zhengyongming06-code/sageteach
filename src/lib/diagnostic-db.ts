import { supabase } from "@/integrations/supabase/client";
import { allCatalogKnowledgePointRows, type UserGrade } from "@/lib/knowledge-points";
import type { Subject } from "@/lib/subjects";

export type DiagnosticAnswerRow = {
  knowledge_point: string;
  is_correct: boolean;
};

/** Seed grade-appropriate catalog with 未测试 when user has no rows yet. */
export async function seedKnowledgePointsCatalogIfEmpty(
  userId: string,
  grade?: UserGrade | null,
): Promise<void> {
  const { count, error: countErr } = await supabase
    .from("knowledge_points")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (countErr) throw countErr;
  if ((count ?? 0) > 0) return;

  const rows = allCatalogKnowledgePointRows(grade).map(({ subject, name }) => ({
    user_id: userId,
    subject,
    name,
    status: "未测试" as const,
  }));

  const { error } = await supabase.from("knowledge_points").insert(rows);
  if (error) throw error;
}

export async function saveDiagnosticResults(
  userId: string,
  subject: Subject,
  answers: DiagnosticAnswerRow[],
  grade?: UserGrade | null,
): Promise<void> {
  await seedKnowledgePointsCatalogIfEmpty(userId, grade);

  const resultRows = answers.map((a) => ({
    user_id: userId,
    subject,
    knowledge_point: a.knowledge_point,
    is_correct: a.is_correct,
  }));

  const { error: insertErr } = await supabase.from("diagnostic_results").insert(resultRows);
  if (insertErr) throw insertErr;

  const now = new Date().toISOString();
  for (const a of answers) {
    const status = a.is_correct ? "掌握中" : "薄弱";
    const { error } = await supabase.from("knowledge_points").upsert(
      {
        user_id: userId,
        subject,
        name: a.knowledge_point,
        status,
        updated_at: now,
      },
      { onConflict: "user_id,subject,name" },
    );
    if (error) throw error;
  }
}
