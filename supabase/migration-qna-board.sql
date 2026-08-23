-- 홈페이지 Q&A 게시판 (Ask Quantum)
--
-- 홈페이지 FAQ 아래에서 방문자가 질문을 남기면
--   · 여기에 저장되고
--   · 리드로도 들어가며(intake-qna 엣지 함수)
--   · 담당자에게 종 알림이 간다
-- 답변은 내부 시스템(마케팅 > 홈페이지 Q&A)에서 작성하고,
-- 답변을 달면서 공개로 전환한다. 공개된 것만 홈페이지에 노출된다.
--
-- 실행: Supabase SQL Editor

-- ── 본체 ──────────────────────────────────────────────────────────────
create table if not exists public.qna_questions (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),

  -- 질문자 (회원가입 없이 남기므로 최소 정보만)
  asker_name    text not null,
  asker_phone   text,
  asker_email   text,
  grade         text,                       -- 학년 (G9, G11 …)

  -- 질문
  category      text not null default '기타',
  title         text not null,
  body          text not null,
  is_private    boolean not null default false,   -- 켜면 답변해도 홈페이지에 공개하지 않음

  -- 답변 / 공개 상태
  status        text not null default 'pending',  -- pending · published · hidden
  answer        text,
  answered_at   timestamptz,
  answered_by   uuid references public.profiles(id) on delete set null,

  slug          text unique,                 -- 홈페이지 개별 주소 (/qna/<slug>)
  view_count    integer not null default 0,

  -- 추적
  lead_id       uuid references public.leads(id) on delete set null,
  source_ip     text,
  user_agent    text,

  constraint qna_status_chk check (status in ('pending','published','hidden'))
);

comment on table  public.qna_questions is '홈페이지 Q&A — 방문자 질문과 답변';
comment on column public.qna_questions.is_private is '비공개 질문: 답변해도 홈페이지에 노출하지 않음(성적·가정사정 등)';
comment on column public.qna_questions.status is 'pending=답변대기, published=공개, hidden=숨김(스팸 등)';

create index if not exists qna_questions_status_idx  on public.qna_questions (status, created_at desc);
create index if not exists qna_questions_pending_idx on public.qna_questions (created_at desc) where status = 'pending';
create index if not exists qna_questions_phone_idx   on public.qna_questions (asker_phone);
create index if not exists qna_questions_email_idx   on public.qna_questions (asker_email);

-- ── 이름 마스킹 ────────────────────────────────────────────────────────
-- 김호진 → 김○○ / Michael → M***.  홈페이지에는 마스킹된 이름만 나간다.
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
-- 전화·이메일 같은 개인정보는 이 뷰에 아예 담지 않는다.
-- 홈페이지(anon 키)는 원본 테이블이 아니라 이 뷰만 읽을 수 있다.
create or replace view public.qna_public as
  select
    q.id,
    q.slug,
    q.category,
    q.title,
    q.body,
    q.answer,
    q.answered_at,
    q.created_at,
    q.grade,
    q.view_count,
    public.qna_mask_name(q.asker_name) as asker_masked
  from public.qna_questions q
  where q.status = 'published'
    and q.is_private = false
    and q.answer is not null;

-- 뷰가 소유자 권한으로 돌아가야 원본 테이블의 RLS 를 우회해 공개분만 내보낼 수 있다
alter view public.qna_public set (security_invoker = off);

-- ── 권한 ──────────────────────────────────────────────────────────────
alter table public.qna_questions enable row level security;

-- 원본 테이블: 로그인한 직원만. anon 은 정책이 없으므로 한 줄도 못 읽는다.
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
   where slug = p_slug and status = 'published';
$$;

grant execute on function public.qna_increment_view(text) to anon, authenticated;

-- ── 주소(slug) 자동 생성 ──────────────────────────────────────────────
-- 한글 제목이 대부분이라 제목을 그대로 쓰기 어렵다.
-- 날짜 + 짧은 임의 문자열로 만든다: 2026-08-q7x3k2
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
