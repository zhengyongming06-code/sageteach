import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-api-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// --- 与 src/lib/knowledge-tracking/mastery.ts 保持同步 ---
const MASTERY_PRIOR = 50;
const EVENT_DELTA: Record<string, number> = {
  photo_wrong: -12,
  photo_quiz_wrong: -8,
  photo_quiz_correct: 10,
};

function clamp(n: number) {
  return Math.max(0, Math.min(100, n));
}

type TrackBody = {
  coach_message_id: string;
  subject: string;
  session_date: string;
  session_slug: string | null;
  analysis_markdown: string;
  quiz_results?: { index: number; correct: boolean }[];
};

const EXTRACTION_SYSTEM = `你是 Sage 知识追踪引擎。根据拍照搜题的解析文本，提取结构化 JSON。
只返回 JSON。Schema: {"subject":"...","question_summary":"...","question_type":"...","difficulty":1-5,"is_wrong":true/false,"knowledge_points":["..."],"confidence":0-1}
规则：is_wrong 仅在文本明确表示做错时为 true；普通搜题默认 false。禁止根据【答案】行推断做错。不确定时降低 confidence。`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: { message: "Method not allowed" } }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: { message: "Unauthorized" } }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    return json({ error: { message: "Unauthorized" } }, 401);
  }
  const userId = userData.user.id;

  let body: TrackBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: { message: "Invalid JSON" } }, 400);
  }

  const {
    coach_message_id,
    subject,
    session_date,
    session_slug,
    analysis_markdown,
    quiz_results = [],
  } = body;

  if (!coach_message_id || !subject || !analysis_markdown?.trim()) {
    return json({ error: { message: "coach_message_id, subject, analysis_markdown required" } }, 400);
  }

  const apiKey = Deno.env.get("DEEPSEEK_API_KEY")?.trim();
  if (!apiKey) {
    return json({ error: { message: "DEEPSEEK_API_KEY missing" } }, 500);
  }

  // 1. DeepSeek 提取知识点（不向模型暴露巩固题答案块）
  const sanitizedMarkdown = analysis_markdown.replace(
    /---\s*QUIZ\s*KEY\s*---[\s\S]*?---\s*END\s*QUIZ\s*KEY\s*---/gi,
    "",
  );
  const extraction = await extractKnowledge(apiKey, subject, sanitizedMarkdown);
  if (!extraction) {
    return json({ error: { message: "Knowledge extraction failed" } }, 502);
  }

  const knowledgePoints = extraction.knowledge_points.filter(Boolean);
  const masteryEvents: Record<string, unknown>[] = [];

  if (extraction.is_wrong && knowledgePoints.length > 0) {
    for (const kp of knowledgePoints) {
      masteryEvents.push({
        subject,
        knowledge_point: kp,
        event_type: "photo_wrong",
        delta_score: EVENT_DELTA.photo_wrong,
        source_type: "photo",
        source_id: coach_message_id,
        metadata: { question_type: extraction.question_type },
      });
    }
  }

  for (const qr of quiz_results) {
    const kp = knowledgePoints[qr.index] ?? knowledgePoints[0];
    if (!kp) continue;
    masteryEvents.push({
      subject,
      knowledge_point: kp,
      event_type: qr.correct ? "photo_quiz_correct" : "photo_quiz_wrong",
      delta_score: qr.correct ? EVENT_DELTA.photo_quiz_correct : EVENT_DELTA.photo_quiz_wrong,
      source_type: "quiz",
      source_id: coach_message_id,
      metadata: { quiz_index: qr.index },
    });
  }

  // 2. 记录错题
  let wrongQuestionId: string | null = null;
  if (extraction.is_wrong) {
    const { data: wq, error: wqErr } = await supabase
      .from("student_wrong_questions")
      .insert({
        user_id: userId,
        subject,
        coach_message_id,
        review_session_slug: session_slug,
        review_session_date: session_date,
        question_summary: extraction.question_summary,
        question_type: extraction.question_type,
        difficulty: extraction.difficulty,
        knowledge_points: knowledgePoints,
        extraction,
      })
      .select("id")
      .single();
    if (wqErr) console.error("[knowledge-track-photo] wrong_question", wqErr);
    else wrongQuestionId = wq?.id ?? null;
  }

  // 3. 批量更新掌握度
  let masteryUpdates: unknown[] = [];
  if (masteryEvents.length > 0) {
    const { data: batch, error: batchErr } = await supabase.rpc(
      "apply_knowledge_mastery_batch",
      { p_events: masteryEvents },
    );
    if (batchErr) console.error("[knowledge-track-photo] mastery batch", batchErr);
    else masteryUpdates = (batch as unknown[]) ?? [];
  }

  // 4. 重建弱点树
  const { data: kpRows } = await supabase
    .from("knowledge_points")
    .select("id,subject,name,status,mastery_score,correct_count,wrong_count")
    .eq("user_id", userId)
    .eq("subject", subject);

  const weaknessTree = buildFlatWeaknessTree(subject, kpRows ?? []);

  await supabase.from("student_weakness_trees").upsert(
    {
      user_id: userId,
      subject,
      tree: weaknessTree,
      weak_count: countWeak(weaknessTree),
      computed_at: new Date().toISOString(),
    },
    { onConflict: "user_id,subject" },
  );

  // 5. 生成今日训练
  const today = session_date;
  const dailyItems = pickDailyTraining(subject, kpRows ?? [], today);
  if (dailyItems.length > 0) {
    await supabase.from("daily_training_items").upsert(
      dailyItems.map((d) => ({ ...d, user_id: userId })),
      { onConflict: "user_id,training_date,subject,knowledge_point" },
    );
  }

  const { data: savedDaily } = await supabase
    .from("daily_training_items")
    .select("id,training_date,subject,knowledge_point,priority,reason,task_type,estimated_minutes,status")
    .eq("user_id", userId)
    .eq("training_date", today)
    .order("priority", { ascending: false });

  return json({
    extraction: { ...extraction, subject },
    wrong_question_id: wrongQuestionId,
    mastery_updates: masteryUpdates,
    weakness_tree: weaknessTree,
    daily_training: savedDaily ?? [],
  });
});

