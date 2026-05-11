import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { SAGE_PERSONA, callLovableAI } from "./ai.server";

export const generateTodayPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const today = new Date().toISOString().slice(0, 10);

    const existing = await supabase
      .from("daily_plans")
      .select("plan")
      .eq("user_id", userId)
      .eq("plan_date", today)
      .maybeSingle();
    if (existing.data?.plan) return { plan: existing.data.plan as PlanShape };

    const [profileRes, weakRes, reflRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("grade,current_score,target_score,exam_date")
        .eq("id", userId)
        .maybeSingle(),
      supabase.from("weak_subjects").select("subject").eq("user_id", userId),
      supabase
        .from("reflections")
        .select("subject,ai_diagnosis,created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(5),
    ]);
    const p = profileRes.data;
    const weak = (weakRes.data ?? []).map((r) => r.subject).join("、");
    const recent = (reflRes.data ?? [])
      .map((r) => `${r.subject}: ${(r.ai_diagnosis ?? "").slice(0, 120)}`)
      .join("\n");

    const sys = `${SAGE_PERSONA}

任务：生成学生的今日学习计划。返回严格的 JSON：
{
  "focus": "今天的核心一句话主线，不超过 30 字",
  "tasks": [
    { "subject": "科目", "title": "做什么", "minutes": 数字, "why": "为什么是这个，一句话" }
  ],
  "warning": "一条防止过劳/焦虑的提醒，可以为空"
}
- 任务 3-5 个，按 ROI 排序，第一个最重要
- 总时长 90-180 分钟之间，留休息
- 优先薄弱学科和最近复盘暴露的问题
- 只返回 JSON，不要任何额外文字`;

    const usr = `学生：${p?.grade ?? "?"}，当前 ${p?.current_score ?? "?"} → 目标 ${p?.target_score ?? "?"}
薄弱：${weak}
最近复盘：
${recent || "（无）"}`;

    const res = await callLovableAI({
      messages: [
        { role: "system", content: sys },
        { role: "user", content: usr },
      ],
      reasoning: { effort: "low" },
    });
    if (!res.ok) throw new Error("AI 暂时连不上");
    const json = await res.json();
    let raw: string = json.choices?.[0]?.message?.content ?? "{}";
    raw = raw.replace(/```json|```/g, "").trim();
    let plan: PlanShape;
    try {
      plan = JSON.parse(raw);
    } catch {
      throw new Error("AI 返回格式异常，再试一次");
    }

    await supabase
      .from("daily_plans")
      .upsert({ user_id: userId, plan_date: today, plan }, { onConflict: "user_id,plan_date" });
    return { plan };
  });

export const getTodayPlan = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const today = new Date().toISOString().slice(0, 10);
    const { data } = await supabase
      .from("daily_plans")
      .select("plan")
      .eq("user_id", userId)
      .eq("plan_date", today)
      .maybeSingle();
    return { plan: (data?.plan as PlanShape | null) ?? null };
  });

export type PlanShape = {
  focus: string;
  tasks: { subject: string; title: string; minutes: number; why: string }[];
  warning?: string;
};
