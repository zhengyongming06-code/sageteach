import { invokeErnieVlChat } from "@/lib/ernie-vl";

export type PhotoContentType = "calculation" | "concept" | "vocab" | "translation";

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
  "question_summary": "一句话题意",
  "question_type": "如：椭圆弦长、材料作文立意",
  "knowledge_points": ["具体考点1", "具体考点2"],
  "method_steps": ["步骤1标题", "步骤2标题", "步骤3标题"],
  "key_step": "最容易错或最关键的一步（1～2句）",
  "key_formula": "可选，最多1个关键公式",
  "notes": "参数不清或需验算则说明；否则可省略",
  "vocab": { "word": "", "phonetic": "", "pos": "", "definitions": [], "examples": [] },
  "translation": { "source_text": "", "target_text": "", "vocab_notes": [] }
}

规则：
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
      ? `${hint}\n\n（共 ${imageDataUrls.length} 张图片，请综合识别。）`
      : hint;

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
    { max_tokens: 1800, temperature: 0, signal: options?.signal },
  );

  return parsePhotoRecognitionJson(raw);
}
