import { supabase } from "@/integrations/supabase/client";
import { SAGE_KNOWLEDGE_REFRESH_EVENT } from "@/lib/knowledge-tracking/ingest-client";
import type { Subject } from "@/lib/subjects";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export type RemediationAction = "video_watched" | "practice_done";

export type RemediationProgress = {
  video_watched: boolean;
  practice_done: boolean;
};

const EMPTY_PROGRESS: RemediationProgress = {
  video_watched: false,
  practice_done: false,
};

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
  window.dispatchEvent(new CustomEvent(SAGE_KNOWLEDGE_REFRESH_EVENT));
  return next;
}
