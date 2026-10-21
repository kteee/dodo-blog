-- 두두 블로그 스키마 (전체). Supabase 대시보드 → SQL Editor 에 통째로 붙여넣고 실행.
-- 두두 투두·북로그와 같은 프로젝트에 blog_profiles / blog_posts 테이블과 blog-images 버킷을 추가한다.
-- 내용은 migrations/001_blog.sql 과 같고, 30일 파기 예약(pg_cron)은 migrations/002_purge_deleted.sql 을 따로 실행한다.
--
-- 원칙 (투두와 같음 + 블로그만의 한 가지):
--   (1) 쓰기는 내 행만 (RLS)        (2) 클라이언트는 하드 삭제를 못 한다 (소프트 삭제만)
--   (3) 읽기는 두 갈래: 내 것은 전부, 남의 것은 "공개한 글"만 — 로그인 안 한 방문자(anon)도 공개 글은 읽는다

-- ── 공통 함수 (투두·북로그와 공유, 같은 내용) ────────────
create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create or replace function public.enforce_row_limit() returns trigger
language plpgsql set search_path = '' as $$
declare
  lim int := tg_argv[0]::int;
  n   int;
begin
  execute format('select count(*) from %I.%I where user_id = $1', tg_table_schema, tg_table_name)
    into n using new.user_id;
  if n >= lim then
    raise exception '사용자당 최대 % 개까지 저장할 수 있습니다', lim using errcode = 'check_violation';
  end if;
  return new;
end $$;

-- ── 아이디 규칙: 소문자·숫자·하이픈 3~20자, 하이픈으로 시작·끝 안 됨, 예약어 아님 (src/lib/types.ts 의 handleProblem 과 같은 규칙) ──
create or replace function public.blog_handle_ok(h text) returns boolean
language sql immutable set search_path = '' as $$
  select h ~ '^[a-z0-9]([a-z0-9-]{1,18}[a-z0-9])?$'
     and h not in ('write','edit','my','privacy','import','new','login','logout','auth','api','assets','static','fonts',
                   'admin','root','blog','www','todo','books','home','dodo','dododiary','about','help','settings','search','tag','tags','rss','feed','sitemap');
$$;

-- ── 블로그 주인 정보 (계정당 한 행) ──────────────────────
create table if not exists public.blog_profiles (
  user_id     uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  handle      text not null unique check (public.blog_handle_ok(handle)),   -- 주소 조각 /<handle>. 만든 뒤 못 바꿈
  title       text not null check (char_length(title) between 1 and 40),    -- 블로그 이름
  bio         text not null default '' check (char_length(bio) <= 200),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ── 글 ─────────────────────────────────────────────────
create table if not exists public.blog_posts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  -- 주소 조각 /<handle>/<slug>. 임시글은 '' 이고 공개할 때 제목에서 만든다. '/' 는 못 씀
  slug          text not null default '' check (char_length(slug) <= 120 and slug !~ '[/\s]'),
  title         text not null default '' check (char_length(title) <= 120),
  body_md       text not null default '' check (octet_length(body_md) <= 102400),   -- 100KB (한글 약 3만 자)
  tags          text[] not null default '{}' check (cardinality(tags) <= 10),
  status        text not null default 'draft' check (status in ('draft', 'public')),
  published_at  timestamptz,                                                          -- 처음 공개한 시각
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  -- 공개 글은 주소가 있어야 함
  check (status = 'draft' or char_length(slug) >= 1)
);

-- 같은 사람의 살아 있는 글끼리 주소가 겹치면 안 됨 (임시글 '' 은 여러 개 가능)
create unique index if not exists blog_posts_user_slug_uq on public.blog_posts (user_id, slug) where deleted_at is null and slug <> '';
create index if not exists blog_posts_user_idx     on public.blog_posts (user_id);
create index if not exists blog_posts_public_idx   on public.blog_posts (user_id, published_at desc) where deleted_at is null and status = 'public';
create index if not exists blog_posts_deleted_idx  on public.blog_posts (deleted_at) where deleted_at is not null;

-- ── updated_at 자동 갱신 ───────────────────────────────
drop trigger if exists blog_profiles_touch on public.blog_profiles;
create trigger blog_profiles_touch before update on public.blog_profiles
  for each row execute function public.touch_updated_at();
