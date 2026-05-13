import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const { signIn } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [loading, setLoading] = useState(false);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm">
        <Link to="/" className="text-sm text-muted-foreground">← 返回</Link>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">欢迎回来</h1>
        <p className="mt-1 text-sm text-muted-foreground">继续昨天没说完的话。</p>

        <form
          className="mt-8 space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setLoading(true);
            try {
              await signIn(email, pw);
              nav({ to: "/app/today" });
            } catch (err) {
              toast.error((err as Error).message);
            } finally {
              setLoading(false);
            }
          }}
        >
          <Input type="email" inputMode="email" autoComplete="email" required placeholder="邮箱" value={email} onChange={(e) => setEmail(e.target.value)} className="h-12 rounded-xl" />
          <Input type="password" autoComplete="current-password" required placeholder="密码" value={pw} onChange={(e) => setPw(e.target.value)} className="h-12 rounded-xl" />
          <div className="text-right">
            <Link to="/forgot-password" className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
              忘记密码？
            </Link>
          </div>
          <Button type="submit" disabled={loading} className="h-12 w-full rounded-xl text-base">
            {loading ? "登录中…" : "登录"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          没账号？<Link to="/signup" className="text-primary">注册</Link>
        </p>
      </div>
    </div>
  );
}
