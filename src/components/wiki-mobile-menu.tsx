import { Link } from "@tanstack/react-router";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type WikiMobileMenuProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  showAdmin?: boolean;
  onSignOut: () => void | Promise<void>;
};

export function WikiMobileMenu({
  open,
  onOpenChange,
  showAdmin,
  onSignOut,
}: WikiMobileMenuProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="wiki-mobile-menu flex flex-col">
        <SheetHeader className="text-left">
          <SheetTitle className="text-base font-semibold text-[var(--wiki-heading)]">我的</SheetTitle>
        </SheetHeader>

        <nav className="wiki-mobile-menu-nav" aria-label="账户与设置">
          <Link
            to="/app/diagnostic"
            className="wiki-mobile-menu-link"
            onClick={() => onOpenChange(false)}
          >
            知识点诊断
          </Link>
          {showAdmin ? (
            <Link
              to="/app/admin/analytics"
              className="wiki-mobile-menu-link"
              onClick={() => onOpenChange(false)}
            >
              产品分析
            </Link>
          ) : null}
        </nav>

        <div className="wiki-mobile-menu-section">
          <p className="wiki-mobile-menu-label">外观</p>
          <div className="wiki-mobile-menu-theme">
            <span className="text-sm text-[var(--wiki-fg)]">深色模式</span>
            <ThemeToggle />
          </div>
        </div>

        <div className="wiki-mobile-menu-footer">
          <button
            type="button"
            className="wiki-mobile-menu-signout"
            onClick={() => {
              onOpenChange(false);
              void onSignOut();
            }}
          >
            退出登录
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
