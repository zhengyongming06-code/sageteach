import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { fetchStudentKnowledgeMastery, knowledgeTrackingQueryKeys } from "@/lib/knowledge-tracking/api";
import { fetchWeakKnowledgePoints } from "@/lib/knowledge-tracking/ingest-client";
import { weakArchiveQueryOptions } from "@/lib/weak-archive";
import {
  buildWikiSearchGroups,
  buildWikiSearchSuggestions,
  flattenWikiSearchGroups,
  highlightMatchSegments,
  wikiSearchBreadcrumb,
  wikiSearchPreviewHint,
  wikiSearchPreviewTags,
  type WikiSearchResult,
} from "@/lib/wiki-search";

function HighlightLabel({ text, query }: { text: string; query: string }) {
  const segments = highlightMatchSegments(text, query);
  return (
    <>
      {segments.map((seg, i) =>
        seg.match ? (
          <mark key={i} className="wiki-search-mark">
            {seg.text}
          </mark>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </>
  );
}

function SearchPreview({
  item,
  query,
  onOpen,
}: {
  item: WikiSearchResult;
  query: string;
  onOpen: () => void;
}) {
  const tags = wikiSearchPreviewTags(item);

  return (
    <div className="wiki-search-preview">
      <p className="wiki-search-preview-crumb">{wikiSearchBreadcrumb(item)}</p>
      <h2 className="wiki-search-preview-title">
        <HighlightLabel text={item.label} query={query} />
      </h2>
      {tags.length > 0 ? (
        <div className="wiki-search-preview-tags">
          {tags.map((tag) => (
            <span key={tag} className="wiki-search-tag">
              #<HighlightLabel text={tag} query={query} />
            </span>
          ))}
        </div>
      ) : null}
      {item.detail ? (
        <p className="wiki-search-preview-body">
          <HighlightLabel text={item.detail} query={query} />
        </p>
      ) : (
        <p className="wiki-search-preview-body">{wikiSearchPreviewHint(item)}</p>
      )}
      {item.detail ? (
        <p className="wiki-search-preview-note">{wikiSearchPreviewHint(item)}</p>
      ) : null}
      <button type="button" className="wiki-search-preview-action" onClick={onOpen}>
        打开
      </button>
    </div>
  );
}

export function WikiAppSearch() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: archive = [] } = useQuery({
    ...weakArchiveQueryOptions(user!.id),
    enabled: !!user?.id && open,
  });

  const { data: weakKnowledge = [] } = useQuery({
    queryKey: ["wiki-search-weak-kp", user?.id],
    enabled: !!user?.id && open,
    queryFn: () => fetchWeakKnowledgePoints(user!.id, 8),
    staleTime: 60_000,
  });

  const { data: mastery = [] } = useQuery({
    queryKey: knowledgeTrackingQueryKeys.mastery(user?.id ?? "__none__"),
    enabled: !!user?.id && open && query.trim().length >= 1,
    queryFn: () => fetchStudentKnowledgeMastery(user!.id),
    staleTime: 60_000,
  });

  const knowledgeRows = useMemo(() => {
    if (query.trim().length >= 1) {
      return mastery.map((m) => ({
        subject: m.subject,
        name: m.name,
        mastery_score: m.mastery_score,
        wrong_count: m.wrong_count,
      }));
    }
    return weakKnowledge.map((m) => ({
      subject: m.subject,
      name: m.name,
      mastery_score: "mastery_score" in m ? (m.mastery_score as number | null) : null,
      wrong_count: "wrong_count" in m ? (m.wrong_count as number) : undefined,
    }));
  }, [query, mastery, weakKnowledge]);

  const groups = useMemo(() => {
    const ctx = { archive, knowledge: knowledgeRows };
    if (query.trim().length >= 1) {
      return buildWikiSearchGroups(query, ctx);
    }
    if (!user?.id) return [];
    return buildWikiSearchSuggestions(ctx);
  }, [query, archive, knowledgeRows, user?.id]);

  const flatResults = useMemo(() => flattenWikiSearchGroups(groups), [groups]);
  const activeItem = flatResults[activeIndex] ?? flatResults[0] ?? null;

  useEffect(() => {
    setActiveIndex(0);
  }, [query, flatResults.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.clearTimeout(t);
      document.body.style.overflow = prev;
    };
  }, [open]);

  const close = () => {
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
  };

  const pick = (item: WikiSearchResult) => {
    close();
    void nav({
      to: item.to,
      hash: item.hash,
      search: item.search,
    });
  };

  const modLabel =
    typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.userAgent)
      ? "⌘K"
      : "Ctrl K";

  const onInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (flatResults.length === 0) return;
      setActiveIndex((i) => (i + 1) % flatResults.length);
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (flatResults.length === 0) return;
      setActiveIndex((i) => (i - 1 + flatResults.length) % flatResults.length);
    }
    if (e.key === "Enter" && activeItem) {
      e.preventDefault();
      pick(activeItem);
    }
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  };

  const modal =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            className="wiki-search-overlay"
            role="presentation"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) close();
            }}
          >
            <div
              className="wiki-search-modal"
              role="dialog"
              aria-modal="true"
              aria-label="搜索"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="wiki-search-modal-head">
                <Search className="wiki-search-modal-icon" aria-hidden />
                <input
                  ref={inputRef}
                  type="search"
                  className="wiki-search-modal-input"
                  placeholder="搜索今晚任务、薄弱知识点、科目复盘…"
                  value={query}
                  aria-controls="wiki-search-results"
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={onInputKeyDown}
                />
                <kbd className="wiki-search-kbd">Esc</kbd>
              </div>

              <div className="wiki-search-split">
                <div className="wiki-search-list-pane" id="wiki-search-results" role="listbox">
                  {!user?.id ? (
                    <p className="wiki-search-empty">登录后可搜索今晚任务与薄弱知识点</p>
                  ) : groups.length === 0 || flatResults.length === 0 ? (
                    <p className="wiki-search-empty">没有匹配结果</p>
                  ) : (
                    groups.map((group) => (
                      <div key={group.id} className="wiki-search-group">
                        <p className="wiki-search-group-label">{group.label}</p>
                        <ul className="wiki-search-group-list">
                          {group.items.map((item) => {
                            const idx = flatResults.findIndex((r) => r.id === item.id);
                            const active = idx === activeIndex;
                            return (
                              <li key={item.id}>
                                <button
                                  type="button"
                                  role="option"
                                  aria-selected={active}
                                  className={
                                    active
                                      ? "wiki-search-result wiki-search-result-active"
                                      : "wiki-search-result"
                                  }
                                  onMouseEnter={() => {
                                    if (idx >= 0) setActiveIndex(idx);
                                  }}
                                  onClick={() => pick(item)}
                                >
                                  <span className="wiki-search-result-label">
                                    <HighlightLabel text={item.label} query={query} />
                                  </span>
                                  {item.meta ? (
                                    <span className="wiki-search-result-meta">{item.meta}</span>
                                  ) : null}
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ))
                  )}
                </div>

                <div className="wiki-search-preview-pane">
                  {activeItem ? (
                    <SearchPreview
                      item={activeItem}
                      query={query}
                      onOpen={() => pick(activeItem)}
                    />
                  ) : (
                    <div className="wiki-search-preview wiki-search-preview-idle">
                      <p className="wiki-search-preview-crumb">Sage Study Hub</p>
                      <h2 className="wiki-search-preview-title">搜索你的学习数据</h2>
                      <p className="wiki-search-preview-body">
                        今晚任务、薄弱知识点、科目复盘——搜完就能跳转。
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="wiki-search-modal-foot">
                <span>↑↓ 选择</span>
                <span>Enter 打开</span>
                <span>Esc 关闭</span>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        type="button"
        className="wiki-search-trigger"
        aria-label="打开搜索"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <Search className="h-3.5 w-3.5 shrink-0 opacity-55" aria-hidden />
        <span className="wiki-search-trigger-text">搜索…</span>
        <kbd className="wiki-search-kbd ml-auto">{modLabel}</kbd>
      </button>
      {modal}
    </>
  );
}
