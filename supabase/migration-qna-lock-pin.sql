-- 잠긴 질문을 비밀번호 4자리로 여는 구조
--
-- 앞서 만든 잠금 질문은 "답변을 연락처로 보내드립니다" 였는데,
-- 질문자가 답을 보려면 우리가 따로 연락해야 해서 번거롭다.
-- 대신 질문을 쓸 때 4자리 비밀번호를 정하게 하고,
-- 나중에 다시 와서 그 번호를 넣으면 자기 글의 답변을 바로 본다.
--
-- migration-qna-board.sql 을 먼저 실행한 뒤 이 파일을 실행한다.
-- (여러 번 실행해도 안전)

create extension if not exists pgcrypto with schema extensions;

-- 비밀번호는 원문을 저장하지 않는다. 해시만 남기므로 우리도 알 수 없다.
alter table public.qna_questions add column if not exists lock_pin_hash text;

comment on column public.qna_questions.lock_pin_hash is
  '잠긴 질문을 여는 4자리 비밀번호의 해시. 원문은 저장하지 않는다.';

-- ── 비밀번호 지정 ─────────────────────────────────────────────────────
-- 접수 함수(intake-qna)와 내부 관리 화면에서 쓴다.
create or replace function public.qna_set_lock_pin(p_id uuid, p_pin text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then
    raise exception '비밀번호는 숫자 4자리여야 합니다.';
  end if;
  update public.qna_questions
     set lock_pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf'))
   where id = p_id;
end;
$$;

revoke execute on function public.qna_set_lock_pin(uuid, text) from anon;
grant  execute on function public.qna_set_lock_pin(uuid, text) to authenticated, service_role;

-- ── 열기 시도 기록 ────────────────────────────────────────────────────
-- 4자리는 1만 가지뿐이라 제한이 없으면 전부 대입해 볼 수 있다.
-- 같은 글·같은 IP 기준 15분에 5번까지만 허용한다.
create table if not exists public.qna_unlock_attempts (
  question_id  uuid not null references public.qna_questions(id) on delete cascade,
  ip           text not null,
  tries        integer not null default 0,
  window_start timestamptz not null default now(),
  primary key (question_id, ip)
);

alter table public.qna_unlock_attempts enable row level security;
revoke all on public.qna_unlock_attempts from anon;

-- ── 열기 ──────────────────────────────────────────────────────────────
-- 맞으면 질문 본문과 답변을 돌려준다.
-- 틀린 경우와 없는 글을 같은 응답으로 처리해, 어느 쪽인지 알 수 없게 한다.
create or replace function public.qna_unlock(p_slug text, p_pin text, p_ip text default '')
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  q       public.qna_questions%rowtype;
  a       public.qna_unlock_attempts%rowtype;
  ip_key  text := coalesce(nullif(btrim(p_ip), ''), 'unknown');
begin
  select * into q
    from public.qna_questions
   where slug = p_slug and status = 'published' and is_locked = true;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  -- 시도 횟수 확인 (15분 창)
  select * into a from public.qna_unlock_attempts
   where question_id = q.id and ip = ip_key;

  if found and a.window_start > now() - interval '15 minutes' and a.tries >= 5 then
    return jsonb_build_object('ok', false, 'reason', 'too_many');
  end if;

  if q.lock_pin_hash is null
     or extensions.crypt(coalesce(p_pin, ''), q.lock_pin_hash) <> q.lock_pin_hash then
    insert into public.qna_unlock_attempts (question_id, ip, tries, window_start)
         values (q.id, ip_key, 1, now())
    on conflict (question_id, ip) do update
        set tries = case when public.qna_unlock_attempts.window_start > now() - interval '15 minutes'
                         then public.qna_unlock_attempts.tries + 1 else 1 end,
            window_start = case when public.qna_unlock_attempts.window_start > now() - interval '15 minutes'
                                then public.qna_unlock_attempts.window_start else now() end;
    return jsonb_build_object('ok', false, 'reason', 'wrong');
  end if;

  -- 통과 — 기록을 지워 다음 방문 때 다시 5번을 쓸 수 있게 한다
  delete from public.qna_unlock_attempts where question_id = q.id and ip = ip_key;

  return jsonb_build_object(
    'ok', true,
    'item', jsonb_build_object(
      'slug',         q.slug,
      'category',     q.category,
      'title',        q.title,
      'body',         q.body,
      'answer',       q.answer,
      'answered_at',  q.answered_at,
      'created_at',   q.created_at,
      'grade',        q.grade,
      'asker_masked', public.qna_mask_name(q.asker_name)
    )
  );
end;
$$;

grant execute on function public.qna_unlock(text, text, text) to anon, authenticated;

-- ── 잠긴 글도 목록에는 보이게 ─────────────────────────────────────────
-- 답변이 아직 없는 잠긴 글까지 목록에 띄우지는 않는다(공개 글과 같은 기준).
-- 뷰는 그대로 두고, 비밀번호가 걸려 있는지만 알려 준다.
drop view if exists public.qna_public;
create view public.qna_public as
  select
    q.id,
    q.slug,
    q.category,
    q.title,
    q.is_locked,
    (q.lock_pin_hash is not null) as has_pin,
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

alter view public.qna_public set (security_invoker = off);
grant select on public.qna_public to anon, authenticated;
