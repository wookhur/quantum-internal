-- 계약관리 '서비스 진행중'(계약 건수) ↔ Student360 '활성'(학생 명수) 오차 원인 찾기
--
-- 두 숫자는 단위가 다르다(계약=건, 학생=명). 어긋남 중 정상인 것도 있다.
--   ② 장학생      → 무료라 계약이 없는 것이 정상
--   ④ 재계약 중복 → 한 학생이 진행중 계약 2건이면 건수가 명수보다 많다
-- 실제로 손봐야 하는 건 ①·③·⑤ 이다.
--
-- 주의 1) 이름 표기가 두 표에서 다르다.
--   service_students 는 영문명(name)·한글명(korean_name)을 따로 갖지만
--   contracts.student_name 은 '김은서 | Amy', '백승수 (Jason Baek)', '김민재' 처럼 섞여 있다.
--   그래서 구분기호로 쪼갠 조각과 학생의 영문·한글 이름을 모두 대조한다.
-- 주의 2) 앱은 만료일(expiry_date)이 지난 계약을 상태와 무관하게 '종료'로 본다.
--   그 규칙을 그대로 반영했으므로 계약관리 화면의 '서비스 진행중' 건수와 일치한다.
--
-- Supabase SQL Editor 에 붙여 실행. 읽기만 하며 데이터를 바꾸지 않는다.

with s as (
  select id, name, korean_name, coalesce(scholarship,false) as sch,
         lower(btrim(coalesce(status,''))) as st
    from service_students
),
active_s as (
  select * from s
   where st not in ('finished','done','completed','complete','완료','서비스 완료','종료',
                    'canceled','cancelled','취소','서비스 취소','해지')
),
s_keys as (   -- 학생 키: 영문명·한글명을 각각 키로
  select a.id, lower(regexp_replace(v.k,'\s','','g')) as key
    from active_s a
    cross join lateral (values (a.name), (a.korean_name)) v(k)
   where lower(regexp_replace(coalesce(v.k,''),'\s','','g')) <> ''
),
c as (        -- 앱과 동일: 만료일이 지났으면 상태와 무관하게 종료 취급
  select id, student_name
    from contracts
   where status in ('active','expiring_soon')
     and (expiry_date is null or expiry_date >= current_date)
     and coalesce(student_name,'') <> ''
),
c_keys as (   -- 계약 키: '한글 | 영문' 등을 구분기호로 쪼갠 조각 + 전체 문자열
  select c.id, c.student_name, lower(regexp_replace(t,'\s','','g')) as key
    from c
    cross join lateral unnest(array[c.student_name] ||
                              regexp_split_to_array(c.student_name,'[|()/,·]')) as t
   where lower(regexp_replace(t,'\s','','g')) <> ''
),
m as (select distinct ck.id as cid, sk.id as sid from c_keys ck join s_keys sk on sk.key = ck.key),
m1 as (select cid from m group by cid having count(distinct sid) = 1)   -- 학생 1명에만 걸린 계약
select * from (
  select 1 as 순, '① 활성인데 진행중 계약 없음' as 구분, a.name as 영문명, a.korean_name as 한글명,
         1 as 건수, '계약 만료·종료됐는데 360 상태가 진행중, 또는 계약 등록 누락' as 설명
    from active_s a where not a.sch
     and not exists (select 1 from m where m.sid = a.id and m.cid in (select cid from m1))
  union all
  select 2, '② 장학생(정상)', a.name, a.korean_name, 0, '무료 서비스 — 계약 없음이 정상'
    from active_s a where a.sch
     and not exists (select 1 from m where m.sid = a.id and m.cid in (select cid from m1))
  union all
  select 3, '③ 진행중 계약인데 활성 학생 없음', c.student_name, null, 1,
         'Student360 미등록, 또는 학생만 완료·취소 처리됨'
    from c where not exists (select 1 from m where m.cid = c.id)
  union all
  select 4, '④ 같은 학생 진행중 계약 2건 이상', a.name, a.korean_name, count(*)::int,
         '재계약 등 — 계약 건수가 학생 명수보다 많아지는 원인'
    from m join active_s a on a.id = m.sid where m.cid in (select cid from m1)
   group by a.name, a.korean_name having count(*) > 1
  union all
  select 5, '⑤ 이름이 여러 학생에 걸림(확인 필요)', c.student_name, null,
         (select count(distinct sid)::int from m where m.cid = c.id),
         '동명이인 등으로 어느 학생의 계약인지 가릴 수 없음'
    from c where exists (select 1 from m where m.cid = c.id) and c.id not in (select cid from m1)
) x order by 순, 영문명;
