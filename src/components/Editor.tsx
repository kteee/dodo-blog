import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent, type ReactNode } from "react";
import type { Category, Post, Profile } from "../lib/types";
import { LIMITS, childrenOf, utf8Bytes } from "../lib/types";
import type { Actions } from "../data/useBlog";
import { ACTIONS, handleEnter, handleTab, insertCodeBlock, insertTable, replaceRange, type ActionName, type Sel } from "../lib/editorOps";
import { Markdown, useMarkdown } from "./Markdown";
import { TablePanel } from "./TablePanel";
import { ConfirmDialog } from "./ConfirmDialog";
import { onLinkClick } from "../hooks/useRoute";
import { report } from "../lib/monitoring";
import { readMdFile } from "../lib/importMd";
import { blogHome, postUrl, showUrl } from "../lib/paths";

interface Props {
  profile: Profile;
  post: Post;
  categories: Category[];
  actions: Actions;
  /** 블로그 목록으로 */
  onBack: () => void;
}

/** 태그 칸 글자 → 태그 배열 (쉼표 구분, 앞의 # 제거, 중복 제거, 상한) */
function parseTags(s: string): string[] {
  const out: string[] = [];
  for (const raw of s.split(/[,，]/)) {
    const t = raw.trim().replace(/^#+/, "").trim().slice(0, LIMITS.tag);
    if (t && !out.includes(t)) out.push(t);
    if (out.length >= LIMITS.tags) break;
  }
  return out;
}

const I = (d: string) => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d={d} />
  </svg>
);
const ICONS: Partial<Record<ActionName | "image" | "table", ReactNode>> = {
  bold: I("M6 4h6a4 4 0 0 1 0 8H6V4zM6 12h7a4 4 0 0 1 0 8H6v-8z"),
  italic: I("M19 4h-9M14 20H5M15 4L9 20"),
  strike: I("M16 4H9a3 3 0 0 0 0 6h6a3 3 0 0 1 0 6H8M4 12h16"),
  task: I("M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"),
  indent: I("M3 8l4 4-4 4M11 6h10M11 12h10M11 18h10"),
  outdent: I("M7 8l-4 4 4 4M11 6h10M11 12h10M11 18h10"),
  link: I("M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"),
  image: I("M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5zM8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM21 15l-5-5L5 21"),
  code: I("M16 18l6-6-6-6M8 6l-6 6 6 6"),
};

/** 글 하나를 쓰는 화면: 제목 · 태그 · 툴바 · 본문(textarea) | 미리보기. 0.5초 멈추면 자동 저장 */
/** <select> 용: 트리를 들여쓴 한 줄 목록으로 */
function flatCats(cats: Category[], parentId: string | null = null, depth = 0): { c: Category; depth: number }[] {
  return childrenOf(cats, parentId).flatMap((c) => [{ c, depth }, ...flatCats(cats, c.id, depth + 1)]);
}

