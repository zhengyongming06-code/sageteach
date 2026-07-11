import { supabase } from "@/integrations/supabase/client";
import { SAGE_KNOWLEDGE_REFRESH_EVENT } from "@/lib/knowledge-tracking/ingest-client";
import type { KnowledgePointStatus } from "@/lib/knowledge-points";
import type { Subject } from "@/lib/subjects";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export type RemediationAction = "video_watched" | "practice_done";

export type RemediationProgress = {
  video_watched: boolean;
  practice_done: boolean;
};

/** 辅学巩固阶段：入库后待巩固，互动后掌握中/已掌握 */
export type LearnConsolidationPhase = "待巩固" | "掌握中" | "已掌握";

const EMPTY_PROGRESS: RemediationProgress = {
  video_watched: false,
  practice_done: false,
};

export function topicProgressKey(subject: string, topic: string): string {
  return `${subject}\0${topic}`;
}

export function mergeRemediationProgress(
  a: RemediationProgress,
  b: RemediationProgress,
): RemediationProgress {
  return {
    video_watched: a.video_watched || b.video_watched,
    practice_done: a.practice_done || b.practice_done,
  };
}

export function deriveLearnConsolidationPhase(input: {
  progress: RemediationProgress;
  status: KnowledgePointStatus;
  mastery_score: number | null;
}): LearnConsolidationPhase {
  const score = input.mastery_score ?? 0;
  if (input.progress.practice_done || input.status === "已掌握" || score >= 70) {
    return "已掌握";
  }
  if (input.progress.video_watched) {
    return "掌握中";
  }
  return "待巩固";
}

export function consolidationPhaseHint(phase: LearnConsolidationPhase): string {
  switch (phase) {
    case "待巩固":
      return "拍完题已入库。看完推荐视频或练完同类题，即可标记进度。";
    case "掌握中":
      return "已起步巩固。练完同类题并标记后，此考点算掌握完结。";
    case "已掌握":
      return "此考点已巩固完成。可在复盘继续追问，或复习同类题。";
  }
}

export function consolidationNextStep(phase: LearnConsolidationPhase): string | null {
  switch (phase) {
    case "待巩固":
      return "去看视频或练题 →";
    case "掌握中":
      return "去练同类题并标记 →";
    case "已掌握":
      return null;
  }
}

const ACTION_DELTA: Record<RemediationAction, number> = {
  video_watched: 5,
  practice_done: 10,
};

function progressFromExtraction(extraction: Record<string, unknown> | null): RemediationProgress {
  const raw = extraction?.remediation_progress as Partial<RemediationProgress> | undefined;
  return {
    video_watched: !!raw?.video_watched,
    practice_done: !!raw?.practice_done,
  };
}

export async function fetchRemediationProgressMap(
  messageIds: string[],
): Promise<Record<string, RemediationProgress>> {
  if (messageIds.length === 0) return {};
  try {
    const { data, error } = await db
      .from("learning_evidence")
      .select("coach_message_id, extraction")
      .in("coach_message_id", messageIds);
    if (error) throw error;
    const out: Record<string, RemediationProgress> = {};
    for (const row of data ?? []) {
      const id = row.coach_message_id as string | null;
      if (!id) continue;
      out[id] = progressFromExtraction(row.extraction as Record<string, unknown>);
    }
    return out;
  } catch (e) {
    console.warn("[remediation-progress] fetch", e);
    return {};
  }
}

async function applyRemediationMastery(
  subject: Subject,
  knowledgePoint: string,
  action: RemediationAction,
  delta: number,
  sourceId?: string,
): Promise<void> {
  const { error } = await db.rpc("apply_knowledge_mastery_batch", {
    p_events: [
      {
        subject,
        knowledge_point: knowledgePoint,
        event_type: "review_mastered",
        delta_score: delta,
        source_type: "review",
        source_id: sourceId ?? null,
        metadata: { remediation_action: action, unmark: delta < 0 },
      },
    ],
  });
  if (error) throw error;
}

async function patchEvidenceProgress(
  coachMessageId: string,
  progress: RemediationProgress,
): Promise<void> {
  const { data, error: readErr } = await db
    .from("learning_evidence")
    .select("id, extraction")
    .eq("coach_message_id", coachMessageId)
    .maybeSingle();
  if (readErr) throw readErr;
  if (!data?.id) return;

  const extraction = {
    ...((data.extraction as Record<string, unknown>) ?? {}),
    remediation_progress: progress,
  };
  const { error: writeErr } = await db
    .from("learning_evidence")
    .update({ extraction })
    .eq("id", data.id);
  if (writeErr) throw writeErr;
}

/** 拍题辅学块：切换已看视频 / 练完，并回写掌握度。 */
export async function recordPhotoRemediationProgress(input: {
  coachMessageId: string;
  subject: Subject;
  knowledgePoint: string;
  action: RemediationAction;
  current?: RemediationProgress;
}): Promise<RemediationProgress> {
  const current = input.current ?? EMPTY_PROGRESS;
  const marked =
    input.action === "video_watched" ? current.video_watched : current.practice_done;
  const delta = marked ? -ACTION_DELTA[input.action] : ACTION_DELTA[input.action];

  const next: RemediationProgress = {
    video_watched:
      input.action === "video_watched" ? !current.video_watched : current.video_watched,
    practice_done:
      input.action === "practice_done" ? !current.practice_done : current.practice_done,
  };

  await applyRemediationMastery(
    input.subject,
    input.knowledgePoint,
    input.action,
    delta,
    input.coachMessageId,
  );
  await patchEvidenceProgress(input.coachMessageId, next);
  window.dispatchEvent(new CustomEvent(SAGE_KNOWLEDGE_REFRESH_EVENT));
  return next;
}

