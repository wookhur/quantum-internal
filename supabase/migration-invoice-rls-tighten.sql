-- 인보이스 열람 범위 좁히기
--
-- 지금은 아래 등급이면 전원의 인보이스를 읽을 수 있다.
--   admin · c_level · sales_manager · service_manager · account
--
-- 인보이스에는 계좌번호·주민등록번호·청구금액이 함께 들어 있다.
-- 세일즈매니저와 서비스매니저가 이것을 볼 이유가 없고, 화면에서도
-- 보여주지 않는다. 화면에 안 보일 뿐 API 로는 그대로 읽히는 상태다.
--
-- 두 등급을 뺀다. 경영진(admin·c_level)과 재무는 그대로 둔다.
--
-- 재무 판정은 화면과 같게 맞춘다(app/src/hooks/useProfiles.ts
-- canAccessAccount): role='account' 이거나 is_account 플래그가 켜진 사람.
-- 등급만 보던 예전 방식은, 재무 플래그만 받은 사람에게 목록이 0건으로
-- 보이는 문제를 만든다.
--
-- 수정·삭제·생성 권한은 건드리지 않는다.
--   수정·삭제 : 본인 것 + admin·c_level·account
--   생성      : 본인 이름으로만. 남의 이름으로 만드는 것은 admin·c_level 뿐
--
-- (여러 번 실행해도 안전)

-- 인보이스를 전부 볼 수 있는 사람인가
create or replace function public.can_read_all_invoices()
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
         p.role in ('admin', 'c_level', 'account')   -- 경영진 + 재무 등급
         or coalesce(p.is_account, false)            -- 재무 권한만 따로 받은 사람
       )
  );
$$;

grant execute on function public.can_read_all_invoices() to authenticated;

-- ── 인보이스 ──────────────────────────────────────────────────────────
drop policy if exists fi_select on public.freelancer_invoices;
create policy fi_select on public.freelancer_invoices
  for select to authenticated
  using (freelancer_id = auth.uid() or public.can_read_all_invoices());

-- ── 인보이스 품목 ─────────────────────────────────────────────────────
drop policy if exists fii_select on public.freelancer_invoice_items;
create policy fii_select on public.freelancer_invoice_items
  for select to authenticated
  using (
    exists (
      select 1 from public.freelancer_invoices fi
       where fi.id = freelancer_invoice_items.invoice_id
         and (fi.freelancer_id = auth.uid() or public.can_read_all_invoices())
    )
  );

-- ── 확인 ──────────────────────────────────────────────────────────────
-- 실행 뒤 이걸로 조건을 다시 읽어 sales_manager·service_manager 가
-- 빠졌는지 확인한다.
--
--   select policyname, qual from pg_policies
--    where tablename = 'freelancer_invoices' and cmd = 'SELECT';
