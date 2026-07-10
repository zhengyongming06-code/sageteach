/** Markdown normalize / quiz-key helpers shared by photo analysis pipeline. */

export function normalizePhotoMarkdown(raw: string): string {
  let text = raw.trim();
  text = text.replace(/^```(?:markdown|md|text)?\s*\n?/i, "");
  text = text.replace(/\n?```\s*$/i, "");
  text = text.replace(/([^\n])(#{2,3}\s)/g, "$1\n\n$2");
  text = text.replace(/(#{2,3}[^\n]+)\n([^\n#\s-])/g, "$1\n\n$2");
  return text.trim();
}

const QUIZ_KEY_BLOCK_RE =
  /---\s*QUIZ\s*KEY\s*---[\s\S]*?---\s*END\s*QUIZ\s*KEY\s*---/gi;

export function stripHiddenQuizKeysFromMarkdown(markdown: string): string {
  return markdown.replace(QUIZ_KEY_BLOCK_RE, "").replace(/\n{3,}/g, "\n\n").trim();
}

export function sanitizePhotoMarkdownForDisplay(markdown: string): string {
  return stripHiddenQuizKeysFromMarkdown(markdown);
}
