import { useMemo, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import type { Components } from "react-markdown";
import { cn } from "@/lib/utils";
import { PHOTO_ANALYSIS_LOADING, hasHiddenQuizKeys } from "@/lib/question-photo-analysis";
import { splitPhotoAnalysisContent, PHOTO_QUIZ_REVEAL_EVENT } from "@/lib/photo-quiz-parse";
import { PhotoQuizCard } from "@/components/photo-quiz-card";
import "katex/dist/katex.min.css";

/** 与 render-math.ts 一致：公式内混中文时不刷控制台警告，渲染结果不变。 */
const REHYPE_KATEX_PLUGINS = [[rehypeKatex, { strict: "ignore" as const }]] as const;

const photoMarkdownComponents: Components = {
  pre({ children }) {
    return <div className="my-2 whitespace-pre-wrap">{children}</div>;
  },
  code({ className, children, ...rest }) {
    const isBlock = Boolean(className?.includes("language-"));
    if (isBlock) {
      return (
        <code className="block whitespace-pre-wrap bg-transparent text-[15px] text-foreground/90" {...rest}>
          {children}
        </code>
      );
    }
    return (
      <code className="bg-transparent text-[15px] text-foreground/90" {...rest}>
        {children}
      </code>
    );
  },
  p({ children }) {
    return (
      <p className="mb-4 text-[15px] leading-[1.8] text-foreground/90 last:mb-0">{children}</p>
    );
  },
  strong({ children }) {
    return <strong className="font-bold text-foreground">{children}</strong>;
  },
  h1({ children }) {
    return (
      <h2 className="mb-2 mt-6 text-base font-bold text-foreground first:mt-0">{children}</h2>
    );
  },
  h2({ children }) {
    return (
      <h2 className="mb-2 mt-6 text-base font-bold text-foreground first:mt-0">{children}</h2>
    );
  },
  h3({ children }) {
    return (
      <h3 className="mb-2 mt-6 text-[15px] font-bold text-foreground first:mt-0">{children}</h3>
    );
  },
  ul({ children }) {
    return (
      <ul className="mb-4 list-disc pl-5 text-[15px] leading-[1.8] text-foreground/90">
        {children}
      </ul>
    );
  },
  ol({ children }) {
    return (
      <ol className="mb-4 list-decimal pl-5 text-[15px] leading-[1.8] text-foreground/90">
        {children}
      </ol>
    );
  },
  li({ children }) {
    return <li className="mb-1 leading-[1.8]">{children}</li>;
  },
  blockquote({ children }) {
    return (
      <blockquote className="mb-3 border-l-2 border-primary/30 pl-3 text-[15px] leading-[1.8] text-muted-foreground">
        {children}
      </blockquote>
    );
  },
};

function PhotoAnalysisSkeleton() {
  return (
    <div className="space-y-3 py-1" aria-hidden>
      <div className="h-4 w-[88%] animate-pulse rounded-md bg-muted/70" />
      <div className="h-4 w-full animate-pulse rounded-md bg-muted/60" />
      <div className="h-4 w-[72%] animate-pulse rounded-md bg-muted/50" />
    </div>
  );
}

function PhotoMarkdownBlock({ content }: { content: string }) {
  if (!content.trim()) return null;
  return (
    <ReactMarkdown
      remarkPlugins={[remarkMath]}
      rehypePlugins={[...REHYPE_KATEX_PLUGINS]}
      components={photoMarkdownComponents}
    >
      {content}
    </ReactMarkdown>
  );
}

type PhotoAnalysisMarkdownProps = {
  markdown: string;
  loading?: boolean;
  className?: string;
};

export function PhotoAnalysisMarkdown({ markdown, loading = false, className }: PhotoAnalysisMarkdownProps) {
  const segments = useMemo(() => splitPhotoAnalysisContent(markdown), [markdown]);
  const hasDeferredAnswers = useMemo(() => hasHiddenQuizKeys(markdown), [markdown]);
  const [answersRevealed, setAnswersRevealed] = useState(() => !hasHiddenQuizKeys(markdown));
  let quizIndex = 0;

  useEffect(() => {
    setAnswersRevealed(!hasHiddenQuizKeys(markdown));
  }, [markdown]);

  useEffect(() => {
    if (!hasDeferredAnswers) return;
    const onReveal = () => setAnswersRevealed(true);
    window.addEventListener(PHOTO_QUIZ_REVEAL_EVENT, onReveal);
    return () => window.removeEventListener(PHOTO_QUIZ_REVEAL_EVENT, onReveal);
  }, [hasDeferredAnswers]);

  const showLoadingOnly = loading && !markdown.trim();

  if (showLoadingOnly) {
    return (
      <div className={cn("w-full min-w-0", className)}>
        <p className="text-sm font-medium text-foreground">{PHOTO_ANALYSIS_LOADING}</p>
        <PhotoAnalysisSkeleton />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "photo-analysis-md w-full min-w-0 max-w-prose text-[15px] leading-[1.8] text-foreground",
        "[&_.katex-display]:my-3 [&_.katex-display]:block [&_.katex-display]:overflow-x-auto [&_.katex-display]:text-center",
        className,
      )}
    >
      {loading ? (
        <p className="mb-3 text-sm font-medium text-muted-foreground">{PHOTO_ANALYSIS_LOADING}</p>
      ) : null}

      <div className="space-y-4">
        {segments.map((seg, i) => {
          if (seg.type === "markdown") {
            return <PhotoMarkdownBlock key={`md-${i}`} content={seg.content} />;
          }
          const idx = quizIndex;
          quizIndex += 1;
          return (
            <PhotoQuizCard
              key={`quiz-${i}-${idx}`}
              quiz={seg.quiz}
              index={idx}
              answersRevealed={answersRevealed}
            />
          );
        })}
      </div>

      {loading ? <PhotoAnalysisSkeleton /> : null}
    </div>
  );
}
