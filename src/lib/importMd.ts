import { LIMITS, utf8Bytes } from "./types";
import { splitFrontmatter } from "./markdown";

export interface ImportedMd {
  name: string;
  title: string;
  body: string;
  tags: string[];
  date: string | null;
  tooBig: boolean;
}

/**
 * .md 파일 하나 → 글 재료. frontmatter 의 title / date / tags 를 읽고,
 * 제목이 없으면 첫 "# 제목" 줄(본문에선 뺌) → 파일 이름 순. 마크다운이 아닌 파일은 null
 */
export async function readMdFile(f: File): Promise<ImportedMd | null> {
  if (!/\.(md|markdown|txt)$/i.test(f.name)) return null;
  const raw = await f.text();
  const { data, content } = splitFrontmatter(raw);
  let body = content.replace(/\r\n/g, "\n").trim();
  let title = data.title ?? "";
  if (!title) {
    const h = body.match(/^#\s+(.+)$/m);
    if (h) {
      title = h[1].trim();
      body = body.replace(h[0], "").trim();
    }
  }
  if (!title) title = f.name.replace(/\.[^.]+$/, "");
  const tags = (data.tags ?? data.tag ?? "")
    .replace(/^\[|\]$/g, "")
    .split(",")
    .map((t) => t.trim().replace(/^["']|["']$/g, "").replace(/^#/, ""))
    .filter(Boolean)
    .slice(0, LIMITS.tags);
  return { name: f.name, title: title.slice(0, LIMITS.title), body, tags, date: data.date ?? null, tooBig: utf8Bytes(body) > LIMITS.bodyBytes };
}
