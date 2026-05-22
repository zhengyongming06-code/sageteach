import {
  invokeDeepSeekChat,
  type DeepSeekModel,
} from "@/lib/deepseek-supabase";
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
  easy: "出基础题，难度为高考简单题",
  medium: "出中等难度题，难度为高考中等题",
  hard: "出压轴题，难度为高考最难的20%",
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

const DIAGNOSTIC_QUESTION_SYSTEM = `你是严谨的高考出题专家。出题前请仔细验算确保答案正确。
只输出JSON，不要输出任何思考过程、自我怀疑或「我可能算错了」之类的内容。
如果不确定答案，选择更简单的题目出题。

根据给定的知识点，出一道高考难度的单选题。
只返回JSON，不要 markdown 代码块，不要其他说明文字。`;

const LATEX_FORMAT_HINT =
  "数学公式请用LaTeX格式，行内公式用$...$包裹，例如：$y^2=2px$，$\\pm\\sqrt{2}$，$\\frac{1}{4}$。";

const GENERATION_TIMEOUT_MS = 120_000;

function resolveDiagnosticModel(subject: Subject): DeepSeekModel {
  return subject === "数学" || subject === "物理" ? "deepseek-reasoner" : "deepseek-chat";
}

function stripReasoningArtifacts(raw: string): string {
  let s = raw.trim();
  s = s.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  return s;
}

function extractJsonPayload(raw: string): string {
  let s = stripReasoningArtifacts(raw);
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

/** Generate one question for a single knowledge point (used in parallel). */
export async function generateDiagnosticQuestionForKnowledgePoint(
  subject: Subject,
  knowledgePoint: string,
  difficulty: DiagnosticDifficulty,
): Promise<DiagnosticQuestion> {
  const userContent = `科目：${subject}

知识点：${knowledgePoint}

请针对上述知识点出一道单选题。
难度要求：${DIFFICULTY_PROMPT[difficulty]}
${LATEX_FORMAT_HINT}

只返回一个 JSON 对象（不要数组），格式：
{
  "knowledge_point": "${knowledgePoint}",
  "question": "题目内容",
  "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
  "answer": "A",
  "explanation": "解析"
}`;

  const model = resolveDiagnosticModel(subject);
  const text = await invokeDeepSeekChat(
    [
      { role: "system", content: DIAGNOSTIC_QUESTION_SYSTEM },
      { role: "user", content: userContent },
    ],
    {
      model,
      max_tokens: model === "deepseek-reasoner" ? 4000 : 2000,
      timeoutMs: GENERATION_TIMEOUT_MS,
    },
  );

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
    console.warn("[diagnostic] parse failed for", knowledgePoint, text.slice(0, 600));
    throw new Error(`题目生成失败：${knowledgePoint}`);
  }

  return { ...q, knowledge_point: knowledgePoint };
}

/** Generate all subject questions in parallel (one API call per knowledge point). */
export async function generateDiagnosticQuestionsForSubject(
  subject: Subject,
  knowledgePoints: string[],
  difficulty: DiagnosticDifficulty,
): Promise<DiagnosticQuestion[]> {
  if (knowledgePoints.length === 0) return [];

  const questions = await Promise.all(
    knowledgePoints.map((kp) =>
      generateDiagnosticQuestionForKnowledgePoint(subject, kp, difficulty),
    ),
  );

  return questions;
}

export function letterFromOptionLabel(option: string): string {
  const m = option.trim().match(/^([A-D])[.、．\s]/i);
  return m ? m[1].toUpperCase() : option.trim().charAt(0).toUpperCase();
}

export function isAnswerCorrect(selectedOption: string, correctAnswer: string): boolean {
  return letterFromOptionLabel(selectedOption) === normalizeAnswerLetter(correctAnswer);
}
