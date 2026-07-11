import { supabase } from "@/integrations/supabase/client";
import type { PhotoKnowledgeExtraction } from "@/lib/knowledge-tracking/types";
import { fetchStudentKnowledgeMastery } from "@/lib/knowledge-tracking/api";
import type { KnowledgePointStatus } from "@/lib/knowledge-points";
import type { Subject } from "@/lib/subjects";
import {
  deriveLearnConsolidationPhase,
  fetchLearnHubProgressMap,
  topicProgressKey,
  type LearnConsolidationPhase,
  type RemediationProgress,
} from "@/lib/knowledge-tracking/remediation-progress";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export type LearnHubTopic = {
  subject: Subject;
  name: string;
  mastery_score: number | null;
  status: KnowledgePointStatus;
  wrong_count: number;
  last_wrong_at: string | null;
  last_event_at: string | null;
};

export type LearnHubTopicEnriched = LearnHubTopic & {
  consolidation_phase: LearnConsolidationPhase;
  progress: RemediationProgress;
};

export type LearnTopicPhotoContext = {
  question_summary: string;
  question_type: string;
  difficulty: number;
  created_at: string;
};

export const learnHubQueryKeys = {
  topics: (userId: string, subject?: Subject) =>
    ["learn-hub-topics", userId, subject ?? "all"] as const,
  photoContext: (userId: string, subject: Subject, topic: string) =>
    ["learn-topic-photo", userId, subject, topic] as const,
  topicProgress: (userId: string, subject: Subject, topic: string) =>
    ["learn-topic-progress", userId, subject, topic] as const,
};

function isLearnHubCandidate(row: {
  wrong_count: number;
  last_wrong_at: string | null;
  last_event_at: string | null;
  mastery_score: number | null;
  status: KnowledgePointStatus;
}): boolean {
  if (row.wrong_count > 0 || row.last_wrong_at) return true;
  if (row.status === "薄弱" || row.status === "掌握中") return true;
  return row.mastery_score != null && row.last_event_at != null;
}

export async function fetchLearnHubTopics(
  userId: string,
  subject?: Subject,
): Promise<LearnHubTopic[]> {
  const rows = await fetchStudentKnowledgeMastery(userId, subject);
  return rows
    .filter(isLearnHubCandidate)
    .map((r) => ({
      subject: r.subject,
      name: r.name,
      mastery_score: r.mastery_score,
      status: r.status,
      wrong_count: r.wrong_count,
      last_wrong_at: r.last_wrong_at,
      last_event_at: r.last_event_at,
    }))
    .sort((a, b) => {
      const ta = a.last_wrong_at ?? a.last_event_at ?? "";
      const tb = b.last_wrong_at ?? b.last_event_at ?? "";
      if (ta !== tb) return tb.localeCompare(ta);
      return (a.mastery_score ?? 50) - (b.mastery_score ?? 50);
    });
}

export async function fetchLearnHubTopicsEnriched(
  userId: string,
  subject?: Subject,
): Promise<LearnHubTopicEnriched[]> {
  const topics = await fetchLearnHubTopics(userId, subject);
  const progressMap = await fetchLearnHubProgressMap(
    userId,
    topics.map((t) => ({ subject: t.subject, name: t.name })),
  );
  return topics.map((t) => {
    const progress =
      progressMap[topicProgressKey(t.subject, t.name)] ?? {
        video_watched: false,
        practice_done: false,
      };
    return {
      ...t,
      progress,
      consolidation_phase: deriveLearnConsolidationPhase({
        progress,
        status: t.status,
        mastery_score: t.mastery_score,
      }),
    };
  });
}

export async function userHasLearnTopic(
  userId: string,
  subject: Subject,
  topic: string,
): Promise<boolean> {
  const topics = await fetchLearnHubTopics(userId, subject);
  return topics.some((t) => t.name === topic);
}

function extractionMatchesTopic(extraction: PhotoKnowledgeExtraction, topic: string): boolean {
  const names = [
    ...(extraction.mapped_knowledge_points ?? []),
    ...extraction.knowledge_points,
  ];
  return names.some((n) => n === topic);
}

export async function fetchLatestPhotoContextForTopic(
  userId: string,
  subject: Subject,
  topic: string,
): Promise<LearnTopicPhotoContext | null> {
  try {
    const { data, error } = await db
      .from("learning_evidence")
      .select("extraction, created_at")
      .eq("user_id", userId)
      .eq("subject", subject)
      .order("created_at", { ascending: false })
      .limit(40);
    if (error) throw error;

    for (const row of data ?? []) {
      const extraction = row.extraction as PhotoKnowledgeExtraction | null;
      if (!extraction || !extractionMatchesTopic(extraction, topic)) continue;
      return {
        question_summary: extraction.question_summary,
        question_type: extraction.question_type,
        difficulty: extraction.difficulty,
        created_at: row.created_at as string,
      };
    }
    return null;
  } catch (e) {
    console.warn("[learn-hub] photo context", e);
    return null;
  }
}
