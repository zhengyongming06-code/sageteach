import { useMemo, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { WIKI_NAV_GROUPS, type WikiNavLink } from "@/lib/wiki-app-nav";

type WikiSidebarTreeProps = {
  showAdmin?: boolean;
};

function isLinkActive(
  path: string,
  hash: string,
  search: Record<string, unknown>,
  item: WikiNavLink,
): boolean {
  if (!path.startsWith(item.to)) return false;
  if (item.hash) {
    const want = item.hash.startsWith("#") ? item.hash.slice(1) : item.hash;
    const got = hash.startsWith("#") ? hash.slice(1) : hash;
    return path.startsWith("/app/today") && got === want;
  }
  if (item.to === "/app/review") {
    if (!path.startsWith("/app/review") || path.includes("/archive")) return false;
    const urlSubject = typeof search.subject === "string" ? search.subject : undefined;
    return !!item.search?.subject && urlSubject === item.search.subject;
  }
  if (item.to === "/app/learn") {
    if (!path.startsWith("/app/learn")) return false;
    const urlSubject = typeof search.subject === "string" ? search.subject : undefined;
    return !!item.search?.subject && urlSubject === item.search.subject;
  }
  return true;
}

export function WikiSidebarTree({ showAdmin }: WikiSidebarTreeProps) {
  const location = useRouterState({ select: (s) => s.location });
  const path = location.pathname;
  const hash = location.hash;
  const search = location.search as Record<string, unknown>;
  const [open, setOpen] = useState<Record<string, boolean>>({
    start: true,
    learn: path.startsWith("/app/learn"),
    review: path.startsWith("/app/review"),
    admin: path.startsWith("/app/admin"),
  });

  const groups = useMemo(() => {
    if (!showAdmin) return WIKI_NAV_GROUPS;
    return [
      ...WIKI_NAV_GROUPS,
      {
        id: "admin",
        label: "管理",
        children: [{ id: "analytics", label: "数据分析", to: "/app/admin/analytics" }],
      },
    ];
  }, [showAdmin]);

  return (
    <nav className="wiki-tree min-h-0 flex-1 overflow-y-auto pr-0.5" aria-label="站点导航">
      {groups.map((group) => {
        const expanded = open[group.id] ?? false;
        return (
          <div key={group.id} className="wiki-tree-group">
            <button
              type="button"
              className="wiki-tree-group-btn"
              aria-expanded={expanded}
              onClick={() => setOpen((prev) => ({ ...prev, [group.id]: !expanded }))}
            >
              <ChevronRight
                className={cn("wiki-tree-chevron h-3.5 w-3.5 shrink-0", expanded && "wiki-tree-chevron-open")}
              />
              <span>{group.label}</span>
            </button>
            {expanded ? (
              <ul className="wiki-tree-list">
                {group.children.map((item) => {
                  const active = isLinkActive(path, hash, search, item);
                  return (
                    <li key={item.id}>
                      <Link
                        to={item.to}
                        hash={item.hash}
                        search={item.search}
                        data-active={active}
                        className="wiki-tree-link"
                      >
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}
