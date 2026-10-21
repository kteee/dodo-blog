import { marked } from "marked";
import DOMPurify from "dompurify";

/**
 * 마크다운 → 안전한 HTML (dev-wiki 의 renderMarkdown 을 브라우저로 옮긴 것).
 * - gfm + breaks: Enter 한 번이 줄바꿈 (노트 적듯이)
 * - ==글자== 는 형광펜(<mark>)
 * - h1~h4 에 id 를 붙이고 목차를 뽑음
 * - 남이 쓴 글도 보이므로 DOMPurify 로 스크립트·이벤트 속성은 전부 거름 (CSP 와 이중 방어)
 */
export interface TocItem {
  id: string;
  text: string;
  level: number;
}

marked.use({ gfm: true, breaks: true });

function slugifyHeading(text: string): string {
  return text
    .replace(/<[^>]+>/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-");
}

const PURIFY_OPTS = {
  USE_PROFILES: { html: true },
  // 글 안의 링크는 새 탭 + 유출 방지 (아래 hook 에서 붙임)
  ADD_ATTR: ["target", "rel", "align"],
  FORBID_TAGS: ["style", "form", "input", "button", "iframe", "object", "embed"],
};

let hooked = false;
function ensureHooks() {
  if (hooked) return;
  hooked = true;
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (node.tagName === "A") {
      const href = node.getAttribute("href") || "";
      // 같은 사이트 주소(#목차, /아이디)는 그대로, 바깥 링크는 새 탭
      if (/^(https?:)?\/\//i.test(href)) {
        node.setAttribute("target", "_blank");
        node.setAttribute("rel", "noopener noreferrer nofollow ugc");
      }
    }
    if (node.tagName === "IMG") {
      node.setAttribute("loading", "lazy");
      node.setAttribute("referrerpolicy", "no-referrer");
    }
  });
}

export function renderMarkdown(md: string): { html: string; toc: TocItem[] } {
  ensureHooks();
  let html = marked.parse(md, { async: false }) as string;
  html = html.replace(/==([^=\n]+)==/g, "<mark>$1</mark>");
  const toc: TocItem[] = [];
  const seen = new Map<string, number>();
  html = html.replace(/<h([1-4])>(.*?)<\/h\1>/g, (_m, level: string, text: string) => {
    let id = slugifyHeading(text) || "section";
    const count = (seen.get(id) || 0) + 1;
    seen.set(id, count);
    if (count > 1) id = `${id}-${count}`;
    toc.push({ id, text: text.replace(/<[^>]+>/g, ""), level: Number(level) });
    return `<h${level} id="${id}">${text}</h${level}>`;
  });
  return { html: DOMPurify.sanitize(html, PURIFY_OPTS), toc };
}

/** 가져오기용: frontmatter(---\ntitle: …\n---) 를 떼어 {data, content} 로 (gray-matter 의 아주 작은 버전) */
export function splitFrontmatter(raw: string): { data: Record<string, string>; content: string } {
  const m = raw.match(/^﻿?---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { data: {}, content: raw.replace(/^﻿/, "") };
  const data: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    if (!kv) continue;
    let v = kv[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    data[kv[1].toLowerCase()] = v;
  }
  return { data, content: raw.slice(m[0].length) };
}
