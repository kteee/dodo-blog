/**
 * 마크다운 편집 동작 — dev-wiki editor.js 를 순수 함수로 옮긴 것.
 * 모두 { value, start, end } 를 받아 새 { value, start, end } 를 돌려준다 (DOM 은 안 건드림).
 */
export interface Sel {
  value: string;
  start: number;
  end: number;
}

export function wrapSelection(s: Sel, before: string, after: string, placeholder: string): Sel {
  const selected = s.value.slice(s.start, s.end) || placeholder;
  const value = s.value.slice(0, s.start) + before + selected + after + s.value.slice(s.end);
  return { value, start: s.start + before.length, end: s.start + before.length + selected.length };
}

function lineBounds(value: string, start: number, end: number) {
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  let lineEnd = value.indexOf("\n", end);
  if (lineEnd === -1) lineEnd = value.length;
  return { lineStart, lineEnd };
}

export function mapLines(s: Sel, fn: (line: string) => string): Sel {
  const { lineStart, lineEnd } = lineBounds(s.value, s.start, s.end);
  const oldLines = s.value.slice(lineStart, lineEnd).split("\n");
  const newLines = oldLines.map(fn);
  const newBlock = newLines.join("\n");
  const value = s.value.slice(0, lineStart) + newBlock + s.value.slice(lineEnd);

  // 선택이 있으면 블록 전체를 선택한 채로. 캐럿뿐이면 캐럿만 — 선택해 두면 다음 글자가 방금 넣은 마커를 지워버림
  if (s.start !== s.end) return { value, start: lineStart, end: lineStart + newBlock.length };

  let cursor = lineStart;
  for (let i = 0; i < oldLines.length; i++) {
    if (s.start <= cursor + oldLines[i].length) {
      const offset = s.start - cursor + (newLines[i].length - oldLines[i].length);
      const clamped = Math.max(0, Math.min(offset, newLines[i].length));
      const newLineStart = lineStart + newLines.slice(0, i).reduce((n, l) => n + l.length + 1, 0);
      return { value, start: newLineStart + clamped, end: newLineStart + clamped };
    }
    cursor += oldLines[i].length + 1;
  }
  return { value, start: lineStart + newBlock.length, end: lineStart + newBlock.length };
}

