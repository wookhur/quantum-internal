-- 계약관리 '서비스 진행중'(계약 건수) ↔ Student360 '활성'(학생 명수) 오차 원인 찾기
--
-- 두 숫자는 단위가 다르다(계약=건, 학생=명). 그래서 어긋남 중 일부는 정상이다.
--   ② 장학생        → 무료라 계약이 없는 것이 정상
--   ④ 재계약 중복   → 한 학생이 진행중 계약 2건이면 건수가 명수보다 많다
-- 실제로 손봐야 하는 건 ①과 ③이다.
--
-- Supabase SQL Editor 에 붙여 실행. 읽기만 하며 데이터를 바꾸지 않는다.
-- 상태값 판정은 앱(normalizeStatus / ContractsPage)과 같은 기준으로 맞췄다.

-- ─── 1. 요약 + 검산 ──────────────────────────────────────────────────
with s as (select name, coalesce(scholarship,false) sch, lower(btrim(coalesce(status,''))) st,
                  regexp_replace(coalesce(name,''),'\s','','g') k
             from service_students where coalesce(name,'')<>''),
active_s as (select * from s where st not in ('finished','done','completed','complete','완료','서비스 완료','종료',
                                              'canceled','cancelled','취소','서비스 취소','해지')),
c as (select student_name, regexp_replace(coalesce(student_name,''),'\s','','g') k
        from contracts where status in ('active','expiring_soon') and coalesce(student_name,'')<>''),
c_grp as (select k, count(*) cnt from c group by k),
m as (
  select (select count(distinct k) from active_s)                                            as 활성학생,
         (select count(*) from c)                                                            as 진행중계약,
         (select count(*) from active_s a left join c_grp g on g.k=a.k where g.k is null and not a.sch) as 계약없음,
         (select count(*) from active_s a left join c_grp g on g.k=a.k where g.k is null and a.sch)     as 장학생,
         (select coalesce(sum(g.cnt),0) from c_grp g left join active_s a on a.k=g.k where a.k is null) as 학생없는계약,
         (select coalesce(sum(g.cnt-1),0) from c_grp g join active_s a on a.k=g.k where g.cnt>1)        as 중복추가
)
select 활성학생, 계약없음, 장학생, 학생없는계약, 중복추가, 진행중계약,
       (활성학생 - 계약없음 - 장학생 + 학생없는계약 + 중복추가) as 검산결과,
       case when (활성학생 - 계약없음 - 장학생 + 학생없는계약 + 중복추가) = 진행중계약
            then '✅ 일치' else '❌ 불일치' end as 검산
  from m;

-- ─── 2. 원인별 명단 ──────────────────────────────────────────────────
-- 계약관리 '서비스 진행중'(건수) ↔ Student360 '활성'(명수) 오차 원인별 명단
with s as (
  select name, korean_name, coalesce(scholarship, false) as scholarship,
         lower(btrim(coalesce(status, ''))) as st,
         regexp_replace(coalesce(name, ''), '\s', '', 'g') as k
    from service_students
   where coalesce(name, '') <> ''
),
active_s as (   -- 앱의 '활성' = finished/canceled 계열 제외
  select * from s
   where st not in ('finished','done','completed','complete','완료','서비스 완료','종료',
                    'canceled','cancelled','취소','서비스 취소','해지')
),
c as (          -- 앱의 '서비스 진행중' 계약
  select student_name, regexp_replace(coalesce(student_name, ''), '\s', '', 'g') as k
    from contracts
   where status in ('active','expiring_soon')
     and coalesce(student_name, '') <> ''
),
c_grp as (select k, min(student_name) as nm, count(*) as cnt from c group by k)
select * from (
  -- ① 손봐야 할 항목: 활성 학생인데 진행중 계약이 없음
  select 1 as 순, '① 활성인데 진행중 계약 없음' as 구분,
         a.name as 이름, a.korean_name as 한글명, a.st as 학생상태, 1 as 건수,
         '계약 종료·취소 후 학생 상태 미변경, 또는 계약 등록 누락' as 설명
    from active_s a left join c_grp g on g.k = a.k
   where g.k is null and not a.scholarship
  union all
  -- ② 정상: 장학생은 무료라 계약이 없음
  select 2, '② 장학생(정상)', a.name, a.korean_name, a.st, 0,
         '무료 서비스 — 계약 없음이 정상'
    from active_s a left join c_grp g on g.k = a.k
   where g.k is null and a.scholarship
  union all
  -- ③ 손봐야 할 항목: 진행중 계약인데 대응하는 활성 학생이 없음
  select 3, '③ 진행중 계약인데 활성 학생 없음', g.nm, null, null, g.cnt::int,
         'Student360 미등록, 또는 학생만 완료·취소 처리됨'
    from c_grp g left join active_s a on a.k = g.k
   where a.k is null
  union all
  -- ④ 정상(설명 가능): 한 학생에 진행중 계약 2건 이상 → 건수가 명수보다 많아짐
  select 4, '④ 같은 학생 진행중 계약 2건 이상', g.nm, a.korean_name, a.st, g.cnt::int,
         '재계약 등 — 계약 건수가 학생 명수보다 많아지는 원인'
    from c_grp g join active_s a on a.k = g.k
   where g.cnt > 1
  union all
  -- ⑤ 주의: 활성 학생 동명이인 → 이름으로 맞추므로 매칭이 틀릴 수 있음
  select 5, '⑤ 활성 학생 동명이인', a.name, string_agg(a.korean_name, ' / '), null, count(*)::int,
         '이름으로 계약을 맞추므로 매칭이 틀릴 수 있음'
    from active_s a group by a.k, a.name having count(*) > 1
) x order by 순, 이름;
