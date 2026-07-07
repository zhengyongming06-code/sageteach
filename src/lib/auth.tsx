import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { passwordRecoveryRedirectTo } from "@/lib/auth-redirect";

const ZH_ERRORS: Record<string, string> = {
  "Invalid login credentials": "邮箱或密码不正确",
  "Email not confirmed": "邮箱尚未验证",
  "User already registered": "该邮箱已注册，直接登录即可",
  "Password should be at least 6 characters": "密码至少 6 位",
  "Unable to validate email address: invalid format": "邮箱格式不正确",
  "Anonymous sign-ins are disabled": "请使用邮箱注册",
  "Signups not allowed for this instance": "暂未开放注册",
  "For security purposes, you can only request this after": "请求太频繁，请稍后再试",
  "Email rate limit exceeded": "邮件发送过于频繁，请稍后再试",
};

function toAuthMessage(err: { message?: string; status?: number; code?: string }): string {
  if (err.status === 429) {
    return "请求太频繁（例如短时间内多次登录/注册），请等待约 15～60 分钟后再试；或换手机热点/其他网络后再试。";
  }
  const code = String(err.code ?? "");
  if (code === "over_request_rate_limit" || code === "too_many_requests") {
    return "请求太频繁，请稍后再试。";
  }
  const msg = err.message ?? "";
  if (/rate limit|429|too many requests|over_request|over_email_send|security purposes/i.test(msg)) {
    return "请求太频繁，请稍后再试。";
  }
  const mapped = ZH_ERRORS[msg];
  if (mapped) return mapped;
  if (msg) return msg;
  return "出了一点问题，请稍后再试";
}

type AuthCtx = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  /** 为 true 时表示注册后已带 session，无需再调用 signIn。 */
  signUp: (email: string, password: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (!mounted) return;
      setSession(s);
      // Wait for storage hydration before routing guards decide "logged out".
      if (event === "INITIAL_SESSION") {
        setLoading(false);
      }
    });

    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      // Fallback for clients that skip INITIAL_SESSION.
      setLoading(false);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value: AuthCtx = {
    session,
    user: session?.user ?? null,
    loading,
    async signIn(email, password) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw new Error(toAuthMessage(error));
    },
    async signUp(email, password) {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: typeof window !== "undefined" ? `${window.location.origin}/` : undefined,
        },
      });
      if (error) throw new Error(toAuthMessage(error));
      return !!data.session;
    },
    async signOut() {
      await supabase.auth.signOut();
    },
    async requestPasswordReset(email) {
      const redirectTo = passwordRecoveryRedirectTo();
      if (!redirectTo) throw new Error("无法生成重置链接");
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo,
      });
      if (error) throw new Error(toAuthMessage(error));
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside AuthProvider");
  return v;
}
