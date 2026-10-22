import { useState } from "react";
import type { Profile } from "../lib/types";
import { LIMITS, utf8Bytes } from "../lib/types";
import { splitFrontmatter } from "../lib/markdown";
import { onLinkClick } from "../hooks/useRoute";
import { blogHome } from "../lib/paths";

interface Item {
  name: string;
  title: string;
  body: string;
  tags: string[];
  date: string | null;
  bytes: number;
  tooBig: boolean;
}

interface Props {
  profile: Profile;
  onImport: (items: { title: string; body: string; tags: string[]; date: string | null }[], publish: boolean) => number;
  onDone: () => void;
}

/** 마크다운 파일(.md) 여러 개 → 글. frontmatter 의 title / date / tags 를 읽고, 없으면 첫 # 제목·파일 이름 */
export function ImportPage({ profile, onImport, onDone }: Props) {
  const [items, setItems] = useState<Item[]>([]);
  const [publish, setPublish] = useState(false);
  const [result, setResult] = useState<number | null>(null);

  const read = async (files: FileList | File[]) => {
    const out: Item[] = [];
    for (const f of [...files]) {
      if (!/\.(md|markdown|txt)$/i.test(f.name)) continue;
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
      const bytes = utf8Bytes(body);
      out.push({ name: f.name, title: title.slice(0, LIMITS.title), body, tags, date: data.date ?? null, bytes, tooBig: bytes > LIMITS.bodyBytes });
    }
    setItems(out);
    setResult(null);
  };

  const ok = items.filter((i) => !i.tooBig);
  return (
    <main className="mypage import">
      <a className="mypage-back" href={blogHome(profile.handle)} onClick={onLinkClick}>
        ← 블로그로 돌아가기
      </a>
      <h1>마크다운 가져오기</h1>
      <p className="hint">
        .md 파일을 고르면 글로 들어와요. 파일 맨 위 <b>frontmatter</b>(title · date · tags)를 읽고, 없으면 첫 번째 <b># 제목</b>이나 파일 이름을 제목으로 써요. 본문의
        이미지 주소는 그대로 두니 올리려면 글에서 다시 붙여넣어 주세요.
      </p>
      <label className="import-drop" onDragOver={(e) => e.preventDefault()} onDrop={(e) => {
        e.preventDefault();
        read(e.dataTransfer.files);
      }}>
        <input type="file" accept=".md,.markdown,.txt" multiple hidden onChange={(e) => e.target.files && read(e.target.files)} />
        <span>파일을 고르거나 여기에 끌어다 놓으세요</span>
      </label>

      {items.length > 0 && (
        <>
          <ul className="import-list">
            {items.map((i, n) => (
              <li key={n} className={i.tooBig ? "bad" : ""}>
                <b>{i.title}</b>
                <small>
                  {i.name} · {(i.bytes / 1024).toFixed(1)}KB{i.tags.length ? " · #" + i.tags.join(" #") : ""}
                  {i.date ? " · " + i.date : ""}
                  {i.tooBig ? " · 너무 커서 건너뜀 (100KB 까지)" : ""}
                </small>
              </li>
            ))}
          </ul>
          <label className="import-opt">
            <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} /> 바로 공개 (끄면 임시글로 들어와요)
          </label>
          <div className="import-acts">
            <button className="btn primary" disabled={!ok.length || result !== null} onClick={() => setResult(onImport(ok, publish))}>
              {ok.length}개 가져오기
            </button>
            {result !== null && (
              <>
                <span className="hint">{result}개를 가져왔어요.</span>
                <button className="btn sm" onClick={onDone}>
                  블로그로
                </button>
              </>
            )}
          </div>
        </>
      )}
    </main>
  );
}
