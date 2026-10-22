import { useState } from "react";
import type { Category, Post, Profile } from "../lib/types";
import { LIMITS, MAX_DEPTH, childrenOf, depthOf, subtreeIds } from "../lib/types";
import { onLinkClick } from "../hooks/useRoute";
import { blogHome } from "../lib/paths";
import { ConfirmDialog } from "./ConfirmDialog";

export interface CategoryActions {
  add: (name: string, parentId: string | null, order?: number) => string;
  update: (id: string, patch: Partial<Pick<Category, "name" | "order" | "parentId">>) => string | null;
  remove: (id: string) => void;
}

interface Props {
  profile: Profile;
  categories: Category[];
  posts: Post[];
  actions: CategoryActions;
}

/** 트리를 깊이 순서대로 한 줄 목록으로 (dev-wiki collectCategories) */
function flatten(cats: Category[], parentId: string | null = null, depth = 0): { c: Category; depth: number }[] {
  return childrenOf(cats, parentId).flatMap((c) => [{ c, depth }, ...flatten(cats, c.id, depth + 1)]);
}

/**
 * 카테고리 관리 페이지 (/blog/categories) — dev-wiki 의 /categories 와 같은 표:
 * 이름 · 순서 · 상위 · 글 수 · 저장/삭제, 아래에 "새 카테고리". 순서는 숫자가 작을수록 위.
 */
export function CategoriesPage({ profile, categories, posts, actions }: Props) {
  const rows = flatten(categories);
  const [confirmDel, setConfirmDel] = useState<Category | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newOrder, setNewOrder] = useState("");
  const [newParent, setNewParent] = useState("");

  const countIn = (id: string) => {
    const ids = subtreeIds(categories, id);
    return posts.filter((p) => p.categoryId && ids.has(p.categoryId)).length;
  };
  /** 이 카테고리의 상위로 고를 수 있는 것: 자기 자신·자기 아래는 제외, 깊이 상한 안 */
  const parentOptions = (self: Category | null) => {
    const banned = self ? subtreeIds(categories, self.id) : new Set<string>();
    const myDepth = self ? 1 + Math.max(0, ...[...subtreeIds(categories, self.id)].map((id) => depthOf(categories, id) - depthOf(categories, self.id))) : 1;
    return rows.filter(({ c, depth }) => !banned.has(c.id) && depth + 1 + myDepth <= MAX_DEPTH);
  };

  const create = () => {
    setError(null);
    if (!newName.trim()) return setError("이름을 입력하세요.");
    const order = newOrder.trim() === "" ? undefined : Number(newOrder);
    if (order !== undefined && Number.isNaN(order)) return setError("순서는 숫자로 적어주세요.");
    actions.add(newName, newParent || null, order);
    setNewName("");
    setNewOrder("");
    setNewParent("");
  };

  return (
    <main className="mypage catman">
      <a className="mypage-back" href={blogHome(profile.handle)} onClick={onLinkClick}>
        ← 블로그로 돌아가기
      </a>
      <h1>카테고리 관리</h1>

      <table className="cat-table">
        <thead>
          <tr>
            <th>이름</th>
            <th className="col-order">순서</th>
            <th>상위</th>
            <th className="col-count">글</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={5} className="cat-empty">
                카테고리가 없습니다.
              </td>
            </tr>
          ) : (
            rows.map(({ c, depth }) => (
              <Row key={c.id} c={c} depth={depth} count={countIn(c.id)} parents={parentOptions(c)} actions={actions} onDelete={() => setConfirmDel(c)} onError={setError} />
            ))
          )}
        </tbody>
      </table>

      <h2 className="cat-subhead">새 카테고리</h2>
      <div className="cat-new">
        <input type="text" value={newName} maxLength={LIMITS.category} placeholder="이름 (예: 네트워크)" onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} />
        <input type="number" value={newOrder} placeholder="순서" onChange={(e) => setNewOrder(e.target.value)} />
        <select value={newParent} onChange={(e) => setNewParent(e.target.value)} aria-label="상위 카테고리">
          <option value="">최상위</option>
          {parentOptions(null).map(({ c, depth }) => (
            <option key={c.id} value={c.id}>
              {"— ".repeat(depth) + c.name}
            </option>
          ))}
        </select>
        <button type="button" className="btn primary" onClick={create}>
          추가
        </button>
      </div>
      {error && <p className="mypage-error">{error}</p>}
      <p className="cat-hint">순서는 숫자가 작을수록 위에 표시됩니다. 같은 숫자면 이름순. 이름·순서·상위를 고치면 바로 저장돼요. 최대 {MAX_DEPTH}단계.</p>

      {confirmDel && (
        <ConfirmDialog
          title={`'${confirmDel.name}' 카테고리를 삭제할까요?`}
          body="안의 글은 미분류로, 하위 카테고리는 한 단계 위로 옮겨져요. 글은 지워지지 않아요."
          confirmLabel="삭제"
          onConfirm={() => {
            actions.remove(confirmDel.id);
            setConfirmDel(null);
          }}
          onCancel={() => setConfirmDel(null)}
        />
      )}
    </main>
  );
}

function Row({ c, depth, count, parents, actions, onDelete, onError }: { c: Category; depth: number; count: number; parents: { c: Category; depth: number }[]; actions: CategoryActions; onDelete: () => void; onError: (m: string | null) => void }) {
  const [name, setName] = useState(c.name);
  const [order, setOrder] = useState(String(c.order));
  const saveName = () => {
    const n = name.trim();
    if (!n) return setName(c.name);
    if (n !== c.name) onError(actions.update(c.id, { name: n }));
  };
  const saveOrder = () => {
    const v = Number(order);
    if (order.trim() === "" || Number.isNaN(v)) return setOrder(String(c.order));
    if (v !== c.order) onError(actions.update(c.id, { order: v }));
  };
  return (
    <tr className="cat-row">
      <td className="cat-name">
        <span className="cat-indent" style={{ width: depth * 16 }} />
        <input type="text" className="cat-title" value={name} maxLength={LIMITS.category} onChange={(e) => setName(e.target.value)} onBlur={saveName} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
      </td>
      <td>
        <input type="number" className="cat-order" value={order} onChange={(e) => setOrder(e.target.value)} onBlur={saveOrder} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
      </td>
      <td>
        <select className="cat-parent" value={c.parentId ?? ""} aria-label="상위 카테고리" onChange={(e) => onError(actions.update(c.id, { parentId: e.target.value || null }))}>
          <option value="">최상위</option>
          {parents.map(({ c: p, depth: d }) => (
            <option key={p.id} value={p.id}>
              {"— ".repeat(d) + p.name}
            </option>
          ))}
        </select>
      </td>
      <td className="cat-count">{count}</td>
      <td className="cat-actions">
        <button type="button" className="btn sm quiet danger" onClick={onDelete}>
          삭제
        </button>
      </td>
    </tr>
  );
}
