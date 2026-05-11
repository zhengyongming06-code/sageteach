import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/signup")({ component: Signup });

function Signup() {
  const { signUp, signIn } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [loading, setLoading] = useState(false);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm">
        <Link to="/" className="text-sm text-muted-foreground">← 返回</Link>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">开始使用 Sage</h1>
        <p className="mt-1 text-sm text-muted-foreground">三十秒注册，今晚就能用。</p>

        <form
          className="mt-8 space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (pw.length < 8) return toast.error("密码至少 8 位，安全一点");
            setLoading(true);
            try {
              await signUp(email, pw);
              await signIn(email, pw);
              nav({ to: "/onboarding" });
            } catch (err) {
              toast.error((err as Error).message);
            } finally {
              setLoading(false);
            }
          }}
        >
          <Input type="email" inputMode="email" autoComplete="email" required placeholder="邮箱" value={email} onChange={(e) => setEmail(e.target.value)} className="h-12 rounded-xl" />
          <Input type="password" autoComplete="new-password" required placeholder="设个密码（≥8 位）" value={pw} onChange={(e) => setPw(e.target.value)} className="h-12 rounded-xl" />
          <Button type="submit" disabled={loading} className="h-12 w-full rounded-xl text-base">
            {loading ? "注册中…" : "注册并开始"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          已有账号？<Link to="/login" className="text-primary">登录</Link>
        </p>
      </div>
    </div>
  );
}
