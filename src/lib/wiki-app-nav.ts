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
      { id: "archive", label: "弱点档案", to: "/app/today", hash: "archive" },
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

export function searchWikiNav(
  query: string,
  knowledgeRows: { subject: string; name: string }[],
): WikiSearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const navHits = flattenWikiNavLinks().filter(
    (item) =>
      item.label.toLowerCase().includes(q) ||
      (item.meta?.toLowerCase().includes(q) ?? false),
  );

  const kpHits = knowledgeRows
    .filter(
      (kp) =>
        kp.name.toLowerCase().includes(q) || kp.subject.toLowerCase().includes(q),
    )
    .slice(0, 8)
    .map((kp) => ({
      id: `kp-${kp.subject}-${kp.name}`,
      label: kp.name,
      meta: kp.subject,
      to: "/app/today",
      hash: "mastery",
    }));

  const seen = new Set<string>();
  return [...navHits, ...kpHits].filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}
