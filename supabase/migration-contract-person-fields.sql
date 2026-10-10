-- ============================================================
-- 계약서에서 뽑을 사람 정보 칸 추가
-- ------------------------------------------------------------
-- Student 360 의 '계약서에서 채우기'가 채워야 할 항목이 정해졌다.
--   학교, 학년, 학생 한글이름, 학생 영문이름, 학생 이메일, 학생 연락처,
--   학부모 이름, 학부모 연락처, 학부모 이메일, 주소
--
-- 그런데 계약 레코드에는 이름이 하나(student_name), 연락처도 하나(phone)뿐이라
-- 영문이름과 '학생/학부모' 연락처 구분을 담을 자리가 없었다. 그 칸들을 만든다.
--
--  · student_name_en : 학생 영문 이름 (student_name 은 지금처럼 한글 이름)
--  · student_phone   : 학생 본인 연락처
--  · parent_phone    : 학부모 연락처
--    (phone 은 예전 값이 들어 있으므로 그대로 둔다. 새 추출은 위 두 칸에 넣고,
--     학부모 연락처가 비면 phone 을 갈음해 쓴다.)
--
-- 학부모 '이름' 은 기존 contractor_name 이 그 값이라 새로 만들지 않는다.
-- Safe to re-run.
-- ============================================================

alter table public.contracts add column if not exists student_name_en text;
alter table public.contracts add column if not exists student_phone   text;
alter table public.contracts add column if not exists parent_phone    text;

comment on column public.contracts.student_name_en is '학생 영문 이름. student_name 은 한글 이름.';
comment on column public.contracts.student_phone   is '학생 본인 연락처. 계약서에 학생·학부모 번호가 따로 적힌 경우 구분해 담는다.';
comment on column public.contracts.parent_phone    is '학부모 연락처. 비어 있으면 기존 phone 값을 갈음해 쓴다.';

notify pgrst, 'reload schema';
