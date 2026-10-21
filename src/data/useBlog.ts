import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Post, Profile } from "../lib/types";
import { LIMITS, slugify, uniqueSlug, utf8Bytes, uuid } from "../lib/types";
import type { Repo } from "./repo";
import { describeError, report } from "../lib/monitoring";

export interface Toast {
  id: number;
  text: string;
  kind: "info" | "err";
  action?: { label: string; run: () => void };
}

/** 서버까지 못 간 오류(오프라인, DNS, 연결 끊김)인지 — 이 경우엔 작업을 버리지 않고 다시 보낸다 */
function isNetworkError(e: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const msg = e && typeof e === "object" ? String((e as { message?: unknown }).message ?? "") : String(e);
  return /Failed to fetch|NetworkError|Load failed|network request failed|fetch failed/i.test(msg);
}

/** 앞 단어 마지막 글자에 받침이 있으면 "이", 없으면 "가" (한글이 아니면 "가") */
function iGa(word: string) {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  if (code < 0 || code > 11171) return "가";
  return code % 28 ? "이" : "가";
}
const short = (s: string, n = 18) => (s.length > n ? s.slice(0, n) + "…" : s);

type PostPatch = Partial<Omit<Post, "id" | "createdAt">>;

/**
 * 내 블로그 상태 + 저장 동기화 (투두 useDodo · 북로그 useBooks 와 같은 구조).
 * 모든 변경은 낙관적으로 화면에 먼저 반영하고, 저장이 실패하면 알리고 서버 상태를 다시 불러온다.
 * repo 가 null 이면(로그아웃) 아무것도 안 함 — 남의 블로그 읽기는 usePublicBlog 가 따로 함.
 */
