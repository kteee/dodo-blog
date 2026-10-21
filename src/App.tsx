import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { localRepo } from "./data/localRepo";
import { supabase, supabaseRepo } from "./data/supabase";
import { signIn, signOut, useAuth } from "./data/auth";
import { useBlog } from "./data/useBlog";
import type { PublicBlog, Repo } from "./data/repo";
import { go, useRoute } from "./hooks/useRoute";
import { TopNav } from "./components/TopNav";
import { CreateBlog, Intro } from "./components/Landing";
import { MyPage } from "./components/MyPage";
import { SiteFooter } from "./components/SiteFooter";
import { Toasts } from "./components/Toasts";
import { BlogSide, NO_FILTER, PostList, PostView, type Filter } from "./components/Blog";
import { Editor } from "./components/Editor";
import { ImportPage } from "./components/Import";
import { RESERVED_HANDLES } from "./lib/types";
import { report } from "./lib/monitoring";

/* 보기 옵션은 이 브라우저에만 기억 (저장이 막혀도 기본값으로 동작) */
const SIDE_PREF = "dodo-blog:sideFolded";
function readPref(k: string, fallback: boolean) {
  try {
    const v = localStorage.getItem(k);
    return v === null ? fallback : v === "1";
  } catch {
    return fallback;
  }
}
function writePref(k: string, v: boolean) {
  try {
    localStorage.setItem(k, v ? "1" : "0");
  } catch {
    /* 저장 못 해도 이번 화면에서는 적용됨 */
  }
}

/** 남의 블로그 읽기 (로그인 없이). 같은 아이디는 한 번만 받아 둠 */
function usePublicBlog(repo: Repo | null, handle: string | null, skip: boolean) {
  const [state, setState] = useState<{ handle: string; blog: PublicBlog | null; status: "loading" | "ready" | "error" } | null>(null);
  const seq = useRef(0);
  const load = useCallback(() => {
    if (!repo || !handle || skip) return;
    const my = ++seq.current;
    setState({ handle, blog: null, status: "loading" });
    repo
      .getBlog(handle)
      .then((blog) => my === seq.current && setState({ handle, blog, status: "ready" }))
      .catch((e) => {
        report(e, "getBlog");
        if (my === seq.current) setState({ handle, blog: null, status: "error" });
      });
  }, [repo, handle, skip]);
  useEffect(load, [load]);
  return { data: state?.handle === handle ? state : null, retry: load };
}