export function Editor({ profile, post, categories, actions, onBack }: Props) {
  const [title, setTitle] = useState(post.title);
  const [tagText, setTagText] = useState(post.tags.join(", "));
  const [body, setBody] = useState(post.body);
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [saved, setSaved] = useState<"idle" | "dirty" | "saved">("idle");
  const [menu, setMenu] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [slugEdit, setSlugEdit] = useState<string | null>(null);
  const [caret, setCaret] = useState(0);
  const [tableOpen, setTableOpen] = useState(false);
  const [grid, setGrid] = useState<{ r: number; c: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const ta = useRef<HTMLTextAreaElement>(null);
  const pendingSel = useRef<{ start: number; end: number } | null>(null);
  const dirty = useRef(false);
  const timer = useRef<number | null>(null);
  const latest = useRef({ title, tagText, body });
  latest.current = { title, tagText, body };
  const filePicker = useRef<HTMLInputElement>(null);
  const mdPicker = useRef<HTMLInputElement>(null);
  const [overwrite, setOverwrite] = useState<{ title: string; body: string; tags: string[] } | null>(null);

  // 다른 기기에서 바뀐 값: 내가 입력 중이 아닐 때만 반영
  useEffect(() => {
    if (dirty.current) return;
    setTitle(post.title);
    setTagText(post.tags.join(", "));
    setBody(post.body);
  }, [post.title, post.tags, post.body]);

  const flush = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (!dirty.current) return;
    dirty.current = false;
    actions.markDirty("post:" + post.id, false);
    const { title, tagText, body } = latest.current;
    if (utf8Bytes(body) > LIMITS.bodyBytes) {
      setErr("본문이 너무 길어요 (100KB 까지). 줄이기 전까지는 저장되지 않아요.");
      return;
    }
    setErr(null);
    actions.updatePost(post.id, { title: title.trim().slice(0, LIMITS.title), tags: parseTags(tagText), body });
    setSaved("saved");
  }, [actions, post.id]);
  const flushRef = useRef(flush);
  flushRef.current = flush;

  const touch = () => {
    dirty.current = true;
    setSaved("dirty");
    actions.markDirty("post:" + post.id, true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = window.setTimeout(() => flushRef.current(), 500);
  };
  useEffect(() => () => flushRef.current(), []);
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") flushRef.current();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
    };
  }, []);

  // 편집 동작 뒤 선택 범위 복원 (값은 state 로 바뀌므로 그 다음 프레임에)
  useLayoutEffect(() => {
    const s = pendingSel.current;
    if (!s || !ta.current) return;
    pendingSel.current = null;
    ta.current.setSelectionRange(s.start, s.end);
    if (document.activeElement !== ta.current) ta.current.focus({ preventScroll: true });
    setCaret(s.start);
  });

  const sel = (): Sel => {
    const el = ta.current;
    return { value: latest.current.body, start: el?.selectionStart ?? 0, end: el?.selectionEnd ?? 0 };
  };
  const apply = (fn: (s: Sel) => Sel) => {
    const el = ta.current;
    const top = el?.scrollTop ?? 0;
    const next = fn(sel());
    setBody(next.value);
    latest.current.body = next.value;
    pendingSel.current = { start: next.start, end: next.end };
    touch();
    if (el) requestAnimationFrame(() => (el.scrollTop = top));
  };
  const run = (name: ActionName) => apply(ACTIONS[name]);

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // 한글 조합 중엔 아무것도 가로채지 않음 (조합이 깨짐)
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.ctrlKey || e.metaKey) {
      const k = e.key.toLowerCase();
      if (k === "b") {
        e.preventDefault();
        run("bold");
      } else if (k === "i") {
        e.preventDefault();
        run("italic");
      }
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      const next = handleEnter(sel());
      if (next) {
        e.preventDefault();
        apply(() => next);
      }
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      apply((s) => handleTab(s, e.shiftKey));
    }
  };

  /* ── 이미지: 파일 선택 · 붙여넣기 · 드롭 → 올리고 ![이름](주소) 로 ── */
  const uploadImages = async (files: File[]) => {
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (!images.length) return;
    const marker = "![업로드 중…](uploading)";
    apply((s) => replaceRange(s, s.start, s.end, marker));
    const parts: string[] = [];
    for (const file of images) {
      try {
        const url = await actions.uploadImage(file);
        parts.push(`![${file.name.replace(/\.[^.]+$/, "")}](${url})`);
      } catch (e) {
        report(e, "upload");
        setErr(e instanceof Error ? e.message : "이미지를 올리지 못했어요");
      }
    }
    const text = parts.join("\n\n");
    const cur = latest.current.body;
    const idx = cur.indexOf(marker);
    if (idx === -1) return;
    apply(() => replaceRange({ value: cur, start: idx, end: idx }, idx, idx + marker.length, text, idx + text.length));
  };
  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = [...(e.clipboardData?.files ?? [])];
    if (files.some((f) => f.type.startsWith("image/"))) {
      e.preventDefault();
      uploadImages(files);
    }
  };
  const [dropping, setDropping] = useState(false);
  const onDrop = (e: DragEvent<HTMLTextAreaElement>) => {
    const files = [...(e.dataTransfer?.files ?? [])];
    setDropping(false);
    if (!files.some((f) => f.type.startsWith("image/"))) return;
    e.preventDefault();
    uploadImages(files);
  };

  /* ── 가져오기: .md 하나 → 이 글에 채움, 여러 개 → 각각 임시글 ── */
  const fill = (m: { title: string; body: string; tags: string[] }) => {
    setTitle(m.title);
    setTagText(m.tags.join(", "));
    setBody(m.body);
    latest.current = { title: m.title, tagText: m.tags.join(", "), body: m.body };
    touch();
  };
  const importMd = async (files: File[]) => {
    setErr(null);
    const read = (await Promise.all(files.map(readMdFile))).filter((x): x is NonNullable<typeof x> => !!x);
    const ok = read.filter((m) => !m.tooBig);
    if (!read.length) return setErr("마크다운(.md) 파일만 가져올 수 있어요.");
    if (!ok.length) return setErr("파일이 너무 커요 (본문 100KB 까지).");
    if (ok.length === 1) {
      const m = ok[0];
      const empty = !latest.current.title.trim() && !latest.current.body.trim();
      if (empty) fill(m);
      else setOverwrite(m);
      return;
    }
    const n = actions.importPosts(ok, false);
    setErr(null);
    setSaved("saved");
    alertImported(n, read.length - ok.length);
  };
  const [imported, setImported] = useState<string | null>(null);
  const alertImported = (n: number, skipped: number) => setImported(`${n}개를 임시글로 가져왔어요.` + (skipped ? ` ${skipped}개는 너무 커서 건너뜀.` : "") + " 블로그 목록에서 볼 수 있어요.");

  const { html } = useMarkdown(body);
  const isPublic = post.status === "public";
  const home = blogHome(profile.handle);
  const viewHref = postUrl(profile.handle, post.slug);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: PointerEvent) => {
      if (!(e.target as Element).closest?.(".ed-more")) setMenu(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [menu]);

  const publish = () => {
    flush();
    if (!latest.current.title.trim()) {
      setErr("제목을 적어야 공개할 수 있어요");
      return;
    }
    setErr(null);
    actions.publish(post.id);
  };

  const toolbar = (
    <div className="md-toolbar" role="toolbar" aria-label="서식">
      {(["h1", "h2", "h3"] as const).map((h) => (
        <button key={h} type="button" className="md-btn txt" title={"제목 " + h.slice(1)} onMouseDown={(e) => e.preventDefault()} onClick={() => run(h)}>
          {h.toUpperCase()}
        </button>
      ))}
      <span className="md-divider" />
      {(["bold", "italic", "strike"] as const).map((a) => (
        <button key={a} type="button" className="md-btn" title={{ bold: "굵게 (Ctrl+B)", italic: "기울임 (Ctrl+I)", strike: "취소선" }[a]} onMouseDown={(e) => e.preventDefault()} onClick={() => run(a)}>
          {ICONS[a]}
        </button>
      ))}
      <button type="button" className="md-btn txt mark" title="형광펜" onMouseDown={(e) => e.preventDefault()} onClick={() => run("highlight")}>
        형광
      </button>
      <span className="md-divider" />
      <button type="button" className="md-btn txt" title="글머리 기호" onMouseDown={(e) => e.preventDefault()} onClick={() => run("ul")}>
        •
      </button>
      <button type="button" className="md-btn txt" title="번호 목록" onMouseDown={(e) => e.preventDefault()} onClick={() => run("ol")}>
        1.
      </button>
      <button type="button" className="md-btn" title="체크리스트" onMouseDown={(e) => e.preventDefault()} onClick={() => run("task")}>
        {ICONS.task}
      </button>
      <button type="button" className="md-btn txt" title="인용" onMouseDown={(e) => e.preventDefault()} onClick={() => run("quote")}>
        “
      </button>
      <button type="button" className="md-btn" title="들여쓰기 (Tab)" onMouseDown={(e) => e.preventDefault()} onClick={() => run("indent")}>
        {ICONS.indent}
      </button>
      <button type="button" className="md-btn" title="내어쓰기 (Shift+Tab)" onMouseDown={(e) => e.preventDefault()} onClick={() => run("outdent")}>
        {ICONS.outdent}
      </button>
      <span className="md-divider" />
      <button type="button" className="md-btn" title="링크" onMouseDown={(e) => e.preventDefault()} onClick={() => run("link")}>
        {ICONS.link}
      </button>
      <button type="button" className="md-btn" title="이미지 올리기 (붙여넣기·드래그도 돼요)" onMouseDown={(e) => e.preventDefault()} onClick={() => filePicker.current?.click()}>
        {ICONS.image}
      </button>
      <span className="md-table-wrap">
        <button type="button" className="md-btn txt" title="표" aria-expanded={!!grid} onMouseDown={(e) => e.preventDefault()} onClick={() => setGrid(grid ? null : { r: 2, c: 2 })}>
          ▦
        </button>
        {grid && (
          <div className="md-grid-picker" onMouseDown={(e) => e.preventDefault()}>
            <div className="md-grid" onMouseLeave={() => setGrid({ r: 2, c: 2 })}>
              {Array.from({ length: 6 }, (_, r) =>
                Array.from({ length: 8 }, (_, c) => (
                  <span
                    key={`${r}-${c}`}
                    className={"md-grid-cell" + (r < grid.r && c < grid.c ? " on" : "")}
                    onMouseEnter={() => setGrid({ r: r + 1, c: c + 1 })}
                    onClick={() => {
                      const g = { r: r + 1, c: c + 1 };
                      setGrid(null);
                      apply((s) => insertTable(s, g.r, g.c));
                      setTableOpen(true);
                    }}
                  />
                )),
              )}
            </div>
            <div className="md-grid-label">
              {grid.c} × {grid.r} (열 × 행)
            </div>
          </div>
        )}
      </span>
      <span className="md-divider" />
      <button type="button" className="md-btn" title="인라인 코드" onMouseDown={(e) => e.preventDefault()} onClick={() => run("code")}>
        {ICONS.code}
      </button>
      <select
        className="md-select"
        title="코드 블록"
        value=""
        onMouseDown={(e) => e.stopPropagation()}
        onChange={(e) => {
          const lang = e.target.value;
          if (lang === "") return;
          apply((s) => insertCodeBlock(s, lang === "plain" ? "" : lang));
        }}
      >
        <option value="">코드 블록</option>
        {["js", "ts", "jsx", "tsx", "html", "css", "python", "java", "csharp", "sql", "json", "bash", "plain"].map((l) => (
          <option key={l} value={l}>
            {{ js: "JavaScript", ts: "TypeScript", jsx: "JSX", tsx: "TSX", html: "HTML", css: "CSS", python: "Python", java: "Java", csharp: "C#", sql: "SQL", json: "JSON", bash: "Bash", plain: "일반 텍스트" }[l]}
          </option>
        ))}
      </select>
      <button type="button" className="md-btn txt" title="구분선" onMouseDown={(e) => e.preventDefault()} onClick={() => run("hr")}>
        ―
      </button>
      <button type="button" className="md-btn txt" title="접이식 영역" onMouseDown={(e) => e.preventDefault()} onClick={() => run("details")}>
        ▸
      </button>
    </div>
  );

  // dev-wiki 처럼 작성 | 미리보기 탭 (좌우 분할 없음)
  const showWrite = tab === "write";
  const showPreview = tab === "preview";

  return (
    <div className="editor">
      <div className="toolbar ed-top">
        <a className="crumb" href={home} onClick={(e) => {
          e.preventDefault();
          flush();
          onBack();
        }}>
          ← {profile.title}
        </a>
        <span className="spacer" />
        <button className="wbtn" title="마크다운(.md) 파일에서 가져오기" onClick={() => mdPicker.current?.click()}>
          가져오기
        </button>
        <span className={"ed-saved " + saved} aria-live="polite">
          {saved === "dirty" ? "저장 중…" : saved === "saved" ? "저장됨" : ""}
        </span>
        <span className={"pill" + (isPublic ? " pub" : "")}>{isPublic ? "공개" : "임시글"}</span>
        {isPublic ? (
          <>
            <a className="btn sm" href={viewHref} onClick={onLinkClick}>
              보기
            </a>
            <button className="btn sm" onClick={() => actions.unpublish(post.id)}>
              비공개로
            </button>
          </>
        ) : (
          <button className="btn primary sm" onClick={publish}>
            공개하기
          </button>
        )}
        <span className="ed-more">
          <button className="btn quiet sm" aria-label="더 보기" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
            ⋯
          </button>
          {menu && (
            <div className="minipop">
              <button
                className="minirow"
                onClick={() => {
                  setMenu(false);
                  setSlugEdit(post.slug);
                }}
              >
                주소 바꾸기
              </button>
              <button
                className="minirow danger"
                onClick={() => {
                  setMenu(false);
                  setConfirmDel(true);
                }}
              >
                글 삭제
              </button>
            </div>
          )}
        </span>
      </div>

      {slugEdit !== null && (
        <form
          className="ed-slug"
          onSubmit={(e) => {
            e.preventDefault();
            actions.setSlug(post.id, slugEdit);
            setSlugEdit(null);
          }}
        >
          <span className="mk-pre">
            {showUrl(profile.handle)}/
          </span>
          <input className="mk-in" type="text" value={slugEdit} maxLength={LIMITS.slug} autoFocus placeholder="비우면 제목으로" onChange={(e) => setSlugEdit(e.target.value)} />
          <button type="submit" className="btn sm">
            바꾸기
          </button>
          <button type="button" className="btn quiet sm" onClick={() => setSlugEdit(null)}>
            취소
          </button>
        </form>
      )}

      <input
        className="ed-title"
        type="text"
        value={title}
        maxLength={LIMITS.title}
        placeholder="제목"
        onChange={(e) => {
          setTitle(e.target.value);
          touch();
        }}
      />
      <div className="ed-meta">
        {/* 카테고리: dev-wiki 의 "경로" 칸 — 바로 저장 */}
        <select className="ed-cat" value={post.categoryId ?? ""} aria-label="카테고리" onChange={(e) => actions.updatePost(post.id, { categoryId: e.target.value || null })}>
          <option value="">미분류</option>
          {flatCats(categories).map(({ c, depth }) => (
            <option key={c.id} value={c.id}>
              {"\u00a0\u00a0".repeat(depth) + (depth ? "└ " : "") + c.name}
            </option>
          ))}
        </select>
        <input
          className="ed-tags"
          type="text"
          value={tagText}
          placeholder="태그 (쉼표로 구분)"
          onChange={(e) => {
            setTagText(e.target.value);
            touch();
          }}
          onBlur={() => setTagText(parseTags(tagText).join(", "))}
        />
      </div>

      {(
        <div className="ed-tabs" role="tablist">
          <button role="tab" aria-selected={tab === "write"} onClick={() => setTab("write")}>
            작성
          </button>
          <button role="tab" aria-selected={tab === "preview"} onClick={() => setTab("preview")}>
            미리보기
          </button>
        </div>
      )}
      {showWrite && toolbar}
      {showWrite && tableOpen && (
        <TablePanel
          value={body}
          caret={caret}
          onWrite={(start, end, text) => {
            const value = latest.current.body.slice(0, start) + text + latest.current.body.slice(end);
            setBody(value);
            latest.current.body = value;
            touch();
          }}
          onLeave={() => ta.current?.focus()}
        />
      )}
      <div className="ed-split">
        {showWrite && (
          <textarea
            ref={ta}
            className={"ed-body" + (dropping ? " drop" : "")}
            value={body}
            placeholder="마크다운으로 써요. 이미지는 붙여넣거나 끌어다 놓으면 올라가요."
            spellCheck={false}
            onChange={(e) => {
              setBody(e.target.value);
              touch();
            }}
            onKeyDown={onKeyDown}
            onKeyUp={(e) => {
              setCaret(e.currentTarget.selectionStart);
              setTableOpen(true);
            }}
            onClick={(e) => {
              setCaret(e.currentTarget.selectionStart);
              setTableOpen(true);
            }}
            onPaste={onPaste}
            onDragOver={(e) => {
              if ([...e.dataTransfer.types].includes("Files")) {
                e.preventDefault();
                setDropping(true);
              }
            }}
            onDragLeave={() => setDropping(false)}
            onDrop={onDrop}
          />
        )}
        {showPreview && (
          <div className="ed-preview">
            {body.trim() ? <Markdown html={html} /> : <p className="ed-preview-empty">미리보기</p>}
          </div>
        )}
      </div>
      {err && <p className="ed-err">{err}</p>}
      {imported && (
        <p className="ed-note">
          {imported}{" "}
          <button className="linkbtn" onClick={() => setImported(null)}>
            닫기
          </button>
        </p>
      )}
      <input
        ref={mdPicker}
        type="file"
        accept=".md,.markdown,.txt"
        multiple
        hidden
        onChange={(e) => {
          importMd([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
      {overwrite && (
        <ConfirmDialog
          title="지금 쓴 내용을 바꿀까요?"
          body={`'${overwrite.title}' 파일의 제목·본문·태그로 이 글을 채워요. 지금 쓴 내용은 사라져요.`}
          confirmLabel="바꾸기"
          onConfirm={() => {
            fill(overwrite);
            setOverwrite(null);
          }}
          onCancel={() => setOverwrite(null)}
        />
      )}
      <input
        ref={filePicker}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          uploadImages([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
      {confirmDel && (
        <ConfirmDialog
          title="이 글을 삭제할까요?"
          body="삭제한 글은 30일 안에 되돌릴 수 있어요 (삭제 직후 뜨는 '실행 취소')."
          confirmLabel="삭제"
          onConfirm={() => {
            setConfirmDel(false);
            dirty.current = false;
            actions.markDirty("post:" + post.id, false);
            actions.deletePost(post.id);
            onBack();
          }}
          onCancel={() => setConfirmDel(false)}
        />
      )}
    </div>
  );
}
