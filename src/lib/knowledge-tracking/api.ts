import { supabase } from "@/integrations/supabase/client";
import type {
  DailyTrainingItem,
  KnowledgeTrackPhotoRequest,
  KnowledgeTrackPhotoResponse,
  StudentKnowledgePoint,
  WeaknessTreeNode,
} from "@/lib/knowledge-tracking/types";

/** 新表尚未写入 generated types 前，用窄接口访问 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

const FN = "knowledge-track-photo";

export async function trackKnowledgeFromPhoto(
  payload: KnowledgeTrackPhotoRequest,
): Promise<KnowledgeTrackPhotoResponse> {
  const { data, error } = await supabase.functions.invoke<KnowledgeTrackPhotoResponse>(FN, {
    body: payload,
  });
  if (error) throw error;
  if (!data) throw new Error("knowledge-track-photo: empty response");
  return data;
}

export async function fetchStudentWeaknessTree(
  userId: string,
  subject: string,
): Promise<WeaknessTreeNode | null> {
  const { data, error } = await db
    .from("student_weakness_trees")
    .select("tree")
    .eq("user_id", userId)
    .eq("subject", subject)
    .maybeSingle();
  if (error) throw error;
  return (data?.tree as WeaknessTreeNode | null) ?? null;
}

export async function fetchDailyTraining(
  userId: string,
  trainingDate: string,
): Promise<DailyTrainingItem[]> {
  const { data, error } = await db
    .from("daily_training_items")
    .select(
      "id,training_date,subject,knowledge_point,priority,reason,task_type,estimated_minutes,status",
    )
    .eq("user_id", userId)
    .eq("training_date", trainingDate)
    .order("priority", { ascending: false });
  if (error) throw error;
  return (data ?? []) as DailyTrainingItem[];
}

export async function fetchStudentKnowledgeMastery(
  userId: string,
  subject?: string,
): Promise<StudentKnowledgePoint[]> {
  let q = db
    .from("knowledge_points")
    .select(
      "id,subject,name,status,mastery_score,correct_count,wrong_count,streak_correct,last_event_at,last_wrong_at,catalog_node_id",
    )
    .eq("user_id", userId);
  if (subject) q = q.eq("subject", subject);
  const { data, error } = await q.order("mastery_score", { ascending: true, nullsFirst: true });
  if (error) throw error;
  return (data ?? []) as StudentKnowledgePoint[];
}

export const knowledgeTrackingQueryKeys = {
  weaknessTree: (userId: string, subject: string) =>
    ["weakness-tree", userId, subject] as const,
  dailyTraining: (userId: string, date: string) =>
    ["daily-training", userId, date] as const,
  mastery: (userId: string, subject?: string) =>
    ["knowledge-mastery", userId, subject ?? "all"] as const,
};
