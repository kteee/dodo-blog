import { createBrowserClient } from "@supabase/ssr";
import type { Post, Profile } from "../lib/types";
import { LIMITS, uuid } from "../lib/types";
import type { Mine, PublicBlog, Repo } from "./repo";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
// Publishable key(sb_publishable_...) 권장. 예전 anon 키도 받아줌
const anon = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined;

/**
 * 두두 계정: 로그인 세션을 localStorage 대신 `.dododiary.com` 쿠키에 둔다.
 * 투두·북로그·블로그·홈이 같은 쿠키를 읽으므로 한 번 로그인하면 전부 열린다 (각 서비스의 supabase.ts 가 같은 설정).
 * 세션이 4KB 를 넘으면 @supabase/ssr 이 쿠키를 여러 개로 쪼개 저장한다. localhost 에선 도메인 없이(이 주소에만) 저장.
 */
const SHARED_COOKIE_DOMAIN = ".dododiary.com";
const onDodo = typeof location !== "undefined" && location.hostname.endsWith(SHARED_COOKIE_DOMAIN.slice(1));

/** 환경변수가 없으면 null → 앱은 로컬 모드로 동작 */
export const supabase =
  url && anon
    ? createBrowserClient(url, anon, {
        cookieOptions: {
          ...(onDodo ? { domain: SHARED_COOKIE_DOMAIN } : {}),
          path: "/",
          sameSite: "lax",
          secure: onDodo,
          maxAge: 60 * 60 * 24 * 400, // 브라우저 상한(400일). 실제 로그인 유지는 refresh token 수명을 따름
        },
        // keepalive: 탭을 닫는 순간 보낸 저장(자동저장 등)도 끝까지 전송됨
        global: { fetch: (input, init) => fetch(input, { ...init, keepalive: true }) },
      })
    : null;

const BUCKET = "blog-images";

interface ProfileRow {
  user_id: string;
  handle: string;
  title: string;
  bio: string;
  created_at: string;
}
const PROFILE_COLS = "user_id,handle,title,bio,created_at";
const profileFromRow = (r: ProfileRow): Profile => ({ handle: r.handle, title: r.title, bio: r.bio, createdAt: r.created_at });

