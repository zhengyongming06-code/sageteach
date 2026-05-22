import { invokeDeepSeekChat } from "@/lib/deepseek-supabase";
import type { Subject } from "@/lib/subjects";

export type DiagnosticDifficulty = "easy" | "medium" | "hard";

export type DiagnosticQuestion = {
  knowledge_point: string;
  question: string;
  options: string[];
  answer: string;
  explanation: string;
};

const DIFFICULTY_PROMPT: Record<DiagnosticDifficulty, string> = {
  easy: `难度要求：高考基础题，送分题难度，直接代入公式可得答案，不需要复杂推导。
出基础题，难度为高考简单题。`,
  medium: `难度要求：高考中等题，需要2-3步推导，类似高考第10-14题难度。
出中等难度题，难度为高考中等题。`,
  hard: `难度要求：综合题，需要结合2-3个知识点，有一定推导步骤，类似平时模拟卷中等偏难题，不要出超纲或创新题型。`,
};

export const DIAGNOSTIC_DIFFICULTY_OPTIONS: {
  id: DiagnosticDifficulty;
  title: string;
  description: string;
}[] = [
  { id: "easy", title: "摸底模式", description: "基础题为主，看看哪里有漏洞" },
  { id: "medium", title: "冲刺模式", description: "中等难度，模拟真实考试水平" },
  { id: "hard", title: "挑战模式", description: "压轴题难度，冲高分专用" },
];

/** Minimum successfully generated questions before starting a quiz round. */
export const MIN_DIAGNOSTIC_QUESTIONS = 3;

const REQUEST_TIMEOUT_MS_DEFAULT = 10_000;
const REQUEST_TIMEOUT_MS_HARD = 15_000;

const SIMPLER_RETRY_HINT =
  "请出一道更简单的单选题，一两步可得答案，确保能输出合法 JSON。";

const LATEX_FORMAT_HINT =
  "数学公式请用LaTeX格式，行内公式用$...$包裹，例如：$y^2=2px$，$\\pm\\sqrt{2}$，$\\frac{1}{4}$。";

function requestTimeoutMs(difficulty: DiagnosticDifficulty): number {
  return difficulty === "hard" ? REQUEST_TIMEOUT_MS_HARD : REQUEST_TIMEOUT_MS_DEFAULT;
}

function diagnosticSystemPrompt(difficulty: DiagnosticDifficulty): string {
  if (difficulty === "hard") {
    return `你是高考出题专家。出一道综合单选题，题目可以有一定难度。
只返回一个扁平 JSON 对象，不要嵌套对象，options 只能是 4 个字符串，不要数组套数组。
格式：
{"knowledge_point":"知识点","question":"题目","options":["A. 选项","B. 选项","C. 选项","D. 选项"],"answer":"A","explanation":"解析"}
答案必须正确。字符串内不要有换行或未转义引号。`;
  }

  return `你是严谨的高考出题专家。出一道高考单选题。
要求：
1. 答案必须唯一且正确，出题前在脑中验算
2. 题目难度必须严格符合用户指定的难度要求
3. 只返回JSON，不含任何其他文字
4. JSON格式严格如下，不要有换行符在字符串内：
{
  "knowledge_point": "知识点",
  "question": "题目",
  "options": ["A. 选项", "B. 选项", "C. 选项", "D. 选项"],
  "answer": "A",
  "explanation": "解析"
}
5. 字符串内不要有未转义的引号或换行`;
}

/** Strip think blocks / fences / control chars, then isolate the JSON object. */
function cleanJson(raw: string): string {
  let text = raw;
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, "");
  text = text.replace(/```json\s*/g, "").replace(/```\s*/g, "");
  text = text.replace(/[\x00-\x09\x0b-\x1f]/g, " ");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("no JSON");
  return text.slice(start, end + 1);
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

/** Extract a quoted JSON string value for a field (handles basic escapes). */
function extractQuotedJsonField(raw: string, field: string): string | null {
  const key = `"${field}"`;
  const idx = raw.indexOf(key);
  if (idx === -1) return null;
  const colon = raw.indexOf(":", idx + key.length);
  if (colon === -1) return null;
  let i = colon + 1;
  while (i < raw.length && /\s/.test(raw[i])) i += 1;
  if (raw[i] !== '"') return null;
  i += 1;
  let out = "";
  while (i < raw.length) {
    const ch = raw[i];
    if (ch === "\\" && i + 1 < raw.length) {
      out += raw[i + 1];
      i += 2;
      continue;
    }
    if (ch === '"') break;
    out += ch;
    i += 1;
  }
  return out.trim() || null;
}

function extractOptionsFromRaw(raw: string): string[] | null {
  const m = raw.match(/"options"\s*:\s*\[([\s\S]*?)\]/i);
  if (!m) return null;
  try {
    const parsed = JSON.parse(`[${m[1]}]`) as unknown;
    if (!Array.isArray(parsed)) return null;
    const opts = parsed.slice(0, 4).map((o) => String(o).trim());
    if (opts.length < 4 || opts.some((o) => !o)) return null;
    return opts;
  } catch {
    return null;
  }
}

