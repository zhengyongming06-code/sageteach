import { Link } from "@tanstack/react-router";
import { BookOpen, ExternalLink, MessageCircle, PlayCircle } from "lucide-react";
import { useState } from "react";
import { RemediationProgressActions } from "@/components/remediation-progress-actions";
import {
  buildFollowUpPrompt,
  type KnowledgeRemediation,
} from "@/lib/knowledge-topics/recommend";
import type {
  RemediationAction,
  RemediationProgress,
} from "@/lib/knowledge-tracking/remediation-progress";
import { cn } from "@/lib/utils";

type PhotoRemediationPanelProps = {
  remediation: KnowledgeRemediation;
  progress?: RemediationProgress;
  coachMessageId?: string;
  onMarkProgress?: (
    action: RemediationAction,
  ) => Promise<RemediationProgress>;
  onAskFollowUp?: (text: string) => void;
  className?: string;
};

const EMPTY_PROGRESS: RemediationProgress = {
  video_watched: false,
  practice_done: false,
};

export function PhotoRemediationPanel({
  remediation,
  progress = EMPTY_PROGRESS,
  coachMessageId,
  onMarkProgress,
  onAskFollowUp,
  className,
}: PhotoRemediationPanelProps) {
  const { subject, knowledgePoints, videos, practiceQuestions, learnSearch } = remediation;
  const [expandedPracticeId, setExpandedPracticeId] = useState<string | null>(null);

  return (
    <div className={cn("photo-remediation-panel", className)}>
      <div className="photo-remediation-head">
        <div className="photo-remediation-tags">
          {knowledgePoints.map((kp) => (
            <Link
              key={kp}
              to="/app/learn"
              search={{ subject, topic: kp }}
              className="photo-remediation-tag"
            >
              {kp}
            </Link>
          ))}
        </div>
      </div>

      <div className="photo-remediation-body">
        {videos.length > 0 ? (
          <div className="photo-remediation-block">
            <p className="photo-remediation-label">推荐视频</p>
            <ul className="photo-remediation-video-list">
              {videos.slice(0, 2).map((v) => (
                <li key={v.id}>
                  <a
                    href={v.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="photo-remediation-video"
                  >
                    <PlayCircle className="h-4 w-4 shrink-0 text-[#00a1d6]" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="photo-remediation-video-title">{v.title}</span>
                      <span className="photo-remediation-video-meta">
                        {v.teacher} · B站
                        {v.note ? ` · ${v.note}` : ""}
                      </span>
                    </span>
                    <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-45" aria-hidden />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {practiceQuestions.length > 0 ? (
          <div className="photo-remediation-block">
            <p className="photo-remediation-label">同类练手</p>
            <p className="photo-remediation-practice-tip">点题目可展开提示；做完后下方可标记「练完」。</p>
            <ol className="photo-remediation-practice">
              {practiceQuestions.slice(0, 2).map((q, i) => {
                const open = expandedPracticeId === q.id;
                return (
                  <li key={q.id} className="photo-remediation-practice-item">
                    <span className="photo-remediation-practice-num">{i + 1}</span>
                    <button
                      type="button"
                      className="photo-remediation-practice-btn min-w-0 flex-1 text-left"
                      onClick={() =>
                        setExpandedPracticeId((prev) => (prev === q.id ? null : q.id))
                      }
                    >
                      <p className="photo-remediation-practice-stem">{q.stem}</p>
                      <p className="photo-remediation-practice-meta">
                        {q.source}
                        {q.difficulty ? ` · 难度 ${q.difficulty}` : ""}
                        {q.answerHint ? (open ? " · 收起提示" : " · 点看提示") : ""}
                      </p>
                      {open && q.answerHint ? (
                        <p className="photo-remediation-practice-hint">提示：{q.answerHint}</p>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
        ) : null}
      </div>

      <div className="photo-remediation-foot">
        {coachMessageId && onMarkProgress ? (
          <RemediationProgressActions
            progress={progress}
            onMark={onMarkProgress}
            compact
            className="photo-remediation-progress"
          />
        ) : null}

        <div className="photo-remediation-actions">
          <Link
            to="/app/learn"
            search={learnSearch}
            className="photo-remediation-btn photo-remediation-btn-secondary"
          >
            <BookOpen className="h-3.5 w-3.5 shrink-0" aria-hidden />
            打开知识点页
          </Link>
          {onAskFollowUp ? (
            <button
              type="button"
              className="photo-remediation-btn photo-remediation-btn-primary"
              onClick={() => onAskFollowUp(buildFollowUpPrompt(remediation))}
            >
              <MessageCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
              继续追问 Sage
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
