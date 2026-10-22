import { useEffect, useMemo, useRef, useState } from "react";
import type { Post } from "../lib/types";
import { postDate } from "../lib/types";

interface Props {
  posts: Post[];
  onPick: (p: Post) => void;
}

const MAX = 20;

/** 본문에서 검색어 주변 한 줄 (dev-wiki /api/search 의 발췌와 같은 방식). 검색어가 본문에 없으면 앞부분 */
function snippet(body: string, q: string): string {
  // 마크다운 기호(#, *, `, > …)는 떼고 본문 글자만
  const text = body.replace(/^#{1,6}\s+/gm, "").replace(/[*_`~>=|]+/g, " ").replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\s+/g, " ");
  const i = text.toLowerCase().indexOf(q);
  if (i === -1) return text.slice(0, 90) + (text.length > 90 ? "…" : "");
  const from = Math.max(0, i - 28);
  const to = Math.min(text.length, i + q.length + 48);
  return (from > 0 ? "…" : "") + text.slice(from, to) + (to < text.length ? "…" : "");
}

/**
 * 헤더의 글 검색 — 투두·북로그 Search 와 같은 모양·키보드 규칙 (dev-wiki 의 제목+내용 검색).
 * 이 블로그의 글 제목·본문·태그에 글자가 들어간 글을 보여주고, 고르면 그 글로. Ctrl+K(또는 ⌘K)로 바로 포커스.
 * 키보드: ↑↓ 이동, Enter 이동, Esc 닫기
 */
export function Search({ posts, onPick }: Props) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return posts
      .filter((p) => p.title.toLowerCase().includes(s) || p.tags.some((t) => t.toLowerCase().includes(s)) || p.body.toLowerCase().includes(s))
      .map((p) => ({ p, sn: snippet(p.body, s) }))
      .slice(0, MAX);
  }, [q, posts]);

  useEffect(() => setActive(0), [q]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        input.current?.focus();
        input.current?.select();
      }
    };
    const onDown = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, []);

  const pick = (p: Post) => {
    onPick(p);
    setOpen(false);
    setQ("");
    input.current?.blur();
  };

  return (
    <div className="search" ref={box}>
      <svg className="search-ico" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="7" cy="7" r="4.5" />
        <path d="M10.5 10.5L14 14" />
      </svg>
      <input
        ref={input}
        type="search"
        value={q}
        placeholder="제목, 내용 검색"
        aria-label="글 검색"
        autoComplete="off"
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === "Escape") {
            setOpen(false);
            input.current?.blur();
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, results.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter" && results[active]) {
            e.preventDefault();
            pick(results[active].p);
          }
        }}
      />
      {open && q.trim() && (
        <div className="search-pop" role="listbox">
          {results.length === 0 ? (
            <p className="search-empty">검색 결과가 없어요</p>
          ) : (
            results.map(({ p, sn }, i) => (
              <button
                key={p.id}
                role="option"
                aria-selected={i === active}
                className={"search-item post" + (i === active ? " on" : "")}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(p)}
              >
                <span className="sr-title">{p.title || "제목 없음"}</span>
                <span className="sr-snippet">
                  {p.status === "draft" ? "임시글 · " : postDate(p) + " · "}
                  {sn}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
