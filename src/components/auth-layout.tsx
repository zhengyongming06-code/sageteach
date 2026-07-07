import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { SageLogo } from "@/components/sage-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { authCardClass, authPageClass } from "@/lib/shell-styles";

type AuthLayoutProps = {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
};

export function AuthLayout({ title, subtitle, children, footer }: AuthLayoutProps) {
  return (
    <div className={authPageClass}>
      <div className="absolute right-4 top-4 sm:right-6 sm:top-6">
        <ThemeToggle compact />
      </div>
      <div className={authCardClass}>
        <Link to="/" className="sy-brand">
          <SageLogo className="h-9 w-9" idPrefix="auth" />
          Sage
        </Link>
        <Link to="/" className="mt-4 block text-sm text-muted-foreground hover:text-foreground">
          ← 返回首页
        </Link>
        <h1 className="sy-h2 !mt-6 !max-w-none !text-2xl">{title}</h1>
        <p className="sy-lead !mb-0 !text-sm">{subtitle}</p>
        <div className="mt-8">{children}</div>
        {footer ? <div className="mt-6">{footer}</div> : null}
      </div>
    </div>
  );
}
