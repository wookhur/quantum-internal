-- ============================================================
-- 전공별 멘토 — 세션이 안 적혀 인보이스에 안 잡히는 건 찾기
-- ------------------------------------------------------------
-- 전공별 멘토는 '세션 1회 = 등급 단가'라, 세션 기록(mentor_sessions)이 있어야만
-- 멘토 인보이스에 줄이 생긴다. 배정(student_coaching)에 적힌 '코칭일(start_date)'은
-- 배정 참고용이라 그것만으로는 청구되지 않는다.
--
-- ①만 돌리면 바로 답이 나옵니다. ②③은 더 자세히 볼 때만.
-- 전부 조회만 하고 아무것도 바꾸지 않습니다.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- ① 세션이 한 건도 없는 전공별 멘토 배정  ← 여기 나오는 게 '빠진 건'
-- ────────────────────────────────────────────────────────────
select
  coalesce(s.korean_name, s.name)                as 학생,
  coalesce(m.korean_name, m.english_name)        as 멘토,
  m.tier                                         as 등급,
  c.start_date                                   as 코칭일,
  c.field_notes                                  as 메모,
  c.created_at::date                             as 배정등록일
from public.student_coaching c
join public.mentors m           on m.id = c.mentor_id
left join public.service_students s on s.id = c.student_id
where m.type = 'major'                                   -- 전공별 멘토만(학습코칭은 월정액이라 해당 없음)
  and not exists (select 1 from public.mentor_sessions ms where ms.coaching_id = c.id)
order by c.start_date nulls last, 학생;


-- ────────────────────────────────────────────────────────────
-- ② 세션은 있지만 '코칭일이 속한 달'에는 한 건도 없는 배정
--    (다른 달 세션만 적혀 있어 그 달 인보이스에서 빠진 경우)
-- ────────────────────────────────────────────────────────────
select
  coalesce(s.korean_name, s.name)                as 학생,
  coalesce(m.korean_name, m.english_name)        as 멘토,
  c.start_date                                   as 코칭일,
  (select count(*) from public.mentor_sessions ms where ms.coaching_id = c.id)            as 전체세션수,
  (select string_agg(ms.session_date::text, ', ' order by ms.session_date)
     from public.mentor_sessions ms where ms.coaching_id = c.id)                          as 적힌세션일
from public.student_coaching c
join public.mentors m           on m.id = c.mentor_id
left join public.service_students s on s.id = c.student_id
where m.type = 'major'
  and c.start_date is not null
  and exists     (select 1 from public.mentor_sessions ms where ms.coaching_id = c.id)
  and not exists (select 1 from public.mentor_sessions ms
                   where ms.coaching_id = c.id
                     and left(ms.session_date::text, 7) = left(c.start_date::text, 7))
order by c.start_date, 학생;


-- ────────────────────────────────────────────────────────────
-- ③ 멘토별·월별로 지금 몇 회가 잡혀 있는지 (인보이스에 뜰 숫자)
--    ①을 처리한 뒤 이 결과가 기대와 맞는지 대조용.
-- ────────────────────────────────────────────────────────────
select
  coalesce(m.korean_name, m.english_name)        as 멘토,
  left(ms.session_date::text, 7)            as 정산월,
  count(*)                                       as 세션수,
  string_agg(distinct coalesce(s.korean_name, s.name), ', ')  as 학생들
from public.mentor_sessions ms
join public.student_coaching c on c.id = ms.coaching_id
join public.mentors m          on m.id = c.mentor_id
left join public.service_students s on s.id = c.student_id
where m.type = 'major'
group by 1, 2
order by 정산월 desc, 멘토;
