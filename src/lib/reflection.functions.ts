import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { SAGE_PERSONA, callLovableAI } from "./ai.server";
import { REFLECTION_QUESTIONS, type Subject } from "./subjects";

export const submitReflection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { subject: Subject; answers: Record<string, string> }) => {
    if (!d?.subject || !REFLECTION_QUESTIONS[d.subject]) throw new Error("subject invalid");
    if (!d.answers || typeof d.answers !== "object") throw new Error("answers required");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const qs = REFLECTION_QUESTIONS[data.subject];
    const formatted = qs.map((q) => `Q: ${q.label}\nA: ${(data.answers[q.id] ?? "").trim() || "（没写）"}`).join("\n\n");

    const sys = `${SAGE_PERSONA}

任务：根据学生关于「${data.subject}」的复盘回答，做一次结构化诊断。
输出严格按 markdown：

### 根本原因
（一两句，直接说，不要寒暄）

### 真正的知识/思维断点
（具体到知识点 / 模型 / 答题习惯）

### 是「不会」还是「慌了」
（明确判断，并解释）

### 今晚的下一步动作
（一个、最多两个，具体到做什么题型/看什么/做多久）

### 一句给你的话
（短，真实，不打鸡血）

总长不超过 350 字。`;

    const res = await callLovableAI({
      messages: [
        { role: "system", content: sys },
        { role: "user", content: formatted },
      ],
      reasoning: { effort: "medium" },
    });
    if (!res.ok) {
      const txt = await res.text();
      console.error("reflection err", res.status, txt);
      if (res.status === 429) throw new Error("AI 太忙，等 30 秒。");
      if (res.status === 402) throw new Error("AI 额度用完了。");
      throw new Error("AI 暂时连不上。");
    }
    const json = await res.json();
    const diagnosis: string = json.choices?.[0]?.message?.content ?? "";

    const { data: row, error } = await supabase.from("reflections").insert({
      user_id: userId,
      subject: data.subject,
      answers: data.answers,
      ai_diagnosis: diagnosis,
    }).select("id").single();
    if (error) throw new Error(error.message);

    return { id: row.id, diagnosis };
  });

export const listReflections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data } = await supabase.from("reflections").select("id,subject,ai_diagnosis,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(20);
    return { items: data ?? [] };
  });
