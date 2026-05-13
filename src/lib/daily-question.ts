/**
 * ---------------------------------------------------------------------------
 * Run in Supabase SQL Editor if `daily_questions` is missing (fixes 404):
 *
 * ```sql
 * CREATE TABLE IF NOT EXISTS daily_questions (
 *   id uuid primary key default gen_random_uuid(),
 *   user_id uuid references auth.users(id) on delete cascade,
 *   date date not null default current_date,
 *   question text,
 *   subject text,
 *   answer text,
 *   explanation text,
 *   completed boolean default false,
 *   was_correct boolean,
 *   created_at timestamptz default now(),
 *   unique(user_id, date)
 * );
 *
 * ALTER TABLE daily_questions ENABLE ROW LEVEL SECURITY;
 *
 * CREATE POLICY "users own daily_questions" ON daily_questions
 *   FOR ALL USING (auth.uid() = user_id);
 * ```
 *
 * Note: inserts from the app pass an explicit `date` (local calendar day),
 * so the column default is not relied on. For INSERT, Postgres may require
 * `WITH CHECK` on policies — if inserts fail, add:
 *   WITH CHECK (auth.uid() = user_id)
 * or split into separate SELECT / INSERT / UPDATE policies.
 * ---------------------------------------------------------------------------
 */

import { supabase } from "@/integrations/supabase/client";
import { invokeDeepSeekChat } from "@/lib/deepseek-supabase";

export type DailyQuestionRow = {
  id: string;
  user_id: string;
  /** Calendar day for this question (YYYY-MM-DD), column name `date` in DB. */
  date: string;
  question: string | null;
  answer: string | null;
  explanation: string | null;
  subject: string | null;
  completed: boolean;
  was_correct: boolean | null;
  created_at: string;
};

/** PostgREST / Supabase when the relation is not exposed (table missing, etc.). */
export function isDailyQuestionsUnavailableError(err: unknown): boolean {
  if (err == null || typeof err !== "object") return false;
  const o = err as { code?: string; message?: string; details?: string; hint?: string };
  const msg = `${o.message ?? ""} ${o.details ?? ""} ${o.hint ?? ""}`.toLowerCase();
  if (o.code === "42P01") return true;
  if (o.code === "PGRST205") return true;
  if (msg.includes("relation") && msg.includes("does not exist")) return true;
  if (msg.includes("schema cache")) return true;
  if (msg.includes("could not find the table")) return true;
  return false;
}

function stripJsonFence(raw: string): string {
  let t = raw.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
  }
  return t.trim();
}

function parseJsonObject(raw: string): Record<string, unknown> {
  const t = stripJsonFence(raw);
  const i = t.indexOf("{");
  const j = t.lastIndexOf("}");
  if (i === -1 || j === -1 || j <= i) throw new Error("invalid_json");
  return JSON.parse(t.slice(i, j + 1)) as Record<string, unknown>;
}

export async function fetchRecentWeakPoints(userId: string, limit = 5): Promise<string[]> {
  const { data, error } = await supabase
    .from("review_summaries")
    .select("weak_point")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? [])
    .map((r) => String(r.weak_point ?? "").trim())
    .filter((w) => w.length > 0);
}

export type GeneratedDailyQuestion = {
  question: string;
  subject: string;
  answer: string;
  explanation: string;
};

export async function generateDailyQuestionViaAi(weakPoints: string[]): Promise<GeneratedDailyQuestion> {
  const list = weakPoints.map((w, i) => `${i + 1}. ${w}`).join("\n");
  const sys = `You output only valid JSON objects, no markdown.`;
  const user = `Based on these weak points from the student's history:
${list}

Generate ONE short practice question to test if they've improved. Format:
{
  "question": "题目内容，简短，30秒内能作答",
  "subject": "学科",
  "answer": "正确答案",
  "explanation": "一句话解释，不超过50字"
}
Return ONLY valid JSON.`;
  const raw = await invokeDeepSeekChat(
    [
      { role: "system", content: sys },
      { role: "user", content: user },
    ],
    { max_tokens: 1500, timeoutMs: 45_000 },
  );
  const o = parseJsonObject(raw);
  const question = String(o.question ?? "").trim();
  const subject = String(o.subject ?? "").trim();
  const answer = String(o.answer ?? "").trim();
  const explanation = String(o.explanation ?? "").trim();
  if (!question || !subject || !answer) throw new Error("incomplete_question");
  return { question, subject, answer, explanation: explanation || "再对照一下要点。" };
}

export async function gradeDailyAnswerViaAi(params: {
  question: string;
  correctAnswer: string;
  studentAnswer: string;
}): Promise<boolean> {
  const user = `Question: ${params.question}
Correct answer (authoritative): ${params.correctAnswer}
Student answer: ${params.studentAnswer}

Decide if the student's answer is correct enough for a short recall question (meaning equivalent counts).
Return ONLY JSON: {"correct":true} or {"correct":false}`;
  const raw = await invokeDeepSeekChat(
    [
      { role: "system", content: "Return only valid JSON." },
      { role: "user", content: user },
    ],
    { max_tokens: 500, timeoutMs: 25_000 },
  );
  const o = parseJsonObject(raw);
  if (typeof o.correct === "boolean") return o.correct;
  if (typeof o.was_correct === "boolean") return o.was_correct;
  throw new Error("grade_parse");
}

/** Returns null if no row, or throws on unexpected errors. Missing table → throws with isDailyQuestionsUnavailableError. */
export async function fetchDailyQuestionForDate(
  userId: string,
  questionDate: string,
): Promise<DailyQuestionRow | null> {
  const { data, error } = await supabase
    .from("daily_questions")
    .select("*")
    .eq("user_id", userId)
    .eq("date", questionDate)
    .maybeSingle();
  if (error) throw error;
  return data as DailyQuestionRow | null;
}

export async function insertDailyQuestionRow(
  userId: string,
  questionDate: string,
  payload: GeneratedDailyQuestion,
): Promise<DailyQuestionRow> {
  const { data, error } = await supabase
    .from("daily_questions")
    .insert({
      user_id: userId,
      date: questionDate,
      question: payload.question,
      answer: payload.answer,
      explanation: payload.explanation,
      subject: payload.subject,
      completed: false,
      was_correct: null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as DailyQuestionRow;
}

export async function markDailyQuestionComplete(
  id: string,
  userId: string,
  wasCorrect: boolean,
): Promise<void> {
  const { error } = await supabase
    .from("daily_questions")
    .update({ completed: true, was_correct: wasCorrect })
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw error;
}
