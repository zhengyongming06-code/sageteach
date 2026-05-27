export type PhotoQuizItem = {
  question: string;
  options: string[];
  answer: string;
  explanation: string;
};

export type PhotoAnalysisSegment =
  | { type: "markdown"; content: string }
  | { type: "quiz"; quiz: PhotoQuizItem };

const QUIZ_BLOCK_RE = /---\s*QUIZ\s*---([\s\S]*?)---\s*END\s*QUIZ\s*---/gi;

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

/** Parse one --- QUIZ --- ... --- END QUIZ --- inner block. */
export function parseQuizBlock(block: string): PhotoQuizItem | null {
  const lines = block.split(/\r?\n/);
  let question = "";
  const options: string[] = [];
  let answer = "";
  let explanation = "";
  let section: "question" | "options" | "answer" | "explanation" | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

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

  if (!question.trim() || options.length < 2 || !answer.trim()) return null;

  return {
    question: question.trim(),
    options: options.slice(0, 4),
    answer: answer.trim(),
    explanation: explanation.trim(),
  };
}

/** Split analysis markdown into markdown segments and interactive quiz blocks. */
export function splitPhotoAnalysisContent(markdown: string): PhotoAnalysisSegment[] {
  const segments: PhotoAnalysisSegment[] = [];
  let lastIndex = 0;

  for (const match of markdown.matchAll(QUIZ_BLOCK_RE)) {
    const start = match.index ?? 0;
    if (start > lastIndex) {
      const md = markdown.slice(lastIndex, start).trim();
      if (md) segments.push({ type: "markdown", content: md });
    }
    const quiz = parseQuizBlock(match[1] ?? "");
    if (quiz) segments.push({ type: "quiz", quiz });
    lastIndex = start + match[0].length;
  }

  if (lastIndex < markdown.length) {
    const tail = markdown.slice(lastIndex).trim();
    if (tail) segments.push({ type: "markdown", content: tail });
  }

  if (segments.length === 0 && markdown.trim()) {
    segments.push({ type: "markdown", content: markdown.trim() });
  }

  return segments;
}
