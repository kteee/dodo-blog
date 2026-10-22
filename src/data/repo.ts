import type { Category, Post, Profile } from "../lib/types";

/** 내 것 전부 (임시글 포함) */
export interface Mine {
  profile: Profile | null;
  posts: Post[];
  categories: Category[];
}

/** 남이 보는 블로그 한 권: 주인 정보 + 공개 글만 */
export interface PublicBlog {
  profile: Profile;
  posts: Post[];
  categories: Category[];
}

/** 저장소 경계. 화면은 이 인터페이스만 알고, 로컬/Supabase 중 뭘 쓰는지는 모른다 */
export interface Repo {
  /* ── 내 블로그 (로그인 필요) ── */
  loadMine(): Promise<Mine>;
  createProfile(p: Omit<Profile, "createdAt">): Promise<void>;
  updateProfile(patch: Partial<Pick<Profile, "title" | "bio">>): Promise<void>;
  insertPost(p: Post): Promise<void>;
  updatePost(id: string, patch: Partial<Omit<Post, "id" | "createdAt">>): Promise<void>;
  /** 소프트 삭제 — 되돌리기 가능 */
  deletePost(id: string): Promise<void>;
  restorePost(id: string): Promise<void>;
  insertCategory(c: Category): Promise<void>;
  updateCategory(id: string, patch: Partial<Pick<Category, "name" | "parentId" | "order">>): Promise<void>;
  /** 소프트 삭제. 글·하위 카테고리 옮기기는 화면 쪽(useBlog)이 먼저 함 */
  deleteCategory(id: string): Promise<void>;
  /** 글에 넣을 이미지. 돌려주는 주소를 마크다운에 적는다 */
  uploadImage(file: File): Promise<string>;
  /** 블로그 그만두기: 글·이미지·블로그 주소만 삭제. 계정과 다른 두두 서비스는 그대로 */
  deleteBlogData(): Promise<void>;
  /** 두두 계정 탈퇴: 계정과 모든 두두 서비스(투두·북로그·블로그) 기록을 즉시 영구 삭제 */
  deleteAccount(): Promise<void>;

  /* ── 누구나 (로그인 없이) ── */
  /** 아이디로 공개 블로그. 없으면 null */
  getBlog(handle: string): Promise<PublicBlog | null>;
  /** 아이디가 이미 쓰이고 있는지 */
  handleTaken(handle: string): Promise<boolean>;
}