async function extractKnowledge(apiKey: string, subject: string, markdown: string) {
  const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: EXTRACTION_SYSTEM },
        {
          role: "user",
          content: `科目：${subject}\n\n${markdown.slice(0, 12000)}`,
        },
      ],
      max_tokens: 800,
      temperature: 0.1,
    }),
  });
  const data = await res.json();
  const raw = data?.choices?.[0]?.message?.content ?? "";
  const i = raw.indexOf("{");
  const j = raw.lastIndexOf("}");
  if (i === -1 || j <= i) return null;
  try {
    return JSON.parse(raw.slice(i, j + 1));
  } catch {
    return null;
  }
}

function buildFlatWeaknessTree(subject: string, rows: Record<string, unknown>[]) {
  const children = rows
    .map((r) => ({
      id: r.id as string,
      name: r.name as string,
      subject,
      mastery_score: (r.mastery_score as number | null) ?? null,
      status: r.status as string,
      wrong_count: (r.wrong_count as number) ?? 0,
      children: [],
      min_score: (r.mastery_score as number | null) ?? MASTERY_PRIOR,
    }))
    .filter((n) => n.min_score < 70 || n.wrong_count > 0)
    .sort((a, b) => a.min_score - b.min_score);

  return {
    id: `subject:${subject}`,
    name: subject,
    subject,
    mastery_score: null,
    status: "未测试",
    wrong_count: children.reduce((s, c) => s + c.wrong_count, 0),
    children,
    min_score: children[0]?.min_score ?? MASTERY_PRIOR,
  };
}

function countWeak(tree: { children: { min_score: number; wrong_count: number }[] }) {
  return tree.children.filter((c) => c.min_score < 70 || c.wrong_count > 0).length;
}

function pickDailyTraining(
  subject: string,
  rows: Record<string, unknown>[],
  trainingDate: string,
) {
  return rows
    .map((r) => {
      const score = (r.mastery_score as number | null) ?? MASTERY_PRIOR;
      const wrong = (r.wrong_count as number) ?? 0;
      const priority = clamp(100 - score + wrong * 8);
      return { row: r, priority, score, wrong };
    })
    .filter((x) => x.score < 70 || x.wrong > 0)
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 3)
    .map(({ row, priority, wrong }) => ({
      training_date: trainingDate,
      subject,
      knowledge_point: row.name as string,
      priority,
      reason: wrong > 0 ? `近期错题涉及「${row.name}」` : `掌握度 ${(row.mastery_score as number) ?? MASTERY_PRIOR}`,
      task_type: wrong > 0 ? "错题重做" : "同类练习",
      estimated_minutes: 15,
      status: "pending",
    }));
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
