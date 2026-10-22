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
import { CategoriesPage } from "./components/Categories";
import { Search } from "./components/Search";
import { APP, app, blogHome, postUrl } from "./lib/paths";
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
  const { profile, posts, categories, actions } = store;

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
  useEffect(() => {
    const noindex = seg[0] === "blog" && ["write", "edit", "import", "my", "categories"].includes(seg[1] ?? "");
    let m = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (noindex && !m) {
      m = document.createElement("meta");
      m.name = "robots";
      m.content = "noindex";
      document.head.appendChild(m);
    } else if (!noindex && m) m.remove();
  }, [path]); // eslint-disable-line react-hooks/exhaustive-deps

  // 경로 풀기: /, /my, /write, /import, /edit/<id>, /<handle>, /<handle>/<slug>
  // 경로 풀기: /@<handle>, /@<handle>/<slug> 는 블로그 화면. 그 밖(/blog, /blog/write, /blog/edit/<id>, /blog/import, /blog/my)은 앱 화면
  const seg = path.split("/").filter(Boolean).map(decodeURIComponent);
  const handle = seg[0]?.startsWith("@") && seg[0].length > 1 ? seg[0].slice(1) : null;
  const slug = handle && seg.length >= 2 ? seg[1] : null;
  const isApp = !handle;
  /** 앱 화면의 하위 경로: /blog/edit/<id> → ["edit", "<id>"] */
  const sub = seg[0] === "blog" ? seg.slice(1) : seg;
  const ready = store.status === "ready" && !!actions;
  const isOwner = !!handle && !!profile && profile.handle === handle;
  const pub = usePublicBlog(anyRepo, handle, isOwner || (!!userId && store.status !== "ready" && store.status !== "idle"));

  // 새 글: 임시글을 만들고 바로 에디터로
  useEffect(() => {
    if (isApp && sub[0] === "write" && ready && profile) go(app("/edit/" + actions.createPost()), true);
  }, [path, ready, profile, actions]);
  // 홈: 블로그가 있으면 내 블로그로
  useEffect(() => {
    if (path === "/") go(APP, true); // 배포에선 두두 홈이 / 를 가짐. 개발 서버에서만 옴
    // blog.dododiary.com/@아이디/… 가 301 로 /blog/@아이디/… 가 되어 들어오면 실제 주소 /@아이디/… 로
    else if (seg[0] === "blog" && seg[1]?.startsWith("@")) go("/" + seg.slice(1).map(encodeURIComponent).join("/"), true);
    else if (path === APP && ready && profile) go(blogHome(profile.handle), true);
  }, [path, ready, profile]);
  useEffect(() => {
    window.scrollTo(0, 0);
    setFilter(NO_FILTER);
  }, [handle]);

  const account = auth.status === "in" ? auth.account : null;
  // 공개 블로그 화면(/@아이디)에선 헤더 워드마크 자리에 그 블로그 제목 (앱 화면은 시리즈 규칙대로 DoDo·BLOG)
  const blog = isOwner && profile ? { profile, posts, categories } : pub.data?.blog ?? null;
  const current = handle && slug ? blog?.posts.find((p) => p.slug === slug) ?? null : null;
  const brand = !isApp && blog ? { title: blog.profile.title, href: blogHome(blog.profile.handle) } : undefined;
  // 블로그 화면 헤더 검색: 그 블로그의 글 (주인이면 임시글도 — 고르면 에디터로)
  const search = !isApp && blog ? (
    <Search posts={blog.posts} onPick={(p) => go(p.status === "public" ? postUrl(blog.profile.handle, p.slug) : app("/edit/" + p.id))} />
  ) : undefined;
  const nav = (
    <TopNav brand={brand} search={search} account={account} isLocal={isLocal} myBlog={profile ? blogHome(profile.handle) : null} menuOpen={menuOpen} setMenuOpen={setMenuOpen} onSignIn={() => signIn()} onSignOut={() => signOut()} />
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

    if (sub[0] === "my") {
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
    } else if (sub[0] === "categories" && ready) {
      main = <CategoriesPage profile={profile} categories={categories} posts={posts} actions={{ add: actions.addCategory, update: actions.updateCategory, remove: actions.deleteCategory }} />;
    } else if (sub[0] === "import" && ready) {
      main = <ImportPage profile={profile} onImport={actions.importPosts} onDone={() => go(blogHome(profile.handle))} />;
    } else if (sub[0] === "edit" && sub[1] && ready) {
      const post = posts.find((p) => p.id === sub[1]);
      main = !post ? (
        <NotFound text="글을 찾을 수 없어요" href={blogHome(profile.handle)} />
      ) : (
        <Editor
          key={post.id}
          profile={profile}
          post={post}
          categories={categories}
          actions={actions}
          unfold={null}
          onBack={() => {
            actions.discardEmpty(post.id);
            go(blogHome(profile.handle));
          }}
        />
      );
    } else main = loading; // "/" 와 "/write" 는 위 effect 가 옮김

    const editing = sub[0] === "edit";
    return (
      <div className="page">
        {nav}
        {editing ? <div className="app one"><main className="main">{main}</main></div> : main}
        {!editing && sub[0] !== "import" && sub[0] !== "categories" && <SiteFooter />}
        {store.net.offline && <NetBar n={store.net.waiting} />}
        <Toasts toasts={store.toasts} dismiss={store.dismiss} />
      </div>
    );
  }

  /* ── 블로그 화면 (/<handle>, /<handle>/<slug>) — 누구나 ── */
  const unfold = sideFolded ? (
    <button className="side-tg" aria-label="사이드바 펼치기" title="펼치기" onClick={toggleSide}>
      <SideIcon />
    </button>
  ) : null;

  let main: ReactNode;
  if (!blog) {
    const waiting = auth.status === "loading" || (userId && (store.status === "loading" || store.status === "idle")) || !pub.data || pub.data.status === "loading";
    main = waiting ? loading : pub.data?.status === "error" ? <RetryGate retry={pub.retry} /> : <NotFound text="그런 블로그가 없어요" href={APP} />;
  } else if (slug) {
    const post = blog.posts.find((p) => p.slug === slug && (isOwner || p.status === "public"));
    main = !post ? (
      <NotFound text="글을 찾을 수 없어요" href={blogHome(blog.profile.handle)} />
    ) : (
      <PostView
        profile={blog.profile}
        post={post}
        categories={blog.categories}
        onCategory={(id) => {
          setFilter({ category: id, tag: null, month: null });
          go(blogHome(blog.profile.handle));
        }}
        isOwner={isOwner}
        unfold={unfold}
        onEdit={isOwner ? () => go(app("/edit/" + post.id)) : undefined}
      />
    );
  } else {
    main = (
      <PostList
        profile={blog.profile}
        posts={blog.posts}
        categories={blog.categories}
        filter={filter}
        isOwner={isOwner}
        unfold={unfold}
        onNew={isOwner ? () => go(app("/write")) : undefined}
        onImport={isOwner ? () => go(app("/import")) : undefined}
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
            <BlogSide
              handle={blog.profile.handle}
              posts={blog.posts}
              categories={blog.categories}
              filter={filter}
              onFilter={(f) => {
                setFilter(f);
                if (slug) go(blogHome(blog.profile.handle));
              }}
              currentPostId={current?.id ?? null}
              isOwner={isOwner}
            />
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
