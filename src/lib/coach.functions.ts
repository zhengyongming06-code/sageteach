import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { SAGE_PERSONA, callLovableAI, type ChatMessage } from "./ai.server";

// Send a coach message; returns the assistant reply (non-streaming for simplicity & reliability)
export const sendCoachMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { content: string }) => {
    if (!d?.content || typeof d.content !== "string") throw new Error("content required");
    if (d.content.length > 4000) throw new Error("太长了，分两次说");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // 1. save user msg
    await supabase.from("coach_messages").insert({ user_id: userId, role: "user", content: data.content });

    // 2. context: profile, weak subjects, last 12 messages, recent reflections
    const [profileRes, weakRes, msgRes, reflRes] = await Promise.all([
      supabase.from("profiles").select("grade,current_score,target_score,exam_date,display_name").eq("id", userId).maybeSingle(),
      supabase.from("weak_subjects").select("subject").eq("user_id", userId),
      supabase.from("coach_messages").select("role,content").eq("user_id", userId).order("created_at", { ascending: false }).limit(12),
      supabase.from("reflections").select("subject,ai_diagnosis,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(3),
    ]);

    const p = profileRes.data;
    const weak = (weakRes.data ?? []).map((r) => r.subject).join("、");
    const recentReflections = (reflRes.data ?? []).map((r) => `【${r.subject}复盘】${(r.ai_diagnosis ?? "").slice(0, 200)}`).join("\n");
    const history: ChatMessage[] = (msgRes.data ?? []).reverse().map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    const sys = `${SAGE_PERSONA}

学生背景：
- 年级：${p?.grade ?? "未知"}
- 当前分数：${p?.current_score ?? "未告诉你"}，目标：${p?.target_score ?? "未告诉你"}
- 距离考试：${p?.exam_date ? `${Math.max(0, Math.ceil((new Date(p.exam_date).getTime() - Date.now()) / 86400000))} 天` : "未知"}
- 薄弱学科：${weak || "未填"}

最近复盘记录（参考，不要直接念）：
${recentReflections || "（暂无）"}`;

    const res = await callLovableAI({
      messages: [{ role: "system", content: sys }, ...history],
      reasoning: { effort: "low" },
    });

    if (!res.ok) {
      const txt = await res.text();
      console.error("AI error", res.status, txt);
      if (res.status === 429) throw new Error("说太快了，我喘口气，30 秒后再问我。");
      if (res.status === 402) throw new Error("AI 额度用完了，先去补一下。");
      throw new Error("AI 暂时连不上，过会再试。");
    }
    const json = await res.json();
    const reply: string = json.choices?.[0]?.message?.content ?? "（沉默了几秒）";

    await supabase.from("coach_messages").insert({ user_id: userId, role: "assistant", content: reply });
    return { reply };
  });

export const getCoachHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data } = await supabase.from("coach_messages").select("id,role,content,created_at").eq("user_id", userId).order("created_at", { ascending: true }).limit(80);
    return { messages: data ?? [] };
  });
