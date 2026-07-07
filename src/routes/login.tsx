import { createFileRoute, Link, Navigate, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { AuthLayout } from "@/components/auth-layout";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const { signIn, session, loading } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [loadingSubmit, setLoadingSubmit] = useState(false);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">加载中…</p>
      </div>
    );
  }

  if (session) {
    return <Navigate to="/app/today" replace />;
  }

  return (
    <AuthLayout
      title="欢迎回来"
      subtitle="继续昨天没说完的话。"
      footer={
        <p className="text-center text-sm text-slate-600">
          没账号？
          <Link to="/signup" className="font-medium text-[var(--syllagrid-blue)] hover:underline">
            注册
          </Link>
        </p>
      }
    >
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setLoadingSubmit(true);
          try {
            await signIn(email, pw);
            nav({ to: "/app/today" });
          } catch (err) {
            toast.error((err as Error).message);
          } finally {
            setLoadingSubmit(false);
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
          autoComplete="current-password"
          required
          placeholder="密码"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          className="h-12 rounded-[10px] border-border bg-card"
        />
        <div className="text-right">
          <Link
            to="/forgot-password"
            className="text-sm text-slate-500 underline-offset-4 hover:text-slate-800 hover:underline"
          >
            忘记密码？
          </Link>
        </div>
        <Button
          type="submit"
          disabled={loadingSubmit}
          className="h-12 w-full sy-button sy-button-primary !min-h-12"
        >
          {loadingSubmit ? "登录中…" : "登录"}
        </Button>
      </form>
    </AuthLayout>
  );
}
