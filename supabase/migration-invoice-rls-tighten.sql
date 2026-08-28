-- 인보이스 열람 범위를 화면과 맞춘다
--
-- 지금 정책은 아래 등급이면 전원의 인보이스를 읽을 수 있다.
--   admin · c_level · sales_manager · service_manager · account
-- 그런데 화면은 '재무 권한자'에게만 전원 목록을 보여준다. admin 이라도
-- 재무 권한이 없으면 화면에서는 못 본다.
--
-- 즉 화면보다 데이터베이스가 더 열려 있다. 세일즈매니저·서비스매니저는
-- 화면에 안 보일 뿐, API 로는 남의 계좌번호·주민등록번호·청구금액을
-- 그대로 읽을 수 있다. 인보이스에는 이 세 가지가 함께 들어 있다.
--
-- 열람 범위를 화면과 같게 좁힌다 — 본인 것 + 재무 권한자.
-- 재무 권한 판정도 화면과 같게 맞춘다(app/src/hooks/useProfiles.ts
-- canAccessAccount): role='account' 이거나 is_account 플래그가 켜진 사람.
-- 등급만 보던 예전 방식은, 재무 플래그만 받은 사람에게 목록이 0건으로
-- 보이는 문제를 만든다.
--
-- 수정·삭제 권한은 건드리지 않는다. 지금도 본인 것과 admin·c_level·account
-- 로 제한돼 있다.
--
-- (여러 번 실행해도 안전)

-- 재무 권한자인가 — 화면의 canAccessAccount 와 같은 기준
create or replace function public.is_finance_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
     where p.id = auth.uid()
       and (p.role = 'account' or coalesce(p.is_account, false))
  );
$$;

grant execute on function public.is_finance_user() to authenticated;

-- ── 인보이스 ──────────────────────────────────────────────────────────
drop policy if exists fi_select on public.freelancer_invoices;
create policy fi_select on public.freelancer_invoices
  for select to authenticated
  using (freelancer_id = auth.uid() or public.is_finance_user());

-- ── 인보이스 품목 ─────────────────────────────────────────────────────
drop policy if exists fii_select on public.freelancer_invoice_items;
create policy fii_select on public.freelancer_invoice_items
  for select to authenticated
  using (
    exists (
      select 1 from public.freelancer_invoices fi
       where fi.id = freelancer_invoice_items.invoice_id
         and (fi.freelancer_id = auth.uid() or public.is_finance_user())
    )
  );
