import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/auth/update-password")({ component: UpdatePassword });

function UpdatePassword() {
  const nav = useNavigate();
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let subscription: { unsubscribe: () => void } | null = null;

    const boot = async () => {
      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(window.location.href);
        if (cancelled) return;
        if (error) {
          console.error(error);
          setReady(false);
          setChecking(false);
          return;
        }
        setReady(true);
        setChecking(false);
        window.history.replaceState({}, "", `${url.origin}${url.pathname}`);
        return;
      }

      const { data: sub } = supabase.auth.onAuthStateChange((event) => {
        if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
          setReady(true);
          setChecking(false);
        }
      });
      subscription = sub.subscription;

      const { data } = await supabase.auth.getSession();
      if (cancelled) {
        subscription.unsubscribe();
        return;
      }
      if (data.session) {
        setReady(true);
      }
      setChecking(false);
    };

    void boot();

    return () => {
      cancelled = true;
      subscription?.unsubscribe();
    };
  }, []);

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6">
        <p className="text-sm text-muted-foreground">正在验证重置链接…</p>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6">
        <p className="max-w-sm text-center text-sm text-muted-foreground">
          链接无效或已过期。请从登录页的「忘记密码」重新申请一封邮件。
        </p>
        <Link to="/login" className="text-sm text-primary">
          返回登录
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold tracking-tight">设置新密码</h1>
        <p className="mt-1 text-sm text-muted-foreground">至少 8 位，建议字母与数字组合。</p>

        <form
          className="mt-8 space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (pw1.length < 8) return toast.error("密码至少 8 位");
            if (pw1 !== pw2) return toast.error("两次输入的密码不一致");
            setLoading(true);
            try {
              const { error } = await supabase.auth.updateUser({ password: pw1 });
              if (error) throw new Error(error.message);
              await supabase.auth.signOut();
              toast.success("密码已更新，请用新密码登录");
              nav({ to: "/login" });
            } catch (err) {
              toast.error((err as Error).message);
            } finally {
              setLoading(false);
            }
          }}
        >
          <Input
            type="password"
            autoComplete="new-password"
            required
            placeholder="新密码"
            value={pw1}
            onChange={(e) => setPw1(e.target.value)}
            className="h-12 rounded-xl"
          />
          <Input
            type="password"
            autoComplete="new-password"
            required
            placeholder="再输入一次"
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
            className="h-12 rounded-xl"
          />
          <Button type="submit" disabled={loading} className="h-12 w-full rounded-xl text-base">
            {loading ? "保存中…" : "保存新密码"}
          </Button>
        </form>
      </div>
    </div>
  );
}
