-- 홈페이지 Q&A 게시판 (Ask Quantum)
--
-- 홈페이지 FAQ 아래에서 방문자가 질문을 남기면
--   · 여기에 저장되고
--   · 리드로도 들어가며(intake-qna 엣지 함수)
--   · 담당자에게 종 알림이 간다
-- 답변은 내부 시스템(마케팅 > 홈페이지 Q&A)에서 작성하고,
-- 답변을 달면서 공개로 전환한다.
--
-- 잠금(is_locked): 공개를 꺼리는 질문은 '게시판에서 빼는' 대신 '잠근다'.
--   제목·분류·날짜는 목록에 그대로 뜨고 내용과 답변만 가려진다.
--   게시판이 비어 보이지 않으면서 질문자의 사정도 지켜진다.
--
-- 폼 항목은 사내 상담 신청 폼(/consult)과 같다. 해외 거주자가 많이 쓸 창구라
-- 거주 구분·국가·지역까지 받아야 콜드콜에서 시차와 연락 시간을 알 수 있다.
--
-- 실행: Supabase SQL Editor (여러 번 실행해도 안전)

-- ── 본체 ──────────────────────────────────────────────────────────────
create table if not exists public.qna_questions (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),

  asker_name    text not null,
  asker_phone   text,
  asker_email   text,
  grade         text,

  category      text not null default '기타',
  title         text not null,
  body          text not null,

  status        text not null default 'pending',
  answer        text,
  answered_at   timestamptz,
  answered_by   uuid references public.profiles(id) on delete set null,

  slug          text unique,
  view_count    integer not null default 0,

  lead_id       uuid references public.leads(id) on delete set null,
  source_ip     text,
  user_agent    text
);

-- 컬럼을 손대기 전에 뷰부터 내린다.
-- 먼저 만든 뷰가 옛 컬럼(is_private)을 붙잡고 있으면 컬럼을 지울 수 없다.
-- 뷰는 이 파일 아래쪽에서 새 구조로 다시 만든다.
drop view if exists public.qna_public;

-- 잠금 + 상담 폼과 같은 수집 항목 (이미 만든 뒤에도 안전하게 추가된다)
alter table public.qna_questions add column if not exists is_locked     boolean not null default false;
alter table public.qna_questions add column if not exists student_name  text;
alter table public.qna_questions add column if not exists school        text;
alter table public.qna_questions add column if not exists residence     text;     -- domestic · overseas
alter table public.qna_questions add column if not exists country       text;     -- 해외 거주국가
alter table public.qna_questions add column if not exists region        text;     -- 서울 강남 / Vancouver
alter table public.qna_questions add column if not exists interest_area text;
alter table public.qna_questions add column if not exists source_path   text;     -- 알게된 경로

-- 예전 이름(is_private)으로 이미 만들었다면 잠금으로 옮긴다
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='qna_questions' and column_name='is_private') then
    update public.qna_questions set is_locked = true where is_private = true;
    alter table public.qna_questions drop column is_private;
  end if;
end $$;

alter table public.qna_questions drop constraint if exists qna_status_chk;
alter table public.qna_questions add  constraint qna_status_chk check (status in ('pending','published','hidden'));

comment on table  public.qna_questions is '홈페이지 Q&A — 방문자 질문과 답변';
comment on column public.qna_questions.is_locked is '잠금: 목록에 제목은 보이되 내용·답변은 가린다(공개를 꺼리는 질문)';
comment on column public.qna_questions.status is 'pending=답변대기, published=공개, hidden=숨김(스팸 등)';

create index if not exists qna_questions_status_idx  on public.qna_questions (status, created_at desc);
create index if not exists qna_questions_pending_idx on public.qna_questions (created_at desc) where status = 'pending';
create index if not exists qna_questions_phone_idx   on public.qna_questions (asker_phone);
create index if not exists qna_questions_email_idx   on public.qna_questions (asker_email);

-- ── 이름 마스킹 ────────────────────────────────────────────────────────
-- 김호진 → 김○○ / Michael → M******
create or replace function public.qna_mask_name(p_name text)
returns text
language sql
immutable
as $$
  select case
    when p_name is null or btrim(p_name) = '' then '익명'
    when btrim(p_name) ~ '^[가-힣]+$' then
      left(btrim(p_name), 1) || repeat('○', greatest(char_length(btrim(p_name)) - 1, 1))
    else
      left(btrim(p_name), 1) || repeat('*', greatest(char_length(btrim(p_name)) - 1, 1))
  end
$$;

-- ── 홈페이지가 읽는 창구 ───────────────────────────────────────────────
-- 전화·이메일·학교 같은 개인정보는 이 뷰에 담지 않는다.
-- 잠긴 질문은 제목까지만 나가고 내용과 답변은 NULL 로 비운다.
drop view if exists public.qna_public;
create view public.qna_public as
  select
    q.id,
    q.slug,
    q.category,
    q.title,
    q.is_locked,
    case when q.is_locked then null else q.body   end as body,
    case when q.is_locked then null else q.answer end as answer,
    q.answered_at,
    q.created_at,
    q.grade,
    q.view_count,
    public.qna_mask_name(q.asker_name) as asker_masked
  from public.qna_questions q
  where q.status = 'published'
    and q.answer is not null;

-- 뷰가 소유자 권한으로 돌아야 원본 RLS 를 우회해 공개분만 내보낼 수 있다
alter view public.qna_public set (security_invoker = off);

-- ── 권한 ──────────────────────────────────────────────────────────────
alter table public.qna_questions enable row level security;

drop policy if exists qna_questions_staff_all on public.qna_questions;
create policy qna_questions_staff_all on public.qna_questions
  for all to authenticated using (true) with check (true);

revoke all on public.qna_questions from anon;
grant select on public.qna_public to anon, authenticated;

-- ── 조회수 ────────────────────────────────────────────────────────────
create or replace function public.qna_increment_view(p_slug text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.qna_questions
     set view_count = view_count + 1
   where slug = p_slug and status = 'published' and is_locked = false;
$$;

grant execute on function public.qna_increment_view(text) to anon, authenticated;

-- ── 주소(slug) 자동 생성 ──────────────────────────────────────────────
-- 한글 제목이 대부분이라 제목을 그대로 주소로 쓰기 어렵다: 2026-08-q7x3k2
create or replace function public.qna_set_slug()
returns trigger
language plpgsql
as $$
begin
  if new.slug is null or btrim(new.slug) = '' then
    new.slug := to_char(coalesce(new.created_at, now()), 'YYYY-MM') || '-' ||
                substr(md5(gen_random_uuid()::text), 1, 6);
  end if;
  return new;
end;
$$;

drop trigger if exists qna_set_slug_trg on public.qna_questions;
create trigger qna_set_slug_trg
  before insert on public.qna_questions
  for each row execute function public.qna_set_slug();

-- ── 답변 시각 자동 기록 ───────────────────────────────────────────────
create or replace function public.qna_touch_answered()
returns trigger
language plpgsql
as $$
begin
  if new.answer is distinct from old.answer and new.answer is not null and btrim(new.answer) <> '' then
    new.answered_at := coalesce(new.answered_at, now());
  end if;
  return new;
end;
$$;

drop trigger if exists qna_touch_answered_trg on public.qna_questions;
create trigger qna_touch_answered_trg
  before update on public.qna_questions
  for each row execute function public.qna_touch_answered();
