-- 장학생(무료 서비스) 표시 칸을 학생관리에 추가한다.
--
-- 장학생 = 우리에게 서비스를 의뢰했고 실제로 서비스도 제공하지만,
-- 비용을 받지 않고 무료로 진행하는 학생.
--
-- 왜 칸이 필요한가:
--   주간보고서는 "Student360 학생 수" 와 "계약관리 서비스진행중 계약 수" 를
--   맞춰보며 어긋나면 빨간 경고를 띄운다. 장학생은 계약이 없는 것이 정상인데
--   매주 '계약 없음' 명단에 올라와, 계약을 빠뜨린 건지 원래 무료인지
--   컨설턴트와 계약관리 담당이 매번 확인해야 했다.
--   이 칸으로 '무료가 맞다'를 한 번 지정해 두면 그 확인이 사라진다.
--
-- 휴면(paused)과는 다른 값이다.
--   paused      = 지금 잠시 서비스가 멈춤 (여행·휴가 등, 나중에 돌아옴)
--   scholarship = 서비스는 정상 진행, 다만 비용을 받지 않음

alter table public.service_students
  add column if not exists scholarship boolean not null default false;

comment on column public.service_students.scholarship is
  '장학생 — 서비스는 제공하되 무료로 진행. 계약관리에 계약이 없는 것이 정상임을 뜻한다.';

-- 장학생만 모아보는 조회가 잦지 않아 부분 인덱스로 충분하다(대부분 false).
create index if not exists service_students_scholarship_idx
  on public.service_students (scholarship)
  where scholarship;

-- 확인용
--   select name, korean_name, scholarship from public.service_students
--    where scholarship order by name;
