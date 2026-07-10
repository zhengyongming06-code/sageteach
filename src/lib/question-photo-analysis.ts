import { invokeErnieVlChatStream } from "@/lib/ernie-vl";
import { SAGE_MCQ_GENERATION_SAFETY_SUFFIX } from "@/lib/ai-safety";
import {
  getCachedPhotoAnalysis,
  hashPhotoAnalysisInput,
  setCachedPhotoAnalysis,
} from "@/lib/photo-analysis-cache";
import { buildCatalogMethodHint } from "@/lib/photo-analysis-catalog-hint";
import { generatePhotoAnalysisMarkdown } from "@/lib/photo-analysis-generate";
import {
  normalizePhotoMarkdown,
  sanitizePhotoMarkdownForDisplay,
  stripHiddenQuizKeysFromMarkdown,
} from "@/lib/photo-analysis-markdown";
import { recognizeQuestionPhoto } from "@/lib/photo-analysis-recognition";

export const PHOTO_ANALYSIS_LOADING = "🔍 正在识别题目...";

/** Shown above photo analysis — sets expectations for method-first output. */
export const PHOTO_ANALYSIS_METHOD_NOTE =
  "解析侧重解题思路与考点；涉及复杂计算请结合辅学视频自行验算。";

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
   定位：辅导入口，不是算题机。优先「题型 + 方法框架 + 关键一步」，不要长数值推导。
   用 markdown 输出：
   - ## 题型判断（1 句话，如：椭圆与直线联立求弦长）
   - ## 方法框架（最多 **3** 个步骤，每个用 ## 步骤1：标题 单独一行；每步只写 1～2 句「做什么」，**禁止**具体数字代入与多步连锁等式）
   - ## 关键一步（最容易错或最决定方向的一步；最多 1 个关键公式，不要展开算到底）
   - ### 核心知识点（- 列表，每条一行）
   - 行内公式 $...$，独立公式 $$...$$（公式总数不宜过多，优先方法性公式）
   - 最后出 **3 道**选择题，考查解题思路和方法判断，而不是具体数值计算。例如：
     - 「求椭圆弦长时，以下哪个步骤是必须的？」
     - 「以下哪种情况下韦达定理可以使用？」
     这类题 AI 不易算错，也更利于巩固解题思路。
   每题必须用以下块（不要用 ### 巩固题 标题）。
   巩固题**先只出题**，答案与解析放在紧随其后的隐藏块（界面不会直接展示，学生点选选项后由前端判分并展示解析）：

--- QUIZ ---
本题考查[具体考点]，与原题相同
题目：xxx
A. xxx
B. xxx
C. xxx
D. xxx
--- END QUIZ ---
--- QUIZ KEY ---
答案：B
解析：xxx
--- END QUIZ KEY ---

   【圆锥曲线 / 导数 / 解析几何 / 多步计算题】硬性要求：
   - **禁止**展开联立、消元、判别式、韦达代入后的完整计算链
   - **禁止**给出未经充分验算的最终数值答案；题面参数若看不清，写「参数需从题图辨认，数值请自行代入验算」
   - 方法框架 + 关键一步合计不超过 4 个小节；宁可短而清晰，不要长而可能算错

   解题要求：
   - 不要心算给出最终数值：若无法从题面唯一确定，写「此步需验证」或「最终数值需你自己代入验算」，**禁止编造数字**
   - 只有当你能从题面明确推出唯一结果时，才用【答案：xxx】单独一行标出；否则**不要输出【答案】行**
   - 同一道题多次识别时，题型判断与方法框架应保持一致；不确定处标「待验算」，不要猜测不同数值

4. 【概念/问答题】（历史、政治、生物、语文等文字阐述题）
   用 markdown 输出：
   - ## 答题要点（分点列出）
   - ### 相关知识点（- 列表）
   - 最后出 **2 道**选择题，考查相关概念的理解与方法判断（不要出需要精确数值计算的题）：格式同类型 3（--- QUIZ --- 只含题目与选项，--- QUIZ KEY --- 含答案与解析）。

