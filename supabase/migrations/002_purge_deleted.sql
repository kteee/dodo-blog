-- 002: 삭제한 지 30일 지난 글을 매일 영구 삭제 (개인정보 처리방침 3항 "삭제 후 30일 보관 후 파기")
-- 실행 전: Supabase 대시보드 → Database → Extensions 에서 "pg_cron" 이 켜져 있어야 함 (투두 005 에서 이미 켰으면 그대로)
-- 참고: 글에서 뺀 이미지 파일은 자동으로 안 지워진다 (글 본문에서 주소만 사라짐). 용량이 문제 되면 그때 정리 작업을 따로 만든다.

create extension if not exists pg_cron;

-- 매일 새벽 4시(UTC 19:00 = 한국 04:00). 같은 이름의 예약이 있으면 덮어씀
select cron.schedule(
  'dodo-blog-purge-deleted',
  '0 19 * * *',
  $$
    delete from public.blog_posts      where deleted_at is not null and deleted_at < now() - interval '30 days';
    delete from public.blog_categories where deleted_at is not null and deleted_at < now() - interval '30 days';
  $$
);

-- 확인: select * from cron.job;   실행 기록: select * from cron.job_run_details order by start_time desc limit 5;
