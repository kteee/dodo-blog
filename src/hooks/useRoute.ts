import { useEffect, useState, type MouseEvent } from "react";

/** 주소 끝 슬래시를 뗀 경로. "/", "/book/<id>", "/my" */
const norm = (p: string) => p.replace(/\/+$/, "") || "/";

/** 현재 경로 — 뒤로가기(popstate)와 go() 로 바뀐다 */
export function useRoute(): string {
  const [path, setPath] = useState(() => norm(location.pathname));
  useEffect(() => {
    const on = () => setPath(norm(location.pathname));
    window.addEventListener("popstate", on);
    return () => window.removeEventListener("popstate", on);
  }, []);
  return path;
}

/** 페이지를 새로 받지 않고 경로만 바꿈 (SPA) */
export function go(path: string, replace = false) {
  if (norm(location.pathname) === norm(path)) return;
  if (replace) history.replaceState(null, "", path);
  else history.pushState(null, "", path);
  dispatchEvent(new PopStateEvent("popstate"));
}

/** <a> 클릭을 SPA 이동으로. 새 탭(ctrl/cmd/중간 클릭)은 브라우저에 맡김 */
export function onLinkClick(e: MouseEvent<HTMLAnchorElement>) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  go(e.currentTarget.getAttribute("href") ?? "/");
}