const learnProgressKey = (subject: string, topic: string) =>
  `sage-learn-progress:${subject}:${topic}`;

function topicNamesFromEvidenceRow(row: {
  linked_knowledge_points?: string[] | null;
  extraction?: Record<string, unknown> | null;
}): string[] {
  const linked = row.linked_knowledge_points ?? [];
  const fromExtraction = (row.extraction?.knowledge_points as string[] | undefined) ?? [];
  const mapped =
    (row.extraction?.mapped_knowledge_points as string[] | undefined) ?? [];
  return [...new Set([...linked, ...fromExtraction, ...mapped])];
}

export async function fetchLearnHubProgressMap(
  userId: string,
  topics: { subject: Subject; name: string }[],
): Promise<Record<string, RemediationProgress>> {
  const out: Record<string, RemediationProgress> = {};
  const wanted = new Set(topics.map((t) => topicProgressKey(t.subject, t.name)));
  for (const t of topics) {
    out[topicProgressKey(t.subject, t.name)] = readLearnTopicProgress(t.subject, t.name);
  }
  if (wanted.size === 0) return out;

  try {
    const { data, error } = await db
      .from("learning_evidence")
      .select("subject, extraction, linked_knowledge_points")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(80);
    if (error) throw error;

    const filled = new Set<string>();
    for (const row of data ?? []) {
      const subject = row.subject as Subject;
      for (const name of topicNamesFromEvidenceRow(row)) {
        const key = topicProgressKey(subject, name);
        if (!wanted.has(key) || filled.has(key)) continue;
        const dbProgress = progressFromExtraction(row.extraction as Record<string, unknown>);
        out[key] = mergeRemediationProgress(out[key] ?? { ...EMPTY_PROGRESS }, dbProgress);
        filled.add(key);
      }
    }
  } catch (e) {
    console.warn("[remediation-progress] fetchLearnHubProgressMap", e);
  }
  return out;
}

export async function fetchLearnTopicProgressMerged(
  userId: string,
  subject: Subject,
  topic: string,
): Promise<RemediationProgress> {
  const map = await fetchLearnHubProgressMap(userId, [{ subject, name: topic }]);
  return map[topicProgressKey(subject, topic)] ?? { ...EMPTY_PROGRESS };
}

async function patchLatestEvidenceProgressForTopic(
  userId: string,
  subject: Subject,
  topic: string,
  progress: RemediationProgress,
): Promise<void> {
  try {
    const { data, error } = await db
      .from("learning_evidence")
      .select("id, coach_message_id, extraction, linked_knowledge_points")
      .eq("user_id", userId)
      .eq("subject", subject)
      .order("created_at", { ascending: false })
      .limit(40);
    if (error) throw error;

    for (const row of data ?? []) {
      const names = topicNamesFromEvidenceRow(row);
      if (!names.includes(topic)) continue;
      const coachMessageId = row.coach_message_id as string | null;
      if (coachMessageId) {
        await patchEvidenceProgress(coachMessageId, progress);
      } else if (row.id) {
        const extraction = {
          ...((row.extraction as Record<string, unknown>) ?? {}),
          remediation_progress: progress,
        };
        await db.from("learning_evidence").update({ extraction }).eq("id", row.id);
      }
      break;
    }
  } catch (e) {
    console.warn("[remediation-progress] patchLatestEvidence", e);
  }
}

export function readLearnTopicProgress(subject: string, topic: string): RemediationProgress {
  try {
    const raw = localStorage.getItem(learnProgressKey(subject, topic));
    if (!raw) return { ...EMPTY_PROGRESS };
    const parsed = JSON.parse(raw) as Partial<RemediationProgress>;
    return {
      video_watched: !!parsed.video_watched,
      practice_done: !!parsed.practice_done,
    };
  } catch {
    return { ...EMPTY_PROGRESS };
  }
}

function writeLearnTopicProgress(subject: string, topic: string, progress: RemediationProgress) {
  localStorage.setItem(learnProgressKey(subject, topic), JSON.stringify(progress));
}

/** 知识点页：切换进度（localStorage + 掌握度）。 */
export async function recordLearnTopicProgress(input: {
  subject: Subject;
  topic: string;
  knowledgePoint: string;
  action: RemediationAction;
  current?: RemediationProgress;
}): Promise<RemediationProgress> {
  const current = input.current ?? readLearnTopicProgress(input.subject, input.topic);
  const marked =
    input.action === "video_watched" ? current.video_watched : current.practice_done;
  const delta = marked ? -ACTION_DELTA[input.action] : ACTION_DELTA[input.action];

  const next: RemediationProgress = {
    video_watched:
      input.action === "video_watched" ? !current.video_watched : current.video_watched,
    practice_done:
      input.action === "practice_done" ? !current.practice_done : current.practice_done,
  };

  await applyRemediationMastery(input.subject, input.knowledgePoint, input.action, delta);
  writeLearnTopicProgress(input.subject, input.topic, next);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user?.id) {
    await patchLatestEvidenceProgressForTopic(user.id, input.subject, input.topic, next);
  }
  window.dispatchEvent(new CustomEvent(SAGE_KNOWLEDGE_REFRESH_EVENT));
  return next;
}