export function useBlog(repo: Repo | null) {
  const [profile, setProfileState] = useState<Profile | null>(null);
  const [posts, setPostsState] = useState<Post[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [net, setNet] = useState<{ offline: boolean; waiting: number }>({ offline: false, waiting: 0 });

  const postsRef = useRef(posts);
  const profileRef = useRef(profile);
  const pending = useRef(0);
  const dirty = useRef(new Set<string>());
  const toastSeq = useRef(0);
  const inflight = useRef<{ repo: Repo; p: Promise<void> } | null>(null);
  const stale = useRef(false);
  const saveSeq = useRef(0);

  const setPosts = (next: Post[]) => {
    postsRef.current = next;
    setPostsState(next);
  };
  const setProfile = (next: Profile | null) => {
    profileRef.current = next;
    setProfileState(next);
  };

  const dismiss = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);
  const toast = useCallback(
    (text: string, kind: Toast["kind"] = "info", action?: Toast["action"]) => {
      const id = ++toastSeq.current;
      setToasts((ts) => [...ts.slice(-2), { id, text, kind, action }]);
      setTimeout(() => dismiss(id), kind === "err" ? 8000 : 6000);
    },
    [dismiss],
  );

  const reload = useCallback(
    (silent: boolean): Promise<void> => {
      if (!repo) return Promise.resolve();
      if (inflight.current?.repo === repo) return inflight.current.p;
      const run = async () => {
        if (!silent) setStatus("loading");
        try {
          const seq = saveSeq.current;
          const mine = await repo.loadMine();
          if (silent && (pending.current > 0 || seq !== saveSeq.current)) {
            stale.current = true;
            if (pending.current === 0) setTimeout(() => reloadRef.current(true), 0);
            return;
          }
          stale.current = false;
          setProfile(mine.profile);
          setPosts(mine.posts);
          setStatus("ready");
        } catch (e) {
          report(e, "load");
          if (silent) toast("최신 데이터를 못 불러왔어요. 연결을 확인해 주세요.", "err");
          else setStatus("error");
        }
      };
      const p = run().finally(() => {
        if (inflight.current?.p === p) inflight.current = null;
      });
      inflight.current = { repo, p };
      return p;
    },
    [repo, toast],
  );

  useEffect(() => {
    setProfile(null);
    setPosts([]);
    if (repo) reload(false);
    else setStatus("idle");
  }, [repo, reload]);

  // 다른 기기에서 바꾼 내용: 탭에 다시 돌아올 때 새로 불러옴 (자동저장 대기 중인 입력이 있으면 덮어쓰지 않음)
  useEffect(() => {
    if (!repo) return;
    const onVis = () => {
      if (document.visibilityState === "visible" && pending.current === 0 && dirty.current.size === 0) reload(true);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [repo, reload]);

  // 저장 중이거나 아직 저장 안 된 입력이 있는데 창을 닫으려 하면 경고
  useEffect(() => {
    const onLeave = (e: BeforeUnloadEvent) => {
      if (pending.current > 0 || dirty.current.size > 0) e.preventDefault();
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, []);

  const reloadRef = useRef(reload);
  reloadRef.current = reload;

  /** 저장 큐: 순서 보장, 네트워크 오류는 재시도, 서버 거부는 알리고 서버 상태로 다시 맞춤 */
  const queue = useRef<{ run: () => Promise<void>; tries: number }[]>([]);
  const running = useRef(false);
  const retryTimer = useRef<number | null>(null);
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const pump = useCallback(() => {
    if (running.current) return;
    const job = queue.current[0];
    if (!job) {
      if (stale.current) reloadRef.current(true);
      return;
    }
    running.current = true;
    job
      .run()
      .then(() => {
        queue.current.shift();
        pending.current--;
        if (job.tries > 0) setNet({ offline: false, waiting: 0 });
      })
      .catch((e) => {
        if (isNetworkError(e)) {
          job.tries++;
          setNet({ offline: true, waiting: queue.current.length });
          if (retryTimer.current) clearTimeout(retryTimer.current);
          retryTimer.current = window.setTimeout(() => {
            retryTimer.current = null;
            pump();
          }, Math.min(30000, 3000 * 2 ** Math.min(job.tries - 1, 4)));
          running.current = false;
          return;
        }
        queue.current.shift();
        pending.current--;
        report(e, "save");
        const detail = describeError(e);
        toastRef.current("저장하지 못했어요. 마지막으로 저장된 상태로 되돌릴게요." + (detail ? ` (${detail.slice(0, 120)})` : ""), "err");
        stale.current = true;
      })
      .then(() => {
        if (!running.current) return;
        running.current = false;
        pump();
      });
  }, []);

  const save = useCallback(
    (remote: () => Promise<void>) => {
      pending.current++;
      saveSeq.current++;
      queue.current.push({ run: remote, tries: 0 });
      pump();
    },
    [pump],
  );

  useEffect(() => {
    const onOnline = () => {
      if (retryTimer.current) {
        clearTimeout(retryTimer.current);
        retryTimer.current = null;
      }
      pump();
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [pump]);

  const actions = useMemo(() => {
    if (!repo) return null;

    /** 바뀐 칸만 골라 저장. 바뀐 게 없으면 아무것도 안 함 */
    const patchPost = (id: string, patch: PostPatch) => {
      const p = postsRef.current.find((x) => x.id === id);
      if (!p) return;
      const diff: PostPatch = {};
      for (const k of Object.keys(patch) as (keyof PostPatch)[]) {
        const v = patch[k];
        if (v === undefined) continue;
        const same = typeof v === "object" ? JSON.stringify(v) === JSON.stringify(p[k]) : v === p[k];
        if (!same) (diff as Record<string, unknown>)[k] = v;
      }
      if (!Object.keys(diff).length) return;
      const next = { ...p, ...diff, updatedAt: new Date().toISOString() };
      setPosts(postsRef.current.map((x) => (x.id === id ? next : x)));
      save(() => repo.updatePost(id, diff));
    };

    const slugFor = (post: Post) => {
      const byId = new Map(postsRef.current.map((x) => [x.id, x.slug]));
      return uniqueSlug(slugify(post.title) || post.id.slice(0, 8), byId.values(), post.id, byId);
    };

    return {
      /** 블로그 만들기 (아이디는 나중에 못 바꿈). 실패하면 throw — 아이디 중복 등은 화면에서 안내 */
      async createProfile(handle: string, title: string): Promise<void> {
        const p: Profile = { handle, title: title.trim() || handle, bio: "", createdAt: new Date().toISOString() };
        await repo.createProfile(p);
        setProfile(p);
      },
      updateProfile(patch: Partial<Pick<Profile, "title" | "bio">>) {
        const cur = profileRef.current;
        if (!cur) return;
        if ((patch.title === undefined || patch.title === cur.title) && (patch.bio === undefined || patch.bio === cur.bio)) return;
        setProfile({ ...cur, ...patch });
        save(() => repo.updateProfile(patch));
      },
      /** 새 임시글 — 바로 저장됨 (빈 글도 한 행). 돌아올 때 비어 있으면 discardEmpty 로 지움 */
      createPost(init: Partial<Pick<Post, "title" | "body" | "tags">> = {}): string {
        const now = new Date().toISOString();
        const p: Post = {
          id: uuid(),
          slug: "",
          title: init.title ?? "",
          body: init.body ?? "",
          tags: init.tags ?? [],
          status: "draft",
          publishedAt: null,
          createdAt: now,
          updatedAt: now,
        };
        setPosts([p, ...postsRef.current]);
        save(() => repo.insertPost(p));
        return p.id;
      },
      updatePost: patchPost,
      /** 공개 — 주소(slug)가 없으면 제목에서 만들고, 처음 공개면 공개일을 지금으로 */
      publish(id: string) {
        const p = postsRef.current.find((x) => x.id === id);
        if (!p) return;
        patchPost(id, { status: "public", slug: p.slug || slugFor(p), publishedAt: p.publishedAt ?? new Date().toISOString() });
      },
      unpublish(id: string) {
        patchPost(id, { status: "draft" });
      },
      /** 주소 직접 바꾸기. 비우면 제목에서 다시 만듦. 겹치면 -2 … */
      setSlug(id: string, slug: string) {
        const p = postsRef.current.find((x) => x.id === id);
        if (!p) return;
        const byId = new Map(postsRef.current.map((x) => [x.id, x.slug]));
        const want = slugify(slug) || slugify(p.title) || p.id.slice(0, 8);
        patchPost(id, { slug: uniqueSlug(want, byId.values(), id, byId) });
      },
      deletePost(id: string) {
        const p = postsRef.current.find((x) => x.id === id);
        if (!p) return;
        setPosts(postsRef.current.filter((x) => x.id !== id));
        save(() => repo.deletePost(id));
        const name = short(p.title || "제목 없음");
        toast(`[${name}]${iGa(name)} 삭제되었습니다.`, "info", {
          label: "실행 취소",
          run: () => {
            if (postsRef.current.some((x) => x.id === id)) return;
            setPosts([p, ...postsRef.current]);
            save(() => repo.restorePost(id));
          },
        });
      },
      /** 제목도 본문도 없는 임시글이면 조용히 지움 (에디터에서 나올 때) */
      discardEmpty(id: string) {
        const p = postsRef.current.find((x) => x.id === id);
        if (!p || p.status !== "draft" || p.title.trim() || p.body.trim()) return;
        setPosts(postsRef.current.filter((x) => x.id !== id));
        save(() => repo.deletePost(id));
      },
      /** 마크다운 파일 여러 개 → 글. 제목은 frontmatter title → 첫 # 제목 → 파일 이름 순 */
      importPosts(items: { title: string; body: string; tags: string[]; date: string | null }[], publish: boolean): number {
        const now = new Date().toISOString();
        const byId = new Map(postsRef.current.map((x) => [x.id, x.slug]));
        const made: Post[] = [];
        for (const it of items) {
          if (utf8Bytes(it.body) > LIMITS.bodyBytes) continue;
          const id = uuid();
          const when = it.date && !Number.isNaN(Date.parse(it.date)) ? new Date(it.date).toISOString() : now;
          const p: Post = {
            id,
            slug: "",
            title: it.title.slice(0, LIMITS.title),
            body: it.body,
            tags: it.tags.slice(0, LIMITS.tags),
            status: publish ? "public" : "draft",
            publishedAt: publish ? when : null,
            createdAt: when,
            updatedAt: now,
          };
          if (publish) {
            p.slug = uniqueSlug(slugify(p.title) || id.slice(0, 8), byId.values());
            byId.set(id, p.slug);
          }
          made.push(p);
        }
        if (!made.length) return 0;
        setPosts([...made, ...postsRef.current]);
        for (const p of made) save(() => repo.insertPost(p));
        return made.length;
      },
      async uploadImage(file: File): Promise<string> {
        return repo.uploadImage(file);
      },
      markDirty(key: string, on: boolean) {
        if (on) dirty.current.add(key);
        else dirty.current.delete(key);
      },
      async deleteAccount() {
        await repo.deleteAccount();
      },
      exportJson() {
        const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), profile: profileRef.current, posts: postsRef.current }, null, 2)], {
          type: "application/json",
        });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `dodo-blog-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo, save, toast]);

  return { profile, posts, status, toasts, net, dismiss, actions, retry: () => reload(false) };
}

export type Actions = NonNullable<ReturnType<typeof useBlog>["actions"]>;
