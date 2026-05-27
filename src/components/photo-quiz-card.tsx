import { useCallback, useState } from "react";
import { MathHtml } from "@/components/math-html";
import {
  isQuizAnswerCorrect,
  normalizeQuizAnswerLetter,
  optionLetter,
  type PhotoQuizItem,
} from "@/lib/photo-quiz-parse";
import { cn } from "@/lib/utils";

type PhotoQuizCardProps = {
  quiz: PhotoQuizItem;
  index: number;
};

export function PhotoQuizCard({ quiz, index }: PhotoQuizCardProps) {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [answered, setAnswered] = useState(false);

  const correctLetter = normalizeQuizAnswerLetter(quiz.answer);

  const pickOption = useCallback(
    (opt: string) => {
      if (answered) return;
      setSelectedOption(opt);
      setAnswered(true);
    },
    [answered],
  );

  const feedbackCorrect =
    selectedOption != null && isQuizAnswerCorrect(selectedOption, quiz.answer);

  return (
    <article className="rounded-2xl border border-border/80 bg-white p-4 shadow-sm">
      <p className="mb-2 text-xs font-medium text-muted-foreground">巩固题 {index + 1}</p>
      <MathHtml
        as="p"
        text={quiz.question}
        className="mb-4 text-[15px] font-medium leading-[1.8] text-foreground"
      />

      <div className="flex flex-col gap-2">
        {quiz.options.map((opt) => {
          const letter = optionLetter(opt);
          const isSelected = selectedOption === opt;
          const isCorrectOpt = letter === correctLetter;

          let variant =
            "border-border bg-white text-foreground hover:border-primary/35 hover:bg-slate-50 active:scale-[0.99]";

          if (answered && isSelected && feedbackCorrect) {
            variant = "border-emerald-500 bg-emerald-50 text-emerald-950";
          } else if (answered && isSelected && !feedbackCorrect) {
            variant = "border-red-400 bg-red-50 text-red-950";
          } else if (answered && !isSelected && isCorrectOpt) {
            variant = "border-emerald-400 bg-emerald-50/80 text-emerald-950";
          } else if (answered) {
            variant = "border-border/70 bg-white text-muted-foreground";
          }

          return (
            <button
              key={opt}
              type="button"
              disabled={answered}
              onClick={() => pickOption(opt)}
              className={cn(
                "flex w-full items-start justify-between gap-2 rounded-xl border px-4 py-3 text-left text-sm shadow-sm transition",
                variant,
              )}
            >
              <MathHtml as="span" text={opt} className="flex-1 text-[15px] leading-snug" />
              {answered && isSelected ? (
                <span className="shrink-0 text-base font-semibold" aria-hidden>
                  {feedbackCorrect ? "✓" : "✗"}
                </span>
              ) : null}
              {answered && !isSelected && isCorrectOpt && !feedbackCorrect ? (
                <span className="shrink-0 text-base font-semibold text-emerald-600" aria-hidden>
                  ✓
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {answered && quiz.explanation ? (
        <div
          className={cn(
            "mt-4 rounded-xl border px-3 py-3 text-sm",
            feedbackCorrect
              ? "border-emerald-200 bg-emerald-50/80"
              : "border-red-200 bg-red-50/80",
          )}
        >
          <p className="mb-1 font-medium text-foreground">
            {feedbackCorrect ? "回答正确" : "回答错误"}
          </p>
          <MathHtml
            as="p"
            text={quiz.explanation}
            className="text-[14px] leading-[1.8] text-muted-foreground"
          />
        </div>
      ) : null}
    </article>
  );
}
