import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { AuthLayout } from "@/components/auth-layout";

export const Route = createFileRoute("/signup")({ component: Signup });

function Signup() {
  const { signUp, signIn } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [loading, setLoading] = useState(false);

  return (
    <AuthLayout
      title="开始使用 Sage"
      subtitle="三十秒注册，今晚就能用。"
      footer={
        <p className="text-center text-sm text-slate-600">
          已有账号？
          <Link to="/login" className="font-medium text-[var(--syllagrid-blue)] hover:underline">
            登录
          </Link>
        </p>
      }
    >
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (pw.length < 8) return toast.error("密码至少 8 位，安全一点");
          setLoading(true);
          try {
            const hasSession = await signUp(email, pw);
            if (!hasSession) {
              await signIn(email, pw);
            }
            const {
              data: { session },
            } = await supabase.auth.getSession();
            if (!session) {
              toast.error("当前未登录（例如需先验证邮箱），验证后请从登录页进入。");
              return;
            }
            nav({ to: "/onboarding" });
          } catch (err) {
            toast.error((err as Error).message);
          } finally {
            setLoading(false);
          }
        }}
      >
        <Input
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          placeholder="邮箱"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-12 rounded-[10px] border-border bg-card"
        />
        <Input
          type="password"
          autoComplete="new-password"
          required
          placeholder="设个密码（≥8 位）"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          className="h-12 rounded-[10px] border-border bg-card"
        />
        <Button
          type="submit"
          disabled={loading}
          className="h-12 w-full sy-button sy-button-primary !min-h-12"
        >
          {loading ? "注册中…" : "注册并开始"}
        </Button>
      </form>
    </AuthLayout>
  );
}
