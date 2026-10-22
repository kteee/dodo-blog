/**
 * 주소 체계 (dododiary.com 바로 밑, 브런치·미디엄 식):
 *   블로그 홈   dododiary.com/@<아이디>
 *   글          dododiary.com/@<아이디>/<글주소>
 *   앱 화면     dododiary.com/blog, /blog/write, /blog/edit/<id>, /blog/import, /blog/my, /blog/privacy
 * 두두 홈(dodo-home)이 dododiary.com 을 갖고 있고, 이 앱은 Cloudflare 라우트 `dododiary.com/@*`·`dododiary.com/blog*` 로만 붙는다.
 * 빌드 에셋은 /blog/assets/… (vite.config.ts 의 base) 라 홈과 겹치지 않는다.
 */
export const SITE = "https://dododiary.com";
export const APP = "/blog";

/** 앱 화면 경로. app("/my") → "/blog/my", app() → "/blog" */
export const app = (p = "") => APP + p;
/** 블로그 홈 "/@아이디" */
export const blogHome = (handle: string) => `/@${handle}`;
/** 글 주소 "/@아이디/글주소" */
export const postUrl = (handle: string, slug: string) => `${blogHome(handle)}/${encodeURIComponent(slug)}`;
/** 화면에 보여 주는 주소 (프로토콜 없이) */
export const showUrl = (handle: string) => `dododiary.com/@${handle}`;
