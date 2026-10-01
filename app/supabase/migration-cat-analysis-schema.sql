-- ============================================================
-- CAT 자료 DB — 분석용 공간 (cat / cat_private 스키마)
-- 설계 문서: cat-db/CLAUDE.md, cat-db/docs/decisions/0003-portal-as-case-source.md
-- 태그 사전: cat-db/taxonomy/tags-v0.2.yaml (태그 행은 별도 seed 파일로 적재)
--
-- 원칙
--  - 학생 정보의 원천은 포털(public.service_*)이다. cat 에는 가명(STU-xxxx)만 둔다.
--  - 실명 ↔ 가명 매핑은 cat_private 에만 있고, 앱 사용자(anon/authenticated)는 접근할 수 없다.
--  - cat 테이블 조회는 admin / c_level 만 가능(RLS). 쓰기는 service_role(동기화·태깅 스크립트)만.
--  - cat / cat_private 스키마는 Supabase API(Exposed schemas)에 추가하지 않는다.
-- 여러 번 실행해도 안전하도록 작성(IF NOT EXISTS / OR REPLACE).
-- ============================================================

CREATE SCHEMA IF NOT EXISTS cat;
CREATE SCHEMA IF NOT EXISTS cat_private;

REVOKE ALL ON SCHEMA cat_private FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SCHEMA cat FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA cat TO authenticated, service_role;
GRANT USAGE ON SCHEMA cat_private TO service_role;

