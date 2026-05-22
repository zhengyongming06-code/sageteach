import { SUBJECTS, type Subject } from "@/lib/subjects";

/** Per-user knowledge point mastery (matches DB check constraint). */
export const KNOWLEDGE_POINT_STATUSES = ["未测试", "薄弱", "掌握中", "已掌握"] as const;

export type KnowledgePointStatus = (typeof KNOWLEDGE_POINT_STATUSES)[number];

/** Canonical catalog of knowledge points per subject (diagnostic + profile). */
export const SUBJECT_KNOWLEDGE_POINTS: Record<Subject, readonly string[]> = {
  数学: [
    "椭圆与双曲线",
    "抛物线",
    "古典概型",
    "条件概率",
    "导数应用",
    "数列",
    "三角函数",
    "向量",
    "线性规划",
    "复数",
  ],
  语文: [
    "论述类文本",
    "文言实词",
    "文言虚词",
    "诗歌鉴赏",
    "作文立意",
    "语言文字运用",
    "名句默写",
  ],
  英语: ["七选五", "完形填空", "阅读理解", "语法填空", "书面表达"],
  物理: ["带电粒子运动", "电磁感应", "力学综合", "光学", "热学"],
  化学: ["氧化还原", "电化学", "有机化学", "化学平衡", "离子方程式"],
  生物: ["遗传规律", "基因工程", "细胞代谢", "生态系统", "免疫调节"],
  政治: ["经济生活", "政治生活", "文化生活", "哲学原理"],
  历史: ["中国近代史", "世界近代史", "古代史", "史料分析"],
  地理: ["大气运动", "水循环", "农业区位", "工业区位", "人口"],
};

export function isSubject(subject: string): subject is Subject {
  return (SUBJECTS as readonly string[]).includes(subject);
}

export function getKnowledgePointsForSubject(subject: Subject): readonly string[] {
  return SUBJECT_KNOWLEDGE_POINTS[subject];
}

/** Questions per diagnostic session (subset of catalog). */
export const DIAGNOSTIC_QUESTION_COUNT = 5;

/** All catalog knowledge points for one subject. */
export function getKnowledgePointsForDiagnosticCoverage(subject: Subject): string[] {
  return [...SUBJECT_KNOWLEDGE_POINTS[subject]];
}

/** Pick knowledge points for a diagnostic run (default 5 per subject). */
export function getKnowledgePointsForDiagnostic(
  subject: Subject,
  count: number = DIAGNOSTIC_QUESTION_COUNT,
): string[] {
  return pickKnowledgePointsForDiagnostic(subject, count);
}

export function diagnosticQuestionCountForSubject(_subject: Subject): number {
  return DIAGNOSTIC_QUESTION_COUNT;
}

export function pickKnowledgePointsForDiagnostic(subject: Subject, count: number): string[] {
  const pool = getKnowledgePointsForDiagnosticCoverage(subject);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.min(count, pool.length));
}

/** Flat list of every catalog row (for seeding user knowledge_points). */
export function allCatalogKnowledgePointRows(): { subject: Subject; name: string }[] {
  return SUBJECTS.flatMap((subject) =>
    SUBJECT_KNOWLEDGE_POINTS[subject].map((name) => ({ subject, name })),
  );
}

export const KNOWLEDGE_POINT_STATUS_DOT_CLASS: Record<KnowledgePointStatus, string> = {
  薄弱: "bg-red-500",
  掌握中: "bg-amber-400",
  已掌握: "bg-emerald-500",
  未测试: "bg-muted-foreground/40",
};
