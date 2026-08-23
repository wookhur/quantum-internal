-- 답변 평가 — "이 답변이 도움이 되었나요?"
--
-- 별점 대신 예/아니오로 받는다. 누르는 데 고민이 없어 응답률이 훨씬 높고,
-- 평가 수가 적을 때 평균이 크게 흔들리지도 않는다.
--
-- 질문자만이 아니라 글을 읽은 누구나 누를 수 있게 한다. 그래야 표본이 쌓인다.
-- 다만 두 가지는 성격이 다르므로 구분해서 저장한다.
--   asker  : 잠긴 질문을 비밀번호로 열고 누른 사람 = 질문자 본인 → 상담 품질
--   reader : 공개된 글을 읽고 누른 사람            → 콘텐츠 품질
--
-- migration-qna-board.sql, migration-qna-lock-pin.sql 을 먼저 실행한 뒤 실행한다.
-- (여러 번 실행해도 안전)

create table if not exists public.qna_answer_feedback (
  question_id  uuid not null references public.qna_questions(id) on delete cascade,
  -- 한 사람이 여러 번 누르는 것을 막는 열쇠 (IP + 브라우저 지문의 해시)
  voter_key    text not null,
  helpful      boolean not null,
  voter_kind   text not null default 'reader',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (question_id, voter_key),
  constraint qna_voter_kind_chk check (voter_kind in ('asker','reader'))
);

comment on table public.qna_answer_feedback is
  '답변 평가 — 질문자(asker)와 독자(reader)를 구분해 쌓는다';

create index if not exists qna_feedback_q_idx on public.qna_answer_feedback (question_id);

alter table public.qna_answer_feedback enable row level security;
revoke all on public.qna_answer_feedback from anon;

drop policy if exists qna_feedback_staff_read on public.qna_answer_feedback;
create policy qna_feedback_staff_read on public.qna_answer_feedback
  for select to authenticated using (true);

-- ── 평가 남기기 ───────────────────────────────────────────────────────
-- 같은 사람이 다시 누르면 마음을 바꾼 것으로 보고 덮어쓴다.
create or replace function public.qna_rate_answer(
  p_slug text, p_helpful boolean, p_voter_key text, p_kind text default 'reader'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  q_id uuid;
  k    text := case when p_kind = 'asker' then 'asker' else 'reader' end;
begin
  if p_voter_key is null or length(btrim(p_voter_key)) < 8 then
    return jsonb_build_object('ok', false, 'reason', 'bad_key');
  end if;

  select id into q_id
    from public.qna_questions
   where slug = p_slug and status = 'published' and answer is not null;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  insert into public.qna_answer_feedback (question_id, voter_key, helpful, voter_kind)
       values (q_id, btrim(p_voter_key), p_helpful, k)
  on conflict (question_id, voter_key) do update
      set helpful = excluded.helpful,
          voter_kind = case when public.qna_answer_feedback.voter_kind = 'asker'
                            then 'asker' else excluded.voter_kind end,
          updated_at = now();

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.qna_rate_answer(text, boolean, text, text) to anon, authenticated;

-- ── 내부 관리 화면에서 보는 집계 ──────────────────────────────────────
create or replace view public.qna_feedback_summary as
  select
    q.id                                          as question_id,
    q.slug,
    q.title,
    q.category,
    q.answered_at,
    count(f.*)                                    as total,
    count(*) filter (where f.helpful)             as helpful,
    count(*) filter (where f.voter_kind = 'asker') as asker_total,
    count(*) filter (where f.voter_kind = 'asker' and f.helpful) as asker_helpful
  from public.qna_questions q
  left join public.qna_answer_feedback f on f.question_id = q.id
  where q.status = 'published' and q.answer is not null
  group by q.id, q.slug, q.title, q.category, q.answered_at;

alter view public.qna_feedback_summary set (security_invoker = on);
grant select on public.qna_feedback_summary to authenticated;
