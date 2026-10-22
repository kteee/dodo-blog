# DoDo blog — 두두 블로그

마크다운으로 쓰는 나만의 블로그. 사용자마다 주소가 하나 — **`https://dododiary.com/@<아이디>`** (브런치·미디엄처럼 브랜드 도메인 바로 밑).
두두 시리즈의 세 번째 서비스 (투두 → 북로그 → 블로그). "다이어리에 적듯이" — 제목·태그·본문, 임시글/공개 두 가지뿐.

- 프론트: Vite + React + TypeScript (서버 없음, 정적 파일만 배포)
- 데이터·인증: Supabase — **두두 투두·북로그와 같은 프로젝트, 같은 구글 계정**. 테이블은 `blog_profiles`, `blog_posts`, 이미지는 Storage 버킷 `blog-images`
- 에디터: 순수 textarea + 실시간 미리보기 (dev-wiki 의 editor.js 를 React 로 옮김). 번들에 에디터 라이브러리 없음 → 한글 입력은 브라우저 그대로
- 렌더: marked(gfm, 줄바꿈 = Enter) + DOMPurify(남의 글도 보이므로 필수) + `==형광펜==`
- 환경변수가 없으면 **로컬 모드**: 이 브라우저 localStorage 에만 저장, 로그인 없이 바로 써볼 수 있음

## 화면

