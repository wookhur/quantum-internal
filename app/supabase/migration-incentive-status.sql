-- 세일즈 인센티브 수령 상태: 라인별 수령 완료 여부 + 수령한 달
-- key = 인센티브 라인 안정키(c:<incentiveId>:<installmentId> 또는 s:<feeId>:<slot>)
create table if not exists public.incentive_status (
  key            text primary key,
  received       boolean not null default false,
  received_month text,           -- 클릭(수령)한 달 (YYYY-MM). 미수령이면 null
  updated_at     timestamptz not null default now()
);

alter table public.incentive_status enable row level security;
create policy "is_select" on public.incentive_status for select to authenticated using (true);
create policy "is_insert" on public.incentive_status for insert to authenticated with check (true);
create policy "is_update" on public.incentive_status for update to authenticated using (true) with check (true);
create policy "is_delete" on public.incentive_status for delete to authenticated using (true);

notify pgrst, 'reload schema';
