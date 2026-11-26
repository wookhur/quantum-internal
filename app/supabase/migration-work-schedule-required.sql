-- 주간 출근 스케줄 입력 대상 지정
--
-- 역할(role)로 가를 수 없다는 것이 확인됐다. 이준형·양은영·Danny Kim 은 계정이
-- freelancer 로 등록돼 있지만 실제로 학생을 담당하는 컨설턴트고(consultants.ts 의
-- 레거시 명부 aidan·eunyoung·danny), 반대로 external 계정 중에도 서비스 대시보드가
-- 열린 사람이 있다. 그래서 '누가 적어야 하는가'는 사람이 직접 정한다.
--
-- 켜고 끄기:
--   update profiles set work_schedule_required = true  where email = 'someone@quantumadmissions.com';
--   update profiles set work_schedule_required = false where email = 'someone@quantumadmissions.com';

alter table profiles
  add column if not exists work_schedule_required boolean not null default false;

comment on column profiles.work_schedule_required is
  '주간 출근 스케줄 입력 대상 — 매주 금요일까지 다음 주를 기입';

-- 시작 명단: 실제로 학생을 담당하는 컨설턴트 7명.
-- 빼거나 더할 사람이 있으면 이 목록을 고쳐서 실행하면 된다.
update profiles
set    work_schedule_required = true,
       updated_at = now()
where  email in (
  'ivitta@quantumadmissions.com',        -- Isabela Vitta
  'johnkim@quantumadmissions.com',       -- John Kim
  'soomeepark@quantumadmissions.com',    -- Soomee Park
  'evelynjenny@quantumadmissions.com',   -- 남연서 (Evelyn)
  'aidanlee826@gmail.com',               -- 이준형  (freelancer 등록이지만 실제 컨설턴트)
  'toeunny@naver.com',                   -- 양은영  (〃)
  'dannykim94@gmail.com'                 -- Danny Kim (〃)
);

-- 퇴사자는 대상에서 제외한다 (Liz Yu·판신디처럼 권한이 남아 있는 경우가 있다)
update profiles
set    work_schedule_required = false
where  coalesce(resigned, false) = true
  and  work_schedule_required = true;

-- 확인
select name, email, role, position, work_schedule_required
from   profiles
where  work_schedule_required = true
order  by name;
