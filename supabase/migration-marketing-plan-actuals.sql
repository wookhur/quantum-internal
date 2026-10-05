-- ============================================================
-- 2027 사업계획 — 월별 실적 입력
-- ------------------------------------------------------------
-- 마케팅 > 지표 > '2027 목표' 탭은 계획서에서 월별 목표를 자동으로 계산한다.
-- 실적 중 콘텐츠 수와 문의 건수는 이미 시스템에 쌓이지만(SNS 콘텐츠·리드),
-- 아래 세 가지는 밖에서 보고 와야 해서 쌓이는 곳이 없었다.
--
--  · 인스타 팔로워 — 인스타 앱이 보여 주는 '진짜' 숫자.
--    콘텐츠별 팔로우 증가를 더한 추정치는 언팔로우·콘텐츠 외 유입이 빠져 어긋난다.
--  · 유료 구독자  — 구독 앱의 월말 결제 유지 인원
--  · 신규 가입    — 그 달에 새로 가입한 수. 유지율(계획서 전제 30%)을 실제로 검증하려면 필요하다.
--
-- 한 달에 한 줄. 같은 달을 다시 저장하면 덮어쓴다(month 유니크).
-- 열람: 로그인한 전 직원. 입력·수정: admin / c_level / marketing_manager.
-- Safe to re-run.
-- ============================================================

create table if not exists public.marketing_plan_actuals (
  id                   uuid primary key default gen_random_uuid(),
  month                text not null unique,          -- 'YYYY-MM'
  instagram_followers  integer,                       -- 월말 인스타 팔로워 (앱 기준)
  paid_subscribers     integer,                       -- 월말 유료 구독자
  app_signups          integer,                       -- 그 달 신규 가입
  notes                text,
  created_by           uuid references public.profiles(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists marketing_plan_actuals_month_idx
  on public.marketing_plan_actuals (month desc);

alter table public.marketing_plan_actuals enable row level security;

-- 열람: 로그인한 직원 전원 (목표 대비 실적은 공유 지표)
drop policy if exists marketing_plan_actuals_read on public.marketing_plan_actuals;
create policy marketing_plan_actuals_read on public.marketing_plan_actuals
  for select to authenticated
  using (true);

-- 입력·수정·삭제: 관리자 / C레벨 / 마케팅 책임자
drop policy if exists marketing_plan_actuals_write on public.marketing_plan_actuals;
create policy marketing_plan_actuals_write on public.marketing_plan_actuals
  for all to authenticated
  using       (exists (select 1 from public.profiles
                        where id = auth.uid()
                          and role = any (array['admin','c_level','marketing_manager'])))
  with check  (exists (select 1 from public.profiles
                        where id = auth.uid()
                          and role = any (array['admin','c_level','marketing_manager'])));

comment on table public.marketing_plan_actuals is
  '2027 사업계획 월별 실적(인스타 팔로워·유료 구독자·신규 가입). 목표 대비 달성률의 실적 쪽 원천.';

notify pgrst, 'reload schema';
