import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme-provider";

type ThemeToggleProps = {
  className?: string;
  /** @deprecated 保留兼容，不再使用三档切换 */
  compact?: boolean;
};

/** 浅色 ↔ 深色，与 Syllagrid Wiki 一致：一个图标，点一下切换。 */
export function ThemeToggle({ className }: ThemeToggleProps) {
  const { resolvedTheme, toggleTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      className={cn(
        "wiki-theme-btn",
        className,
      )}
      aria-label={isDark ? "切换到浅色模式" : "切换到深色模式"}
      title={isDark ? "浅色模式" : "深色模式"}
      onClick={toggleTheme}
    >
      {isDark ? (
        <Sun className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
      ) : (
        <Moon className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
      )}
    </button>
  );
}