// 줄 앞의 블록 마커(제목/목록/인용) — 다른 마커를 덮어써서 "## - 항목" 처럼 겹치지 않게
const BLOCK_MARKER = /^(\s*)(#{1,6}\s+|[-*+]\s+\[[ xX]\]\s+|[-*+]\s+|\d+[.)]\s+|>\s?)?/;

/** 그 줄에 이미 이 마커가 있는지 — 같은 버튼을 두 번 누르면 빼기 위해 */
function markerTest(prefix: string): (l: string) => boolean {
  const heading = prefix.match(/^(#{1,6}) $/);
  if (heading) return (l) => new RegExp(`^\\s*#{${heading[1].length}}\\s+`).test(l);
  if (prefix === "> ") return (l) => /^\s*>\s?/.test(l);
  if (prefix === "- [ ] ") return (l) => /^\s*[-*+]\s+\[[ xX]\]\s+/.test(l);
  if (prefix === "- ") return (l) => /^\s*[-*+]\s+(?!\[[ xX]\]\s)/.test(l);
  if (prefix === "1. ") return (l) => /^\s*\d+[.)]\s+/.test(l);
  return () => false;
}

export function setBlockPrefix(s: Sel, prefix: string): Sel {
  const test = markerTest(prefix);
  const { lineStart, lineEnd } = lineBounds(s.value, s.start, s.end);
  const lines = s.value.slice(lineStart, lineEnd).split("\n");
  const meaningful = lines.filter((l) => l.trim() !== "");
  const allHave = meaningful.length > 0 && meaningful.every(test);
  let counter = 0;
  return mapLines(s, (line) => {
    const m = line.match(BLOCK_MARKER)!;
    const indent = m[1];
    const rest = line.slice(m[0].length);
    if (allHave) return indent + rest;
    if (line.trim() === "" && lines.length > 1) return line;
    if (prefix === "1. ") {
      counter++;
      return `${indent}${counter}. ${rest}`;
    }
    return indent + prefix + rest;
  });
}

export function replaceRange(s: Sel, from: number, to: number, text: string, caret?: number): Sel {
  const value = s.value.slice(0, from) + text + s.value.slice(to);
  const at = caret === undefined ? from + text.length : caret;
  return { value, start: at, end: at };
}

/** 블록(표·구분선·코드)을 캐럿 자리에 넣되, 줄 중간이면 빈 줄을 하나 띄움 */
export function insertBlock(s: Sel, text: string, selectStart: number, selectEnd: number): Sel {
  const needsNewlineBefore = s.start > 0 && s.value[s.start - 1] !== "\n";
  const prefix = needsNewlineBefore ? "\n\n" : "";
  const full = prefix + text;
  const value = s.value.slice(0, s.start) + full + s.value.slice(s.end);
  const base = s.start + full.length - text.length;
  return { value, start: base + selectStart, end: base + selectEnd };
}

export function insertLink(s: Sel): Sel {
  const selected = s.value.slice(s.start, s.end) || "링크 텍스트";
  const before = "[" + selected + "](";
  const url = "https://";
  const value = s.value.slice(0, s.start) + before + url + ")" + s.value.slice(s.end);
  return { value, start: s.start + before.length, end: s.start + before.length + url.length };
}

export function insertImageUrl(s: Sel): Sel {
  const selected = s.value.slice(s.start, s.end) || "대체 텍스트";
  const before = "![" + selected + "](";
  const url = "이미지 URL";
  const value = s.value.slice(0, s.start) + before + url + ")" + s.value.slice(s.end);
  return { value, start: s.start + before.length, end: s.start + before.length + url.length };
}

export function insertTable(s: Sel, rows = 2, cols = 2): Sel {
  const header = "|" + Array.from({ length: cols }, (_, i) => ` 제목${i + 1} |`).join("");
  const separator = "|" + " --- |".repeat(cols);
  const body = Array.from({ length: rows }, () => "|" + "  |".repeat(cols)).join("\n");
  return insertBlock(s, header + "\n" + separator + "\n" + body, 2, 2 + "제목1".length);
}

export function insertCodeBlock(s: Sel, lang: string): Sel {
  const selected = s.value.slice(s.start, s.end) || "코드";
  const fence = "```" + lang;
  return insertBlock(s, fence + "\n" + selected + "\n```", fence.length + 1, fence.length + 1 + selected.length);
}

export const ACTIONS = {
  bold: (s: Sel) => wrapSelection(s, "**", "**", "굵은 텍스트"),
  italic: (s: Sel) => wrapSelection(s, "*", "*", "기울임 텍스트"),
  strike: (s: Sel) => wrapSelection(s, "~~", "~~", "취소선 텍스트"),
  highlight: (s: Sel) => wrapSelection(s, "==", "==", "강조 텍스트"),
  h1: (s: Sel) => setBlockPrefix(s, "# "),
  h2: (s: Sel) => setBlockPrefix(s, "## "),
  h3: (s: Sel) => setBlockPrefix(s, "### "),
  h4: (s: Sel) => setBlockPrefix(s, "#### "),
  quote: (s: Sel) => setBlockPrefix(s, "> "),
  ul: (s: Sel) => setBlockPrefix(s, "- "),
  ol: (s: Sel) => setBlockPrefix(s, "1. "),
  task: (s: Sel) => setBlockPrefix(s, "- [ ] "),
  indent: (s: Sel) => mapLines(s, (l) => "  " + l),
  outdent: (s: Sel) => mapLines(s, (l) => l.replace(/^ {1,2}/, "")),
  code: (s: Sel) => wrapSelection(s, "`", "`", "코드"),
  hr: (s: Sel) => insertBlock(s, "---", 3, 3),
  details: (s: Sel) => insertBlock(s, "<details>\n<summary>접은 제목</summary>\n\n내용을 여기에 작성하세요.\n\n</details>", 19, 24),
  link: insertLink,
  imageUrl: insertImageUrl,
} as const;
export type ActionName = keyof typeof ACTIONS;

/* ── 똑똑한 Enter / Tab ── */

const LIST_RE = /^(\s*)(?:([-*+])\s+(\[[ xX]\]\s+)?|(\d+)([.)])\s+)/;
const QUOTE_RE = /^(\s*)>\s?/;
export const TABLE_ROW_RE = /^\s*\|.*\|\s*$/;
// 구분줄엔 반드시 - 가 있음. 없으면 빈 행("|  |  |")도 구분줄로 잡힘
export const TABLE_SEP_RE = /^\s*\|[\s:|-]*-[\s:|-]*\|\s*$/;

interface LineInfo {
  value: string;
  pos: number;
  lineStart: number;
  lineEnd: number;
  line: string;
}
export function currentLine(s: Sel): LineInfo {
  const { lineStart, lineEnd } = lineBounds(s.value, s.start, s.start);
  return { value: s.value, pos: s.start, lineStart, lineEnd, line: s.value.slice(lineStart, lineEnd) };
}

export function splitCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split(/(?<!\\)\|/)
    .map((c) => c.trim());
}
const joinCells = (cells: string[]) => "| " + cells.join(" | ") + " |";
const emptyRow = (cells: number) => "|" + "  |".repeat(cells);

