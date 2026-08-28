-- 인보이스 열람은 재무 권한을 켜 준 사람만
--
-- 지금은 아래 등급이면 전원의 인보이스를 읽을 수 있다.
--   admin · c_level · sales_manager · service_manager · account
--
-- 인보이스에는 계좌번호·주민등록번호·청구금액이 함께 들어 있다.
-- 등급으로 자동으로 열어 주는 것이 아니라, 재무 권한을 직접 켜 준
-- 사람만 보게 한다. admin 이라도 재무 권한이 없으면 본인 것만 본다.
-- 화면 규칙(canAccessAccount)과 같아진다.
--
-- 수정·삭제·생성 권한은 건드리지 않는다.
--   수정·삭제 : 본인 것 + admin·c_level·account
--   생성      : 본인 이름으로만. 남의 이름으로 만드는 것은 admin·c_level 뿐
--               (앱은 항상 본인 이름으로만 만든다 — 실제로 쓰이지 않는 통로다)
--
-- (여러 번 실행해도 안전)

-- ── 먼저 확인 ─────────────────────────────────────────────────────────
-- 이 마이그레이션을 실행하면 아래 목록에 나오는 사람만 전원 인보이스를
-- 보게 된다. 본인이 여기 없으면 실행 전에 인사관리에서 재무 권한을
-- 켜 두어야 한다. (실행해도 본인 인보이스는 누구나 그대로 보인다)
--
--   select name, email, role, is_account
--     from profiles
--    where role = 'account' or coalesce(is_account, false)
--       or lower(email) = 'accounting@quantumadmissions.com'
--    order by name;

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
       and (
         p.role = 'account'                                        -- 재무 등급
         or coalesce(p.is_account, false)                          -- 재무 권한만 따로 켜 준 사람
         or lower(coalesce(p.email, '')) = 'accounting@quantumadmissions.com'
       )
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

-- ── 실행 뒤 확인 ──────────────────────────────────────────────────────
--   select policyname, qual from pg_policies
--    where tablename = 'freelancer_invoices' and cmd = 'SELECT';
--
-- 조건에 등급 목록(admin·c_level·sales_manager·service_manager)이 사라지고
-- is_finance_user() 만 남아 있으면 적용된 것이다.
