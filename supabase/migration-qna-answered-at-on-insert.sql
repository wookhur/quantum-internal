-- 내부시스템 「질문 추가」로 질문과 답변을 한 번에 넣으면 answered_at 이 비어 있다.
-- qna_touch_answered 트리거가 before update 에만 걸려 있어 INSERT 때는 돌지 않기 때문.
-- INSERT 에서도 답변이 채워져 들어오면 답변 시각을 기록하도록 한다.

create or replace function public.qna_touch_answered()
returns trigger
language plpgsql
as $$
begin
  if new.answer is not null and btrim(new.answer) <> '' then
    if tg_op = 'INSERT' or new.answer is distinct from old.answer then
      new.answered_at := coalesce(new.answered_at, now());
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists qna_touch_answered_ins_trg on public.qna_questions;
create trigger qna_touch_answered_ins_trg
  before insert on public.qna_questions
  for each row execute function public.qna_touch_answered();

-- 이미 들어간 글의 답변 시각을 작성일로 채운다.
update public.qna_questions
   set answered_at = created_at
 where answered_at is null
   and answer is not null
   and btrim(answer) <> '';
