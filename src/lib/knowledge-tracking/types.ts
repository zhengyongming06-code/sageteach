import type { KnowledgePointStatus } from "@/lib/knowledge-points";
import type { Subject } from "@/lib/subjects";

/** 掌握度变更事件类型 */
export type MasteryEventType =
  | "photo_wrong"
  | "photo_quiz_wrong"
  | "photo_quiz_correct"
  | "diagnostic_wrong"
  | "diagnostic_correct"
  | "review_mastered"
  | "manual_adjust";

export type MasterySourceType = "photo" | "quiz" | "diagnostic" | "review" | "system";

export type DailyTrainingTaskType = "同类练习" | "错题重做" | "巩固测验" | "诊断补测";

export type DailyTrainingStatus = "pending" | "done" | "skipped";

/** DeepSeek 从拍照解析中提取的结构 */
export type PhotoKnowledgeExtraction = {
  subject: Subject;
  question_summary: string;
  question_type: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  is_wrong: boolean;
  knowledge_points: string[];
  /** 映射到目录节点后的 canonical 名称 */
  mapped_knowledge_points?: string[];
  confidence: number;
};

export type KgCatalogNode = {
  id: string;
  subject: Subject;
  name: string;
  parent_id: string | null;
  grade_band: "高一" | "高二" | "高三" | null;
  depth: number;
  path: string;
  sort_order: number;
};

/** 弱点树节点（JSON 存入 student_weakness_trees.tree） */
export type WeaknessTreeNode = {
  id: string;
  name: string;
  subject: Subject;
  mastery_score: number | null;
  status: KnowledgePointStatus;
  wrong_count: number;
  children: WeaknessTreeNode[];
  /** 聚合子树最低分，用于排序 */
  min_score: number;
};

export type StudentKnowledgePoint = {
  id: string;
  subject: Subject;
  name: string;
  status: KnowledgePointStatus;
  mastery_score: number | null;
  correct_count: number;
  wrong_count: number;
  streak_correct: number;
  last_event_at: string | null;
  last_wrong_at: string | null;
  catalog_node_id: string | null;
};

export type StudentWrongQuestion = {
  id: string;
  subject: Subject;
  coach_message_id: string | null;
  review_session_slug: string | null;
  review_session_date: string | null;
  question_summary: string;
  question_type: string | null;
  difficulty: number | null;
  knowledge_points: string[];
  is_resolved: boolean;
  created_at: string;
};

export type DailyTrainingItem = {
  id: string;
  training_date: string;
  subject: Subject;
  knowledge_point: string;
  priority: number;
  reason: string;
  task_type: DailyTrainingTaskType;
  estimated_minutes: number;
  status: DailyTrainingStatus;
};

export type MasteryBatchEvent = {
  subject: Subject;
  knowledge_point: string;
  event_type: MasteryEventType;
  delta_score: number;
  source_type: MasterySourceType;
  source_id?: string;
  metadata?: Record<string, unknown>;
};

export type ApplyMasteryResult = {
  subject: Subject;
  knowledge_point: string;
  score_before: number | null;
  score_after: number;
  status: KnowledgePointStatus;
};

/** Edge Function: POST /functions/v1/knowledge-track-photo */
export type KnowledgeTrackPhotoRequest = {
  coach_message_id: string;
  subject: Subject;
  session_date: string;
  session_slug: string | null;
  analysis_markdown: string;
  /** 巩固题对答案后的结果 */
  quiz_results?: { index: number; correct: boolean }[];
};

export type KnowledgeTrackPhotoResponse = {
  extraction: PhotoKnowledgeExtraction;
  wrong_question_id: string | null;
  mastery_updates: ApplyMasteryResult[];
  weakness_tree: WeaknessTreeNode | null;
  daily_training: DailyTrainingItem[];
};