-- ── 1. 가명 매핑 (실명 대조표 역할) ─────────────────────────
CREATE TABLE IF NOT EXISTS cat_private.student_map (
  portal_student_id UUID PRIMARY KEY REFERENCES public.service_students(id) ON DELETE CASCADE,
  student_id        TEXT NOT NULL UNIQUE,              -- STU-0001
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE SEQUENCE IF NOT EXISTS cat_private.student_seq;

CREATE TABLE IF NOT EXISTS cat_private.consultant_map (
  consultant_name TEXT PRIMARY KEY,                    -- 포털 assigned_consultant / consultant_id 원문
  consultant_code TEXT NOT NULL UNIQUE                 -- C01
);
CREATE SEQUENCE IF NOT EXISTS cat_private.consultant_seq;

-- ── 2. 원본 위치 · 태그 사전 ───────────────────────────────
CREATE TABLE IF NOT EXISTS cat.sources (
  source_id       TEXT PRIMARY KEY,                    -- SRC-000001
  source_type     TEXT NOT NULL,                       -- pdf | gdoc | consultation_report | webinar_audio | sns_video ...
  storage         TEXT NOT NULL DEFAULT 'gdrive',
  external_id     TEXT,
  url             TEXT NOT NULL,
  title           TEXT NOT NULL,                       -- 학생 사례 원본은 가명화된 제목
  content_hash    TEXT,
  duplicate_of    TEXT REFERENCES cat.sources(source_id),
  valid_for_cycle TEXT,
  summary         TEXT,
  created_at      TIMESTAMPTZ,
  ingested_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (storage, external_id),
  UNIQUE (url)
);

CREATE TABLE IF NOT EXISTS cat.source_texts (
  source_id TEXT NOT NULL REFERENCES cat.sources(source_id) ON DELETE CASCADE,
  chunk_no  INT  NOT NULL,
  text      TEXT NOT NULL,                             -- 가명화된 텍스트만
  PRIMARY KEY (source_id, chunk_no)
);

CREATE TABLE IF NOT EXISTS cat.tags (
  dimension        TEXT NOT NULL,
  code             TEXT NOT NULL,
  label            TEXT NOT NULL,
  layer            TEXT NOT NULL CHECK (layer IN ('A','B','AB')),
  deprecated       BOOLEAN NOT NULL DEFAULT false,
  taxonomy_version TEXT NOT NULL,
  PRIMARY KEY (dimension, code)
);

CREATE TABLE IF NOT EXISTS cat.schools (
  school_code TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  country     TEXT NOT NULL,
  level       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cat.source_tags (
  source_id        TEXT NOT NULL REFERENCES cat.sources(source_id) ON DELETE CASCADE,
  dimension        TEXT NOT NULL,
  code             TEXT NOT NULL,
  tagged_by        TEXT NOT NULL CHECK (tagged_by IN ('llm','human')),
  confidence       REAL,
  taxonomy_version TEXT NOT NULL,
  PRIMARY KEY (source_id, dimension, code),
  FOREIGN KEY (dimension, code) REFERENCES cat.tags(dimension, code)
);

CREATE TABLE IF NOT EXISTS cat.source_schools (
  source_id   TEXT NOT NULL REFERENCES cat.sources(source_id) ON DELETE CASCADE,
  school_code TEXT NOT NULL REFERENCES cat.schools(school_code),
  PRIMARY KEY (source_id, school_code)
);

-- ── 3. 학생 사례 (가명) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS cat.students (
  student_id      TEXT PRIMARY KEY,
  cohort_year     INT,                                 -- 지원(졸업) 연도. 포털에 없어 수기/LLM 입력
  start_grade     TEXT,                                -- 포털 grade 원문(G10 등)
  start_date      DATE,
  end_date        DATE,
  contract_type   TEXT,
  status          TEXT,                                -- active | paused | completed
  consultant_code TEXT,
  synced_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cat.student_tags (
  student_id       TEXT NOT NULL REFERENCES cat.students(student_id) ON DELETE CASCADE,
  dimension        TEXT NOT NULL,
  code             TEXT NOT NULL,
  as_of            DATE,
  tagged_by        TEXT NOT NULL CHECK (tagged_by IN ('llm','human')),
  taxonomy_version TEXT NOT NULL,
  PRIMARY KEY (student_id, dimension, code),
  FOREIGN KEY (dimension, code) REFERENCES cat.tags(dimension, code)
);

CREATE TABLE IF NOT EXISTS cat.student_targets (
  student_id  TEXT NOT NULL REFERENCES cat.students(student_id) ON DELETE CASCADE,
  school_code TEXT NOT NULL REFERENCES cat.schools(school_code),
  priority    INT,
  round       TEXT,
  PRIMARY KEY (student_id, school_code)
);

CREATE TABLE IF NOT EXISTS cat.meetings (
  meeting_id          TEXT PRIMARY KEY,                -- MTG-<포털 meeting uuid>
  portal_meeting_id   UUID UNIQUE,                     -- 동기화 키 (실명 정보 없음)
  student_id          TEXT NOT NULL REFERENCES cat.students(student_id) ON DELETE CASCADE,
  meeting_date        DATE,
  meeting_type        TEXT,
  source_id           TEXT REFERENCES cat.sources(source_id),
  report_language     TEXT,
  attendee_roles      TEXT[],
  consultant_code     TEXT,
  next_meeting_date   DATE,
  next_meeting_agenda TEXT,
  summary             TEXT,                            -- 가명화된 LLM 요약
  extracted_at        TIMESTAMPTZ                      -- LLM 추출 완료 시각 (NULL = 미추출)
);

CREATE TABLE IF NOT EXISTS cat.student_snapshots (
  meeting_id          TEXT PRIMARY KEY REFERENCES cat.meetings(meeting_id) ON DELETE CASCADE,
  student_id          TEXT NOT NULL REFERENCES cat.students(student_id) ON DELETE CASCADE,
  as_of               DATE NOT NULL,
  grade               TEXT,
  intended_major_text TEXT
);

CREATE TABLE IF NOT EXISTS cat.meeting_tags (
  meeting_id       TEXT NOT NULL REFERENCES cat.meetings(meeting_id) ON DELETE CASCADE,
  dimension        TEXT NOT NULL,
  code             TEXT NOT NULL,
  evidence         TEXT,
  tagged_by        TEXT NOT NULL CHECK (tagged_by IN ('llm','human')),
  confidence       REAL,
  taxonomy_version TEXT NOT NULL,
  PRIMARY KEY (meeting_id, dimension, code),
  FOREIGN KEY (dimension, code) REFERENCES cat.tags(dimension, code)
);

CREATE TABLE IF NOT EXISTS cat.projects (
  project_id       TEXT PRIMARY KEY,
  student_id       TEXT NOT NULL REFERENCES cat.students(student_id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  status           TEXT,                               -- activity_status 코드
  first_meeting_id TEXT REFERENCES cat.meetings(meeting_id),
  grade_start      TEXT,
  grade_end        TEXT,
  target_audience  TEXT,
  output           TEXT,
  impact_metric    TEXT,
  summary          TEXT
);

CREATE TABLE IF NOT EXISTS cat.project_tags (
  project_id       TEXT NOT NULL REFERENCES cat.projects(project_id) ON DELETE CASCADE,
  dimension        TEXT NOT NULL,
  code             TEXT NOT NULL,
  tagged_by        TEXT NOT NULL CHECK (tagged_by IN ('llm','human')),
  confidence       REAL,
  taxonomy_version TEXT NOT NULL,
  PRIMARY KEY (project_id, dimension, code),
  FOREIGN KEY (dimension, code) REFERENCES cat.tags(dimension, code)
);

CREATE TABLE IF NOT EXISTS cat.activity_events (
  project_id TEXT NOT NULL REFERENCES cat.projects(project_id) ON DELETE CASCADE,
  meeting_id TEXT NOT NULL REFERENCES cat.meetings(meeting_id) ON DELETE CASCADE,
  status     TEXT NOT NULL,
  reason     TEXT,
  PRIMARY KEY (project_id, meeting_id)
);

CREATE TABLE IF NOT EXISTS cat.action_items (
  item_id     TEXT PRIMARY KEY,
  meeting_id  TEXT NOT NULL REFERENCES cat.meetings(meeting_id) ON DELETE CASCADE,
  owner_role  TEXT NOT NULL,
  description TEXT NOT NULL,
  due_date    DATE,
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','done','dropped'))
);

CREATE TABLE IF NOT EXISTS cat.comments (
  comment_id      BIGSERIAL PRIMARY KEY,
  student_id      TEXT NOT NULL REFERENCES cat.students(student_id) ON DELETE CASCADE,
  meeting_id      TEXT REFERENCES cat.meetings(meeting_id) ON DELETE CASCADE,
  project_id      TEXT REFERENCES cat.projects(project_id) ON DELETE CASCADE,
  consultant_code TEXT,
  written_at      DATE,
  body            TEXT NOT NULL,
  source_id       TEXT REFERENCES cat.sources(source_id)
);

-- 연차별 중간 평가: 웹사이트 평가 제도가 생기면 이 테이블로 받는다
CREATE TABLE IF NOT EXISTS cat.evaluations (
  student_id     TEXT NOT NULL REFERENCES cat.students(student_id) ON DELETE CASCADE,
  period         TEXT NOT NULL,                        -- y1 | y2 | y3
  criterion      TEXT NOT NULL,
  score          INT  NOT NULL CHECK (score BETWEEN 1 AND 5),
  rubric_version TEXT NOT NULL,
  evaluated_at   DATE,
  evaluator_code TEXT,
  note           TEXT,
  PRIMARY KEY (student_id, period, criterion)
);

CREATE TABLE IF NOT EXISTS cat.outcomes (
  student_id  TEXT NOT NULL REFERENCES cat.students(student_id) ON DELETE CASCADE,
  school_code TEXT NOT NULL REFERENCES cat.schools(school_code),
  round       TEXT NOT NULL DEFAULT 'unknown',
  result      TEXT NOT NULL CHECK (result IN ('admitted','waitlisted','deferred','rejected','enrolled')),
  decided_at  DATE,
  PRIMARY KEY (student_id, school_code, round)
);

CREATE INDEX IF NOT EXISTS idx_cat_meetings_student ON cat.meetings(student_id, meeting_date);
CREATE INDEX IF NOT EXISTS idx_cat_meeting_tags_code ON cat.meeting_tags(dimension, code);
CREATE INDEX IF NOT EXISTS idx_cat_source_tags_code ON cat.source_tags(dimension, code);
CREATE INDEX IF NOT EXISTS idx_cat_project_tags_code ON cat.project_tags(dimension, code);

-- ── 4. 포털 → cat 동기화 (실명 컬럼은 복사하지 않음) ──────────
-- 실행: service_role 또는 SQL Editor 에서 `SELECT cat.sync_from_portal();`
CREATE OR REPLACE FUNCTION cat_private.consultant_code(p_name TEXT) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = cat_private, public AS $$
DECLARE v TEXT;
BEGIN
  IF p_name IS NULL OR btrim(p_name) = '' THEN RETURN NULL; END IF;
  SELECT consultant_code INTO v FROM consultant_map WHERE consultant_name = btrim(p_name);
  IF v IS NULL THEN
    v := 'C' || lpad(nextval('consultant_seq')::text, 2, '0');
    INSERT INTO consultant_map VALUES (btrim(p_name), v);
  END IF;
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION cat.sync_from_portal() RETURNS TABLE(students_synced INT, meetings_synced INT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = cat, cat_private, public AS $$
DECLARE n_s INT; n_m INT;
BEGIN
  -- 새 학생에게 가명 부여
  INSERT INTO cat_private.student_map (portal_student_id, student_id)
  SELECT s.id, 'STU-' || lpad(nextval('cat_private.student_seq')::text, 4, '0')
  FROM public.service_students s
  WHERE NOT EXISTS (SELECT 1 FROM cat_private.student_map m WHERE m.portal_student_id = s.id)
  ORDER BY s.created_at;

  -- 학생 (실명·연락처·학교명·주소는 가져오지 않음)
  INSERT INTO cat.students (student_id, cohort_year, start_grade, start_date, end_date, contract_type, status, consultant_code, synced_at)
  SELECT m.student_id, NULL::int, s.grade, s.start_date, s.end_date,
         s.contract_type, s.status, cat_private.consultant_code(s.assigned_consultant), now()
  FROM public.service_students s JOIN cat_private.student_map m ON m.portal_student_id = s.id
  ON CONFLICT (student_id) DO UPDATE SET
    start_grade = EXCLUDED.start_grade, start_date = EXCLUDED.start_date,
    end_date = EXCLUDED.end_date, contract_type = EXCLUDED.contract_type, status = EXCLUDED.status,
    consultant_code = EXCLUDED.consultant_code, synced_at = now();
  GET DIAGNOSTICS n_s = ROW_COUNT;

  -- 승인·제출된 상담 보고서 → 원본 위치 (제목은 가명)
  INSERT INTO cat.sources (source_id, source_type, storage, url, title, created_at)
  SELECT 'SRC-R-' || sm.id::text, 'consultation_report',
         CASE WHEN sm.report_url LIKE '%drive.google.com%' OR sm.report_url LIKE '%docs.google.com%' THEN 'gdrive' ELSE 'portal' END,
         sm.report_url, m.student_id || ' 상담 보고서 ' || COALESCE(sm.meeting_date::text, ''), sm.report_date
  FROM public.service_meetings sm JOIN cat_private.student_map m ON m.portal_student_id = sm.student_id
  WHERE sm.report_status = 'submitted' AND sm.report_url IS NOT NULL AND sm.report_url <> ''
  ON CONFLICT DO NOTHING;

  -- 상담 회차 (요약 원문 summary 는 실명이 섞일 수 있어 복사하지 않음 → LLM 가명 요약으로 채움)
  INSERT INTO cat.meetings (meeting_id, portal_meeting_id, student_id, meeting_date, meeting_type, source_id, consultant_code)
  SELECT 'MTG-' || sm.id::text, sm.id, m.student_id, sm.meeting_date, sm.meeting_type,
         src.source_id, cat_private.consultant_code(sm.consultant_id)
  FROM public.service_meetings sm
  JOIN cat_private.student_map m ON m.portal_student_id = sm.student_id
  LEFT JOIN cat.sources src ON src.url = sm.report_url
  ON CONFLICT (portal_meeting_id) DO UPDATE SET
    meeting_date = EXCLUDED.meeting_date, meeting_type = EXCLUDED.meeting_type,
    source_id = COALESCE(cat.meetings.source_id, EXCLUDED.source_id), consultant_code = EXCLUDED.consultant_code;
  GET DIAGNOSTICS n_m = ROW_COUNT;

  RETURN QUERY SELECT n_s, n_m;
END $$;

REVOKE ALL ON FUNCTION cat.sync_from_portal() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION cat_private.consultant_code(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION cat.sync_from_portal() TO service_role;

-- ── 5. 중간 평가 전 대리 지표 (포털 원본에서 바로 계산, 가명으로만 노출) ──
CREATE OR REPLACE VIEW cat.v_student_progress WITH (security_invoker = false) AS
SELECT m.student_id,
       (SELECT count(*) FROM public.student_milestones x WHERE x.student_id = m.portal_student_id)                          AS milestones,
       (SELECT count(*) FROM public.student_milestones x WHERE x.student_id = m.portal_student_id AND x.status = 'on_track')  AS on_track,
       (SELECT count(*) FROM public.student_milestones x WHERE x.student_id = m.portal_student_id AND x.status IN ('behind','urgent')) AS behind_or_urgent,
       (SELECT count(*) FROM public.service_followups f WHERE f.student_id = m.portal_student_id)                          AS followups,
       (SELECT count(*) FROM public.service_followups f WHERE f.student_id = m.portal_student_id AND f.done)               AS followups_done,
       (SELECT count(*) FROM public.service_meetings sm WHERE sm.student_id = m.portal_student_id)                         AS meetings,
       (SELECT count(*) FROM public.service_meetings sm WHERE sm.student_id = m.portal_student_id AND sm.report_status = 'submitted') AS reports_submitted
FROM cat_private.student_map m;

-- 학생 단위 과제·위험의 해소 여부 (마지막 회차에 남아 있으면 open)
CREATE OR REPLACE VIEW cat.v_student_issue_status AS
SELECT mt.student_id, t.code AS issue,
       min(mt.meeting_date) AS first_seen, max(mt.meeting_date) AS last_seen,
       CASE WHEN max(mt.meeting_date) = (SELECT max(m2.meeting_date) FROM cat.meetings m2
                                         WHERE m2.student_id = mt.student_id AND m2.extracted_at IS NOT NULL)
            THEN 'open' ELSE 'resolved' END AS state
FROM cat.meeting_tags t JOIN cat.meetings mt ON mt.meeting_id = t.meeting_id
WHERE t.dimension = 'student_issue'
GROUP BY mt.student_id, t.code;

-- ── 6. 권한: 조회는 admin / c_level, 쓰기는 service_role ────────
DO $$
DECLARE tbl TEXT;
BEGIN
  FOR tbl IN SELECT tablename FROM pg_tables WHERE schemaname = 'cat' LOOP
    EXECUTE format('ALTER TABLE cat.%I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('REVOKE ALL ON cat.%I FROM PUBLIC, anon, authenticated', tbl);
    EXECUTE format('GRANT SELECT ON cat.%I TO authenticated', tbl);
    EXECUTE format('GRANT ALL ON cat.%I TO service_role', tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON cat.%I', tbl || '_admin_select', tbl);
    EXECUTE format('CREATE POLICY %I ON cat.%I FOR SELECT TO authenticated USING (public.is_admin_level())', tbl || '_admin_select', tbl);
  END LOOP;
  FOR tbl IN SELECT tablename FROM pg_tables WHERE schemaname = 'cat_private' LOOP
    EXECUTE format('ALTER TABLE cat_private.%I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('REVOKE ALL ON cat_private.%I FROM PUBLIC, anon, authenticated', tbl);
    EXECUTE format('GRANT ALL ON cat_private.%I TO service_role', tbl);
  END LOOP;
END $$;

-- 뷰는 소유자 권한으로 포털 테이블을 읽으므로, 앱 사용자에게 열지 않는다(service_role·SQL Editor 전용)
REVOKE ALL ON cat.v_student_progress, cat.v_student_issue_status FROM PUBLIC, anon, authenticated;
GRANT SELECT ON cat.v_student_progress, cat.v_student_issue_status TO service_role;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA cat TO service_role;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA cat_private TO service_role;
