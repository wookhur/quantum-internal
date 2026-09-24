-- Student360 활성 학생의 '지역'(region) 입력 현황 보기
--
-- 왜 필요한가: 지역 필터(한국/미국/그 외)는 자유 입력인 region(없으면 address·school)
-- 텍스트를 해석해 분류한다. 그래서 지역 칸이 비었거나 표기가 특이하면 '지역 미입력'
-- 으로 빠진다. 이 쿼리로 실제 입력값을 보고 무엇을 채워야 하는지 확인한다.
--
-- Supabase SQL Editor 에 붙여 실행. 읽기만 하며 데이터를 바꾸지 않는다.
-- 상태 판정은 앱의 '활성' 기준과 같게 맞췄다.
with s as (
  select id, name, korean_name, region, address, school, assigned_consultant,
         lower(btrim(coalesce(status,''))) as st
    from service_students
),
active_s as (   -- 앱의 '활성' 기준과 동일 (완료·취소 계열 제외)
  select * from s
   where st not in ('finished','done','completed','complete','완료','서비스 완료','종료',
                    'canceled','cancelled','취소','서비스 취소','해지')
)
-- 1) 지역 입력값 분포 — 어떤 표기가 쓰이고 있는지
select coalesce(nullif(btrim(region), ''), '(비어 있음)') as 지역입력값,
       count(*) as 인원
  from active_s
 group by 1
 order by 인원 desc, 지역입력값;

-- 2) 지역 칸이 비어 있는 학생 — 주소·학교로 추정될 수 있는지 함께 본다
select a.korean_name as 한글명,
       a.name        as 영문명,
       coalesce(p.name, a.assigned_consultant) as 담당컨설턴트,
       a.address     as 주소,
       a.school      as 학교
  from active_s a
  left join profiles p on p.id::text = a.assigned_consultant
 where nullif(btrim(a.region), '') is null
 order by a.korean_name, a.name;
