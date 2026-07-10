import { invokeErnieVlChat } from "@/lib/ernie-vl";

export type PhotoContentType = "calculation" | "concept" | "vocab" | "translation";

export type PhotoSubQuestion = {
  label: string;
  summary: string;
  question_type?: string;
  knowledge_points?: string[];
  method_steps?: string[];
  key_step?: string;
};

export type PhotoRecognition = {
  content_type: PhotoContentType;
  subject: string;
  question_summary: string;
  question_type: string;
  knowledge_points: string[];
  method_steps: string[];
  key_step: string;
  key_formula?: string;
  notes?: string;
  /** When the photo has multiple problems or (1)(2)(3) sub-parts, one entry per part. */
  sub_questions?: PhotoSubQuestion[];
  vocab?: {
    word?: string;
    phonetic?: string;
    pos?: string;
    definitions?: string[];
    examples?: string[];
  };
  translation?: {
    source_text?: string;
    target_text?: string;
    vocab_notes?: string[];
  };
};

export const PHOTO_RECOGNITION_VL_PROMPT = `你是高考拍照识题引擎。只做「识别与结构化」，不要解题，不要输出长推导，不要出巩固题。

看清图片后，只返回一个 JSON 对象（不要 markdown 围栏，不要其它文字）。

Schema:
{
  "content_type": "calculation|concept|vocab|translation",
  "subject": "数学|语文|英语|物理|化学|生物|政治|历史|地理",
  "question_summary": "整页/整图题意概览（含共有背景时写清）",
  "question_type": "主题型，如：抛物线综合、材料作文立意",
  "knowledge_points": ["具体考点1", "具体考点2"],
  "method_steps": ["步骤1标题", "步骤2标题", "步骤3标题"],
  "key_step": "最容易错或最关键的一步（1～2句）",
  "key_formula": "可选，最多1个关键公式",
  "notes": "参数不清或需验算则说明；否则可省略",
  "sub_questions": [
    {
      "label": "第(1)问",
      "summary": "该问一句话题意",
      "question_type": "该问题型",
      "knowledge_points": ["该问考点"],
      "method_steps": ["方法步骤标题"],
      "key_step": "该问关键一步"
    }
  ],
  "vocab": { "word": "", "phonetic": "", "pos": "", "definitions": [], "examples": [] },
  "translation": { "source_text": "", "target_text": "", "vocab_notes": [] }
}

规则：
- **一张图里有多道独立题，或有 (1)(2)(3) / 第一问第二问 等小问时**：必须在 sub_questions 中**逐条**列出每一问，禁止只写第一问
- 仅单一整题且无小问时：sub_questions 可省略或为空数组，用顶层 question_summary / method_steps
- content_type=calculation 时：method_steps 最多3条，只写方法标题，禁止数值代入
- content_type=concept 时：method_steps 可写答题要点标题
- content_type=vocab 时：填 vocab，method_steps 可空数组
- content_type=translation 时：填 translation，method_steps 可空数组
- knowledge_points 1～5 个，用标准高考说法
- 看不清的参数不要猜具体数字`;

export function parsePhotoRecognitionJson(raw: string): PhotoRecognition | null {
  let s = raw.trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
  const i = s.indexOf("{");
  const j = s.lastIndexOf("}");
  if (i === -1 || j <= i) return null;
  try {
    const o = JSON.parse(s.slice(i, j + 1)) as Partial<PhotoRecognition>;
    const content_type = o.content_type;
    if (
      content_type !== "calculation" &&
      content_type !== "concept" &&
      content_type !== "vocab" &&
      content_type !== "translation"
    ) {
      return null;
    }
    if (!o.subject?.trim() || !o.question_summary?.trim()) return null;

    const sub_questions = Array.isArray(o.sub_questions)
      ? o.sub_questions
          .map((sq) => {
            const row = sq as Partial<PhotoSubQuestion>;
            const label = row.label?.trim();
            const summary = row.summary?.trim();
            if (!label || !summary) return null;
            return {
              label,
              summary,
              question_type: row.question_type?.trim() || undefined,
              knowledge_points: Array.isArray(row.knowledge_points)
                ? row.knowledge_points.map(String).filter(Boolean).slice(0, 5)
                : undefined,
              method_steps: Array.isArray(row.method_steps)
                ? row.method_steps.map(String).filter(Boolean).slice(0, 3)
                : undefined,
              key_step: row.key_step?.trim() || undefined,
            } satisfies PhotoSubQuestion;
          })
          .filter((sq): sq is PhotoSubQuestion => sq != null)
          .slice(0, 6)
      : undefined;

    return {
      content_type,
      subject: o.subject.trim(),
      question_summary: o.question_summary.trim(),
      question_type: o.question_type?.trim() || "未分类",
      knowledge_points: Array.isArray(o.knowledge_points)
        ? o.knowledge_points.map(String).filter(Boolean).slice(0, 5)
        : [],
      method_steps: Array.isArray(o.method_steps)
        ? o.method_steps.map(String).filter(Boolean).slice(0, 3)
        : [],
      key_step: o.key_step?.trim() || "",
      key_formula: o.key_formula?.trim() || undefined,
      notes: o.notes?.trim() || undefined,
      sub_questions: sub_questions?.length ? sub_questions : undefined,
      vocab: o.vocab,
      translation: o.translation,
    };
  } catch {
    return null;
  }
}

export async function recognizeQuestionPhoto(
  imageDataUrls: string[],
  userHint: string,
  options?: { signal?: AbortSignal },
): Promise<PhotoRecognition | null> {
  const hint = userHint.trim() || "请识别图片中的题目。";
  const multi =
    imageDataUrls.length > 1
      ? `${hint}\n\n（共 ${imageDataUrls.length} 张图片：请识别每张图上的全部题目；若含 (1)(2)(3) 小问须逐问写入 sub_questions。）`
      : `${hint}\n\n（若图中有多道独立题或 (1)(2)(3) 小问，须在 sub_questions 中逐条列出，禁止只写第一问。）`;

  const raw = await invokeErnieVlChat(
    [
      { role: "system", content: PHOTO_RECOGNITION_VL_PROMPT },
      {
        role: "user",
        content: [
          ...imageDataUrls.map((url) => ({
            type: "image_url" as const,
            image_url: { url },
          })),
          { type: "text" as const, text: multi },
        ],
      },
    ],
    { max_tokens: 2400, temperature: 0, signal: options?.signal },
  );

  return parsePhotoRecognitionJson(raw);
}
