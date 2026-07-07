import { SUBJECTS, type Subject } from "@/lib/subjects";

export type WikiNavLink = {
  id: string;
  label: string;
  to: string;
  hash?: string;
  search?: Record<string, string>;
};

export type WikiNavGroup = {
  id: string;
  label: string;
  children: WikiNavLink[];
};

export const WIKI_NAV_GROUPS: WikiNavGroup[] = [
  {
    id: "start",
    label: "入门",
    children: [
      { id: "today", label: "今日", to: "/app/today" },
      { id: "diagnostic", label: "知识点诊断", to: "/app/diagnostic" },
    ],
  },
  {
    id: "review",
    label: "复盘",
    children: SUBJECTS.map((s) => ({
      id: `subject-${s}`,
      label: s,
      to: "/app/review",
      search: { subject: s },
    })),
  },
];

export type WikiSearchResult = {
  id: string;
  label: string;
  meta?: string;
  to: string;
  hash?: string;
  search?: Record<string, string>;
};

export function flattenWikiNavLinks(): WikiSearchResult[] {
  const out: WikiSearchResult[] = [];
  for (const group of WIKI_NAV_GROUPS) {
    for (const item of group.children) {
      out.push({
        id: item.id,
        label: item.label,
        meta: group.label,
        to: item.to,
        hash: item.hash,
        search: item.search,
      });
    }
  }
  return out;
}

export function isSubjectSearch(value: string | undefined): value is Subject {
  return !!value && (SUBJECTS as readonly string[]).includes(value);
}
