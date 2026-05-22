import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  allCatalogKnowledgePointRows,
  type KnowledgePointStatus,
  type UserGrade,
} from "@/lib/knowledge-points";
import { fetchProfileGrade } from "@/lib/profile-grade";
import { SUBJECTS, type Subject } from "@/lib/subjects";

export type UserKnowledgePointRow = {
  id: string | null;
  subject: Subject;
  name: string;
  status: KnowledgePointStatus;
};

export const knowledgePointsQueryKey = (userId: string) => ["knowledge-points", userId] as const;

export function knowledgePointsQueryOptions(userId: string) {
  return queryOptions({
    queryKey: knowledgePointsQueryKey(userId),
    queryFn: () => fetchUserKnowledgePoints(userId),
    staleTime: 60_000,
  });
}

export async function fetchUserKnowledgePoints(
  userId: string,
  grade?: UserGrade | null,
): Promise<UserKnowledgePointRow[]> {
  const profileGrade = grade ?? (await fetchProfileGrade(userId));
  const { data, error } = await supabase
    .from("knowledge_points")
    .select("id,subject,name,status")
    .eq("user_id", userId)
    .order("subject", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw error;

  if ((data ?? []).length > 0) {
    return (data ?? [])
      .filter((r) => isSubject(r.subject))
      .map((r) => ({
        id: r.id,
        subject: r.subject as Subject,
        name: r.name,
        status: isKnowledgePointStatus(r.status) ? r.status : "未测试",
      }));
  }

  return allCatalogKnowledgePointRows(profileGrade).map(({ subject, name }) => ({
    id: null,
    subject,
    name,
    status: "未测试" as const,
  }));
}

function isSubject(subject: string): subject is Subject {
  return (SUBJECTS as readonly string[]).includes(subject);
}

function isKnowledgePointStatus(value: string): value is KnowledgePointStatus {
  return (
    value === "未测试" || value === "薄弱" || value === "掌握中" || value === "已掌握"
  );
}

export function groupKnowledgePointsBySubject(
  rows: UserKnowledgePointRow[],
): Record<Subject, UserKnowledgePointRow[]> {
  const map = Object.fromEntries(SUBJECTS.map((s) => [s, [] as UserKnowledgePointRow[]])) as Record<
    Subject,
    UserKnowledgePointRow[]
  >;
  for (const row of rows) {
    if (map[row.subject]) map[row.subject].push(row);
  }
  return map;
}
