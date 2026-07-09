import { Link } from "@tanstack/react-router";
import { SUBJECTS, type Subject } from "@/lib/subjects";
import { cn } from "@/lib/utils";

/** Shown on viewports where the learn topic tree (left column) is hidden. */
export function LearnSubjectMobileBar({
  subject,
  showAllTab = false,
}: {
  subject?: Subject;
  showAllTab?: boolean;
}) {
  return (
    <div className="wiki-learn-mobile-subjects lg:hidden">
      <p className="wiki-learn-mobile-subjects-label">学科</p>
      <div className="wiki-learn-mobile-subjects-scroll">
        {showAllTab ? (
          <Link
            to="/app/learn"
            className={cn("wiki-learn-subject-tab", !subject && "wiki-learn-subject-tab-active")}
          >
            全部
          </Link>
        ) : null}
        {SUBJECTS.map((s) => (
          <Link
            key={s}
            to="/app/learn"
            search={{ subject: s }}
            className={cn(
              "wiki-learn-subject-tab",
              subject === s && "wiki-learn-subject-tab-active",
            )}
          >
            {s}
          </Link>
        ))}
      </div>
    </div>
  );
}