通用要求：
- 绝对不要把所有内容挤在同一段；段落之间空一行。
- 仅类型 3、4 才输出 --- QUIZ ---；类型 1、2 禁止输出任何巩固题。
- 不要用 JSON，不要用代码块包裹整段回复。
- QUIZ 块内：本题考查行、题目、A/B/C/D 各占一行；**禁止**在 QUIZ 块内写答案、解析或解题过程。
- QUIZ KEY 块内：答案、解析各占一行；答案行只写单个大写字母（如 B）；每道 QUIZ 必须紧跟一个 QUIZ KEY。
- 生成巩固题时，**绝对不能**在题目文字或选项里出现答案、最终结论或完整解题过程。
- 巩固题先只输出题目和选项；答案字段只写字母；解析写在 QUIZ KEY 里供前端在用户作答后展示，不要在 QUIZ 块里输出解析。

【重要】巩固题须考查与原题相同的核心考点，但用「思路/方法/概念判断」选择题呈现：
- 如果原题是圆锥曲线求弦长，巩固题应考「求弦长的关键步骤或可用定理」，不要另出一道需要从头算数的弦长计算题
- 如果原题是交替级数收敛判断，巩固题应考同类收敛判别思路或方法选择
- 禁止出现与原题考点无关的题目
- 每道巩固题出题前先说明：本题考查[具体考点]，与原题相同${SAGE_MCQ_GENERATION_SAFETY_SUFFIX}`;

export { normalizePhotoMarkdown, sanitizePhotoMarkdownForDisplay, stripHiddenQuizKeysFromMarkdown };

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

export function hasHiddenQuizKeys(markdown: string): boolean {
  return /---\s*QUIZ\s*KEY\s*---/i.test(markdown);
}

/** Strip hidden quiz keys from persisted photo assistant content for DeepSeek history. */
export function stripPhotoContentForChatApi(content: string): string {
  const { isPhotoAnalysis, markdown } = unwrapPhotoMarkdown(content);
  if (!isPhotoAnalysis) return content;
  return wrapPhotoMarkdown(stripHiddenQuizKeysFromMarkdown(markdown));
}

async function analyzeQuestionPhotoLegacyVl(
  urls: string[],
  multiHint: string,
  options?: {
    signal?: AbortSignal;
    onDelta?: (accumulated: string) => void;
  },
): Promise<string> {
  const raw = await invokeErnieVlChatStream(
    [
      { role: "system", content: QUESTION_PHOTO_SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          ...urls.map((url) => ({
            type: "image_url" as const,
            image_url: { url },
          })),
          { type: "text" as const, text: multiHint },
        ],
      },
    ],
    (textSoFar) =>
      options?.onDelta?.(sanitizePhotoMarkdownForDisplay(normalizePhotoMarkdown(textSoFar))),
    { max_tokens: 4096, temperature: 0, signal: options?.signal },
  );
  return normalizePhotoMarkdown(raw);
}

export async function analyzeQuestionPhoto(
  imageDataUrls: string | string[],
  userHint: string,
  options?: {
    signal?: AbortSignal;
    onDelta?: (accumulated: string) => void;
  },
): Promise<string> {
  const urls = (Array.isArray(imageDataUrls) ? imageDataUrls : [imageDataUrls]).filter(Boolean);
  if (urls.length === 0) {
    throw new Error("缺少题目图片");
  }
  const hint = userHint.trim() || "请识别并分析图片中的题目。";
  const multiHint =
    urls.length > 1 ? `${hint}\n\n（共 ${urls.length} 张图片，请综合所有图片中的题目内容分析。）` : hint;

  const cacheHash = await hashPhotoAnalysisInput(urls, hint);
  const cached = getCachedPhotoAnalysis(cacheHash);
  if (cached) {
    options?.onDelta?.(sanitizePhotoMarkdownForDisplay(cached));
    return cached;
  }

  try {
    const recognition = await recognizeQuestionPhoto(urls, hint, { signal: options?.signal });
    if (!recognition) {
      throw new Error("photo recognition parse failed");
    }

    const catalogHint = buildCatalogMethodHint(recognition);
    const markdown = await generatePhotoAnalysisMarkdown(recognition, catalogHint, {
      signal: options?.signal,
      onDelta: options?.onDelta,
    });

    setCachedPhotoAnalysis(cacheHash, markdown);
    return markdown;
  } catch (pipelineErr) {
    console.warn("[photo-analysis] pipeline fallback to legacy VL", pipelineErr);
    const markdown = await analyzeQuestionPhotoLegacyVl(urls, multiHint, options);
    setCachedPhotoAnalysis(cacheHash, markdown);
    return markdown;
  }
}
