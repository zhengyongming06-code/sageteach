/**
 * Shared guardrails for all Sage AI outputs.
 * Append suffixes to prompts; use sanitizers before display / chat history / extraction.
 */

/** Review chat, daily question generation, etc. */
export const SAGE_CONVERSATION_SAFETY_SUFFIX = `

【AI 安全边界 — 必须遵守】
1. 不猜答案：学生未明确说出选了哪一项、或未给出完整作答时，禁止假设其答案并批改；先追问「你选的是哪一项？」或「把你的答案发我」。
2. 不提前泄题：练习/巩固题进行中，禁止在回复里写出标准答案、正确选项字母或完整解题过程；只点评已暴露的那一步思路。
3. 不算数：不要替学生完成多步数值推导或心算最终结果；涉及具体数字时引导学生自己算，或明确说「这一步我算不准，请你代入验算」。
4. 不确定就说不知道：看不清题意、无法核验真题原文、或计算没有把握时，直接说明不确定，不要编造题号、数据或结论。`;

/** MCQ generation (diagnostic, daily question, photo quiz blocks). */
export const SAGE_MCQ_GENERATION_SAFETY_SUFFIX = `

【出题安全 — 必须遵守】
1. 优先出「概念 / 方法 / 步骤判断」选择题，避免需要精确数值计算的单选题；AI 不应依赖心算给出数字结论。
2. 题目与选项中禁止出现正确答案、最终数值结论或完整解题过程。
3. answer 字段只写单个大写字母（A/B/C/D）；解析放在 explanation，且解析里也不要重新泄露其它题的答案。
4. 若无法保证答案唯一且正确，不要出题——返回合法 JSON 且 question 写「本知识点暂无合适自动题，请跳过」、answer 留空字符串，由程序丢弃。`;

/** Structured extraction (review summary, knowledge tracking). */
export const SAGE_EXTRACTION_SAFETY_SUFFIX = `

【抽取安全 — 必须遵守】
1. 只根据对话/文本中**明确出现**的信息填写字段；没有依据时 weak_point / mastered 等用 null 或空，禁止臆测。
2. 不要推断学生是否做错、选了哪一项——除非文本里学生自己说明。
3. 无法判断时降低 confidence，不要编造知识点名称或题号。`;

/** Free-text grading fallback — conservative. */
export const SAGE_GRADING_CONSERVATIVE_SUFFIX = `

【判分安全 — 必须遵守】
1. 只有学生答案与标准答案在语义上明确等价时才判 true。
2. 含糊、部分正确、只对了关键词但缺关键条件 → 判 false。
3. 无法判断时一律 {"correct":false}，禁止猜测。`;

const BRACKET_ANSWER_RE = /^【答案[：:][^】\n]*】\s*$/gm;
const INLINE_BRACKET_ANSWER_RE = /【答案[：:][^】\n]*】/g;

/** Remove visible final-answer markers from markdown (display / chat history). */
export function stripBracketedSolutionAnswers(markdown: string): string {
  return markdown
    .replace(BRACKET_ANSWER_RE, "")
    .replace(INLINE_BRACKET_ANSWER_RE, "（最终数值请自行代入验算）")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function normalizeComparableText(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[，。！？、；：""''（）()[\]【】]/g, "");
}

export function normalizeAnswerLetter(raw: string): string | null {
  const t = raw.trim().toUpperCase();
  const m = t.match(/^([A-D])/);
  return m ? m[1] : null;
}

export function optionLetterFromLabel(option: string): string | null {
  const m = option.trim().match(/^([A-D])[.、．\s]/i);
  return m ? m[1].toUpperCase() : null;
}

/**
 * Deterministic grading before any LLM call.
 * Returns definite=true when match is unambiguous.
 */
export function gradeAnswerLocally(params: {
  studentAnswer: string;
  correctAnswer: string;
  options?: string[];
}): { definite: boolean; correct: boolean } {
  const student = params.studentAnswer.trim();
  const correct = params.correctAnswer.trim();
  if (!student || !correct) return { definite: false, correct: false };

  const studentLetter = normalizeAnswerLetter(student);
  const correctLetter = normalizeAnswerLetter(correct);
  if (correctLetter && studentLetter) {
    return { definite: true, correct: studentLetter === correctLetter };
  }

  if (params.options?.length && correctLetter) {
    const selected = params.options.find((o) => optionLetterFromLabel(o) === studentLetter);
    if (selected) {
      return { definite: true, correct: studentLetter === correctLetter };
    }
  }

  const ns = normalizeComparableText(student);
  const nc = normalizeComparableText(correct);
  if (ns && nc && ns === nc) return { definite: true, correct: true };

  if (nc.length >= 2 && ns.includes(nc)) return { definite: true, correct: true };
  if (ns.length >= 2 && nc.includes(ns)) return { definite: true, correct: true };

  return { definite: false, correct: false };
}

/** Reject generated MCQ if answer key missing or question leaks the answer. */
export function validateGeneratedMcq(params: {
  question: string;
  options: string[];
  answer: string;
  explanation: string;
}): boolean {
  const letter = normalizeAnswerLetter(params.answer);
  if (!letter || params.options.length < 4) return false;
  if (!params.question.trim() || !params.explanation.trim()) return false;

  const correctOpt = params.options.find((o) => optionLetterFromLabel(o) === letter);
  if (!correctOpt) return false;

  const qLower = params.question.toLowerCase();
  const leakPatterns = [
    /故选[：:\s]*[a-d]/i,
    /答案[是为：:\s]*[a-d]/i,
    /正确(?:答案|选项)[是为：:\s]*[a-d]/i,
  ];
  if (leakPatterns.some((re) => re.test(params.question))) return false;

  const correctBody = correctOpt.replace(/^[A-D][.、．\s]+/i, "").trim();
  if (correctBody.length >= 4 && qLower.includes(correctBody.toLowerCase().slice(0, 8))) {
    return false;
  }

  return true;
}
