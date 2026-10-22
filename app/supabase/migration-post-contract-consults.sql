-- ============================================================
-- 계약 후 상담 기록
-- ------------------------------------------------------------
-- 계약 전 통화 내용(학부모 성향·스타일·특이사항)은 콜드콜의 연락 기록에 쌓인다.
-- 계약이 되면 담당이 서비스팀으로 넘어가는데, 그 내용을 다시 물어보거나 처음부터
-- 파악해야 했다. Student 360 에서 계약 전 기록을 그대로 이어 보고, 계약 후 상담을
-- 같은 자리에 이어 적을 수 있게 한다.
--
-- 계약 전 기록은 여기에 복사하지 않는다 — lead_activities 원본을 읽어 보여만 준다.
-- 복사하면 콜드콜 원본과 갈라져 어느 쪽이 맞는지 알 수 없게 된다.
-- Safe to re-run.
-- ============================================================

-- ── 1. 학생 ↔ 리드 연결 ──────────────────────────────────────
-- service_students 에는 리드로 가는 길이 없어서, 지금은 학생 이름 문자열로
-- 계약을 찾고 거기서 contracts.lead_id 를 거친다. 이름이 바뀌면 끊기므로
-- 칸을 만들어 못박아 둔다. (못 찾으면 비워 두고 기존 이름 매칭으로 대체한다)
alter table public.service_students add column if not exists lead_id uuid references public.leads(id) on delete set null;

comment on column public.service_students.lead_id is
  '이 학생이 어느 리드에서 왔는지. 계약 전 상담 기록을 360에서 이어 보기 위한 연결.';

create index if not exists idx_service_students_lead on public.service_students(lead_id);

-- 이름 매칭으로 한 번 채워 둔다(계약 → 리드). 이미 채워진 건 건드리지 않는다.
with m as (
  select s.id as student_id,
         (array_agg(c.lead_id order by
            case when c.status = 'cancelled' then 1 else 0 end,
            c.contract_date desc))[1] as lead_id
  from public.service_students s
  join public.contracts c
    on c.lead_id is not null
   and (
     lower(regexp_replace(coalesce(c.student_name, ''), '\s', '', 'g'))
       = lower(regexp_replace(coalesce(s.korean_name, ''), '\s', '', 'g'))
     or lower(regexp_replace(coalesce(c.student_name, ''), '\s', '', 'g'))
       = lower(regexp_replace(coalesce(s.name, ''), '\s', '', 'g'))
   )
  where s.lead_id is null
  group by s.id
)
update public.service_students s
set lead_id = m.lead_id
from m
where s.id = m.student_id and m.lead_id is not null;


-- ── 2. 알림함 테이블 — 앱은 쓰고 있는데 생성 SQL 이 레포에 없었다 ──
create table if not exists public.user_notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  type       text not null,
  title      text not null,
  message    text,
  link       text,
  metadata   jsonb default '{}'::jsonb,
  is_read    boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_user_notifications_user   on public.user_notifications(user_id, is_read, created_at desc);

alter table public.user_notifications enable row level security;

-- 내 알림만 읽고 지운다. 보내는 쪽은 남의 알림을 만들어야 하므로 insert 는 열어 둔다.
drop policy if exists user_notifications_select on public.user_notifications;
create policy user_notifications_select on public.user_notifications
  for select to authenticated using (user_id = auth.uid());

drop policy if exists user_notifications_insert on public.user_notifications;
create policy user_notifications_insert on public.user_notifications
  for insert to authenticated with check (auth.uid() is not null);

drop policy if exists user_notifications_update on public.user_notifications;
create policy user_notifications_update on public.user_notifications
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists user_notifications_delete on public.user_notifications;
create policy user_notifications_delete on public.user_notifications
  for delete to authenticated using (user_id = auth.uid());


