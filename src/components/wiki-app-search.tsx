import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { fetchStudentKnowledgeMastery, knowledgeTrackingQueryKeys } from "@/lib/knowledge-tracking/api";
import { searchWikiNav } from "@/lib/wiki-app-nav";

export function WikiAppSearch() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);

  const { data: mastery = [] } = useQuery({
    queryKey: knowledgeTrackingQueryKeys.mastery(user?.id ?? "__none__"),
    enabled: !!user?.id && query.trim().length >= 1,
    queryFn: () => fetchStudentKnowledgeMastery(user!.id),
    staleTime: 60_000,
  });

  const results = useMemo(() => {
    if (query.trim().length < 1) return [];
    return searchWikiNav(
      query,
      mastery.map((m) => ({ subject: m.subject, name: m.name })),
    ).slice(0, 10);
  }, [query, mastery]);

  const showResults = focused && query.trim().length >= 1;

  const pick = (item: (typeof results)[number]) => {
    setQuery("");
    setFocused(false);
    void nav({
      to: item.to,
      hash: item.hash,
      search: item.search,
    });
  };

  return (
    <div className="wiki-search-wrap relative !mb-3 !px-1">
      <input
        type="search"
        className="wiki-search"
        placeholder="试试：语文、函数、今日"
        value={query}
        aria-label="搜索"
        aria-expanded={showResults}
        aria-controls="wiki-search-results"
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => window.setTimeout(() => setFocused(false), 120)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && results[0]) {
            e.preventDefault();
            pick(results[0]);
          }
          if (e.key === "Escape") {
            setQuery("");
            setFocused(false);
          }
        }}
      />
      {showResults ? (
        <ul id="wiki-search-results" className="wiki-search-results" role="listbox">
          {results.length === 0 ? (
            <li className="wiki-search-empty">没有匹配结果</li>
          ) : (
            results.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  role="option"
                  className="wiki-search-result"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(item)}
                >
                  <span className="wiki-search-result-label">{item.label}</span>
                  {item.meta ? (
                    <span className="wiki-search-result-meta">{item.meta}</span>
                  ) : null}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
