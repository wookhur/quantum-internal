-- '계약 시점에 만들어진 리드' 를 표시한다.
--
-- 계약관리에서 계약서를 쓸 때 연결할 리드가 없으면 리드를 하나 만들어 붙인다.
-- 그런 리드는 만들어지는 순간 이미 '계약 완료' 라서, 전환율을 재면 늘 100% 가
-- 나온다. 소개로 왔다가 계약 안 된 사람은 애초에 리드로 등록되지 않았기 때문에
-- 분모가 통째로 비어 있는 것이다.
--
-- 유입경로 이름('계약관리')으로 가려내던 것을 플래그로 옮긴다. 이름으로 가리면,
-- 앞으로 문의 시점에 제대로 등록한 소개 리드까지 같이 '비교 불가' 로 묶인다.

alter table public.leads
  add column if not exists created_from_contract boolean not null default false;

comment on column public.leads.created_from_contract is
  '계약관리에서 계약을 쓰면서 자동 생성된 리드 — 전환율 비교에서 제외';

-- 기존 건 표시. 유입경로는 '외부소개' 로 바뀌었을 수 있으므로 메모로 찾는다.
update public.leads
set    created_from_contract = true
where  created_from_contract = false
  and  (memo like '계약관리에서 계약을 쓰면서 만든 리드%'
        or source_channel = '계약관리');

-- 확인
select source_channel as 유입경로,
       count(*) as 리드,
       count(*) filter (where created_from_contract) as 계약시점등록,
       count(*) filter (where pipeline_stage = 'contracted') as 계약
from   public.leads
where  created_from_contract
group  by source_channel;

notify pgrst, 'reload schema';
