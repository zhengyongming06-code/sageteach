/** Password recovery redirect; must match Supabase Dashboard → Auth → URL Configuration → Redirect URLs. */
export function passwordRecoveryRedirectTo(): string {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/auth/update-password`;
}
