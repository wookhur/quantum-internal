-- 세일즈 인센티브 환불(차감): 환불 처리 시 담당자에게 지급됐던 인센티브를 다음달 급여에서 차감.
-- 차감 현황판·지급원장(−라인)·인보이스 발행(−라인)·담당자 알림에 연동된다.
create table if not exists public.incentive_clawbacks (
  id uuid primary key default gen_random_uuid(),
  source text not null,                 -- 'contract' | 'service'
  source_id text,                        -- 계약 분납금 id / 서비스 fee id (참조용)
  student_name text,                     -- 표시용 학생명(인보이스/현황판 매칭)
  contributor_name text not null,        -- 차감 대상 세일즈 담당자(정규화 이름)
  amount numeric not null default 0,     -- 차감액(원)
  reason text,                           -- 차등 근거(해지 사유 등)
  deduct_month text not null,            -- 차감 반영월 'YYYY-MM'(기본 다음달)
  status text not null default 'pending',-- 'pending'(차감대기) | 'deducted'(차감완료)
  created_by uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_clawback_contributor on public.incentive_clawbacks(contributor_name);
create index if not exists idx_clawback_month on public.incentive_clawbacks(deduct_month);

alter table public.incentive_clawbacks enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='incentive_clawbacks' and policyname='clawback_all_auth') then
    create policy "clawback_all_auth" on public.incentive_clawbacks for all to authenticated using (true) with check (true);
  end if;
end $$;

notify pgrst, 'reload schema';
