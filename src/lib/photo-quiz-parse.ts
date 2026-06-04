import { stripHiddenQuizKeysFromMarkdown } from "@/lib/question-photo-analysis";
import { validateGeneratedMcq } from "@/lib/ai-safety";

export type PhotoQuizItem = {
  topicHint?: string;
  question: string;
  options: string[];
  answer?: string;
  explanation?: string;
};

export type PhotoAnalysisSegment =
  | { type: "markdown"; content: string }
  | { type: "quiz"; quiz: PhotoQuizItem };

const QUIZ_BLOCK_RE = /---\s*QUIZ\s*---([\s\S]*?)---\s*END\s*QUIZ\s*---/gi;

/** Legacy chat phrase — no longer triggers AI; kept for optional UX guard in review send. */
export function isPhotoQuizRevealRequest(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return /^(对答案|看答案|对一下|核对答案|公布答案|告诉我答案|做完了|写完了|我做完了|做好了)([吧呢啊呀\s。！!？?~～]*)?$/i.test(
    t,
  );
}

export function normalizeQuizAnswerLetter(raw: string): string {
  const t = raw.trim().toUpperCase();
  const m = t.match(/^([A-D])/);
  return m ? m[1] : t.charAt(0).toUpperCase();
}

export function optionLetter(option: string): string {
  const m = option.trim().match(/^([A-D])[.、．\s]/i);
  return m ? m[1].toUpperCase() : option.trim().charAt(0).toUpperCase();
}

export function isQuizAnswerCorrect(selectedOption: string, correctAnswer: string): boolean {
  return optionLetter(selectedOption) === normalizeQuizAnswerLetter(correctAnswer);
}

function parseTopicHintLine(line: string): string | undefined {
  const t = line.trim();
  if (/^本题考查/i.test(t)) return t;
  return undefined;
}

/** Parse --- QUIZ KEY --- inner block (answer + explanation only). */
export function parseQuizKeyBlock(block: string): Pick<PhotoQuizItem, "answer" | "explanation"> {
  const lines = block.split(/\r?\n/);
  let answer = "";
  let explanation = "";
  let section: "answer" | "explanation" | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (/^答案[：:]/i.test(line)) {
      answer = line.replace(/^答案[：:]\s*/i, "").trim();
      section = "answer";
      continue;
    }
    if (/^解析[：:]/i.test(line)) {
      explanation = line.replace(/^解析[：:]\s*/i, "").trim();
      section = "explanation";
      continue;
    }
    if (section === "explanation") explanation = `${explanation}\n${line}`;
  }

  return {
    answer: answer.trim() || undefined,
    explanation: explanation.trim() || undefined,
  };
}

/** Parse one --- QUIZ --- ... --- END QUIZ --- inner block. */
export function parseQuizBlock(
  block: string,
  keyBlock?: string,
): PhotoQuizItem | null {
  const lines = block.split(/\r?\n/);
  let topicHint: string | undefined;
  let question = "";
  const options: string[] = [];
  let answer = "";
  let explanation = "";
  let section: "question" | "options" | "answer" | "explanation" | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const topic = parseTopicHintLine(line);
    if (topic) {
      topicHint = topic;
      continue;
    }

    if (/^题目[：:]/i.test(line)) {
      question = line.replace(/^题目[：:]\s*/i, "").trim();
      section = "question";
      continue;
    }
    if (/^[A-D][.、．\s]/i.test(line)) {
      options.push(line);
      section = "options";
      continue;
    }
    if (/^答案[：:]/i.test(line)) {
      answer = line.replace(/^答案[：:]\s*/i, "").trim();
      section = "answer";
      continue;
    }
    if (/^解析[：:]/i.test(line)) {
      explanation = line.replace(/^解析[：:]\s*/i, "").trim();
      section = "explanation";
      continue;
    }

    if (section === "question") question = `${question}\n${line}`;
    else if (section === "explanation") explanation = `${explanation}\n${line}`;
  }

  if (keyBlock) {
    const key = parseQuizKeyBlock(keyBlock);
    if (key.answer) answer = key.answer;
    if (key.explanation) explanation = key.explanation;
  }

  if (!question.trim() || options.length < 2) return null;

  const item: PhotoQuizItem = {
    topicHint,
    question: question.trim(),
    options: options.slice(0, 4),
    answer: answer.trim() || undefined,
    explanation: explanation.trim() || undefined,
  };

  if (
    item.answer &&
    item.explanation &&
    !validateGeneratedMcq({
      question: item.question,
      options: item.options,
      answer: item.answer,
      explanation: item.explanation,
    })
  ) {
    return { ...item, answer: undefined, explanation: undefined };
  }

  return item;
}

function extractQuizKeyAfter(markdown: string, quizEndIndex: number): string | undefined {
  const tail = markdown.slice(quizEndIndex);
  const m = tail.match(/^\s*---\s*QUIZ\s*KEY\s*---([\s\S]*?)---\s*END\s*QUIZ\s*KEY\s*---/i);
  return m?.[1];
}

/** Split analysis markdown into markdown segments and interactive quiz blocks. */
export function splitPhotoAnalysisContent(markdown: string): PhotoAnalysisSegment[] {
  const segments: PhotoAnalysisSegment[] = [];
  let lastIndex = 0;
  const quizRe = new RegExp(QUIZ_BLOCK_RE.source, "gi");

  for (const match of markdown.matchAll(quizRe)) {
    const start = match.index ?? 0;
    if (start > lastIndex) {
      const md = stripHiddenQuizKeysFromMarkdown(markdown.slice(lastIndex, start).trim());
      if (md) segments.push({ type: "markdown", content: md });
    }

    const quizEndIndex = start + match[0].length;
    const keyInner = extractQuizKeyAfter(markdown, quizEndIndex);
    const quiz = parseQuizBlock(match[1] ?? "", keyInner);
    if (quiz) segments.push({ type: "quiz", quiz });

    if (keyInner) {
      const keyBlockMatch = markdown
        .slice(quizEndIndex)
        .match(/---\s*QUIZ\s*KEY\s*---[\s\S]*?---\s*END\s*QUIZ\s*KEY\s*---/i);
      lastIndex = quizEndIndex + (keyBlockMatch?.[0]?.length ?? 0);
    } else {
      lastIndex = quizEndIndex;
    }
  }

  if (lastIndex < markdown.length) {
    const tail = stripHiddenQuizKeysFromMarkdown(markdown.slice(lastIndex).trim());
    if (tail) segments.push({ type: "markdown", content: tail });
  }

  if (segments.length === 0 && markdown.trim()) {
    segments.push({
      type: "markdown",
      content: stripHiddenQuizKeysFromMarkdown(markdown.trim()),
    });
  }

  return segments;
}
