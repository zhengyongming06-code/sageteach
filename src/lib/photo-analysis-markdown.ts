/** Markdown normalize / quiz-key helpers shared by photo analysis pipeline. */

const QUIZ_BLOCK_RE =
  /---\s*QUIZ\s*---[\s\S]*?---\s*END\s*QUIZ\s*---/gi;
const QUIZ_KEY_BLOCK_RE =
  /---\s*QUIZ\s*KEY\s*---[\s\S]*?---\s*END\s*QUIZ\s*KEY\s*---/gi;

const LATEX_COMMAND_RE =
  /\\(?:frac|sqrt|times|cdot|leq|geq|neq|sum|int|infty|pi|theta|alpha|beta|gamma|Delta|ldots|cdots|left|right|begin|end|text|mathbf|mathrm|overline|underline|vec|partial|nabla|pm|mp|div)/;

/** Wrap bare `(… \frac …)` fragments in $ delimiters so remark-math / KaTeX can render them. */
export function wrapBareLatexInMathDelimiters(text: string): string {
  if (!LATEX_COMMAND_RE.test(text)) return text;

  return text.replace(/\(([^()\n]*\\[a-zA-Z][^()\n]*)\)/g, (match, inner: string) => {
    if (LATEX_COMMAND_RE.test(inner)) {
      return `$${inner.trim()}$`;
    }
    return match;
  });
}

export function normalizePhotoMarkdown(raw: string): string {
  let text = raw.trim();
  text = text.replace(/^```(?:markdown|md|text)?\s*\n?/i, "");
  text = text.replace(/\n?```\s*$/i, "");
  text = text.replace(/([^\n])(#{2,3}\s)/g, "$1\n\n$2");
  text = text.replace(/(#{2,3}[^\n]+)\n([^\n#\s-])/g, "$1\n\n$2");
  text = wrapBareLatexInMathDelimiters(text);
  return text.trim();
}

/** Remove AI-generated quiz blocks (practice lives in the learn/remediation panel). */
export function stripQuizBlocksFromMarkdown(markdown: string): string {
  return markdown
    .replace(QUIZ_BLOCK_RE, "")
    .replace(QUIZ_KEY_BLOCK_RE, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function stripHiddenQuizKeysFromMarkdown(markdown: string): string {
  return stripQuizBlocksFromMarkdown(markdown);
}

export function sanitizePhotoMarkdownForDisplay(markdown: string): string {
  return stripQuizBlocksFromMarkdown(normalizePhotoMarkdown(markdown));
}
