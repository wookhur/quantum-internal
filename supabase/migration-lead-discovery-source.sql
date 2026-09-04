-- 알게된 경로를 메모에서 별도 칸으로 분리한다.
--
-- 지금까지 홈페이지 상담신청·Q&A 는 "알게된 경로: 지인 소개" 를 메모 뒤에
-- 한 줄로 붙여 왔다. 사람이 읽기엔 충분하지만 경로별 집계가 안 된다.
-- AI 검색으로 찾아온 리드가 몇 건인지 세려면 칸이 있어야 한다.
--
-- source_channel(유입채널)과는 다른 값이다.
--   source_channel  = 어느 창구로 들어왔나  ('홈페이지 상담신청', 세미나명 …)
--   discovery_source = 우리를 어떻게 알았나 ('AI 검색', '지인 소개' …)
--
-- 쓰는 곳이 셋이라(RPC submit_homepage_lead / intake-lead / intake-qna)
-- 각 코드를 고치는 대신 트리거 한 곳에서 옮긴다. 앞으로 창구가 늘어도
-- 같은 형식으로만 쓰면 자동으로 분리된다.

alter table public.leads
  add column if not exists discovery_source text;

comment on column public.leads.discovery_source is
  '알게된 경로 (인스타그램·지인 소개·AI 검색 등). 유입 창구인 source_channel 과 다르다.';

-- ── 메모에서 값을 빼내 칸으로 옮기는 트리거 ────────────────────────────
create or replace function public.leads_extract_discovery_source()
returns trigger language plpgsql as $$
declare
  found text;
begin
  if new.memo is null then
    return new;
  end if;

  found := trim(substring(new.memo from '알게된 경로:[ \t]*([^\n]+)'));

  if found is null or found = '' then
    return new;
  end if;

  -- 최초 값을 지킨다. 같은 사람이 나중에 다른 경로로 다시 문의해도
  -- 처음 우리를 알게 된 경로가 마케팅 분석의 기준이다.
  -- (유입채널을 최초 값으로 고정해 두는 것과 같은 이유)
  if new.discovery_source is null or new.discovery_source = '' then
    new.discovery_source := found;
  end if;

  -- 옮겼으면 메모에서는 지운다. 같은 값이 두 군데 있으면 나중에 어긋난다.
  new.memo := trim(both E' \n' from
    regexp_replace(new.memo, '[ \t]*알게된 경로:[^\n]*\n?', '', 'g'));

  return new;
end;
$$;

drop trigger if exists trg_leads_discovery_source on public.leads;
create trigger trg_leads_discovery_source
  before insert or update of memo on public.leads
  for each row execute function public.leads_extract_discovery_source();

-- ── 기존 기록 backfill ────────────────────────────────────────────────
-- update 트리거가 memo 변경 시에만 돌므로, 여기서는 직접 채운다.
update public.leads
   set discovery_source = trim(substring(memo from '알게된 경로:[ \t]*([^\n]+)')),
       memo = trim(both E' \n' from
              regexp_replace(memo, '[ \t]*알게된 경로:[^\n]*\n?', '', 'g'))
 where memo ~ '알게된 경로:'
   and (discovery_source is null or discovery_source = '');

-- 예전 보기(문자/DM)를 쓰던 기록은 그대로 둔다. 실제로 그렇게 답한 것이라
-- 지금 와서 바꾸면 사실이 아니게 된다.

create index if not exists leads_discovery_source_idx
  on public.leads (discovery_source)
  where discovery_source is not null;

-- 확인용
--   select discovery_source, count(*) from public.leads
--    where discovery_source is not null group by 1 order by 2 desc;