drop trigger if exists blog_posts_touch on public.blog_posts;
create trigger blog_posts_touch before update on public.blog_posts
  for each row execute function public.touch_updated_at();

-- ── 남용 방지 상한: 글 3,000 (삭제 대기 중인 행 포함) ──
drop trigger if exists blog_posts_limit on public.blog_posts;
create trigger blog_posts_limit before insert on public.blog_posts
  for each row execute function public.enforce_row_limit('3000');

-- ── RLS ───────────────────────────────────────────────
alter table public.blog_profiles enable row level security;
alter table public.blog_posts    enable row level security;

-- 주인 정보: 누구나 읽음(아이디·블로그 이름·소개뿐), 쓰기는 본인만. delete 정책 없음 (탈퇴하면 cascade 로 지워짐)
drop policy if exists "public select" on public.blog_profiles;
drop policy if exists "own insert"    on public.blog_profiles;
drop policy if exists "own update"    on public.blog_profiles;
create policy "public select" on public.blog_profiles for select to anon, authenticated using (true);
create policy "own insert"    on public.blog_profiles for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own update"    on public.blog_profiles for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- 글: 내 것은 전부 / 남의 것은 공개한 글만 (삭제된 건 제외). 쓰기는 본인만, delete 정책 없음
drop policy if exists "own select"    on public.blog_posts;
drop policy if exists "public select" on public.blog_posts;
drop policy if exists "own insert"    on public.blog_posts;
drop policy if exists "own update"    on public.blog_posts;
create policy "own select"    on public.blog_posts for select to authenticated using (user_id = (select auth.uid()));
create policy "public select" on public.blog_posts for select to anon, authenticated using (status = 'public' and deleted_at is null);
create policy "own insert"    on public.blog_posts for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own update"    on public.blog_posts for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- 로그인 안 한 방문자는 읽기만
revoke insert, update, delete on public.blog_profiles from anon;
revoke insert, update, delete on public.blog_posts    from anon;

-- ── 이미지 버킷: 공개 읽기, 쓰기는 내 폴더(<user_id>/…)에만, 5MB·이미지만 ──
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('blog-images', 'blog-images', true, 5242880, array['image/png','image/jpeg','image/gif','image/webp','image/avif','image/svg+xml'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "blog images public read" on storage.objects;
drop policy if exists "blog images own insert"  on storage.objects;
drop policy if exists "blog images own update"  on storage.objects;
drop policy if exists "blog images own delete"  on storage.objects;
create policy "blog images public read" on storage.objects for select to anon, authenticated
  using (bucket_id = 'blog-images');
create policy "blog images own insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'blog-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "blog images own update" on storage.objects for update to authenticated
  using (bucket_id = 'blog-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "blog images own delete" on storage.objects for delete to authenticated
  using (bucket_id = 'blog-images' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ── 블로그 그만두기 / 두두 계정 (투두 008_account.sql 과 같은 구조) ─────────
-- 두두 시리즈(투두·북로그·블로그)는 Supabase 프로젝트·계정 하나를 같이 쓴다.
--   delete_blog_data()   블로그 기록만 하드 삭제: 글(임시·삭제 대기 포함)·블로그 주소(프로필)·Storage 의 내 이미지 목록 행.
--                        계정과 다른 서비스는 그대로. 다음 방문 땐 다시 "블로그 만들기"부터
--   delete_my_account()  **원본은 투두 `dodo-todo/supabase/migrations/008_account.sql`** — 서비스별 delete_*_data 가
--                        있는 만큼 차례로 부른 뒤 계정(auth.users)을 지운다. 이 파일은 그 함수를 다시 정의하지 않는다.
-- security definer + auth.uid() 고정이라 본인 것만 지울 수 있고, 클라이언트 키로 직접 하드 삭제는 여전히 불가.
-- Storage 의 파일 자체는 앱이 삭제 직전에 Storage API 로 지운다 (기록 삭제·계정 탈퇴 둘 다). 여기선 남은 목록 행만 한 번 더 정리.
create or replace function public.delete_blog_data() returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  delete from storage.objects where bucket_id = 'blog-images' and (storage.foldername(name))[1] = uid::text;
  delete from public.blog_posts    where user_id = uid;
  delete from public.blog_profiles where user_id = uid;
end $$;

revoke all on function public.delete_blog_data() from public, anon;
grant execute on function public.delete_blog_data() to authenticated;