| 경로 | 내용 |
|---|---|
| `/blog` | 로그인 전: 소개 + Google 로그인. 로그인 후 블로그가 없으면 **아이디·이름 정하기**, 있으면 `/@<아이디>` 로 |
| `/@<아이디>` | 글 목록 (공개일 최신순). 왼쪽 사이드: 블로그 이름·소개 → 전체/임시글(주인만) → 태그 → 달. 주인에겐 **＋ 새 글**, **가져오기** |
| `/@<아이디>/<글주소>` | 글 보기. 본문 720px, 넓은 화면(1181px~)엔 오른쪽 목차. 주인에겐 **수정** |
| `/blog/write` → `/blog/edit/<id>` | 에디터. 제목 · 태그(쉼표) · 툴바 · 본문 textarea \| 미리보기 (폰은 쓰기/미리보기 탭). **0.5초 멈추면 자동 저장**. 공개하기 / 비공개로 / ⋯(주소 바꾸기·삭제) |
| `/blog/import` | .md 여러 개 → 글 (frontmatter title·date·tags, 없으면 첫 # 제목·파일 이름). 임시글로 또는 바로 공개 |
| `/blog/my` · `/blog/privacy` | 블로그 이름·소개 수정, 데이터 내보내기(JSON), 회원 탈퇴 / 개인정보 처리방침 |

- 주소 체계와 경로 헬퍼는 `src/lib/paths.ts` (`app()`, `blogHome()`, `postUrl()`). 글쓰기 화면(`/blog/write·edit·import·my`)은 `<meta name="robots" content="noindex">`
- 로그인 안 한 손님도 `/@<아이디>` 와 공개 글은 볼 수 있음 (헤더에 작은 로그인 버튼)
- 글 주소(slug)는 **공개할 때 제목에서** 만듦 (한글 그대로, 공백은 `-`). 겹치면 `-2`. ⋯ > 주소 바꾸기로 직접 지정 가능
- 삭제는 **소프트 삭제** + "실행 취소" 토스트. 30일 뒤 영구 삭제. 임시글은 제목·본문 없이 나가면 조용히 지움
- 이미지: 툴바 버튼·붙여넣기·끌어다 놓기 → Supabase Storage `blog-images/<내 id>/…` (5MB, 이미지만). 로컬 모드는 data: 주소로 본문에 들어감
- 아이디 규칙: 소문자·숫자·하이픈 3~20자, 예약어(admin·dodo·todo·books·… 브랜드·사칭 방지용, `src/lib/types.ts`) 금지. 주소에 `@` 가 붙어 화면 경로와는 안 부딪힘. 한 번 정하면 못 바꿈

### 에디터 (dev-wiki 에서 가져온 것)

- 툴바: H1~H3 · 굵게/기울임/취소선/형광펜 · 목록/번호/체크/인용 · 들여쓰기 · 링크/이미지/표 · 인라인 코드/코드 블록 · 구분선/접기. 같은 버튼 두 번 → 마커 제거
- Enter: 목록·번호·체크·인용·표 행을 이어감 (빈 항목에서 Enter 면 끝). Tab: 들여쓰기, 표 안에선 다음 칸. Ctrl+B/I
- 커서가 표 위에 있으면 위에 **표 편집 격자**가 열림: 셀 입력·행/열 추가·삭제·정렬. 격자에 치면 본문의 파이프 문법이 같이 바뀜
- 한글 조합 중(`isComposing`)엔 Enter/Tab 을 가로채지 않음

## 글꼴

설정(⚙) > 글꼴: 기본(IBM Plex Sans KR) · 고딕(맑은 고딕) · 명조(본명조). 투두·북로그와 같음. 본문 textarea 만 고정폭.

## 바로 실행 (로컬 모드)

```bash
npm install
npm run dev
```

http://localhost:5180/blog (투두 5175 · 북로그 5177 · 홈 5178). `/` 는 `/blog` 로 보내고, `/@아이디` 도 그대로 열림 (`vite.config.ts` 의 개발용 플러그인)

## Supabase 연결

투두와 같은 프로젝트를 쓰므로 프로젝트·구글 로그인은 이미 돼 있다. 할 일은 테이블·버킷 추가와 주소 등록뿐.

1. **SQL Editor** 에 `supabase/schema.sql` 전체를 붙여넣고 Run
   - `blog_profiles`(계정당 한 행, handle 유니크), `blog_posts` + RLS + 상한(글 3,000 / 본문 100KB / 태그 10) + Storage 버킷 `blog-images` 와 정책
   - **읽기 정책이 두 갈래**: 내 글은 전부(`own select`), 남의 글은 `status='public'` 만 — `anon` 도 읽음. 쓰기는 본인만, delete 정책 없음
   - `touch_updated_at`, `enforce_row_limit` 는 투두·북로그와 같은 내용. `delete_blog_data()` 추가 (아래 "두두 계정"). `delete_my_account` 는 **여기서 정의하지 않음** — 투두 008 이 원본
   - 투두 `supabase/migrations/008_account.sql` 이 먼저 실행돼 있어야 "두두 계정 탈퇴"가 블로그 기록까지 지운다 (008 은 `delete_blog_data` 가 있으면 부름)
2. 30일 지난 삭제분 파기: `supabase/migrations/002_purge_deleted.sql` 실행 (pg_cron 은 투두 005 에서 이미 켜져 있음)
   - 001 을 주소 변경 전에 실행했다면 `003_handle_reserved.sql` 도 실행 (예약어 목록 축소)
3. **Authentication → URL Configuration → Redirect URLs** 에 추가:
   - `https://dododiary.com/blog`
   - `http://localhost:5180/blog` (개발용)
   - 예전 `https://blog.dododiary.com` 이 있으면 지움
4. `.env.example` 을 `.env` 로 복사하고 채움 — `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` 는 **투두 `.env` 값 그대로**
5. `npm run dev` → "Google 계정으로 로그인" → 아이디 정하기

> Publishable key 는 브라우저에 노출돼도 되는 키. 보안은 RLS 가 담당한다.
> **Secret key(`sb_secret_...`)나 service_role 키는 절대 `.env` 에 넣지 말 것.**

### 두두 계정 (투두·북로그·블로그 공통)

두두 서비스는 Supabase 프로젝트·구글 로그인·계정을 하나로 같이 쓴다.

- **로그인 공유**: 세션을 localStorage 대신 `.dododiary.com` 쿠키에 저장(`src/data/supabase.ts`, `@supabase/ssr`). 한 서비스에서 로그인하면 todo/books/blog/홈 모두 로그인 상태. localhost 에선 그 주소에만 저장. 투두·북로그의 `supabase.ts` 와 같은 쿠키 설정.
- **블로그 그만두기 vs 계정 탈퇴** (마이페이지):
  - `delete_blog_data()` — 글(임시·삭제 대기 포함)·블로그 주소(프로필)·Storage 이미지 목록 행을 하드 삭제. 앱은 그 직전에 Storage API 로 이미지 파일을 지운다. 계정과 다른 서비스는 그대로이고, 다음 방문 땐 다시 "블로그 만들기"부터 (아이디는 다른 사람이 가져갈 수 있음).
  - `delete_my_account()` — **원본은 투두 `dodo-todo/supabase/migrations/008_account.sql`**: `delete_todo_data`·`delete_books_data`·`delete_blog_data` 중 있는 것을 전부 부른 뒤 계정 삭제. 블로그 schema.sql 은 이 함수를 다시 정의하지 않는다. 블로그 앱도 탈퇴 직전에 이미지 파일을 먼저 지운다.
- 배포 순서: 투두 008 → 블로그 `schema.sql` → 블로그 배포 (쿠키 전환이라 기존 로그인은 한 번 다시).

### 백업

투두의 GitHub Actions 백업(`dodo-todo/.github/workflows/backup.yml`)이 `public` 스키마 전체를 뜨므로 `blog_profiles`, `blog_posts` 도 같이 백업된다.
덤프 검사 목록에 `blog_profiles blog_posts` 를 추가해 두면 빠졌을 때 알림이 온다. **Storage 의 이미지 파일은 백업에 안 들어간다** (처리방침 3항에 명시).

## 배포 (Cloudflare Workers, 같은 호스트에 홈 + 블로그)

`dododiary.com` 은 두두 홈(dodo-home) Worker 가 **커스텀 도메인**으로 갖고 있다. 블로그 Worker 는 같은 호스트에 **라우트** 두 개로 붙는다:
`dododiary.com/@*` (블로그 홈·글) 와 `dododiary.com/blog*` (앱 화면 + `/blog/assets/…` 에셋). `wrangler.jsonc` 에 적어 뒀다.

> 우선순위 (Cloudflare 문서 [Routes](https://developers.cloudflare.com/workers/configuration/routing/routes/)): "Routes can `fetch()` Custom Domains and **take precedence if configured on the same hostname**."
> 즉 라우트에 걸리는 `/@…`·`/blog…` 는 블로그 Worker 가 받고, 나머지는 홈 Worker 가 받는다. 홈 쪽은 손댈 것 없음.
> 라우트 패턴은 끝에 `*` 만 허용(중간 와일드카드 불가)이고, `/@*` 는 `/@` 로 시작하는 모든 경로에 맞는다.

1. GitHub 저장소 `kteee/dodo-blog` 에 푸시 (돼 있음)
2. Cloudflare 대시보드 → **Workers & Pages → Create → Workers → Import a repository** → `dodo-blog` 선택
   - Build command `npm run build`, Deploy command `npx wrangler deploy`
   - `wrangler.jsonc` 의 `routes` 가 배포 때 같이 등록된다 (`zone_name: dododiary.com`). 대시보드에서 확인: Worker → Settings → **Domains & Routes** 에 `dododiary.com/@*`, `dododiary.com/blog*` 두 줄
   - 등록이 안 됐으면 거기서 **Add → Route** 로 같은 패턴 두 개를 Zone `dododiary.com` 에 직접 추가
   - `workers_dev: false` 라 `*.workers.dev` 주소는 안 생김
3. **빌드용 변수** (Settings → Build → Variables and secrets):
   `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SENTRY_DSN`(선택), `NODE_VERSION=22`
   - 값이 빠지면 배포판은 "서비스 설정 오류" 화면을 띄움 (조용히 로컬 모드로 가지 않게)
4. 확인: `https://dododiary.com/blog` 가 블로그 로그인 화면, `https://dododiary.com/@아이디` 가 블로그 홈, `https://dododiary.com/` 은 그대로 두두 홈
   - `/@…` 요청도 블로그 Worker 의 정적 에셋에 없는 경로라 `not_found_handling: single-page-application` 으로 블로그 index.html 이 나간다
5. Supabase Redirect URLs: `https://dododiary.com/blog` 추가, `https://blog.dododiary.com` 제거 (위 "Supabase 연결" 3번)
   - `blog.dododiary.com` 은 아래 '301 리다이렉트' 로 살려 둔다
6. **홈(dodo-home) 쪽**: `robots.txt` 는 루트(홈 Worker) 것만 읽히므로 홈 robots 에 `Disallow: /blog/write`, `/blog/edit/`, `/blog/my`, `/blog/import` 추가. 홈 푸터·/account 의 블로그 링크는 `https://dododiary.com/blog`. 투두 `AppsMenu` · 북로그 푸터의 블로그 링크도 같은 주소

### `blog.dododiary.com` → `dododiary.com/blog` 301 (입구 주소 유지)

투두(`todo.`)·북로그(`books.`)와 입구 모양을 맞추려고 `blog.dododiary.com` 은 살려 두고 실제 주소로 **301 리다이렉트**한다. 코드가 아니라 Cloudflare 설정 두 가지로 한다 (경로·쿼리 보존: `blog.dododiary.com/x?y` → `dododiary.com/blog/x?y`).

1. **DNS 레코드** (Cloudflare → dododiary.com → DNS → Add record): 리다이렉트 규칙은 프록시를 거쳐야 돌아가므로 가짜 대상이라도 **Proxied** 레코드가 있어야 한다
   - Type `AAAA` · Name `blog` · IPv6 `100::` · Proxy status **Proxied(주황 구름)** · TTL Auto
   - (`100::` 은 Cloudflare 문서가 "원본 없이 규칙만 돌릴 때" 쓰라고 안내하는 블랙홀 주소. `A 192.0.2.1` 도 같은 용도)
2. **Redirect Rule** (dododiary.com → Rules → Redirect Rules → Create rule):
   - Rule name: `blog subdomain → /blog`
   - When incoming requests match → **Custom filter expression**:
     ```
     (http.host eq "blog.dododiary.com")
     ```
   - Then → **Type: Dynamic**, Expression:
     ```
     concat("https://dododiary.com/blog", http.request.uri)
     ```
     `http.request.uri` 는 경로 + `?쿼리` 까지라 따로 "Preserve query string" 을 켤 필요 없음
   - Status code: **301**
   - 결과: `https://blog.dododiary.com/` → `https://dododiary.com/blog/`, `https://blog.dododiary.com/my?x=1` → `https://dododiary.com/blog/my?x=1`

- 홈·푸터·투두·북로그 등 서비스 소개 링크는 `https://blog.dododiary.com` 을 그대로 써도 된다 (리다이렉트됨). 블로그 **안**의 OG url·canonical·sitemap 은 실제 주소 `https://dododiary.com/...` 를 쓴다 (`index.html` 의 `og:url` 은 이미 그렇게)
- Supabase Redirect URLs 엔 `https://blog.dododiary.com` 을 넣지 않는다 (로그인은 늘 `https://dododiary.com/blog` 로 돌아옴)
- 확인: `curl -sI https://blog.dododiary.com/my?x=1 | grep -i location` → `location: https://dododiary.com/blog/my?x=1`

대안(라우트가 우선 적용되지 않는 경우): 홈 Worker 가 `/@*`·`/blog*` 를 [Service binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/) 으로 블로그 Worker 에 넘기는 방식. 지금은 문서상 라우트가 우선이라 쓰지 않는다.

### 2차: SEO 프리렌더

지금은 SPA 라 크롤러가 빈 HTML 을 본다. 북로그의 `run_worker_first` Worker 패턴으로 `/@<아이디>/<글>` 요청에 Worker 가 Supabase(anon 키)에서 글을 읽어 `<title>`·description·OG·본문 HTML 을 index.html 에 끼워 응답하면 된다. sitemap.xml 도 같은 Worker 에서 (`/blog/sitemap.xml` 로 내고 홈 robots 에 `Sitemap:` 줄 추가).

## 에러 알림 (Sentry)

투두와 같은 `src/lib/monitoring.ts`. 배포판 + `VITE_SENTRY_DSN` 이 있을 때만 켜지고, 글 내용은 보내지 않는다.

## 구조

```
src/
  App.tsx                 경로별 화면, 로그인 게이트, 내 블로그/남의 블로그 분기, 사이드 접기
  components/TopNav.tsx   헤더 (투두와 같은 구조. 손님에겐 작은 로그인 버튼)
  components/Landing.tsx  로그인 전 소개 · 블로그 만들기(아이디 검사·중복 확인)
  components/Blog.tsx     사이드(이름·태그·달) · 글 목록 · 글 보기(목차) · 글꼴 메뉴
  components/Editor.tsx   에디터 (툴바·자동 저장·이미지·공개/비공개·주소·삭제)
  components/TablePanel.tsx 표 편집 격자
  components/Markdown.tsx 마크다운 렌더 훅 · 목차
  components/Import.tsx   마크다운 가져오기
  components/MyPage.tsx · Privacy.tsx · SiteFooter.tsx · Toasts.tsx · ConfirmDialog.tsx · OptionsMenu.tsx
  data/useBlog.ts         내 블로그 상태 + 저장 큐 (투두 useDodo 와 같은 구조: 낙관적 반영, 순서 보장, 오프라인 재시도)
  data/supabase.ts        Supabase 저장소 (내 것 + 공개 읽기 + 이미지 업로드) / data/localRepo.ts 로컬 모드
  lib/editorOps.ts        편집 동작 순수 함수 (dev-wiki editor.js 이식: 서식·똑똑한 Enter/Tab·표 모델)
  lib/markdown.ts         marked + DOMPurify + 형광펜 + 목차 · frontmatter 분리
  lib/types.ts            타입·상한·아이디 규칙·slug·정렬·요약
  lib/paths.ts            주소 체계 (/blog, /@아이디, /@아이디/글)
  hooks/useRoute.ts       pushState 기반 경로
  styles.css              앞부분은 투두 styles.css 공통 부분 그대로, "블로그 전용" 부터가 이 서비스 것
supabase/schema.sql       전체 스키마 (= migrations/001_blog.sql)
supabase/migrations/      001 테이블·RLS·상한·버킷, 002 30일 파기(pg_cron)
public/_headers           CSP(img-src https: — 글에 적은 외부 이미지 허용)·HSTS·캐시 규칙 (/blog/assets/*)
vite.config.ts            base /blog/ + 개발 서버용 /@… 폴백·/ → /blog 리다이렉트
wrangler.jsonc            라우트 dododiary.com/@* · /blog*
```

## 안정성 (투두와 같은 규칙)

| 위험 | 대응 |
|---|---|
| 글이 사라짐 | DB 는 소프트 삭제만(delete 정책 없음) + "실행 취소" 토스트 |
| 저장 실패 | 화면 먼저 반영 → 실패하면 빨간 토스트 + 서버 상태로 다시 맞춤 |
| 오프라인 중 편집 | 저장 큐에 두고 연결이 돌아오면 재전송. 화면 위 배너로 대기 건수 |
| 자동저장 전에 탭 닫음 | 닫기 경고 + 숨길 때 즉시 저장 + fetch keepalive |
| 남의 임시글 접근 | RLS: 남의 글은 `public` 만. 임시글·삭제분은 본인만 |
| 남이 쓴 글의 스크립트 | DOMPurify 로 script·이벤트 속성 제거 + CSP `script-src 'self'` |
| 한 계정이 DB 용량을 채움 | 사용자당 글 3천 · 본문 100KB · 태그 10 · 이미지 5MB (버킷 설정) |
| 아이디 충돌·예약어 | DB `blog_handle_ok` 체크 + 유니크 + 화면에서 0.4초 디바운스 중복 확인 |
| 데이터 갇힘 | 마이페이지 → 데이터 내보내기 (JSON) |
