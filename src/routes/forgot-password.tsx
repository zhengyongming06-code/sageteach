import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/forgot-password")({ component: ForgotPassword });

function ForgotPassword() {
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm">
        <Link to="/login" className="text-sm text-muted-foreground">
          ← 返回登录
        </Link>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">忘记密码</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          输入注册邮箱，我们会发一封重置邮件（请查收垃圾箱）。
        </p>

        {sent ? (
          <p className="mt-8 rounded-xl border border-border bg-muted/40 p-4 text-sm text-foreground">
            若该邮箱已注册，你会收到重置链接。打开邮件里的链接即可设置新密码。
          </p>
        ) : (
          <form
            className="mt-8 space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              setLoading(true);
              try {
                await requestPasswordReset(email);
                setSent(true);
                toast.success("邮件已发送");
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
              placeholder="注册时用的邮箱"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-12 rounded-xl"
            />
            <Button type="submit" disabled={loading} className="h-12 w-full rounded-xl text-base">
              {loading ? "发送中…" : "发送重置邮件"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