-- ── 3. 계약 후 상담 기록 ─────────────────────────────────────
create table if not exists public.post_contract_consults (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references public.service_students(id) on delete cascade,
  consult_date  date not null,
  content       text not null,                -- 상담 내용
  follow_up     text,                         -- follow-up commitments (약속한 것)
  status        text not null default 'open'  -- 처리 상태
                 check (status in ('open', 'done')),
  consultant_id uuid references public.profiles(id) on delete set null,   -- 상담자
  shared_with   uuid[] not null default '{}', -- 공유 대상자(알림을 받은 사람들)
  created_by    uuid references public.profiles(id) on delete set null,
  author_name   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_post_contract_consults_student on public.post_contract_consults(student_id, consult_date desc);

comment on table  public.post_contract_consults is '계약 후 상담 기록. 계약 전 통화 내용은 lead_activities 원본을 읽어 보여만 주고 여기 복사하지 않는다.';
comment on column public.post_contract_consults.status      is 'open=미처리, done=처리완료';
comment on column public.post_contract_consults.shared_with is '이 기록을 공유해 알림을 보낸 직원들. 누구에게 갔는지 나중에 확인하려고 남긴다.';

drop trigger if exists set_post_contract_consults_updated_at on public.post_contract_consults;
create trigger set_post_contract_consults_updated_at
  before update on public.post_contract_consults
  for each row execute function public.set_updated_at();

alter table public.post_contract_consults enable row level security;

-- 열람: 로그인한 직원 전원. 수정·삭제: 쓴 사람 또는 관리자급.
drop policy if exists post_contract_consults_select on public.post_contract_consults;
create policy post_contract_consults_select on public.post_contract_consults
  for select to authenticated using (true);

drop policy if exists post_contract_consults_insert on public.post_contract_consults;
create policy post_contract_consults_insert on public.post_contract_consults
  for insert to authenticated with check (auth.uid() is not null);

drop policy if exists post_contract_consults_update on public.post_contract_consults;
create policy post_contract_consults_update on public.post_contract_consults
  for update to authenticated
  using (created_by = auth.uid() or public.is_admin_level())
  with check (created_by = auth.uid() or public.is_admin_level());

drop policy if exists post_contract_consults_delete on public.post_contract_consults;
create policy post_contract_consults_delete on public.post_contract_consults
  for delete to authenticated
  using (created_by = auth.uid() or public.is_admin_level());

notify pgrst, 'reload schema';


-- ============================================================
-- 추가 (2026-10-14): 백필 규칙을 느슨하게 다시
-- ------------------------------------------------------------
-- 위 1번의 백필은 "계약 학생명 = 학생 이름" 완전 일치만 봤다. 계약서 학생명이
-- '김은서 | Amy Kim' 처럼 한 칸에 한글·영문이 섞여 들어오므로 52명 중 14명만 붙었다.
-- 앱이 쓰는 매칭(부분 포함까지 본다)과 같은 규칙으로 다시 돌린다.
-- 학부모 이름은 (모)/(부) 표기와 번호·기호를 걷어내고 비교하고, 이름이 서로 다르면
-- 연락처가 맞아야 붙인다(동명이인 방지).
-- ============================================================
with s as (
  select id, name, korean_name, contact, parent_email, email,
         lower(regexp_replace(coalesce(name, ''), '\s', '', 'g'))        as nm,
         lower(regexp_replace(coalesce(korean_name, ''), '\s', '', 'g')) as kn,
         regexp_replace(
           regexp_replace(lower(coalesce(parent_name, '')), '\(\s*[모부]\s*\)', '', 'g'),
           '[^가-힣a-z]', '', 'g') as pn,
         regexp_replace(coalesce(contact, ''), '\D', '', 'g') as sph
  from public.service_students
  where lead_id is null
),
c as (
  select id, lead_id, status, contract_date,
         lower(regexp_replace(coalesce(student_name, ''), '\s', '', 'g')) as sn,
         regexp_replace(
           regexp_replace(lower(coalesce(contractor_name, '')), '\(\s*[모부]\s*\)', '', 'g'),
           '[^가-힣a-z]', '', 'g') as pn,
         coalesce(nullif(regexp_replace(coalesce(parent_phone, ''), '\D', '', 'g'), ''),
                  nullif(regexp_replace(coalesce(phone, ''),        '\D', '', 'g'), '')) as cph
  from public.contracts
  where lead_id is not null
),
pair as (
  select s.id as student_id, c.id as contract_id, c.lead_id, c.status, c.contract_date,
         case
           when c.sn in (s.nm, s.kn, s.nm || s.kn, s.kn || s.nm) then 0
           when length(s.kn) >= 2 and position(s.kn in c.sn) > 0 then 1
           else 2
         end as rule_rank,
         (s.pn <> '' and c.pn <> '' and s.pn <> c.pn) as pn_conflict,
         (length(s.sph) >= 8 and length(coalesce(c.cph, '')) >= 8
          and right(s.sph, 8) = right(c.cph, 8))      as ph_ok
  from s
  join c
    on c.sn <> ''
   and (
         c.sn in (s.nm, s.kn, s.nm || s.kn, s.kn || s.nm)
      or (length(s.kn) >= 2 and position(s.kn in c.sn) > 0)
      or (length(s.nm) >= 3 and position(s.nm in c.sn) > 0)
   )
),
ranked as (
  select p.*,
         row_number() over (
           partition by student_id
           order by rule_rank,
                    case when status = 'cancelled' then 1 else 0 end,
                    contract_date desc nulls last,
                    contract_id
         ) as rn
  from pair p
  where not p.pn_conflict or p.ph_ok
)
update public.service_students t
set lead_id = r.lead_id
from ranked r
where t.id = r.student_id and r.rn = 1 and t.lead_id is null;

-- 이태우 — 학부모가 'Kyounghee Moon'(학생정보) / '문경희'(계약서)로 같은 분인데
-- 한글·영문 표기가 달라 기계로는 판단이 안 됐다. 이메일(moonkyonghee75@)로 확인됨.
update public.service_students s
set lead_id = c.lead_id
from public.contracts c
where s.lead_id is null
  and c.lead_id is not null
  and s.korean_name = '이태우'
  and c.student_name like '이태우%'
  and c.contractor_name = '문경희';

-- 강윤영·홍예빈은 장학생이라 계약서가 없다 — 리드 연결 없이 두는 것이 정상이다.

-- 학생 이름 양끝 공백 정리
update public.service_students
set name        = btrim(name),
    korean_name = btrim(korean_name)
where name <> btrim(name) or korean_name <> btrim(korean_name);
