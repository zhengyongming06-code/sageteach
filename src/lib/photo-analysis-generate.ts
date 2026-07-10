import { invokeDeepSeekChat } from "@/lib/deepseek-supabase";
import { SAGE_MCQ_GENERATION_SAFETY_SUFFIX } from "@/lib/ai-safety";
import {
  normalizePhotoMarkdown,
  sanitizePhotoMarkdownForDisplay,
  stripHiddenQuizKeysFromMarkdown,
} from "@/lib/photo-analysis-markdown";
import type { PhotoRecognition } from "@/lib/photo-analysis-recognition";

const PHOTO_ANALYSIS_GENERATION_SYSTEM = `你是 Sage 拍照搜题辅学助手。根据「识题 JSON」和可选「题库方法参考」，生成给学生看的 markdown 解析。

必须遵守：
- 定位是辅导入口，不是算题机；禁止长数值推导与联立消元全过程
- 计算/解答题结构：
  - ## 题型判断
  - ## 方法框架（最多3个 ## 步骤N：标题，每步1～2句，禁止代入具体数字）
  - ## 关键一步
  - ### 核心知识点
- 概念/问答题结构：
  - ## 答题要点
  - ### 相关知识点
- 单词/翻译类按 JSON 中 vocab/translation 字段简洁输出，不要巩固题
- 仅 calculation、concept 类型才输出 2～3 道 --- QUIZ --- 巩固题（思路判断题，禁止数值计算题）
- QUIZ 块格式与 QUIZ KEY 隐藏块规则同既有规范；巩固题考查与原题相同考点
- 有「题库方法参考」时，方法框架与关键一步应与之对齐，但不要照抄成冗长答案
- 禁止编造看不清的参数；需要验算时明确写「数值请自行代入验算」
- 不要 JSON，不要代码块包裹整段${SAGE_MCQ_GENERATION_SAFETY_SUFFIX}`;

function buildGenerationUserPrompt(
  recognition: PhotoRecognition,
  catalogHint: string | null,
): string {
  const payload = JSON.stringify(recognition, null, 2);
  return catalogHint
    ? `识题结果：\n${payload}\n\n题库方法参考（优先对齐）：\n${catalogHint}`
    : `识题结果：\n${payload}`;
}

function renderVocabMarkdown(recognition: PhotoRecognition): string {
  const v = recognition.vocab;
  if (!v?.word) return `## 单词\n\n${recognition.question_summary}`;
  const defs = (v.definitions ?? []).map((d) => `- ${d}`).join("\n");
  const examples = (v.examples ?? []).map((e) => `- ${e}`).join("\n");
  return [
    "## 单词",
    `**${v.word}**`,
    v.phonetic ? `**音标**：${v.phonetic}` : null,
    v.pos ? `**词性**：${v.pos}` : null,
    defs ? `**释义**：\n${defs}` : null,
    examples ? `**例句**：\n${examples}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function renderTranslationMarkdown(recognition: PhotoRecognition): string {
  const t = recognition.translation;
  if (!t?.target_text) return `## 翻译\n\n${recognition.question_summary}`;
  const vocab = (t.vocab_notes ?? []).map((n) => `- ${n}`).join("\n");
  return [
    "## 翻译",
    t.target_text,
    vocab ? `### 重点词汇\n${vocab}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function generatePhotoAnalysisMarkdown(
  recognition: PhotoRecognition,
  catalogHint: string | null,
  options?: {
    signal?: AbortSignal;
    onDelta?: (accumulated: string) => void;
  },
): Promise<string> {
  if (recognition.content_type === "vocab") {
    return normalizePhotoMarkdown(renderVocabMarkdown(recognition));
  }
  if (recognition.content_type === "translation") {
    return normalizePhotoMarkdown(renderTranslationMarkdown(recognition));
  }

  const raw = await invokeDeepSeekChat(
    [
      { role: "system", content: PHOTO_ANALYSIS_GENERATION_SYSTEM },
      { role: "user", content: buildGenerationUserPrompt(recognition, catalogHint) },
    ],
    {
      max_tokens: 3200,
      signal: options?.signal,
      onDelta: options?.onDelta
        ? (textSoFar) => {
            options.onDelta?.(
              sanitizePhotoMarkdownForDisplay(normalizePhotoMarkdown(textSoFar)),
            );
          }
        : undefined,
    },
  );

  return normalizePhotoMarkdown(raw);
}
