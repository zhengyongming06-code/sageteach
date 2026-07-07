import { SUBJECTS } from "@/lib/subjects";
import type { WeakArchiveRow } from "@/lib/weak-archive";
import { flattenWikiNavLinks } from "@/lib/wiki-app-nav";

export type WikiSearchResultKind = "task" | "knowledge" | "nav" | "action";

export type WikiSearchResult = {
  id: string;
  kind: WikiSearchResultKind;
  label: string;
  detail?: string;
  meta?: string;
  to: string;
  hash?: string;
  search?: Record<string, string>;
};

export type WikiSearchGroup = {
  id: WikiSearchResultKind | "suggest";
  label: string;
  items: WikiSearchResult[];
};

export type WikiKnowledgeSearchRow = {
  subject: string;
  name: string;
  mastery_score?: number | null;
  wrong_count?: number;
};

const GROUP_ORDER: WikiSearchResultKind[] = ["task", "knowledge", "action", "nav"];

const GROUP_LABELS: Record<WikiSearchResultKind | "suggest", string> = {
  suggest: "快捷入口",
  task: "今晚任务",
  knowledge: "薄弱知识点",
  action: "快捷动作",
  nav: "页面",
};

function includesQuery(text: string, q: string): boolean {
  return text.toLowerCase().includes(q);
}

function matchesAny(q: string, ...parts: (string | undefined | null)[]): boolean {
  return parts.some((p) => p && includesQuery(p, q));
}

export function highlightMatchSegments(
  text: string,
  query: string,
): { text: string; match: boolean }[] {
  const q = query.trim();
  if (!q) return [{ text, match: false }];
  const lower = text.toLowerCase();
  const needle = q.toLowerCase();
  const out: { text: string; match: boolean }[] = [];
  let i = 0;
  while (i < text.length) {
    const idx = lower.indexOf(needle, i);
    if (idx === -1) {
      out.push({ text: text.slice(i), match: false });
      break;
    }
    if (idx > i) out.push({ text: text.slice(i, idx), match: false });
    out.push({ text: text.slice(idx, idx + q.length), match: true });
    i = idx + q.length;
  }
  return out.length ? out : [{ text, match: false }];
}

function searchTasks(query: string, archive: WeakArchiveRow[]): WikiSearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return archive
    .filter((row) => matchesAny(q, row.tonight_task, row.weak_point, row.subject))
    .slice(0, 6)
    .map((row) => ({
      id: `task-${row.id}`,
      kind: "task" as const,
      label: row.tonight_task,
      detail: row.weak_point ? `卡在 ${row.weak_point}` : undefined,
      meta: row.completed ? `${row.subject} · 已完成` : row.subject,
      to: "/app/today",
      hash: "archive",
    }));
}

function searchKnowledge(query: string, rows: WikiKnowledgeSearchRow[]): WikiSearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return rows
    .filter((row) => matchesAny(q, row.name, row.subject))
    .slice(0, 6)
    .map((row) => {
      const score =
        row.mastery_score != null ? `${Math.round(row.mastery_score)}%` : undefined;
      const wrong = row.wrong_count ? `错 ${row.wrong_count} 次` : undefined;
      const detail = [score, wrong].filter(Boolean).join(" · ") || "掌握中";
      return {
        id: `kp-${row.subject}-${row.name}`,
        kind: "knowledge" as const,
        label: row.name,
        detail,
        meta: row.subject,
        to: "/app/diagnostic",
      };
    });
}

function searchActions(query: string): WikiSearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const out: WikiSearchResult[] = [];
  for (const subject of SUBJECTS) {
    if (includesQuery(subject, q) || includesQuery(`${subject}复盘`, q) || q === "复盘") {
      out.push({
        id: `action-review-${subject}`,
        kind: "action",
        label: `开始${subject}复盘`,
        meta: "复盘",
        to: "/app/review",
        search: { subject },
      });
    }
  }
  if (includesQuery("今晚任务", q) || includesQuery("任务", q) || q === "今晚") {
    out.push({
      id: "action-tasks",
      kind: "action",
      label: "查看今晚任务",
      meta: "今日",
      to: "/app/today",
      hash: "archive",
    });
  }
  if (includesQuery("诊断", q)) {
    out.push({
      id: "action-diagnostic",
      kind: "action",
      label: "知识点诊断",
      meta: "诊断",
      to: "/app/diagnostic",
    });
  }
  return out.slice(0, 4);
}

function searchNav(query: string): WikiSearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return flattenWikiNavLinks()
    .filter(
      (item) =>
        includesQuery(item.label, q) || (item.meta != null && includesQuery(item.meta, q)),
    )
    .map((item) => ({
      id: `nav-${item.id}`,
      kind: "nav" as const,
      label: item.label,
      meta: item.meta,
      to: item.to,
      hash: item.hash,
      search: item.search,
    }));
}

