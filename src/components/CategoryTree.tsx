import type { Category, Post } from "../lib/types";
import { childrenOf, sortPosts, subtreeIds } from "../lib/types";
import { onLinkClick } from "../hooks/useRoute";
import { app, postUrl } from "../lib/paths";

interface Props {
  handle: string;
  categories: Category[];
  posts: Post[];
  /** 지금 고른 카테고리 (목록 필터). "__none" = 미분류 */
  selected: string | null;
  onSelect: (id: string | null) => void;
  /** 지금 보고 있는 글 (트리에서 진하게) */
  currentPostId?: string | null;
  isOwner: boolean;
}

/**
 * 왼쪽 사이드의 폴더 트리 — dev-wiki 사이드바 그대로:
 * 1단계 카테고리는 고정 헤더(접지 않음), 그 아래는 <details> 로 접히고(보는 글이 안에 있으면 펼쳐짐), 카테고리 밑에 글 목록.
 * 관리(추가·이름·순서·상위·삭제)는 /blog/categories 페이지에서 — 주인에겐 맨 아래 "카테고리 관리" 링크.
 */
export function CategoryTree({ handle, categories, posts, selected: selectedIn, onSelect, currentPostId, isOwner }: Props) {
  // "__x" = 태그·달 필터 중이라 트리엔 선택 표시 없음. "전체 보기"는 헤더의 블로그 제목이 맡음 (사이드바에 전체 줄 없음)
  const selected: string | null = selectedIn === "__x" ? null : selectedIn;

  const visible = (p: Post) => isOwner || p.status === "public";
  const uncategorized = posts.filter((p) => visible(p) && !p.categoryId).length;
  const currentPost = posts.find((p) => p.id === currentPostId);
  const openIds = new Set<string>();
  if (currentPost?.categoryId) {
    for (const c of categories) if (subtreeIds(categories, c.id).has(currentPost.categoryId)) openIds.add(c.id);
  }
  if (selected && selected !== "__none") for (const c of categories) if (subtreeIds(categories, c.id).has(selected)) openIds.add(c.id);

  const postRow = (p: Post) => (
    <li key={p.id} className="ct-post">
      <a
        className={"ct-link" + (p.id === currentPostId ? " on" : "") + (p.status === "draft" ? " draft" : "")}
        href={p.status === "public" ? postUrl(handle, p.slug) : app("/edit/" + p.id)}
        onClick={onLinkClick}
        title={p.title}
      >
        {p.title || "제목 없음"}
      </a>
    </li>
  );

  // 글 수는 안 보여줌 (사용자 요청). 숫자는 관리 페이지 표에만
  const nameRow = (c: Category) => (
    <button className={"ct-name" + (selected === c.id ? " on" : "")} onClick={() => onSelect(selected === c.id ? null : c.id)}>
      <span className="nm">{c.name}</span>
    </button>
  );

  const renderChildren = (parentId: string, depth: number) => {
    const kids = childrenOf(categories, parentId);
    const inside = sortPosts(posts.filter((p) => visible(p) && p.categoryId === parentId));
    if (!kids.length && !inside.length) return null;
    return (
      <ul className="ct-list">
        {kids.map((c) => (
          <li key={c.id} className="ct-cat">
            <details open={openIds.has(c.id) || undefined}>
              <summary className="ct-row">
                <span className="ct-chev" aria-hidden="true">
                  <svg viewBox="0 0 16 16"><path d="M5 3l5 5-5 5" /></svg>
                </span>
                {nameRow(c)}
              </summary>
              {renderChildren(c.id, depth + 1)}
            </details>
          </li>
        ))}
        {inside.map(postRow)}
      </ul>
    );
  };

  const tops = childrenOf(categories, null);
  return (
    <nav className="ctree" aria-label="카테고리">
      <ul className="ct-list top">
        {tops.map((c) => (
          <li key={c.id} className="ct-cat top">
            <div className="ct-row top">{nameRow(c)}</div>
            {renderChildren(c.id, 1)}
          </li>
        ))}
        {uncategorized > 0 && (
          <li className="ct-cat">
            <button className={"ct-name" + (selected === "__none" ? " on" : "")} onClick={() => onSelect(selected === "__none" ? null : "__none")}>
              <span className="nm">미분류</span>
            </button>
          </li>
        )}
        {isOwner && (
          <li>
            <a className="addcat" href={app("/categories")} onClick={onLinkClick}>
              카테고리 관리
            </a>
          </li>
        )}
      </ul>
    </nav>
  );
}
