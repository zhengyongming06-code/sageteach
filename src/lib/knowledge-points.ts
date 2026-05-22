import { SUBJECTS, type Subject } from "@/lib/subjects";

/** Per-user knowledge point mastery (matches DB check constraint). */
export const KNOWLEDGE_POINT_STATUSES = ["未测试", "薄弱", "掌握中", "已掌握"] as const;

export type KnowledgePointStatus = (typeof KNOWLEDGE_POINT_STATUSES)[number];

export const GRADE_OPTIONS = ["高一", "高二", "高三", "已毕业"] as const;

export type UserGrade = (typeof GRADE_OPTIONS)[number];

export type GradeBand = "高一" | "高二" | "高三";

/** Knowledge points per subject, tagged by grade band. */
export const SUBJECT_KNOWLEDGE_BY_GRADE: Record<
  Subject,
  Partial<Record<GradeBand, readonly string[]>>
> = {
  数学: {
    高一: ["函数与导数基础", "三角函数", "向量", "数列"],
    高二: ["立体几何", "概率统计", "古典概型", "条件概率", "线性规划"],
    高三: ["椭圆与双曲线", "抛物线", "导数应用", "复数"],
  },
  语文: {
    高一: ["文言实词", "文言虚词", "诗歌鉴赏基础", "名句默写"],
    高二: ["论述类文本", "文学类文本", "语言文字运用"],
    高三: ["作文立意", "实用类文本", "论述类选项辨析"],
  },
  英语: {
    高一: ["词汇语法", "阅读理解基础"],
    高二: ["完形填空", "七选五", "语法填空"],
    高三: ["书面表达", "阅读理解长难句"],
  },
  物理: {
    高一: ["力学基础", "运动学", "牛顿定律"],
    高二: ["电场", "磁场", "电磁感应"],
    高三: ["带电粒子运动", "光学", "热学", "力学综合"],
  },
  化学: {
    高一: ["离子方程式", "氧化还原", "物质的量"],
    高二: ["化学平衡", "电化学", "有机化学基础"],
    高三: ["有机合成", "实验题", "工业流程"],
  },
  生物: {
    高一: ["细胞结构", "细胞代谢", "遗传规律基础"],
    高二: ["基因工程", "免疫调节", "生态系统"],
    高三: ["遗传综合", "实验设计", "现代生物技术"],
  },
  政治: {
    高三: ["经济生活", "政治生活", "文化生活", "哲学原理"],
  },
  历史: {
    高三: ["中国近代史", "世界近代史", "古代史", "史料分析"],
  },
  地理: {
    高三: ["大气运动", "水循环", "农业区位", "工业区位", "人口"],
  },
};

/** @deprecated Flat list — prefer grade-aware helpers below. */
export const SUBJECT_KNOWLEDGE_POINTS: Record<Subject, readonly string[]> = Object.fromEntries(
  SUBJECTS.map((subject) => [
    subject,
    Object.values(SUBJECT_KNOWLEDGE_BY_GRADE[subject]).flat(),
  ]),
) as Record<Subject, readonly string[]>;

export function isSubject(subject: string): subject is Subject {
  return (SUBJECTS as readonly string[]).includes(subject);
}

export function normalizeUserGrade(raw: string | null | undefined): UserGrade | null {
  if (!raw) return null;
  if (raw === "其他") return "已毕业";
  if ((GRADE_OPTIONS as readonly string[]).includes(raw)) return raw as UserGrade;
  return null;
}

/** Grade bands included for this user (current grade and below). */
export function gradeBandsForUser(grade: UserGrade): GradeBand[] {
  switch (grade) {
    case "高一":
      return ["高一"];
    case "高二":
      return ["高一", "高二"];
    case "高三":
    case "已毕业":
      return ["高一", "高二", "高三"];
    default:
      return ["高三"];
  }
}

/** All knowledge points for a subject visible at the user's grade. */
export function getKnowledgePointsForSubjectAndGrade(
  subject: Subject,
  grade: UserGrade,
): string[] {
  const bands = gradeBandsForUser(grade);
  const byGrade = SUBJECT_KNOWLEDGE_BY_GRADE[subject];
  const out: string[] = [];
  for (const band of bands) {
    const list = byGrade[band];
    if (list) out.push(...list);
  }
  return out;
}

export function getKnowledgePointsForSubject(
  subject: Subject,
  grade?: UserGrade | null,
): readonly string[] {
  if (grade) return getKnowledgePointsForSubjectAndGrade(subject, grade);
  return SUBJECT_KNOWLEDGE_POINTS[subject];
}

/** Questions per diagnostic round. */
export const DIAGNOSTIC_QUESTION_COUNT = 5;

export function getTotalKnowledgePointsForSubject(subject: Subject, grade: UserGrade): number {
  return getKnowledgePointsForSubjectAndGrade(subject, grade).length;
}

/** Pick the next round of knowledge points (untested only). */
export function pickKnowledgePointsForDiagnosticRound(
  subject: Subject,
  grade: UserGrade,
  exclude: ReadonlySet<string>,
  count: number = DIAGNOSTIC_QUESTION_COUNT,
): string[] {
  const pool = getKnowledgePointsForSubjectAndGrade(subject, grade).filter((kp) => !exclude.has(kp));
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

/** @deprecated Use pickKnowledgePointsForDiagnosticRound with grade + exclude set. */
export function getKnowledgePointsForDiagnosticCoverage(subject: Subject): string[] {
  return [...SUBJECT_KNOWLEDGE_POINTS[subject]];
}

/** @deprecated */
export function getKnowledgePointsForDiagnostic(
  subject: Subject,
  count: number = DIAGNOSTIC_QUESTION_COUNT,
): string[] {
  return pickKnowledgePointsForDiagnostic(subject, count);
}

/** @deprecated */
export function pickKnowledgePointsForDiagnostic(subject: Subject, count: number): string[] {
  const pool = getKnowledgePointsForDiagnosticCoverage(subject);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.min(count, pool.length));
}

export function diagnosticQuestionCountForSubject(_subject: Subject): number {
  return DIAGNOSTIC_QUESTION_COUNT;
}

/** Catalog rows for seeding / profile fallback (grade-filtered). */
export function allCatalogKnowledgePointRows(grade?: UserGrade | null): {
  subject: Subject;
  name: string;
}[] {
  const effective = grade ?? "高三";
  return SUBJECTS.flatMap((subject) =>
    getKnowledgePointsForSubjectAndGrade(subject, effective).map((name) => ({
      subject,
      name,
    })),
  );
}

export const KNOWLEDGE_POINT_STATUS_DOT_CLASS: Record<KnowledgePointStatus, string> = {
  薄弱: "bg-red-500",
  掌握中: "bg-amber-400",
  已掌握: "bg-emerald-500",
  未测试: "bg-muted-foreground/40",
};
