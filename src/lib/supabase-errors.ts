import type { PostgrestError } from "@supabase/supabase-js";

export function logSupabaseError(
  context: string,
  error: PostgrestError,
  extra?: Record<string, unknown>,
) {
  console.error(`[${context}] Supabase error`, {
    message: error.message,
    details: error.details,
    hint: error.hint,
    code: error.code,
    ...extra,
  });
}
