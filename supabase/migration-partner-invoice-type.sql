-- 파트너 발행유형(개인/사업자) — 학생관리 자동청구를 개인/사업자 파트너 게시판으로
-- 갈라 넣기 위한 사람별 태그. 기본은 '개인'. 사업자로 거래하는 파트너(예: 김지현)를
-- '사업자'로 지정하면 그 사람의 자동청구가 사업자 파트너 게시판에만 뜬다(중복·누락 없음).
--
-- 사람 식별은 이름(정규화 키)으로 한다 — 자동청구 목록 자체가 컨설턴트 이름 기준이므로
-- 동일한 키를 그대로 쓴다. (canonicalConsultantName → consultantNameKey 결과)
--
-- (여러 번 실행해도 안전)

create table if not exists public.partner_invoice_types (
  name_key    text primary key,                 -- consultantNameKey(정규화 이름)
  display_name text,                             -- 참고용 원본 이름
  invoice_type text not null default 'individual'
    check (invoice_type in ('individual', 'business')),
  updated_at  timestamptz not null default now()
);

alter table public.partner_invoice_types enable row level security;

-- 조회: 로그인 사용자 전체(자동청구 필터에 필요, 민감정보 아님 — 개인/사업자 구분 값)
drop policy if exists pit_select on public.partner_invoice_types;
create policy pit_select on public.partner_invoice_types
  for select to authenticated using (true);

-- 쓰기(insert/update/delete): 재무 권한자만 (화면의 canAccessAccount 와 동일 기준)
drop policy if exists pit_write on public.partner_invoice_types;
create policy pit_write on public.partner_invoice_types
  for all to authenticated
  using (public.is_finance_user())
  with check (public.is_finance_user());
