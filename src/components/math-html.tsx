import { useMemo } from "react";
import { renderMath } from "@/lib/render-math";

type MathHtmlProps = {
  text: string;
  className?: string;
  as?: "div" | "span" | "p";
};

export function MathHtml({ text, className, as: Tag = "div" }: MathHtmlProps) {
  const html = useMemo(() => renderMath(text), [text]);
  if (!html) return null;
  return <Tag className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
