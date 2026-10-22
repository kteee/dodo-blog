-- 003: 아이디 예약어 축소 — 주소가 blog.dododiary.com/<아이디> 에서 dododiary.com/@<아이디> 로 바뀌어
-- 화면 경로(write·edit·my·privacy·import…)와 더는 안 부딪힌다. 브랜드·운영자 사칭 방지용만 남김.
-- 이미 schema.sql(001)을 실행한 프로젝트에 한 번 실행. (새 프로젝트는 schema.sql 에 반영돼 있음)
-- src/lib/types.ts 의 RESERVED_HANDLES 와 같은 목록.

create or replace function public.blog_handle_ok(h text) returns boolean
language sql immutable set search_path = '' as $$
  select h ~ '^[a-z0-9]([a-z0-9-]{1,18}[a-z0-9])?$'
     and h not in ('admin','root','official','support','help','dodo','dododiary','blog','todo','books','home','www','api','login','auth');
$$;
