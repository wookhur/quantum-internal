-- ============================================================
-- 계약서 — 학생/학부모 이메일 칸 추가
-- ------------------------------------------------------------
-- 계약서에는 학생·학부모 이메일이 적혀 있는데 계약 레코드에 받는 칸이 없었다.
-- 그래서 Student 360 의 '계약서에서 채우기'가 이메일을 채워 줄 수 없었다.
-- Safe to re-run.
-- ============================================================

alter table public.contracts add column if not exists student_email text;
alter table public.contracts add column if not exists parent_email  text;

comment on column public.contracts.student_email is '계약서에 적힌 학생 이메일 — Student 360 학생정보 자동 채움에 쓰인다.';
comment on column public.contracts.parent_email  is '계약서에 적힌 학부모(계약자) 이메일.';

notify pgrst, 'reload schema';
