import { invokeErnieVlChatStream } from "@/lib/ernie-vl";

export const PHOTO_ANALYSIS_LOADING = "🔍 正在识别题目...";

/** Prefix for persisted photo-analysis assistant messages. */
export const SAGE_PHOTO_MD_MARKER = "__sage_photo_md_v1__";

/** @deprecated Legacy JSON storage — still detected for display fallback. */
export const SAGE_PHOTO_ANALYSIS_MARKER = "__sage_photo_analysis_v1__";

export const QUESTION_PHOTO_SYSTEM_PROMPT = `你是高考/大学学习助教。请先识别图片内容，再按类型输出，不要套用一种格式。

首先判断图片内容类型（只选一种最匹配的）：

1. 【单词/词汇查询】（单个或几个英语单词，无完整题目）
   直接返回，用 markdown：
   - ## 单词
   - **音标**：...
   - **词性**：...
   - **释义**：...
   - **例句**：（2条，每条单独一行）
   不要解题过程，不要知识点列表，不要巩固题，不要 --- QUIZ --- 块。

2. 【翻译类】（一段外文需要翻译成中文，或中译英）
   直接返回，用 markdown：
   - ## 翻译
   - 译文正文（分段）
   - ### 重点词汇（每条单独一行，格式：单词 — 释义）
   不要巩固题，不要 --- QUIZ --- 块。

3. 【计算/解答题】（数学、物理、化学等需要推导计算的题）
   用 markdown 输出：
   - 解题过程：每个步骤用 ## 步骤1：xxx 单独一行，段与段之间空一行
   - ### 核心知识点（- 列表，每条一行）
   - 行内公式 $...$，独立公式 $$...$$
   - 最后出 **3 道**同类巩固选择题，每题必须用以下块（不要用 ### 巩固题 标题）：

--- QUIZ ---
题目：xxx
A. xxx
B. xxx
C. xxx
D. xxx
答案：B
解析：xxx
--- END QUIZ ---

4. 【概念/问答题】（历史、政治、生物、语文等文字阐述题）
   用 markdown 输出：
   - ## 答题要点（分点列出）
   - ### 相关知识点（- 列表）
   - 最后出 **2 道**同类巩固选择题，每题用 --- QUIZ --- ... --- END QUIZ --- 块（格式同上）。

通用要求：
- 绝对不要把所有内容挤在同一段；段落之间空一行。
- 仅类型 3、4 才输出 --- QUIZ ---；类型 1、2 禁止输出任何巩固题。
- 不要用 JSON，不要用代码块包裹整段回复。
- QUIZ 块内：题目、A/B/C/D、答案、解析各占一行；答案行只写字母（如 B）。`;

/** Strip fences and fix common glued heading/paragraph breaks from model output. */
export function normalizePhotoMarkdown(raw: string): string {
  let text = raw.trim();
  text = text.replace(/^```(?:markdown|md|text)?\s*\n?/i, "");
  text = text.replace(/\n?```\s*$/i, "");
  // Headings stuck to previous line → start on new paragraph
  text = text.replace(/([^\n])(#{2,3}\s)/g, "$1\n\n$2");
  // Blank line after heading when body follows immediately
  text = text.replace(/(#{2,3}[^\n]+)\n([^\n#\s-])/g, "$1\n\n$2");
  return text.trim();
}

export function wrapPhotoMarkdown(markdown: string): string {
  return SAGE_PHOTO_MD_MARKER + normalizePhotoMarkdown(markdown);
}

export function unwrapPhotoMarkdown(content: string): {
  isPhotoAnalysis: boolean;
  markdown: string;
} {
  if (content.startsWith(SAGE_PHOTO_MD_MARKER)) {
    return {
      isPhotoAnalysis: true,
      markdown: normalizePhotoMarkdown(content.slice(SAGE_PHOTO_MD_MARKER.length)),
    };
  }
  if (content.startsWith(SAGE_PHOTO_ANALYSIS_MARKER)) {
    return {
      isPhotoAnalysis: true,
      markdown: "这是旧版分析记录，请重新拍照获取最新解析。",
    };
  }
  return { isPhotoAnalysis: false, markdown: content };
}

export async function analyzeQuestionPhoto(
  imageDataUrl: string,
  userHint: string,
  options?: {
    signal?: AbortSignal;
    onDelta?: (accumulated: string) => void;
  },
): Promise<string> {
  const hint = userHint.trim() || "请识别并分析图片中的题目。";
  const raw = await invokeErnieVlChatStream(
    [
      { role: "system", content: QUESTION_PHOTO_SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: { url: imageDataUrl },
          },
          { type: "text", text: hint },
        ],
      },
    ],
    (textSoFar) => options?.onDelta?.(textSoFar),
    { max_tokens: 4096, signal: options?.signal },
  );

  return normalizePhotoMarkdown(raw);
}
