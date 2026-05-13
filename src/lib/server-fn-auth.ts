import { supabase } from "@/integrations/supabase/client";

/** Authorization header for server functions that use `requireSupabaseAuth`. */
export async function getBearerAuthHeaders(): Promise<{ Authorization: string }> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("未登录");
  return { Authorization: `Bearer ${token}` };
}