/** 표 안에서 Enter: 아래에 새 행 (머리글 다음에 구분줄이 없으면 그것도). 빈 행에서 Enter 면 표에서 나감 */
function handleTableEnter(s: Sel, info: LineInfo): Sel | null {
  const { value, lineStart, lineEnd, line } = info;
  if (!TABLE_ROW_RE.test(line) || TABLE_SEP_RE.test(line)) return null;
  const cells = splitCells(line).length;
  if (line.replace(/[|\s]/g, "") === "") return replaceRange(s, lineStart, lineEnd, "");

  const prevEnd = lineStart - 1;
  const prevLine = prevEnd <= 0 ? "" : value.slice(value.lastIndexOf("\n", prevEnd - 1) + 1, prevEnd);
  const nextEnd = value.indexOf("\n", lineEnd + 1);
  const nextLine = value.slice(lineEnd + 1, nextEnd === -1 ? value.length : nextEnd);
  const isHeader = !TABLE_ROW_RE.test(prevLine);
  const needsSeparator = isHeader && !TABLE_SEP_RE.test(nextLine);
  const row = emptyRow(cells);
  const inserted = "\n" + (needsSeparator ? "|" + " --- |".repeat(cells) + "\n" : "") + row;
  return replaceRange(s, lineEnd, lineEnd, inserted, lineEnd + inserted.length - row.length + 2);
}

/** 목록에서 Enter: 마커를 이어감 (번호는 +1). 빈 항목에서 Enter 면 목록 끝 */
function handleListEnter(s: Sel, info: LineInfo): Sel | null {
  const { pos, lineStart, lineEnd, line } = info;
  const m = line.match(LIST_RE);
  if (!m) return null;
  const [marker, indent, bullet, checkbox, number, delimiter] = [m[0], m[1], m[2], m[3], m[4], m[5]];
  if (line.slice(marker.length).trim() === "") return replaceRange(s, lineStart, lineEnd, "");
  const next = number ? `${indent}${Number(number) + 1}${delimiter} ` : `${indent}${bullet} ${checkbox ? "[ ] " : ""}`;
  return replaceRange(s, pos, pos, "\n" + next);
}

function handleQuoteEnter(s: Sel, info: LineInfo): Sel | null {
  const { pos, lineStart, lineEnd, line } = info;
  const m = line.match(QUOTE_RE);
  if (!m) return null;
  if (line.slice(m[0].length).trim() === "") return replaceRange(s, lineStart, lineEnd, "");
  return replaceRange(s, pos, pos, "\n" + m[1] + "> ");
}

/** Enter 처리. 손댈 게 없으면 null (브라우저 기본 동작) */
export function handleEnter(s: Sel): Sel | null {
  if (s.start !== s.end) return null;
  const info = currentLine(s);
  return handleTableEnter(s, info) || handleListEnter(s, info) || handleQuoteEnter(s, info);
}

