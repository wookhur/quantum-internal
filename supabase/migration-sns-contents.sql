-- ============================================================
-- 마케팅 주간보고서 — SNS 콘텐츠 성과
-- ------------------------------------------------------------
-- 인스타그램 등 SNS 에 올린 콘텐츠 한 건당 한 줄. 마케팅팀이 채널 인사이트에서
-- 본 숫자를 그대로 입력하면, 주간보고서가 기간으로 잘라 집계한다.
--
-- 왜 새 표가 필요한가: video_projects 는 영상 제작 진행(상태·체크리스트)을 관리하는
-- 표라 게시일·저장수·팔로우 증가 같은 '성과' 칸이 없다. 성과는 따로 쌓는다.
--
-- 열람: 로그인한 전 직원. 입력·수정: admin / c_level / marketing_manager.
-- Safe to re-run.
-- ============================================================

create table if not exists public.sns_contents (
  id          uuid primary key default gen_random_uuid(),
  channel     text not null default 'instagram',  -- instagram / youtube / blog / threads / etc
  posted_at   date not null,                      -- 게시일 (주간보고서 기간 기준)
  title       text not null,                      -- 콘텐츠명
  category    text,                               -- 카테고리 (예: 미국대학, 입시정보)
  url         text,                               -- 게시물 링크
  -- 채널 인사이트에서 보이는 숫자 그대로
  views       integer not null default 0,         -- 조회수(도달)
  likes       integer not null default 0,
  comments    integer not null default 0,
  saves       integer not null default 0,         -- 저장
  shares      integer not null default 0,         -- 공유
  follows     integer not null default 0,         -- 이 콘텐츠로 늘어난 팔로워
  notes       text,
  created_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists sns_contents_posted_idx  on public.sns_contents (posted_at desc);
create index if not exists sns_contents_channel_idx on public.sns_contents (channel);

alter table public.sns_contents enable row level security;

-- 열람: 로그인한 직원 전원 (마케팅 성과는 공유 지표)
drop policy if exists sns_contents_read on public.sns_contents;
create policy sns_contents_read on public.sns_contents
  for select to authenticated
  using (true);

-- 입력·수정·삭제: 관리자 / C레벨 / 마케팅 책임자
drop policy if exists sns_contents_write on public.sns_contents;
create policy sns_contents_write on public.sns_contents
  for all to authenticated
  using       (exists (select 1 from public.profiles
                        where id = auth.uid()
                          and role = any (array['admin','c_level','marketing_manager'])))
  with check  (exists (select 1 from public.profiles
                        where id = auth.uid()
                          and role = any (array['admin','c_level','marketing_manager'])));

comment on table public.sns_contents is
  'SNS 콘텐츠별 성과(조회·좋아요·댓글·저장·공유·팔로우). 마케팅 주간보고서의 원천 데이터.';

notify pgrst, 'reload schema';
