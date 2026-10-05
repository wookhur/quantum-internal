-- ============================================================
-- 담당 컨설턴트 슬러그 'aidan' → 이준형 프로필 UUID 로 정리
-- ------------------------------------------------------------
-- 프로필이 생기기 전에는 담당자를 'aidan' 같은 짧은 문자열로 저장했다.
-- 지금은 실제 프로필(이준형, 02e20da3-…)이 있는데도 학생 기록은 옛 값을 들고 있어,
-- 화면에는 'Aidan Lee' 로 보이고 인보이스는 '이준형' 으로 찾아 관리비가 어긋났다.
--
-- 앱에는 이미 'Aidan Lee' → '이준형' 별칭이 들어가 있어 지금도 동작은 한다.
-- 이 SQL 은 데이터 자체를 바로잡는 것이고, 별칭은 지우지 않는다
-- (누락분과 과거 기록을 계속 받아 주는 안전망).
--
-- ⚠️ ①을 먼저 돌려 어디에 얼마나 남아 있는지 보고, 그 다음 ②를 실행하세요.
--    ③은 이력(consultant_history)까지 정리하는 선택 단계입니다.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- ① 어디에 'aidan' 이 남아 있나 (읽기만 함)
--    public 스키마의 모든 문자열 컬럼을 훑어 값이 정확히 'aidan' 인 행을 센다.
--    uuid 형 컬럼에는 'aidan' 이 들어갈 수 없으므로 애초에 나오지 않는다.
-- ────────────────────────────────────────────────────────────
select table_name, column_name, cnt
from (
  select
    c.table_name,
    c.column_name,
    (xpath(
      '/row/cnt/text()',
      query_to_xml(
        format('select count(*) as cnt from %I.%I where %I = %L',
               c.table_schema, c.table_name, c.column_name, 'aidan'),
        false, true, '')
    ))[1]::text::int as cnt
  from information_schema.columns c
  join information_schema.tables t
    on t.table_schema = c.table_schema
   and t.table_name   = c.table_name
   and t.table_type   = 'BASE TABLE'
  where c.table_schema = 'public'
    and c.data_type in ('text', 'character varying')
) q
where cnt > 0
order by cnt desc;

-- ①-2 JSON 안에 들어 있는 경우(예: 담당자 변경 이력)
select table_name, column_name, cnt
from (
  select
    c.table_name,
    c.column_name,
    (xpath(
      '/row/cnt/text()',
      query_to_xml(
        format('select count(*) as cnt from %I.%I where %I::text like %L',
               c.table_schema, c.table_name, c.column_name, '%"aidan"%'),
        false, true, '')
    ))[1]::text::int as cnt
  from information_schema.columns c
  join information_schema.tables t
    on t.table_schema = c.table_schema
   and t.table_name   = c.table_name
   and t.table_type   = 'BASE TABLE'
  where c.table_schema = 'public'
    and c.data_type in ('json', 'jsonb')
) q
where cnt > 0
order by cnt desc;

-- ①-3 바뀔 학생 명단을 눈으로 확인
select id, korean_name, name, status, assigned_consultant
from public.service_students
where assigned_consultant = 'aidan'
order by korean_name;


-- ────────────────────────────────────────────────────────────
-- ② 담당 컨설턴트를 이준형 프로필로 교체 (여기서 실제로 바뀝니다)
--    ① 실행 결과: service_students.assigned_consultant 2건, service_meetings.consultant_id 3건.
--    ①에서 그 밖의 표가 더 나왔다면 같은 형태로 한 줄씩 추가하세요.
-- ────────────────────────────────────────────────────────────
update public.service_students
set assigned_consultant = '02e20da3-8a89-4725-8e06-22bd882a4e8b',
    updated_at = now()
where assigned_consultant = 'aidan';

-- 미팅 기록에 적힌 진행자도 같은 사람이다.
update public.service_meetings
set consultant_id = '02e20da3-8a89-4725-8e06-22bd882a4e8b'
where consultant_id = 'aidan';


-- ────────────────────────────────────────────────────────────
-- ③ (선택) 담당자 변경 이력 안의 'aidan' 도 같이 정리
--    이력은 화면 표시용이라 안 고쳐도 별칭이 이름을 제대로 보여 줍니다.
--    고치시려면 먼저 ③-1 로 '무엇이 어떻게 바뀌는지' 확인하세요.
-- ────────────────────────────────────────────────────────────

-- ③-1 바뀌기 전 / 후 비교 (읽기만 함)
--     'aidan' 인 칸만 골라 바꾼다 — jsonb_set 은 인자 하나라도 NULL 이면 결과가 통째로
--     NULL 이 되므로, 값이 없는 칸은 아예 건드리지 않는다.
select
  s.id,
  s.korean_name,
  s.consultant_history as 지금,
  (
    select jsonb_agg(
             case when x.v->>'to' = 'aidan'
                  then jsonb_set(x.v, '{to}', '"02e20da3-8a89-4725-8e06-22bd882a4e8b"'::jsonb)
                  else x.v end
             order by x.ord)
    from (
      select case when e.elem->>'from' = 'aidan'
                  then jsonb_set(e.elem, '{from}', '"02e20da3-8a89-4725-8e06-22bd882a4e8b"'::jsonb)
                  else e.elem end as v,
             e.ord
      from jsonb_array_elements(s.consultant_history) with ordinality as e(elem, ord)
    ) x
  )                    as 바뀐뒤
from public.service_students s
where jsonb_typeof(s.consultant_history) = 'array'
  and s.consultant_history::text like '%"aidan"%';

-- ③-2 위 '바뀐뒤' 가 맞으면 실행
update public.service_students s
set consultant_history = sub.fixed,
    updated_at = now()
from (
  select
    s2.id,
    (
      select jsonb_agg(
               case when x.v->>'to' = 'aidan'
                    then jsonb_set(x.v, '{to}', '"02e20da3-8a89-4725-8e06-22bd882a4e8b"'::jsonb)
                    else x.v end
               order by x.ord)
      from (
        select case when e.elem->>'from' = 'aidan'
                    then jsonb_set(e.elem, '{from}', '"02e20da3-8a89-4725-8e06-22bd882a4e8b"'::jsonb)
                    else e.elem end as v,
               e.ord
        from jsonb_array_elements(s2.consultant_history) with ordinality as e(elem, ord)
      ) x
    ) as fixed
  from public.service_students s2
  where jsonb_typeof(s2.consultant_history) = 'array'
    and s2.consultant_history::text like '%"aidan"%'
) sub
where s.id = sub.id
  and sub.fixed is not null;   -- 혹시라도 못 만들었으면 덮어쓰지 않는다


-- ────────────────────────────────────────────────────────────
-- ④ 확인 — ①과 ①-2 를 다시 돌리면 아무 행도 안 나와야 합니다.
--    그리고 이준형 담당 학생이 제대로 붙었는지:
-- ────────────────────────────────────────────────────────────
select s.korean_name, s.name, s.status, p.name as 담당컨설턴트
from public.service_students s
join public.profiles p on p.id::text = s.assigned_consultant
where p.name = '이준형'
order by s.korean_name;
