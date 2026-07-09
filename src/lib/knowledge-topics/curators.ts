import type { Subject } from "@/lib/subjects";

export type CuratorTier = "default" | "basic" | "advanced";

export type SubjectCurator = {
  name: string;
  tier: CuratorTier;
  note?: string;
};

/** 各学科 B 站推荐博主（用户策展 + 搜索链接 MVP） */
export const SUBJECT_CURATORS: Record<Subject, SubjectCurator[]> = {
  语文: [{ name: "国家玮", tier: "default" }],
  数学: [{ name: "赵礼显", tier: "default" }],
  英语: [
    { name: "FREE高考英语", tier: "default" },
    { name: "龙坚", tier: "default", note: "备选" },
  ],
  物理: [
    { name: "黄夫人", tier: "basic", note: "基础" },
    { name: "夏梦迪", tier: "advanced", note: "进阶" },
  ],
  化学: [{ name: "李政", tier: "default" }],
  生物: [{ name: "李林", tier: "default" }],
  政治: [{ name: "刘勖雯", tier: "default" }],
  历史: [{ name: "刘勖雯", tier: "default" }],
  地理: [{ name: "刘勖雯", tier: "default" }],
};

export function bilibiliSearchUrl(keyword: string): string {
  return `https://search.bilibili.com/all?keyword=${encodeURIComponent(keyword)}`;
}

/** 按难度选物理博主：≤2 偏基础，否则进阶 */
export function pickCuratorsForSubject(subject: Subject, difficulty = 3): SubjectCurator[] {
  const all = SUBJECT_CURATORS[subject];
  if (subject !== "物理") return all.slice(0, 2);

  const basic = all.find((c) => c.tier === "basic");
  const advanced = all.find((c) => c.tier === "advanced");
  if (difficulty <= 2 && basic) return [basic, advanced].filter(Boolean) as SubjectCurator[];
  if (advanced) return [advanced, basic].filter(Boolean) as SubjectCurator[];
  return all.slice(0, 2);
}
