import { invokeDeepSeekChat } from "@/lib/deepseek-supabase";
import type { Subject } from "@/lib/subjects";

export type DiagnosticQuestion = {
  knowledge_point: string;
  question: string;
  options: string[];
  answer: string;
  explanation: string;
};

const DIAGNOSTIC_QUESTION_SYSTEM = `你是高考出题专家。根据给定的知识点，出一道高考难度的单选题。
只返回JSON，不要 markdown 代码块，不要其他说明文字。`;

const GENERATION_TIMEOUT_MS = 120_000;
const GENERATION_BATCH_SIZE = 5;

function extractJsonPayload(raw: string): string {
  let s = raw.trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  const arrStart = s.indexOf("[");
  const arrEnd = s.lastIndexOf("]");
  if (arrStart !== -1 && arrEnd > arrStart) return s.slice(arrStart, arrEnd + 1);
  const objStart = s.indexOf("{");
  const objEnd = s.lastIndexOf("}");
  if (objStart !== -1 && objEnd > objStart) return s.slice(objStart, objEnd + 1);
  return s;
}

function normalizeAnswerLetter(raw: unknown): string | null {
  const t = String(raw ?? "")
    .trim()
    .toUpperCase();
  const m = t.match(/^([A-D])/);
  return m ? m[1] : null;
}

function normalizeOptions(raw: unknown): string[] | null {
  if (!Array.isArray(raw) || raw.length < 4) return null;
  const opts = raw.slice(0, 4).map((o) => String(o).trim());
  if (opts.some((o) => !o)) return null;
  return opts;
}

function parseOneQuestion(o: Record<string, unknown>, expectedKp?: string): DiagnosticQuestion | null {
  const knowledge_point = String(o.knowledge_point ?? expectedKp ?? "").trim();
  const question = String(o.question ?? "").trim();
  const options = normalizeOptions(o.options);
  const answer = normalizeAnswerLetter(o.answer);
  const explanation = String(o.explanation ?? "").trim();
  if (!knowledge_point || !question || !options || !answer || !explanation) return null;
  return { knowledge_point, question, options, answer, explanation };
}

export function parseDiagnosticQuestionsJson(
  raw: string,
  expectedKnowledgePoints: string[],
): DiagnosticQuestion[] | null {
  const payload = extractJsonPayload(raw);
  try {
    const parsed = JSON.parse(payload) as unknown;
    if (Array.isArray(parsed)) {
      const out: DiagnosticQuestion[] = [];
      for (let i = 0; i < parsed.length; i++) {
        const item = parsed[i];
        if (!item || typeof item !== "object") continue;
        const q = parseOneQuestion(item as Record<string, unknown>, expectedKnowledgePoints[i]);
        if (q) out.push(q);
      }
      if (out.length > 0) return out;
    }
    if (parsed && typeof parsed === "object") {
      const q = parseOneQuestion(parsed as Record<string, unknown>);
      return q ? [q] : null;
    }
  } catch (e) {
    console.warn("[diagnostic] JSON.parse failed", e, payload.slice(0, 400));
  }
  return null;
}

export async function generateDiagnosticQuestions(
  subject: Subject,
  knowledgePoints: string[],
): Promise<DiagnosticQuestion[]> {
  const kpList = knowledgePoints
    .map((k, i) => `${i + 1}. ${k}`)
    .join("\n");

  const userContent = `科目：${subject}

请为以下 ${knowledgePoints.length} 个知识点各出一道高考难度单选题（每个知识点一题，共 ${knowledgePoints.length} 题）。

知识点列表：
${kpList}

只返回 JSON 数组。数组每一项格式：
{
  "knowledge_point": "知识点名称（必须与上面列表完全一致）",
  "question": "题目内容",
  "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
  "answer": "A",
  "explanation": "解析"
}`;

  const text = await invokeDeepSeekChat(
    [
      { role: "system", content: DIAGNOSTIC_QUESTION_SYSTEM },
      { role: "user", content: userContent },
    ],
    {
      max_tokens: Math.min(8000, 900 * knowledgePoints.length + 800),
      timeoutMs: GENERATION_TIMEOUT_MS,
    },
  );

  const parsed = parseDiagnosticQuestionsJson(text, knowledgePoints);
  if (!parsed || parsed.length === 0) {
    console.warn("[diagnostic] parse failed", text.slice(0, 600));
    throw new Error("题目生成失败，请重试");
  }

  const byKp = new Map<string, DiagnosticQuestion>();
  for (const q of parsed) byKp.set(q.knowledge_point, q);

  const ordered: DiagnosticQuestion[] = [];
  for (const kp of knowledgePoints) {
    const q = byKp.get(kp) ?? parsed.find((p) => p.knowledge_point.includes(kp) || kp.includes(p.knowledge_point));
    if (q) ordered.push({ ...q, knowledge_point: kp });
  }

  if (ordered.length < knowledgePoints.length) {
    for (const q of parsed) {
      if (!ordered.some((o) => o.knowledge_point === q.knowledge_point)) ordered.push(q);
    }
  }

  return ordered.slice(0, knowledgePoints.length);
}

/** Generate questions in batches so long subject lists (e.g. 数学 10 点) stay reliable. */
export async function generateDiagnosticQuestionsForSubject(
  subject: Subject,
  knowledgePoints: string[],
  options?: {
    onProgress?: (completed: number, total: number) => void;
  },
): Promise<DiagnosticQuestion[]> {
  const total = knowledgePoints.length;
  if (total === 0) return [];

  const batchSize = GENERATION_BATCH_SIZE;
  const all: DiagnosticQuestion[] = [];

  for (let offset = 0; offset < total; offset += batchSize) {
    const batch = knowledgePoints.slice(offset, offset + batchSize);
    const qs = await generateDiagnosticQuestions(subject, batch);
    all.push(...qs);
    options?.onProgress?.(Math.min(offset + batch.length, total), total);
  }

  return all;
}

export function letterFromOptionLabel(option: string): string {
  const m = option.trim().match(/^([A-D])[.、．\s]/i);
  return m ? m[1].toUpperCase() : option.trim().charAt(0).toUpperCase();
}

export function isAnswerCorrect(selectedOption: string, correctAnswer: string): boolean {
  return letterFromOptionLabel(selectedOption) === normalizeAnswerLetter(correctAnswer);
}
