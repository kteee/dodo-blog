-- 004: 카테고리 폴더 트리 (dev-wiki 의 content/ 폴더 구조를 DB 로) — 이미 001 을 실행한 프로젝트에 한 번 실행. (schema.sql 에도 반영됨)
--   blog_categories: parent_id 로 중첩, sort_order 로 같은 부모 안 순서, 소프트 삭제
--   blog_posts.category_id: 글이 속한 카테고리 (null = 미분류). 남의 카테고리에 내 글을 붙이는 건 복합 외래키로 막음
-- 읽기는 글과 같은 두 갈래: 내 것은 전부, 남의 것은 누구나(카테고리 이름은 공개 블로그 사이드바에 보임). 쓰기는 본인만

create table if not exists public.blog_categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  parent_id   uuid,                                                   -- null = 최상위
  name        text not null check (char_length(name) between 1 and 30),
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  unique (id, user_id),
  -- 부모도 내 카테고리여야 함
  foreign key (parent_id, user_id) references public.blog_categories (id, user_id)
);

create index if not exists blog_categories_user_idx    on public.blog_categories (user_id);
create index if not exists blog_categories_deleted_idx on public.blog_categories (deleted_at) where deleted_at is not null;

alter table public.blog_posts add column if not exists category_id uuid;
alter table public.blog_posts drop constraint if exists blog_posts_category_fk;
alter table public.blog_posts add constraint blog_posts_category_fk
  foreign key (category_id, user_id) references public.blog_categories (id, user_id);
create index if not exists blog_posts_category_idx on public.blog_posts (category_id) where category_id is not null;

drop trigger if exists blog_categories_touch on public.blog_categories;
create trigger blog_categories_touch before update on public.blog_categories
  for each row execute function public.touch_updated_at();

-- 남용 방지 상한: 카테고리 300 (삭제 대기 중인 행 포함)
drop trigger if exists blog_categories_limit on public.blog_categories;
create trigger blog_categories_limit before insert on public.blog_categories
  for each row execute function public.enforce_row_limit('300');

alter table public.blog_categories enable row level security;
drop policy if exists "own select"    on public.blog_categories;
drop policy if exists "public select" on public.blog_categories;
drop policy if exists "own insert"    on public.blog_categories;
drop policy if exists "own update"    on public.blog_categories;
create policy "own select"    on public.blog_categories for select to authenticated using (user_id = (select auth.uid()));
create policy "public select" on public.blog_categories for select to anon, authenticated using (deleted_at is null);
create policy "own insert"    on public.blog_categories for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own update"    on public.blog_categories for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke insert, update, delete on public.blog_categories from anon;

-- 블로그 그만두기에 카테고리도 포함 (delete_blog_data 재정의)
create or replace function public.delete_blog_data() returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  delete from storage.objects where bucket_id = 'blog-images' and (storage.foldername(name))[1] = uid::text;
  delete from public.blog_posts      where user_id = uid;
  delete from public.blog_categories where user_id = uid;
  delete from public.blog_profiles   where user_id = uid;
end $$;

-- 30일 파기 예약에 카테고리 추가 (같은 이름이라 덮어씀)
select cron.schedule(
  'dodo-blog-purge-deleted',
  '0 19 * * *',
  $$
    delete from public.blog_posts      where deleted_at is not null and deleted_at < now() - interval '30 days';
    delete from public.blog_categories where deleted_at is not null and deleted_at < now() - interval '30 days';
  $$
);
