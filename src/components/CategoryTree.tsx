import { useEffect, useRef, useState } from "react";
import type { Category, Post } from "../lib/types";
import { LIMITS, MAX_DEPTH, childrenOf, depthOf, sortPosts, subtreeIds } from "../lib/types";
import { onLinkClick } from "../hooks/useRoute";
import { app, postUrl } from "../lib/paths";
import { ConfirmDialog } from "./ConfirmDialog";

export interface TreeActions {
  add: (name: string, parentId: string | null) => string;
  rename: (id: string, name: string) => void;
  move: (id: string, dir: -1 | 1) => void;
  remove: (id: string) => void;
}

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
  actions?: TreeActions;
}

/**
 * 왼쪽 사이드의 폴더 트리 — dev-wiki 사이드바 그대로:
 * 1단계 카테고리는 고정 헤더(접지 않음), 그 아래는 <details> 로 접히고(보는 글이 안에 있으면 펼쳐짐), 카테고리 밑에 글 목록.
 * 주인은 각 줄의 ⋯ 로 이름 바꾸기·하위 추가·위/아래·삭제, 맨 아래 "＋ 카테고리".
 */
export function CategoryTree({ handle, categories, posts, selected: selectedIn, onSelect, currentPostId, isOwner, actions }: Props) {
  // "__x" = 태그·달 필터 중이라 트리엔 선택 표시 없음 ("전체" 도 아님)
  const noneSelected = selectedIn === "__x";
  let selected: string | null = noneSelected ? null : selectedIn;
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [adding, setAdding] = useState<{ parentId: string | null } | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<Category | null>(null);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: PointerEvent) => {
      if (!(e.target as Element).closest?.(".ct-menu")) setMenu(null);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [menu]);

  const visible = (p: Post) => isOwner || p.status === "public";
  const countIn = (id: string) => {
    const ids = subtreeIds(categories, id);
    return posts.filter((p) => visible(p) && p.categoryId && ids.has(p.categoryId)).length;
  };
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

  const menuFor = (c: Category) =>
    isOwner && actions ? (
      <span className="ct-menu">
        <button
          className="ct-more"
          aria-label={c.name + " 관리"}
          aria-expanded={menu === c.id}
          onClick={(e) => {
            e.stopPropagation();
            setMenu(menu === c.id ? null : c.id);
          }}
        >
          ⋯
        </button>
        {menu === c.id && (
          <div className="minipop">
            <button className="minirow" onClick={() => { setMenu(null); setEditing({ id: c.id, name: c.name }); }}>이름 바꾸기</button>
            {depthOf(categories, c.id) < MAX_DEPTH && (
              <button className="minirow" onClick={() => { setMenu(null); setAdding({ parentId: c.id }); }}>하위 카테고리 추가</button>
            )}
            <button className="minirow" onClick={() => { setMenu(null); actions.move(c.id, -1); }}>위로</button>
            <button className="minirow" onClick={() => { setMenu(null); actions.move(c.id, 1); }}>아래로</button>
            <button className="minirow danger" onClick={() => { setMenu(null); setConfirmDel(c); }}>삭제</button>
          </div>
        )}
      </span>
    ) : null;

  const nameRow = (c: Category, depth: number) => {
    if (editing?.id === c.id) {
      return (
        <form
          className="ct-form"
          onSubmit={(e) => {
            e.preventDefault();
            actions?.rename(c.id, editing.name);
            setEditing(null);
          }}
        >
          <input autoFocus value={editing.name} maxLength={LIMITS.category} onChange={(e) => setEditing({ id: c.id, name: e.target.value })} onBlur={() => { actions?.rename(c.id, editing.name); setEditing(null); }} onKeyDown={(e) => e.key === "Escape" && setEditing(null)} />
        </form>
      );
    }
    const n = countIn(c.id);
    return (
      <>
        <button className={"ct-name" + (selected === c.id ? " on" : "")} onClick={() => onSelect(selected === c.id ? null : c.id)}>
          <span className="nm">{c.name}</span>
          <span className="n">{n}</span>
        </button>
        {depth > 0 && menuFor(c)}
      </>
    );
  };

  const addForm = (parentId: string | null) =>
    adding && adding.parentId === parentId ? (
      <li className="ct-addform">
        <AddForm
          onDone={(name) => {
            if (name.trim()) actions?.add(name, parentId);
            setAdding(null);
          }}
        />
      </li>
    ) : null;

  const renderChildren = (parentId: string, depth: number) => {
    const kids = childrenOf(categories, parentId);
    const inside = sortPosts(posts.filter((p) => visible(p) && p.categoryId === parentId));
    if (!kids.length && !inside.length && adding?.parentId !== parentId) return null;
    return (
      <ul className="ct-list">
        {kids.map((c) => (
          <li key={c.id} className="ct-cat">
            <details open={openIds.has(c.id) || undefined}>
              <summary className="ct-row">
                <span className="ct-chev" aria-hidden="true">
                  <svg viewBox="0 0 16 16"><path d="M5 3l5 5-5 5" /></svg>
                </span>
                {nameRow(c, depth)}
              </summary>
              {renderChildren(c.id, depth + 1)}
            </details>
          </li>
        ))}
        {addForm(parentId)}
        {inside.map(postRow)}
      </ul>
    );
  };

  const tops = childrenOf(categories, null);
  return (
    <nav className="ctree" aria-label="카테고리">
      <ul className="ct-list top">
        <li className="ct-cat">
          <button className={"ct-name all" + (selected === null && !noneSelected ? " on" : "")} onClick={() => onSelect(null)}>
            <span className="nm">전체</span>
            <span className="n">{posts.filter(visible).length}</span>
          </button>
        </li>
        {tops.map((c) => (
          <li key={c.id} className="ct-cat top">
            <div className="ct-row top">
              {nameRow(c, 0)}
              {menuFor(c)}
            </div>
            {renderChildren(c.id, 1)}
          </li>
        ))}
        {uncategorized > 0 && (
          <li className="ct-cat">
            <button className={"ct-name" + (selected === "__none" ? " on" : "")} onClick={() => onSelect(selected === "__none" ? null : "__none")}>
              <span className="nm">미분류</span>
              <span className="n">{uncategorized}</span>
            </button>
          </li>
        )}
        {addForm(null)}
        {isOwner && actions && !adding && (
          <li>
            <button className="addcat" onClick={() => setAdding({ parentId: null })}>
              ＋ 카테고리
            </button>
          </li>
        )}
      </ul>
      {confirmDel && (
        <ConfirmDialog
          title={`'${confirmDel.name}' 카테고리를 삭제할까요?`}
          body="안의 글은 미분류로, 하위 카테고리는 한 단계 위로 옮겨져요. 글은 지워지지 않아요."
          confirmLabel="삭제"
          onConfirm={() => {
            actions?.remove(confirmDel.id);
            setConfirmDel(null);
          }}
          onCancel={() => setConfirmDel(null)}
        />
      )}
    </nav>
  );
}

function AddForm({ onDone }: { onDone: (name: string) => void }) {
  const [name, setName] = useState("");
  const done = useRef(false);
  const finish = (v: string) => {
    if (done.current) return;
    done.current = true;
    onDone(v);
  };
  return (
    <form
      className="ct-form"
      onSubmit={(e) => {
        e.preventDefault();
        finish(name);
      }}
    >
      <input autoFocus value={name} maxLength={LIMITS.category} placeholder="카테고리 이름" onChange={(e) => setName(e.target.value)} onBlur={() => finish(name)} onKeyDown={(e) => e.key === "Escape" && finish("")} />
    </form>
  );
}
