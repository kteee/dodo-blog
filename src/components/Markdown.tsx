import { useMemo } from "react";
import { renderMarkdown, type TocItem } from "../lib/markdown";

/** 마크다운 → {html, toc}. 본문이 같으면 다시 계산 안 함 */
export function useMarkdown(body: string) {
  return useMemo(() => renderMarkdown(body), [body]);
}

/** 마크다운 본문 (글 보기·에디터 미리보기 공용). DOMPurify 를 거친 HTML 만 들어옴 */
export function Markdown({ html, className = "" }: { html: string; className?: string }) {
  return <article className={"md " + className} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** 오른쪽 목차 (글 보기). 제목이 없으면 안 그림 */
export function Toc({ items }: { items: TocItem[] }) {
  if (!items.length) return null;
  const min = Math.min(...items.map((i) => i.level));
  return (
    <nav className="toc" aria-label="목차">
      <p className="sect-label">목차</p>
      <ul>
        {items.map((i) => (
          <li key={i.id} className={"toc-l" + (i.level - min)}>
            <a href={"#" + i.id}>{i.text}</a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