export default function App() {
  const auth = useAuth();
  const userId = auth.status === "in" ? auth.account.id : null;
  const isLocal = auth.mode === "local";
  // 읽기용 저장소는 로그인과 상관없이 하나 (공개 글은 누구나). 쓰기용은 로그인했을 때만
  const anyRepo = useMemo(() => (isLocal ? localRepo : supabase ? supabaseRepo() : null), [isLocal]);
  const repo = useMemo(() => (!userId ? null : isLocal ? localRepo : supabaseRepo()), [userId, isLocal]);
  const store = useBlog(repo);
  const { profile, posts, actions } = store;

  const path = useRoute();
  const [menuOpen, setMenuOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>(NO_FILTER);
  const [sideFolded, setSideFoldedState] = useState(() => readPref(SIDE_PREF, false));
  const toggleSide = () => {
    setSideFoldedState((v) => {
      writePref(SIDE_PREF, !v);
      return !v;
    });
  };

  // 계정 메뉴: 바깥을 누르거나 Esc 로 닫힘
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!(e.target as Element).closest?.(".acct")) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);
  useEffect(() => setMenuOpen(false), [path]);

  // 경로 풀기: /, /my, /write, /import, /edit/<id>, /<handle>, /<handle>/<slug>
  const seg = path.split("/").filter(Boolean).map(decodeURIComponent);
  const isApp = seg.length === 0 || RESERVED_HANDLES.includes(seg[0]);
  const handle = !isApp ? seg[0] : null;
  const slug = !isApp && seg.length >= 2 ? seg[1] : null;
  const ready = store.status === "ready" && !!actions;
  const isOwner = !!handle && !!profile && profile.handle === handle;
  const pub = usePublicBlog(anyRepo, handle, isOwner || (!!userId && store.status !== "ready" && store.status !== "idle"));

  // 새 글: 임시글을 만들고 바로 에디터로
  useEffect(() => {
    if (path === "/write" && ready && profile) go("/edit/" + actions.createPost(), true);
  }, [path, ready, profile, actions]);
  // 홈: 블로그가 있으면 내 블로그로
  useEffect(() => {
    if (path === "/" && ready && profile) go("/" + profile.handle, true);
  }, [path, ready, profile]);
  useEffect(() => {
    window.scrollTo(0, 0);
    setFilter(NO_FILTER);
  }, [handle]);

  const account = auth.status === "in" ? auth.account : null;
  const nav = (
    <TopNav account={account} isLocal={isLocal} myBlog={profile ? "/" + profile.handle : null} menuOpen={menuOpen} setMenuOpen={setMenuOpen} onSignIn={() => signIn()} onSignOut={() => signOut()} />
  );
  const loading = (
    <div className="gate">
      <p>불러오는 중…</p>
    </div>
  );
  const needsLogin = (
    <div className="page">
      {nav}
      <Intro onSignIn={() => signIn()} />
      <SiteFooter />
    </div>
  );

  /* ── 앱 화면 (/, /my, /write, /edit, /import) ── */
  if (isApp) {
    if (auth.status === "loading") return <div className="page">{nav}{loading}</div>;
    if (auth.status === "out") return needsLogin;
    if (!account) return needsLogin;

    if (path === "/my") {
      return (
        <div className="page">
          {nav}
          <MyPage
            account={account}
            isLocal={isLocal}
            profile={profile}
            onProfile={ready ? actions.updateProfile : null}
            onExport={ready ? actions.exportJson : null}
            onDeleteBlogData={async () => {
              if (!actions) throw new Error("not ready");
              await actions.deleteBlogData();
            }}
            onDeleteAccount={async () => {
              if (!actions) throw new Error("not ready");
              await actions.deleteAccount();
            }}
          />
          <SiteFooter />
          <Toasts toasts={store.toasts} dismiss={store.dismiss} />
        </div>
      );
    }

    let main: ReactNode;
    if (store.status === "loading" || store.status === "idle") main = loading;
    else if (store.status === "error") main = <RetryGate retry={store.retry} />;
    else if (!profile) {
      main = <CreateBlog taken={(h) => anyRepo!.handleTaken(h)} onCreate={(h, t) => actions!.createProfile(h, t)} />;
    } else if (path === "/import" && ready) {
      main = <ImportPage profile={profile} onImport={actions.importPosts} onDone={() => go("/" + profile.handle)} />;
    } else if (seg[0] === "edit" && seg[1] && ready) {
      const post = posts.find((p) => p.id === seg[1]);
      main = !post ? (
        <NotFound text="글을 찾을 수 없어요" href={"/" + profile.handle} />
      ) : (
        <Editor
          key={post.id}
          profile={profile}
          post={post}
          actions={actions}
          unfold={null}
          onBack={() => {
            actions.discardEmpty(post.id);
            go("/" + profile.handle);
          }}
        />
      );
    } else main = loading; // "/" 와 "/write" 는 위 effect 가 옮김

    const editing = seg[0] === "edit";
    return (
      <div className="page">
        {nav}
        {editing ? <div className="app one"><main className="main">{main}</main></div> : main}
        {!editing && path !== "/import" && <SiteFooter />}
        {store.net.offline && <NetBar n={store.net.waiting} />}
        <Toasts toasts={store.toasts} dismiss={store.dismiss} />
      </div>
    );
  }

  /* ── 블로그 화면 (/<handle>, /<handle>/<slug>) — 누구나 ── */
  const blog = isOwner && profile ? { profile, posts } : pub.data?.blog ?? null;
  const unfold = sideFolded ? (
    <button className="side-tg" aria-label="사이드바 펼치기" title="펼치기" onClick={toggleSide}>
      <SideIcon />
    </button>
  ) : null;

  let main: ReactNode;
  if (!blog) {
    const waiting = auth.status === "loading" || (userId && (store.status === "loading" || store.status === "idle")) || !pub.data || pub.data.status === "loading";
    main = waiting ? loading : pub.data?.status === "error" ? <RetryGate retry={pub.retry} /> : <NotFound text="그런 블로그가 없어요" href="/" />;
  } else if (slug) {
    const post = blog.posts.find((p) => p.slug === slug && (isOwner || p.status === "public"));
    main = !post ? (
      <NotFound text="글을 찾을 수 없어요" href={"/" + blog.profile.handle} />
    ) : (
      <PostView profile={blog.profile} post={post} isOwner={isOwner} unfold={unfold} onEdit={isOwner ? () => go("/edit/" + post.id) : undefined} />
    );
  } else {
    main = (
      <PostList
        profile={blog.profile}
        posts={blog.posts}
        filter={filter}
        isOwner={isOwner}
        unfold={unfold}
        onNew={isOwner ? () => go("/write") : undefined}
        onImport={isOwner ? () => go("/import") : undefined}
      />
    );
  }

  return (
    <div className="page">
      {nav}
      <div className={"app" + (sideFolded ? " side-folded" : "")}>
        {!blog || sideFolded ? null : (
          <aside className="side" aria-label="블로그 정보">
            <div className="side-top">
              <button className="side-tg" aria-label="사이드바 접기" title="접기" onClick={toggleSide}>
                <SideIcon />
              </button>
            </div>
            <BlogSide profile={blog.profile} posts={blog.posts} filter={filter} onFilter={(f) => {
              setFilter(f);
              if (slug) go("/" + blog.profile.handle);
            }} isOwner={isOwner} />
          </aside>
        )}
        <main className="main">{main}</main>
      </div>
      {store.net.offline && <NetBar n={store.net.waiting} />}
      <Toasts toasts={store.toasts} dismiss={store.dismiss} />
    </div>
  );
}

function SideIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <rect x="1.5" y="2.5" width="13" height="11" rx="2" />
      <path d="M6 2.5v11" />
    </svg>
  );
}

function NetBar({ n }: { n: number }) {
  return (
    <div className="netbar" role="status">
      연결이 끊겼어요. 저장 대기 중 {n}건 — 연결되면 자동으로 저장돼요.
    </div>
  );
}

function RetryGate({ retry }: { retry: () => void }) {
  return (
    <div className="gate">
      <div>
        <h3>불러오지 못했어요</h3>
        <p>네트워크 연결을 확인하고 다시 시도해 주세요. 저장된 글은 안전해요.</p>
        <button className="signin" onClick={retry}>
          다시 시도
        </button>
      </div>
    </div>
  );
}

function NotFound({ text, href }: { text: string; href: string }) {
  return (
    <div className="gate">
      <div>
        <h3>{text}</h3>
        <p>삭제됐거나 주소가 잘못됐어요.</p>
        <a className="signin" href={href} onClick={(e) => {
          e.preventDefault();
          go(href);
        }}>
          돌아가기
        </a>
      </div>
    </div>
  );
}