/** Manual fallback when JSON.parse fails — at minimum recover question text. */
function parseQuestionFallback(raw: string, knowledgePoint: string): DiagnosticQuestion | null {
  console.warn("[diagnostic] attempting fallback parse", raw.slice(0, 800));

  const question = extractQuotedJsonField(raw, "question");
  if (!question) return null;

  const options =
    extractOptionsFromRaw(raw) ??
    ["A. 见题目条件", "B. 见题目条件", "C. 见题目条件", "D. 见题目条件"];
  const answer = normalizeAnswerLetter(extractQuotedJsonField(raw, "answer")) ?? "A";
  const explanation =
    extractQuotedJsonField(raw, "explanation") ?? "请参考教材或老师讲法核对本题。";

  return {
    knowledge_point: knowledgePoint,
    question,
    options,
    answer,
    explanation,
  };
}

export function parseDiagnosticQuestionsJson(
  raw: string,
  expectedKnowledgePoints: string[],
): DiagnosticQuestion[] | null {
  let payload: string;
  try {
    payload = cleanJson(raw);
  } catch (e) {
    console.warn("[diagnostic] cleanJson failed", e, raw.slice(0, 400));
    const fb = parseQuestionFallback(raw, expectedKnowledgePoints[0] ?? "");
    return fb ? [fb] : null;
  }
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
      if (q) return [q];
    }
  } catch (e) {
    console.warn("[diagnostic] JSON.parse failed", e, payload.slice(0, 400));
  }

  const fb = parseQuestionFallback(raw, expectedKnowledgePoints[0] ?? "");
  return fb ? [fb] : null;
}

async function requestQuestionForKnowledgePoint(
  subject: Subject,
  knowledgePoint: string,
  difficulty: DiagnosticDifficulty,
  simpler: boolean,
): Promise<DiagnosticQuestion | null> {
  const latexHint = difficulty === "hard" ? "" : LATEX_FORMAT_HINT;
  const userContent = `科目：${subject}
知识点：${knowledgePoint}
${DIFFICULTY_PROMPT[difficulty]}
${simpler ? SIMPLER_RETRY_HINT : ""}
${latexHint}
knowledge_point 必须与「${knowledgePoint}」完全一致。`;

  let text: string;
  try {
    text = await invokeDeepSeekChat(
      [
        { role: "system", content: diagnosticSystemPrompt(difficulty) },
        { role: "user", content: userContent },
      ],
      {
        model: "deepseek-chat",
        max_tokens: 2000,
        timeoutMs: requestTimeoutMs(difficulty),
      },
    );
  } catch (e) {
    console.warn("[diagnostic] request failed", knowledgePoint, simpler ? "(retry)" : "", e);
    return null;
  }

  const parsed = parseDiagnosticQuestionsJson(text, [knowledgePoint]);
  const q =
    parsed?.[0] ??
    parsed?.find(
      (p) =>
        p.knowledge_point === knowledgePoint ||
        p.knowledge_point.includes(knowledgePoint) ||
        knowledgePoint.includes(p.knowledge_point),
    );

  if (!q) {
    console.warn(
      "[diagnostic] parse failed for",
      knowledgePoint,
      simpler ? "(retry)" : "",
      text.slice(0, 800),
    );
    return null;
  }

  return { ...q, knowledge_point: knowledgePoint };
}

/** Generate one question; retries once with a simpler prompt before giving up. */
export async function generateDiagnosticQuestionForKnowledgePoint(
  subject: Subject,
  knowledgePoint: string,
  difficulty: DiagnosticDifficulty,
): Promise<DiagnosticQuestion | null> {
  const first = await requestQuestionForKnowledgePoint(subject, knowledgePoint, difficulty, false);
  if (first) return first;
  return requestQuestionForKnowledgePoint(subject, knowledgePoint, difficulty, true);
}

/** Generate diagnostic questions in parallel; throws only if fewer than MIN succeed. */
export async function generateDiagnosticQuestionsForSubject(
  subject: Subject,
  knowledgePoints: string[],
  difficulty: DiagnosticDifficulty,
  options?: {
    onProgress?: (completed: number, total: number) => void;
  },
): Promise<DiagnosticQuestion[]> {
  const total = knowledgePoints.length;
  if (total === 0) return [];

  options?.onProgress?.(0, total);
  let completed = 0;

  const settled = await Promise.all(
    knowledgePoints.map(async (kp) => {
      try {
        return await generateDiagnosticQuestionForKnowledgePoint(subject, kp, difficulty);
      } finally {
        completed += 1;
        options?.onProgress?.(completed, total);
      }
    }),
  );

  const results = settled.filter((q): q is DiagnosticQuestion => q != null);
  if (results.length < MIN_DIAGNOSTIC_QUESTIONS) {
    throw new Error("出题不足，请重试");
  }
  return results;
}

export function letterFromOptionLabel(option: string): string {
  const m = option.trim().match(/^([A-D])[.、．\s]/i);
  return m ? m[1].toUpperCase() : option.trim().charAt(0).toUpperCase();
}

export function isAnswerCorrect(selectedOption: string, correctAnswer: string): boolean {
  return letterFromOptionLabel(selectedOption) === normalizeAnswerLetter(correctAnswer);
}