/** 표 안에서 Tab: 다음 칸으로. 마지막 칸이면 행 추가 */
function handleTableTab(s: Sel, info: LineInfo, backwards: boolean): Sel | null {
  const { pos, value, lineStart, lineEnd, line } = info;
  if (!TABLE_ROW_RE.test(line)) return null;
  const pipes: number[] = [];
  for (let i = lineStart; i < lineEnd; i++) if (value[i] === "|") pipes.push(i);
  const target = backwards ? [...pipes].reverse().find((p) => p < pos - 1) : pipes.find((p) => p >= pos);
  if (target === undefined) {
    if (backwards) return null;
    const row = emptyRow(splitCells(line).length);
    return replaceRange(s, lineEnd, lineEnd, "\n" + row, lineEnd + 3);
  }
  return { value, start: target + 2, end: target + 2 };
}

export function handleTab(s: Sel, shift: boolean): Sel {
  const collapsed = s.start === s.end;
  const info = currentLine(s);
  if (collapsed) {
    const t = handleTableTab(s, info, shift);
    if (t) return t;
  }
  if (shift) return ACTIONS.outdent(s);
  if (collapsed) return replaceRange(s, info.pos, info.pos, "  ");
  return ACTIONS.indent(s);
}

/* ── 표 모델 (비주얼 표 편집기용) ── */

export interface TableModel {
  start: number;
  end: number;
  header: string[];
  body: string[][];
  aligns: ("" | "left" | "center" | "right")[];
}

const escapeCell = (t: string) => t.replace(/\|/g, "\\|").replace(/\n/g, " ").trim();
const unescapeCell = (t: string) => t.replace(/\\\|/g, "|").trim();

function parseAlign(cell: string): TableModel["aligns"][number] {
  const c = cell.trim();
  const left = c.startsWith(":");
  const right = c.endsWith(":");
  if (left && right) return "center";
  if (right) return "right";
  if (left) return "left";
  return "";
}
const alignMarker = (a: string) => (a === "left" ? ":---" : a === "center" ? ":---:" : a === "right" ? "---:" : "---");

/** 캐럿이 놓인 표 (연속된 표 줄 묶음). 표가 아니면 null */
export function tableAt(value: string, pos: number): TableModel | null {
  const caretLineStart = value.lastIndexOf("\n", pos - 1) + 1;
  let caretLineEnd = value.indexOf("\n", pos);
  if (caretLineEnd === -1) caretLineEnd = value.length;
  if (!TABLE_ROW_RE.test(value.slice(caretLineStart, caretLineEnd))) return null;

  let start = caretLineStart;
  while (start > 0) {
    const prevEnd = start - 1;
    const prevStart = value.lastIndexOf("\n", prevEnd - 1) + 1;
    if (!TABLE_ROW_RE.test(value.slice(prevStart, prevEnd))) break;
    start = prevStart;
  }
  let end = caretLineEnd;
  while (end < value.length) {
    const nextStart = end + 1;
    let nextEnd = value.indexOf("\n", nextStart);
    if (nextEnd === -1) nextEnd = value.length;
    if (!TABLE_ROW_RE.test(value.slice(nextStart, nextEnd))) break;
    end = nextEnd;
  }

  const lines = value.slice(start, end).split("\n");
  const sepIndex = lines.findIndex((l) => TABLE_SEP_RE.test(l));
  const rows = lines.map(splitCells);
  const hasSep = sepIndex > 0;
  const header = (hasSep ? rows[sepIndex - 1] : rows[0]) || [];
  const aligns = hasSep ? rows[sepIndex].map(parseAlign) : [];
  const body = hasSep ? rows.slice(sepIndex + 1) : rows.slice(1);
  const cols = Math.max(1, header.length, ...body.map((r) => r.length));
  const pad = (row: string[] | undefined) => {
    const cells = (row || []).map(unescapeCell);
    while (cells.length < cols) cells.push("");
    return cells.slice(0, cols);
  };
  return {
    start,
    end,
    header: pad(header),
    body: body.length ? body.map(pad) : [Array(cols).fill("")],
    aligns: Array.from({ length: cols }, (_, i) => aligns[i] || ""),
  };
}

export function serializeTable(m: TableModel): string {
  return [joinCells(m.header.map(escapeCell)), joinCells(m.aligns.map(alignMarker)), ...m.body.map((r) => joinCells(r.map(escapeCell)))].join("\n");
}