interface PostRow {
  id: string;
  slug: string;
  title: string;
  body_md: string;
  tags: string[] | null;
  status: Post["status"];
  published_at: string | null;
  created_at: string;
  updated_at: string;
}
const POST_COLS = "id,slug,title,body_md,tags,status,published_at,created_at,updated_at";
const postFromRow = (r: PostRow): Post => ({
  id: r.id,
  slug: r.slug,
  title: r.title,
  body: r.body_md,
  tags: r.tags ?? [],
  status: r.status,
  publishedAt: r.published_at,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

function postToRow(p: Partial<Omit<Post, "id" | "createdAt">>) {
  const r: Record<string, unknown> = {};
  if (p.slug !== undefined) r.slug = p.slug;
  if (p.title !== undefined) r.title = p.title;
  if (p.body !== undefined) r.body_md = p.body;
  if (p.tags !== undefined) r.tags = p.tags;
  if (p.status !== undefined) r.status = p.status;
  if (p.publishedAt !== undefined) r.published_at = p.publishedAt;
  // updated_at 은 DB 트리거가 채움
  return r;
}

function check<T extends { error: unknown }>(res: T): T {
  if (res.error) throw res.error;
  return res;
}

/** Supabase는 한 번에 최대 1000행만 준다 — 페이지로 나눠 읽음 */
async function selectPosts(opts: { userId: string; publicOnly: boolean }): Promise<Post[]> {
  const client = supabase!;
  const page = 1000;
  const out: Post[] = [];
  for (let from = 0; ; from += page) {
    let q = client.from("blog_posts").select(POST_COLS).eq("user_id", opts.userId).is("deleted_at", null);
    if (opts.publicOnly) q = q.eq("status", "public");
    const { data } = check(await q.order("id").range(from, from + page - 1));
    const rows = (data ?? []) as unknown as PostRow[];
    out.push(...rows.map(postFromRow));
    if (rows.length < page) return out;
  }
}

const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp", "image/avif": "avif", "image/svg+xml": "svg" };

/** 올린 이미지 파일 전부 삭제 (auth.users 를 지우거나 목록 행을 지워도 파일은 자동으로 안 사라짐). 실패해도 삭제·탈퇴는 진행 */
async function removeMyImages() {
  const db = supabase!;
  try {
    const { data: u } = await db.auth.getUser();
    const uid = u.user?.id;
    if (!uid) return;
    for (;;) {
      const { data: list } = await db.storage.from(BUCKET).list(uid, { limit: 100 });
      if (!list?.length) break;
      await db.storage.from(BUCKET).remove(list.map((f) => `${uid}/${f.name}`));
      if (list.length < 100) break;
    }
  } catch {
    /* 이미지 정리 실패는 삭제·탈퇴를 막지 않음 */
  }
}

export function supabaseRepo(): Repo {
  const db = supabase!;
  return {
    async loadMine(): Promise<Mine> {
      const [profile, posts] = await Promise.all([
        db.from("blog_profiles").select(PROFILE_COLS).maybeSingle(),
        // 공개 글 읽기 정책 때문에 조건 없이 읽으면 남의 공개 글도 섞여 옴 → 내 user_id 로 거름
        db.auth.getUser().then(({ data }) => selectPosts({ userId: data.user?.id ?? "", publicOnly: false })),
      ]);
      check(profile);
      return { profile: profile.data ? profileFromRow(profile.data as ProfileRow) : null, posts };
    },
    async createProfile(p) {
      // user_id 는 DB 기본값(auth.uid())
      check(await db.from("blog_profiles").insert({ handle: p.handle, title: p.title, bio: p.bio }));
    },
    async updateProfile(patch) {
      const { data } = await db.auth.getUser();
      check(await db.from("blog_profiles").update(patch).eq("user_id", data.user?.id ?? ""));
    },
    async insertPost(p) {
      check(await db.from("blog_posts").insert({ id: p.id, ...postToRow(p) }));
    },
    async updatePost(id, patch) {
      check(await db.from("blog_posts").update(postToRow(patch)).eq("id", id));
    },
    async deletePost(id) {
      check(await db.from("blog_posts").update({ deleted_at: new Date().toISOString() }).eq("id", id));
    },
    async restorePost(id) {
      check(await db.from("blog_posts").update({ deleted_at: null }).eq("id", id));
    },
    async uploadImage(file) {
      const ext = EXT[file.type];
      if (!ext) throw new Error("이미지 파일(png·jpg·gif·webp·avif·svg)만 올릴 수 있어요");
      if (file.size > LIMITS.imageBytes) throw new Error("이미지는 5MB 까지 올릴 수 있어요");
      const { data: u } = await db.auth.getUser();
      const uid = u.user?.id;
      if (!uid) throw new Error("not authenticated");
      // 경로 <내 id>/<무작위>.<확장자> — Storage 정책이 내 폴더에만 쓰게 허용
      const path = `${uid}/${uuid()}.${ext}`;
      check(await db.storage.from(BUCKET).upload(path, file, { contentType: file.type, cacheControl: "31536000", upsert: false }));
      return db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    },
    async deleteBlogData() {
      await removeMyImages();
      check(await db.rpc("delete_blog_data"));
    },
    async deleteAccount() {
      await removeMyImages();
      check(await db.rpc("delete_my_account"));
      await db.auth.signOut({ scope: "local" });
    },
    async getBlog(handle): Promise<PublicBlog | null> {
      const prof = check(await db.from("blog_profiles").select(PROFILE_COLS).eq("handle", handle).maybeSingle());
      if (!prof.data) return null;
      const row = prof.data as ProfileRow;
      const posts = await selectPosts({ userId: row.user_id, publicOnly: true });
      return { profile: profileFromRow(row), posts };
    },
    async handleTaken(handle) {
      const { data } = check(await db.from("blog_profiles").select("handle").eq("handle", handle).maybeSingle());
      return !!data;
    },
  };
}
