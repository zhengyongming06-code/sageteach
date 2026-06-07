import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { analyticsQueryKeys, checkAnalyticsAdmin } from "@/lib/analytics/api";

/**
 * Admin = row in Supabase `admin_users` (see checkAnalyticsAdmin).
 * Shared by desktop sidebar and mobile tab bar.
 */
export function useIsAdmin() {
  const { user } = useAuth();
  const loggedRef = useRef(false);

  const query = useQuery({
    queryKey: analyticsQueryKeys.admin,
    queryFn: checkAnalyticsAdmin,
    enabled: !!user?.id,
    staleTime: 120_000,
  });

  useEffect(() => {
    if (!import.meta.env.DEV || !user?.id || query.isLoading || loggedRef.current) return;
    loggedRef.current = true;
    console.log("[useIsAdmin]", {
      userId: user.id,
      email: user.email,
      isAdmin: query.data === true,
    });
  }, [user?.id, user?.email, query.data, query.isLoading]);

  return {
    isAdmin: query.data === true,
    isLoading: query.isLoading && !!user?.id,
    isAdminKnown: query.data !== undefined,
  };
}
