import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { GRADE_OPTIONS, normalizeUserGrade, type UserGrade } from "@/lib/knowledge-points";

export const profileGradeQueryKey = (userId: string) => ["profile-grade", userId] as const;

export function profileGradeQueryOptions(userId: string) {
  return queryOptions({
    queryKey: profileGradeQueryKey(userId),
    queryFn: () => fetchProfileGrade(userId),
    staleTime: 60_000,
  });
}

export async function fetchProfileGrade(userId: string): Promise<UserGrade | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("grade")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return normalizeUserGrade(data?.grade);
}

export async function updateProfileGrade(userId: string, grade: UserGrade): Promise<void> {
  const { error } = await supabase.from("profiles").update({ grade }).eq("id", userId);
  if (error) throw error;
}

export { GRADE_OPTIONS };
