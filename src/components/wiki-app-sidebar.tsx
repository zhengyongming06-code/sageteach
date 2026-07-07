import { Link } from "@tanstack/react-router";
import { ThemeToggle } from "@/components/theme-toggle";
import { WikiAppSearch } from "@/components/wiki-app-search";
import { WikiSidebarTree } from "@/components/wiki-sidebar-tree";

type WikiAppSidebarProps = {
  showAdmin?: boolean;
  onSignOut: () => void | Promise<void>;
};

export function WikiAppSidebar({ showAdmin, onSignOut }: WikiAppSidebarProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Link to="/app/today" className="mb-5 block shrink-0 px-1">
        <span className="wiki-sidebar-title">Sage</span>
        <span className="mt-0.5 block text-xs font-medium text-[var(--wiki-nav-fg)]">Study Hub</span>
      </Link>

      <WikiAppSearch />

      <div className="mb-3 flex shrink-0 items-center gap-1 px-1">
        <ThemeToggle />
      </div>

      <WikiSidebarTree showAdmin={showAdmin} />

      <div className="mt-4 shrink-0 border-t border-border pt-4">
        <button type="button" onClick={() => void onSignOut()} className="wiki-nav-link w-full text-left">
          退出登录
        </button>
      </div>
    </div>
  );
}
