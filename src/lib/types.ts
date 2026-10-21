/** 블로그 주인 정보 — 계정당 하나. handle 이 곧 주소(/<handle>) */
export interface Profile {
  handle: string;
  /** 블로그 이름 (헤더·목록 위에 보임) */
  title: string;
  bio: string;
  createdAt: string;
}

export type PostStatus = "draft" | "public";

export interface Post {
  id: string;
  /** 주소 조각. 임시글은 "" (공개할 때 제목에서 만듦) */
  slug: string;
  title: string;
  body: string;
  tags: string[];
  status: PostStatus;
  /** 처음 공개한 시각 (목록 정렬·날짜 표시 기준). 임시글은 null */
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** DB 와 같은 상한 (supabase/schema.sql 의 check 와 맞출 것) */
export const LIMITS = {
  handleMin: 3,
  handleMax: 20,
  blogTitle: 40,
  bio: 200,
  title: 120,
  slug: 120,
  /** 본문 바이트 (UTF-8). 한글 약 3만 자 */
  bodyBytes: 100 * 1024,
  tags: 10,
  tag: 20,
  /** 이미지 한 장 (Storage 버킷 설정과 같음) */
  imageBytes: 5 * 1024 * 1024,
} as const;

/** 주소로 못 쓰는 아이디 — 화면 경로·시리즈 서브도메인과 겹치는 것 (DB 의 blog_handle_ok 와 같은 목록) */
export const RESERVED_HANDLES = [
  "write", "edit", "my", "privacy", "import", "new", "login", "logout", "auth", "api", "assets", "static", "fonts",
  "admin", "root", "blog", "www", "todo", "books", "home", "dodo", "dododiary", "about", "help", "settings", "search", "tag", "tags", "rss", "feed", "sitemap",
];

const HANDLE_RE = /^[a-z0-9](?:[a-z0-9-]{1,18}[a-z0-9])?$/;

/** 아이디 규칙: 소문자·숫자·하이픈 3~20자, 하이픈으로 시작·끝 안 됨, 예약어 아님. 문제 없으면 null, 있으면 안내 문구 */
export function handleProblem(h: string): string | null {
  if (h.length < LIMITS.handleMin || h.length > LIMITS.handleMax) return `${LIMITS.handleMin}~${LIMITS.handleMax}자로 지어주세요`;
  if (!HANDLE_RE.test(h)) return "영문 소문자·숫자·하이픈(-)만 쓸 수 있어요. 하이픈으로 시작하거나 끝날 수 없어요";
  if (RESERVED_HANDLES.includes(h)) return "쓸 수 없는 아이디예요";
  return null;
}

/** 제목 → 주소 조각. 한글 그대로 두고(브라우저가 알아서 인코딩), 공백은 하이픈, 기호는 뺌 */
export function slugify(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, LIMITS.slug);
}

/** 내 글들과 겹치지 않는 주소. 겹치면 -2, -3 … */
export function uniqueSlug(base: string, taken: Iterable<string>, selfId?: string, byId?: Map<string, string>): string {
  const set = new Set<string>();
  for (const s of taken) set.add(s);
  if (selfId && byId) set.delete(byId.get(selfId) ?? "");
  const root = base || "post";
  if (!set.has(root)) return root;
  for (let n = 2; ; n++) {
    const s = `${root}-${n}`;
    if (!set.has(s)) return s;
  }
}

export const uuid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
      });

export const utf8Bytes = (s: string) => new TextEncoder().encode(s).length;

/** 글 날짜(공개일, 없으면 만든 날) "2026. 10. 21." */
export function postDate(p: Pick<Post, "publishedAt" | "createdAt">): string {
  return fmtDate(p.publishedAt ?? p.createdAt);
}
export function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
}
/** "2026-10" */
export function monthKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** 목록·공개 정렬: 공개일 최신순 (임시글은 수정일) */
export function sortPosts(posts: Post[]): Post[] {
  const key = (p: Post) => p.publishedAt ?? p.updatedAt;
  return [...posts].sort((a, b) => (key(a) < key(b) ? 1 : key(a) > key(b) ? -1 : 0));
}

/** 본문 첫 문단 요약 (목록용). 마크다운 기호는 대강 뗌 */
export function excerpt(body: string, n = 120): string {
  const text = body
    .replace(/```[\s\S]*?```/g, "")
    .replace(/^\s*\|.*$/gm, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_~`>=|#-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > n ? text.slice(0, n) + "…" : text;
}
