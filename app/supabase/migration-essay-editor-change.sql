-- ============================================================
-- 에세이 에디터 교체 + 원서·에세이 서비스비 중간 종료
-- ------------------------------------------------------------
-- 에세이 에디터는 읽기 전용 칸이라, 바뀌면 학생 정보 수정 창에서 덮어썼다. 그러면
-- 누가 언제까지 맡았는지가 사라진다. 원서·에세이 서비스비는 그 사람에게 매월 나가는
-- 돈이라, 교체 시점이 남아야 어느 달까지 누구 몫인지 가릴 수 있다.
-- 담당 컨설턴트(consultant_history)와 같은 방식으로 이력을 남긴다.
--
-- 그리고 서비스비는 '시작월~그해 12월' 로 못 박혀 있어 중간에 끊을 수 없었다.
-- 11월에 에디터가 바뀌어 끝까지 못 맡아도 12월까지 계속 나갔다. end_month 를 두어
-- 그 달까지만 지급한다 — 월 지급액(총액÷개월수)은 그대로 두고 범위만 줄인다.
-- 끊었다고 월액이 올라가면 못 받은 달의 몫이 받은 달로 옮겨 붙어 더 많이 지급된다.
-- Safe to re-run.
-- ============================================================

alter table public.service_students
  add column if not exists essay_editor_history jsonb;

comment on column public.service_students.essay_editor_history is
  '에세이 에디터 교체 이력 [{from, to, date}]. 현재 에디터는 essay_editor 에 유지.';

alter table public.essay_service_plans
  add column if not exists end_month text;

comment on column public.essay_service_plans.end_month is
  '지급을 끊는 달 YYYY-MM. 비우면 그해 12월까지. 에디터가 바뀌어 끝까지 못 맡은 경우에 쓴다. 월 지급액은 변하지 않고 지급 범위만 줄어든다.';

notify pgrst, 'reload schema';
