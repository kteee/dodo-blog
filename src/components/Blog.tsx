import { useEffect, useMemo, type ReactNode } from "react";
import type { Post, Profile } from "../lib/types";
import { excerpt, fmtDate, monthKey, postDate, sortPosts } from "../lib/types";
import { go, onLinkClick } from "../hooks/useRoute";
import { Markdown, Toc, useMarkdown } from "./Markdown";
import { app, blogHome, postUrl } from "../lib/paths";

export interface Filter {
  tag: string | null;
  /** "2026-10" */
  month: string | null;
}
export const NO_FILTER: Filter = { tag: null, month: null };

/** 글 날짜(공개일, 임시글은 수정일)로 달 묶기 */
const dateOf = (p: Post) => p.publishedAt ?? p.updatedAt;

/* ── 왼쪽 사이드: 전체/임시글 → 태그 → 달 (블로그 제목은 헤더에) ── */
interface SideProps {
  posts: Post[];
  filter: Filter;
  onFilter: (f: Filter) => void;
  isOwner: boolean;
}
export function BlogSide({ posts, filter, onFilter, isOwner }: SideProps) {
  const pub = posts.filter((p) => p.status === "public");
  const tags = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of pub) for (const t of p.tags) m.set(t, (m.get(t) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko"));
  }, [pub]);
  const months = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of pub) {
      const k = monthKey(dateOf(p));
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [pub]);
  const drafts = isOwner ? posts.filter((p) => p.status === "draft").length : 0;
  return (
    <>
      <div>
        <ul className="cats">
          <li>
            <button className={"cat" + (!filter.tag && !filter.month ? " on" : "")} onClick={() => onFilter(NO_FILTER)}>
              <span className="sq done" aria-hidden="true" />
              <span className="nm">전체</span>
              <span className="n">{pub.length}</span>
              <span />
            </button>
          </li>
          {isOwner && (
            <li>
              <button className={"cat" + (filter.tag === "__draft" ? " on" : "")} onClick={() => onFilter({ tag: "__draft", month: null })}>
                <span className="sq" aria-hidden="true" />
                <span className="nm">임시글</span>
                <span className="n">{drafts}</span>
                <span />
              </button>
            </li>
          )}
        </ul>
      </div>
      {tags.length > 0 && (
        <div>
          <p className="sect-label">태그</p>
          <ul className="cats">
            {tags.map(([t, n]) => (
              <li key={t}>
                <button className={"cat" + (filter.tag === t ? " on" : "")} onClick={() => onFilter({ tag: filter.tag === t ? null : t, month: null })}>
                  <span className="hash" aria-hidden="true">
                    #
                  </span>
                  <span className="nm">{t}</span>
                  <span className="n">{n}</span>
                  <span />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {months.length > 0 && (
        <div>
          <p className="sect-label">달</p>
          <ul className="cats">
            {months.map(([k, n]) => (
              <li key={k}>
                <button className={"cat" + (filter.month === k ? " on" : "")} onClick={() => onFilter({ tag: null, month: filter.month === k ? null : k })}>
                  <span className="hash" aria-hidden="true">
                    ·
                  </span>
                  <span className="nm">{k.replace("-", ". ")}</span>
                  <span className="n">{n}</span>
                  <span />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

/* ── 글 목록 ── */
interface ListProps {
  profile: Profile;
  posts: Post[];
  filter: Filter;
  isOwner: boolean;
  unfold: ReactNode;
  onNew?: () => void;
  onImport?: () => void;
}
export function PostList({ profile, posts, filter, isOwner, unfold, onNew, onImport }: ListProps) {
  const list = useMemo(() => {
    let l = posts;
    if (filter.tag === "__draft") l = l.filter((p) => p.status === "draft");
    else {
      l = l.filter((p) => p.status === "public");
      if (filter.tag) l = l.filter((p) => p.tags.includes(filter.tag!));
      if (filter.month) l = l.filter((p) => monthKey(dateOf(p)) === filter.month);
    }
    return sortPosts(l);
  }, [posts, filter]);
  const heading = filter.tag === "__draft" ? "임시글" : filter.tag ? "#" + filter.tag : filter.month ? filter.month.replace("-", "년 ") + "월" : "글";

  return (
    <>
      <div className="toolbar">
        {unfold}
        <h1 className="h1">
          {heading}
          <span className="sub">{list.length}</span>
        </h1>
        <span className="spacer" />
        {isOwner && onImport && (
          <button className="btn quiet sm" onClick={onImport}>
            가져오기
          </button>
        )}
        {isOwner && onNew && (
          <button className="btn primary" onClick={onNew}>
            ＋ 새 글
          </button>
        )}
      </div>
      <div className="scroll">
        {list.length === 0 ? (
          <div className="empty">
            {isOwner ? (
              filter.tag === "__draft" ? (
                <p>임시글이 없어요.</p>
              ) : (
                <>
                  <p>아직 글이 없어요.</p>
                  <p>＋ 새 글을 눌러 첫 글을 써보세요. 공개하기 전까지는 나만 볼 수 있어요.</p>
                </>
              )
            ) : (
              <p>아직 공개된 글이 없어요.</p>
            )}
          </div>
        ) : (
          <ul className="posts">
            {list.map((p) => {
              const href = p.status === "public" ? postUrl(profile.handle, p.slug) : app(`/edit/${p.id}`);
              return (
                <li key={p.id} className="post-row">
                  <a className="post-link" href={href} onClick={onLinkClick}>
                    <span className="post-title">{p.title || "제목 없음"}</span>
                    <span className="post-meta">
                      <time dateTime={dateOf(p)}>{postDate(p)}</time>
                      {p.tags.map((t) => (
                        <span key={t} className="post-tag">
                          #{t}
                        </span>
                      ))}
                    </span>
                    {p.body && <span className="post-ex">{excerpt(p.body)}</span>}
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}

/* ── 글 보기 ── */
interface ViewProps {
  profile: Profile;
  post: Post;
  isOwner: boolean;
  unfold: ReactNode;
  onEdit?: () => void;
}
export function PostView({ profile, post, isOwner, unfold, onEdit }: ViewProps) {
  const { html, toc } = useMarkdown(post.body);
  const home = blogHome(profile.handle);
  // 글이 바뀌면 맨 위로. 주소에 #목차 가 있으면 거기로
  useEffect(() => {
    const id = decodeURIComponent(location.hash.slice(1));
    const el = id && document.getElementById(id);
    if (el) el.scrollIntoView();
    else window.scrollTo(0, 0);
  }, [post.id]);
  useEffect(() => {
    const prev = document.title;
    document.title = `${post.title || "제목 없음"} | ${profile.title}`;
    return () => {
      document.title = prev;
    };
  }, [post.title, profile.title]);

  return (
    <>
      <div className="toolbar">
        {unfold}
        <a className="crumb" href={home} onClick={onLinkClick}>
          ← {profile.title}
        </a>
        <span className="spacer" />
        {isOwner && onEdit && (
          <button className="btn sm" onClick={onEdit}>
            수정
          </button>
        )}
      </div>
      <div className="postwrap">
        <div className="post">
          <header className="post-head">
            <h1 className="post-h1">{post.title || "제목 없음"}</h1>
            <p className="post-meta">
              <time dateTime={dateOf(post)}>{fmtDate(dateOf(post))}</time>
              {post.tags.map((t) => (
                <a key={t} className="post-tag" href={home} onClick={(e) => {
                  onLinkClick(e);
                  go(home);
                }}>
                  #{t}
                </a>
              ))}
              {post.status === "draft" && <span className="post-tag draft">임시글</span>}
            </p>
          </header>
          <Markdown html={html} />
        </div>
        <Toc items={toc} />
      </div>
    </>
  );
}
