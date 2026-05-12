import { supabase } from "@/integrations/supabase/client";

export type UserExamRow = {
  id: string;
  user_id: string;
  name: string;
  exam_date: string;
  created_at: string;
};

function startOfLocalToday(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Parse YYYY-MM-DD as local calendar date (noon to reduce DST edge cases). */
export function parseLocalExamDate(ymd: string): Date {
  const [y, m, day] = ymd.split("-").map(Number);
  return new Date(y, m - 1, day, 12, 0, 0, 0);
}

/** Whole days from local today to exam date (negative if exam already passed). */
export function daysFromTodayToExam(ymd: string, now = new Date()): number {
  const t0 = startOfLocalToday(now).getTime();
  const t1 = startOfLocalToday(parseLocalExamDate(ymd)).getTime();
  return Math.round((t1 - t0) / 86400000);
}

/**
 * Pick the best exam for countdown: soonest upcoming (today counts);
 * if none left, the most recent past exam (still show days negative).
 */
export function pickNearestExam(exams: UserExamRow[]): { row: UserExamRow; days: number } | null {
  if (!exams.length) return null;
  const scored = exams.map((row) => ({
    row,
    days: daysFromTodayToExam(row.exam_date),
  }));
  const upcoming = scored.filter((s) => s.days >= 0).sort((a, b) => a.days - b.days || a.row.exam_date.localeCompare(b.row.exam_date));
  if (upcoming.length) return { row: upcoming[0].row, days: upcoming[0].days };
  const past = scored.sort((a, b) => b.days - a.days);
  return { row: past[0].row, days: past[0].days };
}

export async function fetchUserExams(userId: string): Promise<UserExamRow[]> {
  const { data, error } = await supabase
    .from("user_exams")
    .select("id,user_id,name,exam_date,created_at")
    .eq("user_id", userId)
    .order("exam_date", { ascending: true });
  if (error) {
    console.warn("[user_exams] fetch failed", error);
    return [];
  }
  return (data ?? []) as UserExamRow[];
}

/** Mirror nearest exam onto profiles for legacy reads / coach prompts. */
export async function syncProfileNearestExam(userId: string): Promise<void> {
  const exams = await fetchUserExams(userId);
  const nearest = pickNearestExam(exams);
  if (!nearest) {
    await supabase.from("profiles").update({ exam_name: null, exam_date: null }).eq("id", userId);
    return;
  }
  await supabase
    .from("profiles")
    .update({
      exam_name: nearest.row.name,
      exam_date: nearest.row.exam_date,
    })
    .eq("id", userId);
}
