-- 서비스입금관리의 '몇월 교육비'(service_month)가 실제로 무엇으로 저장돼 있는지 확인
--
-- 화면의 월 뱃지는 service_month 컬럼을 그대로 보여준다. 앱은 이 값을 자동으로
-- 채우지 않는다 — 사람이 고른 값만 저장된다(Student360 학업지원/EC 폼, 또는
-- 서비스입금관리 목록의 월 드롭다운). 그래서 전부 9월로 보인다면 저장된 값이 9월이다.
-- 기간(period_start/end)과 등록 시각을 같이 보면 어느 달 수업인지 가려낼 수 있다.
--
-- Supabase SQL Editor 에 붙여 실행. 읽기만 하며 데이터를 바꾸지 않는다.

-- 1) 특정 학생의 학업지원(Academic) 항목 — 저장된 월과 실제 기간 비교
select a.id,
       s.korean_name  as 학생,
       a.academy_name as 학원,
       a.subject      as 과목,
       a.service_month as 저장된월,
       a.period_start as 기간시작,
       a.period_end   as 기간종료,
       a.billed_amount as 청구액,
       a.collection_status as 수금상태,
       a.created_at   as 등록시각
  from service_academic_support a
  join service_students s on s.id = a.student_id
 where s.korean_name like '%김채현%' or s.name ilike '%chloe%kim%'
 order by a.created_at;

-- 2) 저장된 월과 기간이 어긋난 항목 전체 (기간은 8월인데 9월로 저장된 것 등)
select s.korean_name as 학생,
       a.academy_name as 학원,
       a.service_month as 저장된월,
       a.period_start as 기간시작,
       to_char(a.period_start, 'FMMM') || '월' as 기간상의월,
       a.created_at as 등록시각
  from service_academic_support a
  join service_students s on s.id = a.student_id
 where a.period_start is not null
   and a.service_month is not null
   and a.service_month <> to_char(a.period_start, 'FMMM') || '월'
 order by s.korean_name, a.period_start;

-- 3) 월별 분포 — 정말 9월에 몰려 있는지, 언제 등록된 것들인지
select coalesce(service_month, '(월 미지정)') as 저장된월,
       count(*) as 건수,
       min(created_at)::date as 처음등록,
       max(created_at)::date as 마지막등록
  from service_academic_support
 group by 1
 order by 건수 desc;
