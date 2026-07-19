import { supabase } from "@/integrations/supabase/client";
import type { PhotoKnowledgeExtraction } from "@/lib/knowledge-tracking/types";
import {
  getKnowledgeTopicEntry,
  type KnowledgeTopicQuestion,
  type KnowledgeTopicVideo,
} from "@/lib/knowledge-topics/catalog";
import { fetchPracticeQuestions } from "@/lib/knowledge-topics/fetch-practice-questions";
import {
  bilibiliSearchUrl,
  pickCuratorsForSubject,
  type SubjectCurator,
} from "@/lib/knowledge-topics/curators";
import type { Subject } from "@/lib/subjects";

export type KnowledgeRemediation = {
  subject: Subject;
  knowledgePoints: string[];
  primaryKnowledgePoint: string;
  questionType?: string;
  questionSummary?: string;
  videos: KnowledgeTopicVideo[];
  practiceQuestions: KnowledgeTopicQuestion[];
  learnSearch: { subject: Subject; topic: string };
};

function curatorVideo(
  curator: SubjectCurator,
  subject: Subject,
  knowledgePoint: string,
  questionType: string | undefined,
  index: number,
): KnowledgeTopicVideo {
  const keyword = questionType
    ? `${curator.name} ${knowledgePoint} ${questionType}`
    : `${curator.name} ${knowledgePoint}`;
  return {
    id: `curator-${index}-${curator.name}`,
    title: questionType ? `${knowledgePoint} · ${questionType}` : `${knowledgePoint}专题`,
    teacher: curator.name,
    platform: "bilibili",
    url: bilibiliSearchUrl(keyword.trim()),
    note: curator.note,
  };
}

function fallbackPractice(
  subject: Subject,
  knowledgePoint: string,
  fromEntry: KnowledgeTopicQuestion[],
): KnowledgeTopicQuestion[] {
  if (fromEntry.length > 0) return fromEntry.slice(0, 3);
  return [
    {
      id: "placeholder-1",
      stem: `找 2 道「${knowledgePoint}」同类题练手；不会就拍错题继续识点。`,
      source: `${subject} · 待接入题库`,
      difficulty: 2,
    },
  ];
}

function mergeVideos(
  entryVideos: KnowledgeTopicVideo[],
  curatorVideos: KnowledgeTopicVideo[],
  max = 3,
): KnowledgeTopicVideo[] {
  const seen = new Set<string>();
  const out: KnowledgeTopicVideo[] = [];
  for (const v of [...entryVideos, ...curatorVideos]) {
    const key = `${v.teacher}\0${v.url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
    if (out.length >= max) break;
  }
  return out;
}

export function buildKnowledgeRemediation(input: {
  subject: Subject;
  knowledge_points: string[];
  question_type?: string;
  question_summary?: string;
  difficulty?: number;
  /** 已从题库取到的练题；有则优先用，否则走 catalog / 占位 */
  practiceQuestions?: KnowledgeTopicQuestion[];
}): KnowledgeRemediation | null {
  const knowledgePoints = input.knowledge_points.filter(Boolean);
  if (knowledgePoints.length === 0) return null;

  const primary = knowledgePoints[0]!;
  const entry = getKnowledgeTopicEntry(input.subject, primary);
  const curators = pickCuratorsForSubject(input.subject, input.difficulty ?? 3);
  const curatorVideos = curators.map((c, i) =>
    curatorVideo(c, input.subject, primary, input.question_type, i),
  );

  const practiceQuestions =
    input.practiceQuestions && input.practiceQuestions.length > 0
      ? input.practiceQuestions.slice(0, 3)
      : fallbackPractice(input.subject, primary, entry?.practiceQuestions ?? []);

  return {
    subject: input.subject,
    knowledgePoints,
    primaryKnowledgePoint: primary,
    questionType: input.question_type,
    questionSummary: input.question_summary,
    videos: mergeVideos(entry?.videos ?? [], curatorVideos),
    practiceQuestions,
    learnSearch: { subject: input.subject, topic: primary },
  };
}

/** 同步结构 + 异步从 learning_resources 补练题（数学种子优先）。 */
export async function buildKnowledgeRemediationAsync(input: {
  subject: Subject;
  knowledge_points: string[];
  question_type?: string;
  question_summary?: string;
  difficulty?: number;
}): Promise<KnowledgeRemediation | null> {
  const knowledgePoints = input.knowledge_points.filter(Boolean);
  if (knowledgePoints.length === 0) return null;
  const primary = knowledgePoints[0]!;
  const fromDb = await fetchPracticeQuestions(input.subject, primary, 3);
  return buildKnowledgeRemediation({
    ...input,
    practiceQuestions: fromDb.length > 0 ? fromDb : undefined,
  });
}

export function buildKnowledgeRemediationFromExtraction(
  extraction: PhotoKnowledgeExtraction,
): KnowledgeRemediation | null {
  return buildKnowledgeRemediation({
    subject: extraction.subject,
    knowledge_points: extraction.mapped_knowledge_points ?? extraction.knowledge_points,
    question_type: extraction.question_type,
    question_summary: extraction.question_summary,
    difficulty: extraction.difficulty,
  });
}

export async function buildKnowledgeRemediationFromExtractionAsync(
  extraction: PhotoKnowledgeExtraction,
): Promise<KnowledgeRemediation | null> {
  return buildKnowledgeRemediationAsync({
    subject: extraction.subject,
    knowledge_points: extraction.mapped_knowledge_points ?? extraction.knowledge_points,
    question_type: extraction.question_type,
    question_summary: extraction.question_summary,
    difficulty: extraction.difficulty,
  });
}

export async function fetchPhotoRemediationsForMessages(
  messageIds: string[],
): Promise<Record<string, KnowledgeRemediation>> {
  if (messageIds.length === 0) return {};

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  try {
    const { data, error } = await db
      .from("learning_evidence")
      .select("coach_message_id, extraction, subject")
      .in("coach_message_id", messageIds);
    if (error) throw error;

    const out: Record<string, KnowledgeRemediation> = {};
    for (const row of data ?? []) {
      const msgId = row.coach_message_id as string | null;
      const extraction = row.extraction as PhotoKnowledgeExtraction | null;
      if (!msgId || !extraction) continue;
      const remediation = await buildKnowledgeRemediationFromExtractionAsync({
        ...extraction,
        subject: (extraction.subject ?? row.subject) as Subject,
      });
      if (remediation) out[msgId] = remediation;
    }
    return out;
  } catch (e) {
    console.warn("[photo-remediation] fetch evidence", e);
    return {};
  }
}

export function buildFollowUpPrompt(remediation: KnowledgeRemediation): string {
  const kp = remediation.primaryKnowledgePoint;
  const qt = remediation.questionType;
  if (qt && qt !== "未分类") {
    return `我卡在「${kp}」——${qt}，${qt.includes("题") ? "不知道" : "这一步"}该怎么入手？`;
  }
  return `我卡在「${kp}」，能帮我找到具体是哪一步不会吗？`;
}
