import { supabase } from "@/integrations/supabase/client";
import { invokeDeepSeekChat } from "@/lib/deepseek-supabase";
import { generateDailyTrainingItems } from "@/lib/knowledge-tracking/daily-training";
import {
  buildPhotoKnowledgeExtractionUserPrompt,
  parsePhotoExtractionJson,
  PHOTO_KNOWLEDGE_EXTRACTION_SYSTEM,
} from "@/lib/knowledge-tracking/extract-prompt";
import { stripHiddenQuizKeysFromMarkdown } from "@/lib/question-photo-analysis";
import { buildWeaknessTree, countWeakNodes, mapToCatalogNames } from "@/lib/knowledge-tracking/graph";
import { MASTERY_EVENT_DELTA } from "@/lib/knowledge-tracking/mastery";
import type {
  ApplyMasteryResult,
  DailyTrainingItem,
  KnowledgeTrackPhotoRequest,
  KnowledgeTrackPhotoResponse,
  PhotoKnowledgeExtraction,
} from "@/lib/knowledge-tracking/types";
import { getKnowledgePointsForSubject, isSubject } from "@/lib/knowledge-points";
import type { Subject } from "@/lib/subjects";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export const SAGE_KNOWLEDGE_REFRESH_EVENT = "sage-knowledge-refresh";

