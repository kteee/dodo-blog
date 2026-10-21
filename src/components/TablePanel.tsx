import { useEffect, useRef, useState } from "react";
import { serializeTable, tableAt, type TableModel } from "../lib/editorOps";

interface Props {
  value: string;
  caret: number;
  /** 표 범위를 새 마크다운으로 바꿈 */
  onWrite: (start: number, end: number, text: string) => void;
  /** 표에서 나가기 (Esc) — 본문 textarea 로 포커스 */
  onLeave: () => void;
}

/**
 * 비주얼 표 편집기 (dev-wiki 의 것을 React 로). 캐럿이 놓인 마크다운 표를 격자로 보여주고,
 * 셀에 치는 대로 파이프 문법을 본문에 다시 써 넣는다. 셀 글자는 React 가 건드리지 않게(캐럿 유지) 구조가 바뀔 때만 다시 그림.
 */
export function TablePanel({ value, caret, onWrite, onLeave }: Props) {
  const vt = useRef<TableModel | null>(null);
  const [version, setVersion] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const editing = useRef(false);

  // 본문·캐럿이 바뀌면 표를 다시 읽음 — 단, 격자 안에서 치는 중이면 패널이 상태의 주인
  useEffect(() => {
    if (editing.current) return;
    const t = tableAt(value, caret);
    const prev = vt.current;
    vt.current = t;
    if (!t || !prev || t.start !== prev.start || serializeTable(t) !== serializeTable(prev)) setVersion((v) => v + 1);
  }, [value, caret]);

  const write = () => {
    const m = vt.current;
    if (!m) return;
    const text = serializeTable(m);
    onWrite(m.start, m.end, text);
    m.end = m.start + text.length;
  };
  const rerender = () => {
    write();
    setVersion((v) => v + 1);
  };
  const focusCell = (r: number, c: number) => {
    requestAnimationFrame(() => {
      const el = box.current?.querySelector<HTMLElement>(`[data-r="${r}"][data-c="${c}"]`);
      if (!el) return;
      el.focus();
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    });
  };

  const m = vt.current;
  if (!m) return null;
  const cols = m.header.length;

  const cell = (r: number, c: number) => (
    <Cell key={`${version}-${r}-${c}`} r={r} c={c} text={r === -1 ? m.header[c] : m.body[r][c]} align={m.aligns[c]} />
  );

  return (
    <div
      className="vt-panel"
      ref={box}
      onFocus={() => (editing.current = true)}
      onBlur={(e) => {
        if (!box.current?.contains(e.relatedTarget as Node)) editing.current = false;
      }}
      onInput={(e) => {
        const el = (e.target as HTMLElement).closest<HTMLElement>(".vt-cell");
        if (!el || !vt.current) return;
        const r = Number(el.dataset.r);
        const c = Number(el.dataset.c);
        const text = el.textContent ?? "";
        if (r === -1) vt.current.header[c] = text;
        else vt.current.body[r][c] = text;
        write();
      }}
      onKeyDown={(e) => {
        const el = (e.target as HTMLElement).closest<HTMLElement>(".vt-cell");
        if (!el || !vt.current) return;
        if (e.nativeEvent.isComposing) return;
        const r = Number(el.dataset.r);
        const c = Number(el.dataset.c);
        if (e.key === "Tab") {
          e.preventDefault();
          let nr = r;
          let nc = c + (e.shiftKey ? -1 : 1);
          if (nc >= cols) {
            nc = 0;
            nr = r + 1;
            if (nr >= vt.current.body.length) {
              vt.current.body.push(Array(cols).fill(""));
              rerender();
            }
          } else if (nc < 0) {
            nc = cols - 1;
            nr = r - 1;
            if (nr < -1) return;
          }
          focusCell(nr, nc);
        } else if (e.key === "Enter") {
          e.preventDefault();
          if (r + 1 >= vt.current.body.length) {
            vt.current.body.push(Array(cols).fill(""));
            rerender();
          }
          focusCell(r + 1, c);
        } else if (e.key === "Escape") {
          e.preventDefault();
          editing.current = false;
          onLeave();
        }
      }}
    >
      <div className="vt-head">
        <span className="vt-title">표 편집</span>
        <span className="vt-hint">셀을 눌러 입력 · Tab 다음 칸 · Enter 아래 칸 · Esc 본문으로</span>
      </div>
      <div className="vt-scroll">
        <table className="vt">
          <tbody>
            <tr className="vt-ctl-row">
              <td className="vt-corner" />
              {m.aligns.map((a, c) => (
                <td key={c} className="vt-colctl">
                  <button
                    type="button"
                    className="vt-mini"
                    title="정렬 바꾸기"
                    onClick={() => {
                      const cycle = ["", "center", "right"] as const;
                      m.aligns[c] = cycle[(cycle.indexOf(a as (typeof cycle)[number]) + 1) % cycle.length];
                      rerender();
                    }}
                  >
                    {a === "center" ? "⇔" : a === "right" ? "⇥" : "⇤"}
                  </button>
                  <button
                    type="button"
                    className="vt-mini vt-del"
                    title="이 열 삭제"
                    onClick={() => {
                      if (cols <= 1) return;
                      m.header.splice(c, 1);
                      m.aligns.splice(c, 1);
                      m.body.forEach((row) => row.splice(c, 1));
                      rerender();
                    }}
                  >
                    ×
                  </button>
                </td>
              ))}
              <td className="vt-addcol-cell" rowSpan={m.body.length + 2}>
                <button
                  type="button"
                  className="vt-add"
                  title="열 추가"
                  onClick={() => {
                    m.header.push("");
                    m.aligns.push("");
                    m.body.forEach((row) => row.push(""));
                    rerender();
                  }}
                >
                  +
                </button>
              </td>
            </tr>
            <tr>
              <td className="vt-rowctl" />
              {m.header.map((_, c) => cell(-1, c))}
            </tr>
            {m.body.map((row, r) => (
              <tr key={`${version}-${r}`}>
                <td className="vt-rowctl">
                  <button
                    type="button"
                    className="vt-mini vt-del"
                    title="이 행 삭제"
                    onClick={() => {
                      if (m.body.length <= 1) m.body = [Array(cols).fill("")];
                      else m.body.splice(r, 1);
                      rerender();
                    }}
                  >
                    ×
                  </button>
                </td>
                {row.map((_, c) => cell(r, c))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        className="vt-addrow"
        onClick={() => {
          m.body.push(Array(cols).fill(""));
          rerender();
          focusCell(m.body.length - 1, 0);
        }}
      >
        + 행 추가
      </button>
    </div>
  );
}

/** 셀 글자는 처음 그릴 때만 넣음 — 이후 입력은 브라우저가 맡고 React 는 안 건드림 (캐럿이 튀지 않게) */
function Cell({ r, c, text, align }: { r: number; c: number; text: string; align: string }) {
  const ref = useRef<HTMLTableCellElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.textContent = text;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const Tag = r === -1 ? "th" : "td";
  return (
    <Tag
      ref={ref as never}
      className="vt-cell"
      contentEditable
      suppressContentEditableWarning
      data-r={r}
      data-c={c}
      data-placeholder={r === -1 ? "제목" : undefined}
      style={align ? { textAlign: align as "left" | "center" | "right" } : undefined}
    />
  );
}
