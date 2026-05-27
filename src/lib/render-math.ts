import katex from "katex";
import "katex/dist/katex.min.css";

type Segment =
  | { kind: "text"; value: string }
  | { kind: "inline"; value: string }
  | { kind: "block"; value: string };

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function splitInlineMath(text: string): Segment[] {
  const segments: Segment[] = [];
  const inlineRe = /\$([^$\n]+?)\$/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = inlineRe.exec(text)) !== null) {
    if (m.index > last) {
      segments.push({ kind: "text", value: text.slice(last, m.index) });
    }
    segments.push({ kind: "inline", value: m[1].trim() });
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    segments.push({ kind: "text", value: text.slice(last) });
  }
  if (segments.length === 0 && text) {
    segments.push({ kind: "text", value: text });
  }
  return segments;
}

function splitBlockAndInlineMath(text: string): Segment[] {
  const segments: Segment[] = [];
  const blockRe = /\$\$([\s\S]+?)\$\$/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(text)) !== null) {
    if (m.index > last) {
      segments.push(...splitInlineMath(text.slice(last, m.index)));
    }
    segments.push({ kind: "block", value: m[1].trim() });
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    segments.push(...splitInlineMath(text.slice(last)));
  }
  return segments;
}

/** Convert $...$ / $$...$$ in plain text to KaTeX HTML (for dangerouslySetInnerHTML). */
export function renderMath(text: string): string {
  if (!text.trim()) return "";

  const segments = splitBlockAndInlineMath(text);
  return segments
    .map((seg) => {
      if (seg.kind === "block") {
        try {
          return `<div class="katex-block my-2 overflow-x-auto">${katex.renderToString(seg.value, {
            displayMode: true,
            throwOnError: false,
            strict: "ignore",
          })}</div>`;
        } catch {
          return `<div class="my-2">${escapeHtml(seg.value)}</div>`;
        }
      }
      if (seg.kind === "inline") {
        try {
          return katex.renderToString(seg.value, {
            displayMode: false,
            throwOnError: false,
            strict: "ignore",
          });
        } catch {
          return escapeHtml(seg.value);
        }
      }
      return escapeHtml(seg.value).replace(/\n/g, "<br />");
    })
    .join("");
}
