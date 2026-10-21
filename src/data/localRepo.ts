import type { Post, Profile } from "../lib/types";
import { LIMITS } from "../lib/types";
import type { Mine, PublicBlog, Repo } from "./repo";

/** Supabase 연결 전 개발·체험용. 이 브라우저 localStorage 에만 저장 (사용자는 한 명 = "나") */
const KEY = "dodo-blog:v1";

type Deletable<T> = T & { deletedAt?: string | null };
interface Stored {
  profile: Profile | null;
  posts: Deletable<Post>[];
}

function read(): Stored {
  const raw = localStorage.getItem(KEY);
  if (!raw) return { profile: null, posts: [] };
  // 파싱이 실패하면 빈 값으로 덮어쓰지 않고 에러를 낸다 — 데이터 보존이 우선
  const s = JSON.parse(raw) as Stored;
  return { profile: s.profile ?? null, posts: s.posts ?? [] };
}

function write(s: Stored) {
  localStorage.setItem(KEY, JSON.stringify(s));
}

function mutate(fn: (s: Stored) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const s = read();
      fn(s);
      write(s);
      resolve();
    } catch (e) {
      reject(e);
    }
  });
}

const live = <T,>(x: Deletable<T>) => !x.deletedAt;
const strip = <T,>({ deletedAt: _d, ...rest }: Deletable<T>) => rest as T;

/** 이미지는 data: 주소로 본문에 그대로 넣음 (로컬 모드 한정. 용량이 커지면 localStorage 한도에 걸릴 수 있음) */
function toDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export const localRepo: Repo = {
  async loadMine(): Promise<Mine> {
    const s = read();
    return { profile: s.profile, posts: s.posts.filter(live).map(strip<Post>) };
  },
  createProfile: (p) =>
    mutate((s) => {
      if (s.profile) throw new Error("이미 블로그가 있어요");
      s.profile = { ...p, createdAt: new Date().toISOString() };
    }),
  updateProfile: (patch) =>
    mutate((s) => {
      if (!s.profile) throw new Error("블로그가 없어요");
      Object.assign(s.profile, patch);
    }),
  insertPost: (p) => mutate((s) => void s.posts.push({ ...p, deletedAt: null })),
  updatePost: (id, patch) =>
    mutate((s) => {
      const p = s.posts.find((x) => x.id === id);
      if (!p) throw new Error("post not found: " + id);
      Object.assign(p, patch, { updatedAt: new Date().toISOString() });
    }),
  deletePost: (id) =>
    mutate((s) => {
      const p = s.posts.find((x) => x.id === id);
      if (p) p.deletedAt = new Date().toISOString();
    }),
  restorePost: (id) =>
    mutate((s) => {
      const p = s.posts.find((x) => x.id === id);
      if (p) p.deletedAt = null;
    }),
  async uploadImage(file) {
    if (file.size > LIMITS.imageBytes) throw new Error("이미지는 5MB 까지 올릴 수 있어요");
    return toDataUrl(file);
  },
  async deleteAccount() {
    localStorage.removeItem(KEY);
  },
  async getBlog(handle): Promise<PublicBlog | null> {
    const s = read();
    if (!s.profile || s.profile.handle !== handle) return null;
    return { profile: s.profile, posts: s.posts.filter(live).map(strip<Post>).filter((p) => p.status === "public") };
  },
  async handleTaken(handle) {
    return read().profile?.handle === handle;
  },
};