export function buildWikiSearchGroups(
  query: string,
  ctx: {
    archive: WeakArchiveRow[];
    knowledge: WikiKnowledgeSearchRow[];
  },
): WikiSearchGroup[] {
  const q = query.trim();
  if (!q) return [];

  const buckets = new Map<WikiSearchResultKind, WikiSearchResult[]>();
  const add = (items: WikiSearchResult[]) => {
    for (const item of items) {
      const list = buckets.get(item.kind) ?? [];
      if (list.some((x) => x.id === item.id)) continue;
      list.push(item);
      buckets.set(item.kind, list);
    }
  };

  add(searchTasks(q, ctx.archive));
  add(searchKnowledge(q, ctx.knowledge));
  add(searchActions(q));
  add(searchNav(q));

  return GROUP_ORDER.filter((kind) => (buckets.get(kind)?.length ?? 0) > 0).map((kind) => ({
    id: kind,
    label: GROUP_LABELS[kind],
    items: buckets.get(kind) ?? [],
  }));
}

export function buildWikiSearchSuggestions(ctx: {
  archive: WeakArchiveRow[];
  knowledge: WikiKnowledgeSearchRow[];
}): WikiSearchGroup[] {
  const pendingTasks = ctx.archive.filter((r) => !r.completed).slice(0, 4);
  const weakKp = ctx.knowledge
    .filter((row) => (row.mastery_score ?? 100) < 70 || (row.wrong_count ?? 0) > 0)
    .slice(0, 3);

  const items: WikiSearchResult[] = [
    ...pendingTasks.map((row) => ({
      id: `suggest-task-${row.id}`,
      kind: "task" as const,
      label: row.tonight_task,
      detail: row.weak_point ? `卡在 ${row.weak_point}` : undefined,
      meta: `${row.subject} · 未完成`,
      to: "/app/today",
      hash: "archive",
    })),
    ...weakKp.map((row) => ({
      id: `suggest-kp-${row.subject}-${row.name}`,
      kind: "knowledge" as const,
      label: row.name,
      detail:
        row.mastery_score != null
          ? `掌握度 ${Math.round(row.mastery_score)}%`
          : "薄弱知识点",
      meta: row.subject,
      to: "/app/diagnostic",
    })),
  ];

  if (items.length === 0) {
    items.push(
      {
        id: "suggest-today",
        kind: "nav",
        label: "今日",
        meta: "入门",
        to: "/app/today",
      },
      {
        id: "suggest-review-math",
        kind: "action",
        label: "开始数学复盘",
        meta: "复盘",
        to: "/app/review",
        search: { subject: "数学" },
      },
    );
  }

  return [{ id: "suggest", label: GROUP_LABELS.suggest, items }];
}

export function flattenWikiSearchGroups(groups: WikiSearchGroup[]): WikiSearchResult[] {
  return groups.flatMap((g) => g.items);
}

export function wikiSearchPreviewTags(item: WikiSearchResult): string[] {
  switch (item.kind) {
    case "task": {
      const subject = item.meta?.replace(/\s·\s已完成|\s·\s未完成/g, "").trim();
      return [subject, "今晚任务"].filter((t): t is string => !!t && t.length > 0);
    }
    case "knowledge":
      return [item.meta ?? "学科", "薄弱"].filter(Boolean);
    case "action":
      return [item.meta ?? "动作", "快捷"];
    case "nav":
      return [item.meta ?? "页面", "导航"];
    default:
      return [];
  }
}

export function wikiSearchBreadcrumb(item: WikiSearchResult): string {
  switch (item.kind) {
    case "task":
      return `Sage › 今日 › 今晚任务 › ${item.meta?.split(" · ")[0] ?? "复盘"}`;
    case "knowledge":
      return `Sage › 今日 › 知识点 › ${item.meta ?? "学科"}`;
    case "action":
      return `Sage › ${item.meta ?? "快捷"} › ${item.label}`;
    case "nav":
      return `Sage › ${item.meta ?? "入门"} › ${item.label}`;
    default:
      return `Sage › ${item.label}`;
  }
}

export function wikiSearchPreviewHint(item: WikiSearchResult): string {
  switch (item.kind) {
    case "task":
      return "复盘整理出的可执行任务。做完可在今日页标记完成。";
    case "knowledge":
      return "来自你的掌握度数据。可在今日页查看训练与诊断。";
    case "action":
      return "快捷跳转到常用操作，Enter 立即打开。";
    case "nav":
      return "应用内页面导航。";
    default:
      return "";
  }
}