function localYmd(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function patternKey(subject: string, questionType: string): string {
  return `${subject}:${questionType.trim().slice(0, 80)}`;
}

async function extractKnowledgeFromMarkdown(
  subject: string,
  markdown: string,
): Promise<PhotoKnowledgeExtraction | null> {
  const sanitized = stripHiddenQuizKeysFromMarkdown(markdown);
  try {
    const raw = await invokeDeepSeekChat(
      [
        { role: "system", content: PHOTO_KNOWLEDGE_EXTRACTION_SYSTEM },
        {
          role: "user",
          content: buildPhotoKnowledgeExtractionUserPrompt(subject, sanitized),
        },
      ],
      { max_tokens: 800 },
    );
    const parsed = parsePhotoExtractionJson(raw);
    if (!parsed) return null;
    const subj = isSubject(parsed.subject) ? parsed.subject : (subject as Subject);
    const catalog = getKnowledgePointsForSubject(subj);
    const mapped = mapToCatalogNames(parsed.knowledge_points, catalog);
    return {
      subject: subj,
      question_summary: parsed.question_summary,
      question_type: parsed.question_type,
      difficulty: Math.min(5, Math.max(1, Math.round(parsed.difficulty))) as 1 | 2 | 3 | 4 | 5,
      is_wrong: parsed.is_wrong,
      knowledge_points: mapped.length > 0 ? mapped : parsed.knowledge_points,
      mapped_knowledge_points: mapped,
      confidence: parsed.confidence,
    };
  } catch (e) {
    console.warn("[knowledge-ingest] extract failed", e);
    return null;
  }
}

async function ensureLearningSession(input: {
  userId: string;
  subject: string;
  sessionSlug: string | null;
}): Promise<string | null> {
  try {
    if (input.sessionSlug) {
      const { data: existing } = await db
        .from("learning_sessions")
        .select("id")
        .eq("user_id", input.userId)
        .eq("legacy_review_session_slug", input.sessionSlug)
        .maybeSingle();
      if (existing?.id) return existing.id as string;
    }
    const { data, error } = await db
      .from("learning_sessions")
      .insert({
        user_id: input.userId,
        subject: input.subject,
        session_type: "photo",
        legacy_review_session_slug: input.sessionSlug,
      })
      .select("id")
      .single();
    if (error) {
      console.warn("[knowledge-ingest] learning_session", error);
      return null;
    }
    return data?.id ?? null;
  } catch {
    return null;
  }
}

async function applyMasteryEvents(
  events: Record<string, unknown>[],
): Promise<ApplyMasteryResult[]> {
  if (events.length === 0) return [];
  try {
    const { data, error } = await db.rpc("apply_knowledge_mastery_batch", {
      p_events: events,
    });
    if (error) {
      console.warn("[knowledge-ingest] mastery rpc", error);
      return await applyMasteryFallback(events);
    }
    return (data ?? []) as ApplyMasteryResult[];
  } catch {
    return await applyMasteryFallback(events);
  }
}

async function applyMasteryFallback(
  events: Record<string, unknown>[],
): Promise<ApplyMasteryResult[]> {
  const out: ApplyMasteryResult[] = [];
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return out;

  for (const ev of events) {
    const subject = ev.subject as string;
    const kp = ev.knowledge_point as string;
    const delta = ev.delta_score as number;
    const status = delta < 0 ? "薄弱" : delta > 10 ? "已掌握" : "掌握中";
    await supabase.from("knowledge_points").upsert(
      {
        user_id: user.id,
        subject,
        name: kp,
        status,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,subject,name" },
    );
    out.push({
      subject: subject as Subject,
      knowledge_point: kp,
      score_before: null,
      score_after: 50 + delta,
      status: status as ApplyMasteryResult["status"],
    });
  }
  return out;
}

async function upsertMistakePattern(
  userId: string,
  subject: string,
  extraction: PhotoKnowledgeExtraction,
): Promise<void> {
  if (!extraction.is_wrong || !extraction.question_type) return;
  const key = patternKey(subject, extraction.question_type);
  try {
    const { data: existing } = await db
      .from("student_mistake_patterns")
      .select("id,occurrence_count")
      .eq("user_id", userId)
      .eq("subject", subject)
      .eq("pattern_key", key)
      .maybeSingle();

    if (existing?.id) {
      await db
        .from("student_mistake_patterns")
        .update({
          occurrence_count: (existing.occurrence_count as number) + 1,
          last_seen_at: new Date().toISOString(),
          knowledge_points: extraction.knowledge_points,
        })
        .eq("id", existing.id);
    } else {
      await db.from("student_mistake_patterns").insert({
        user_id: userId,
        subject,
        pattern_key: key,
        label: extraction.question_type,
        description: extraction.question_summary,
        knowledge_points: extraction.knowledge_points,
      });
    }
  } catch (e) {
    console.warn("[knowledge-ingest] mistake pattern", e);
  }
}

async function refreshDerivedViews(userId: string, subject: Subject, sessionDate: string) {
  const { data: masteryData } = await db
    .from("knowledge_points")
    .select("id,subject,name,status,mastery_score,correct_count,wrong_count")
    .eq("user_id", userId)
    .eq("subject", subject);

  const rows = (masteryData ?? []) as {
    id: string;
    subject: Subject;
    name: string;
    status: string;
    mastery_score: number | null;
    correct_count: number;
    wrong_count: number;
  }[];

  const tree = buildWeaknessTree(
    subject,
    [],
    rows.map((r) => ({
      id: r.id,
      subject: r.subject,
      name: r.name,
      status: r.status as import("@/lib/knowledge-points").KnowledgePointStatus,
      mastery_score: r.mastery_score,
      correct_count: r.correct_count,
      wrong_count: r.wrong_count,
      streak_correct: 0,
      last_event_at: null,
      last_wrong_at: null,
      catalog_node_id: null,
    })),
  );
  try {
    await db.from("student_weakness_trees").upsert(
      {
        user_id: userId,
        subject,
        tree,
        weak_count: countWeakNodes(tree),
        computed_at: new Date().toISOString(),
      },
      { onConflict: "user_id,subject" },
    );
  } catch (e) {
    console.warn("[knowledge-ingest] weakness tree", e);
  }

  const dailyItems = generateDailyTrainingItems({
    userId,
    trainingDate: sessionDate,
    treesBySubject: { [subject]: tree },
    recentWrongSubjects: [subject],
  });

  if (dailyItems.length > 0) {
    try {
      await db.from("daily_training_items").upsert(
        dailyItems.map((d) => ({ ...d, user_id: userId })),
        { onConflict: "user_id,training_date,subject,knowledge_point" },
      );
    } catch (e) {
      console.warn("[knowledge-ingest] daily training", e);
    }
  }

  return { tree, dailyItems };
}

export async function ingestPhotoEvidenceClient(
  payload: KnowledgeTrackPhotoRequest,
): Promise<KnowledgeTrackPhotoResponse> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("未登录");

  const extraction =
    (await extractKnowledgeFromMarkdown(payload.subject, payload.analysis_markdown)) ?? {
      subject: payload.subject,
      question_summary: "拍照搜题",
      question_type: "未分类",
      difficulty: 3 as const,
      is_wrong: false,
      knowledge_points: [],
      confidence: 0.2,
    };

  const sessionId = await ensureLearningSession({
    userId: user.id,
    subject: payload.subject,
    sessionSlug: payload.session_slug,
  });

  try {
    await db.from("learning_evidence").insert({
      user_id: user.id,
      session_id: sessionId,
      evidence_type: "photo",
      subject: payload.subject,
      coach_message_id: payload.coach_message_id,
      raw_content: payload.analysis_markdown.slice(0, 50_000),
      extraction,
      linked_knowledge_points: extraction.knowledge_points,
    });
  } catch (e) {
    console.warn("[knowledge-ingest] evidence insert", e);
  }

  const masteryEvents: Record<string, unknown>[] = [];
  if (extraction.is_wrong) {
    for (const kp of extraction.knowledge_points) {
      masteryEvents.push({
        subject: payload.subject,
        knowledge_point: kp,
        event_type: "photo_wrong",
        delta_score: MASTERY_EVENT_DELTA.photo_wrong,
        source_type: "photo",
        source_id: payload.coach_message_id,
      });
    }
  }
  for (const qr of payload.quiz_results ?? []) {
    const kp = extraction.knowledge_points[qr.index] ?? extraction.knowledge_points[0];
    if (!kp) continue;
    masteryEvents.push({
      subject: payload.subject,
      knowledge_point: kp,
      event_type: qr.correct ? "photo_quiz_correct" : "photo_quiz_wrong",
      delta_score: qr.correct
        ? MASTERY_EVENT_DELTA.photo_quiz_correct
        : MASTERY_EVENT_DELTA.photo_quiz_wrong,
      source_type: "quiz",
      source_id: payload.coach_message_id,
      metadata: { quiz_index: qr.index },
    });
  }

  const masteryUpdates = await applyMasteryEvents(masteryEvents);

  if (extraction.is_wrong) {
    try {
      await db.from("student_wrong_questions").insert({
        user_id: user.id,
        subject: payload.subject,
        coach_message_id: payload.coach_message_id,
        review_session_slug: payload.session_slug,
        review_session_date: payload.session_date,
        question_summary: extraction.question_summary,
        question_type: extraction.question_type,
        difficulty: extraction.difficulty,
        knowledge_points: extraction.knowledge_points,
        extraction,
      });
    } catch (e) {
      console.warn("[knowledge-ingest] wrong_questions", e);
    }
  }

  await upsertMistakePattern(user.id, payload.subject, extraction);

  const { tree, dailyItems } = await refreshDerivedViews(
    user.id,
    payload.subject,
    payload.session_date,
  );

  let savedDaily: DailyTrainingItem[] = dailyItems.map((d, i) => ({
    ...d,
    id: `local-${i}`,
  }));
  try {
    const { data } = await db
      .from("daily_training_items")
      .select(
        "id,training_date,subject,knowledge_point,priority,reason,task_type,estimated_minutes,status",
      )
      .eq("user_id", user.id)
      .eq("training_date", payload.session_date)
      .order("priority", { ascending: false });
    savedDaily = (data ?? dailyItems) as DailyTrainingItem[];
  } catch {
    /* use generated */
  }

  window.dispatchEvent(new CustomEvent(SAGE_KNOWLEDGE_REFRESH_EVENT));

  return {
    extraction,
    wrong_question_id: null,
    mastery_updates: masteryUpdates,
    weakness_tree: tree,
    daily_training: savedDaily,
  };
}

export async function ingestPhotoEvidence(
  payload: KnowledgeTrackPhotoRequest,
): Promise<KnowledgeTrackPhotoResponse> {
  try {
    const { data, error } = await supabase.functions.invoke<KnowledgeTrackPhotoResponse>(
      "knowledge-track-photo",
      { body: payload },
    );
    if (!error && data) {
      window.dispatchEvent(new CustomEvent(SAGE_KNOWLEDGE_REFRESH_EVENT));
      return data;
    }
  } catch {
    /* fallback */
  }
  return ingestPhotoEvidenceClient(payload);
}

export async function fetchWeakKnowledgePoints(userId: string, limit = 8) {
  try {
    const { data, error } = await db
      .from("knowledge_points")
      .select("subject,name,status,mastery_score,wrong_count")
      .eq("user_id", userId)
      .in("status", ["薄弱", "掌握中"])
      .order("mastery_score", { ascending: true, nullsFirst: true })
      .limit(limit);
    if (error) throw error;
    return data ?? [];
  } catch {
    const { data } = await supabase
      .from("knowledge_points")
      .select("subject,name,status")
      .eq("user_id", userId)
      .eq("status", "薄弱")
      .limit(limit);
    return data ?? [];
  }
}

export async function fetchMistakePatterns(userId: string, limit = 5) {
  try {
    const { data, error } = await db
      .from("student_mistake_patterns")
      .select("subject,label,occurrence_count,last_seen_at,knowledge_points")
      .eq("user_id", userId)
      .order("last_seen_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data ?? [];
  } catch {
    return [];
  }
}

export async function markDailyTrainingDone(itemId: string) {
  const { error } = await db
    .from("daily_training_items")
    .update({ status: "done", completed_at: new Date().toISOString() })
    .eq("id", itemId);
  if (error) throw error;
}

export { localYmd as knowledgeLocalYmd };
