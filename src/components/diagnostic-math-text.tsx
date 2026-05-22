import { Fragment, type ReactNode } from "react";
import { BlockMath, InlineMath } from "react-katex";
import "katex/dist/katex.min.css";

type Segment =
  | { kind: "text"; value: string }
  | { kind: "inline"; value: string }
  | { kind: "block"; value: string };

const SUPER_DIGITS = "⁰¹²³⁴⁵⁶⁷⁸⁹";

/** Light touch: x^2 style exponents without $ delimiters → unicode superscripts. */
function applySimpleSuperscripts(text: string): string {
  return text.replace(/\^([0-9+\-]+)/g, (_, raw: string) =>
    [...raw]
      .map((ch) => {
        if (ch === "+") return "⁺";
        if (ch === "-") return "⁻";
        const n = Number(ch);
        if (Number.isInteger(n) && n >= 0 && n <= 9) return SUPER_DIGITS[n];
        return ch;
      })
      .join(""),
  );
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

function renderSegment(seg: Segment, key: string): ReactNode {
  if (seg.kind === "block") {
    try {
      return (
        <div key={key} className="my-2 overflow-x-auto">
          <BlockMath math={seg.value} />
        </div>
      );
    } catch {
      return <span key={key}>{seg.value}</span>;
    }
  }
  if (seg.kind === "inline") {
    try {
      return <InlineMath key={key} math={seg.value} />;
    } catch {
      return <span key={key}>{seg.value}</span>;
    }
  }
  return <Fragment key={key}>{seg.value}</Fragment>;
}

type DiagnosticMathTextProps = {
  children: string;
  className?: string;
};

/** Renders diagnostic copy with $...$ / $$...$$ KaTeX and simple ^n superscripts. */
export function DiagnosticMathText({ children, className }: DiagnosticMathTextProps) {
  const normalized = applySimpleSuperscripts(children);
  const segments = splitBlockAndInlineMath(normalized);
  return (
    <span className={className}>
      {segments.map((seg, i) => renderSegment(seg, String(i)))}
    </span>
  );
}
