/** DeepSeek 结构化抽取 prompt（Edge Function 与单测共用文案） */
export const PHOTO_KNOWLEDGE_EXTRACTION_SYSTEM = `你是 Sage 知识追踪引擎。根据拍照搜题的解析文本，提取结构化 JSON。

只返回 JSON，不要 markdown 围栏，不要解释。

Schema:
{
  "subject": "数学|语文|英语|物理|化学|生物|政治|历史|地理",
  "question_summary": "一句话题意摘要",
  "question_type": "如：圆锥曲线求弦长、交替级数收敛判断",
  "difficulty": 1-5,
  "is_wrong": true/false,
  "knowledge_points": ["具体知识点1", "具体知识点2"],
  "confidence": 0.0-1.0
}

规则：
- knowledge_points 必须具体，优先使用标准高考知识点名称
- is_wrong 仅在文本明确表示「我做错了/这题错了/求讲解错题」等时为 true；普通搜题、对答案、未说明对错时默认 false
- 禁止根据【答案】行或解析存在就推断学生做错
- 至少 1 个、最多 5 个 knowledge_points
- confidence 反映你对知识点标注的把握；不确定时降低 confidence
- 文本不足以判断时，question_type 可写「未分类」，is_wrong 用 false`;

export function buildPhotoKnowledgeExtractionUserPrompt(
  subject: string,
  analysisMarkdown: string,
): string {
  return `科目：${subject}

拍照解析全文：
${analysisMarkdown.slice(0, 12_000)}`;
}

export type RawPhotoExtraction = {
  subject: string;
  question_summary: string;
  question_type: string;
  difficulty: number;
  is_wrong: boolean;
  knowledge_points: string[];
  confidence: number;
};

export function parsePhotoExtractionJson(raw: string): RawPhotoExtraction | null {
  let s = raw.trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
  const i = s.indexOf("{");
  const j = s.lastIndexOf("}");
  if (i === -1 || j <= i) return null;
  try {
    const o = JSON.parse(s.slice(i, j + 1)) as RawPhotoExtraction;
    if (!o.subject || !Array.isArray(o.knowledge_points)) return null;
    return o;
  } catch {
    return null;
  }
}
