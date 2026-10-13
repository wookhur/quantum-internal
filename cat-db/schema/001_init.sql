-- CAT 자료 DB — 001 초기 스키마 (초안, 태그 사전 v0.1 기준)
-- SQLite / Postgres 공통 문법 위주로 작성 (ADR 0001).
-- 실명·연락처 컬럼은 어디에도 두지 않는다. 실명 대조표는 private/ 에 별도 보관.

-- ── 원본 위치 (A·B 공통) ───────────────────────────────
CREATE TABLE sources (
  source_id       TEXT PRIMARY KEY,          -- 예: SRC-000001
  source_type     TEXT NOT NULL,             -- pdf | gdoc | webinar_audio | sns_video | meeting_note ...
  storage         TEXT NOT NULL DEFAULT 'gdrive',
  external_id     TEXT,                      -- 구글 드라이브 파일 ID 등
  url             TEXT NOT NULL,             -- 원본 열람 주소
  title           TEXT NOT NULL,
  content_hash    TEXT,                      -- md5. 중복 제거용
  duplicate_of    TEXT REFERENCES sources(source_id),
  valid_for_cycle TEXT,                      -- 적용 입시 연도. 예 2026-27
  summary         TEXT,                      -- LLM 요약 (PII 없음)
  created_at      TEXT,                      -- 원본 작성일
  ingested_at     TEXT NOT NULL,
  UNIQUE (storage, external_id)
);

-- 전사본·추출 텍스트 (검색·LLM 입력용). 원문은 원본에 있고 여기는 가공본.
CREATE TABLE source_texts (
  source_id   TEXT NOT NULL REFERENCES sources(source_id),
  chunk_no    INTEGER NOT NULL,
  text        TEXT NOT NULL,
  PRIMARY KEY (source_id, chunk_no)
);

-- ── 태그 사전 (taxonomy/*.yaml 에서 생성) ──────────────
CREATE TABLE tags (
  dimension   TEXT NOT NULL,                 -- grade, major, project_type, strength ...
  code        TEXT NOT NULL,
  label       TEXT NOT NULL,
  layer       TEXT NOT NULL,                 -- A | B | AB
  deprecated  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (dimension, code)
);

CREATE TABLE schools (
  school_code TEXT PRIMARY KEY,              -- upenn, jhu, cambridge, exeter ...
  name        TEXT NOT NULL,
  country     TEXT NOT NULL,                 -- US | UK ...
  level       TEXT NOT NULL                  -- undergrad_us | undergrad_uk | boarding ...
);

-- 태그 부여 이력 공통 컬럼: tagged_by(llm|human), confidence, taxonomy_version
CREATE TABLE source_tags (
  source_id        TEXT NOT NULL REFERENCES sources(source_id),
  dimension        TEXT NOT NULL,
  code             TEXT NOT NULL,
  tagged_by        TEXT NOT NULL,
  confidence       REAL,
  taxonomy_version TEXT NOT NULL,
  PRIMARY KEY (source_id, dimension, code),
  FOREIGN KEY (dimension, code) REFERENCES tags(dimension, code)
);

CREATE TABLE source_schools (
  source_id   TEXT NOT NULL REFERENCES sources(source_id),
  school_code TEXT NOT NULL REFERENCES schools(school_code),
  PRIMARY KEY (source_id, school_code)
);

-- ── B층 · 학생 사례 ────────────────────────────────────
CREATE TABLE students (
  student_id      TEXT PRIMARY KEY,          -- STU-0001 (가명). 실명 대조는 private/ 에만
  cohort_year     INTEGER,                   -- 졸업(지원) 연도
  start_grade     TEXT,                      -- 컨설팅 시작 학년 (grade 코드)
  school_type     TEXT,                      -- 국제학교 | 보딩 | 국내 일반고 ... (학교명은 저장 안 함)
  curriculum      TEXT,                      -- IB | AP | A-Level | 국내
  consultant_code TEXT                       -- 담당 컨설턴트 (이니셜/코드)
);

CREATE TABLE student_tags (                  -- 희망 전공, 진학 단계 등
  student_id       TEXT NOT NULL REFERENCES students(student_id),
  dimension        TEXT NOT NULL,
  code             TEXT NOT NULL,
  as_of            TEXT,                     -- 희망 전공은 바뀔 수 있으므로 시점 기록
  tagged_by        TEXT NOT NULL,
  taxonomy_version TEXT NOT NULL,
  PRIMARY KEY (student_id, dimension, code),
  FOREIGN KEY (dimension, code) REFERENCES tags(dimension, code)
);

CREATE TABLE student_targets (
  student_id  TEXT NOT NULL REFERENCES students(student_id),
  school_code TEXT NOT NULL REFERENCES schools(school_code),
  priority    INTEGER,                       -- 1 = 1지망
  round       TEXT,                          -- ED | EA | REA | RD | UCAS
  PRIMARY KEY (student_id, school_code)
);

CREATE TABLE projects (
  project_id  TEXT PRIMARY KEY,              -- PRJ-000001
  student_id  TEXT NOT NULL REFERENCES students(student_id),
  title       TEXT NOT NULL,                 -- 비식별 제목
  grade_start TEXT,
  grade_end   TEXT,
  target_audience TEXT,                      -- 누구에게 (규모 포함)
  output      TEXT,                          -- 남은 산출물
  impact_metric TEXT,                        -- 측정된 변화
  summary     TEXT
);

CREATE TABLE project_tags (                  -- project_type, strength, issue
  project_id       TEXT NOT NULL REFERENCES projects(project_id),
  dimension        TEXT NOT NULL,
  code             TEXT NOT NULL,
  tagged_by        TEXT NOT NULL,
  confidence       REAL,
  taxonomy_version TEXT NOT NULL,
  PRIMARY KEY (project_id, dimension, code),
  FOREIGN KEY (dimension, code) REFERENCES tags(dimension, code)
);

-- 컨설턴트 코멘트 (자유 텍스트, PII 금지)
CREATE TABLE comments (
  comment_id      INTEGER PRIMARY KEY,
  student_id      TEXT NOT NULL REFERENCES students(student_id),
  project_id      TEXT REFERENCES projects(project_id),
  consultant_code TEXT,
  written_at      TEXT,
  body            TEXT NOT NULL,
  source_id       TEXT REFERENCES sources(source_id)
);

-- 1·2·3년차 중간 평가 (기준별 1행)
CREATE TABLE evaluations (
  student_id      TEXT NOT NULL REFERENCES students(student_id),
  period          TEXT NOT NULL,             -- y1 | y2 | y3
  criterion       TEXT NOT NULL,             -- academics | ec_depth | impact | external_recognition | narrative
  score           INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5),
  rubric_version  TEXT NOT NULL,
  evaluated_at    TEXT,
  evaluator_code  TEXT,
  note            TEXT,
  PRIMARY KEY (student_id, period, criterion)
);

-- 최종 결과 (학교별)
CREATE TABLE outcomes (
  student_id  TEXT NOT NULL REFERENCES students(student_id),
  school_code TEXT NOT NULL REFERENCES schools(school_code),
  round       TEXT,
  result      TEXT NOT NULL,                 -- admitted | waitlisted | deferred | rejected | enrolled
  decided_at  TEXT,
  PRIMARY KEY (student_id, school_code, round)
);

-- 사례의 근거 원본 연결 (상담 노트, 원서, 활동 증빙 등)
CREATE TABLE student_sources (
  student_id  TEXT NOT NULL REFERENCES students(student_id),
  source_id   TEXT NOT NULL REFERENCES sources(source_id),
  role        TEXT,                          -- application | meeting_note | essay_draft | evidence
  PRIMARY KEY (student_id, source_id)
);

-- ── 벤치마크용 뷰: 연차별 평균 점수 ─────────────────────
CREATE VIEW student_period_scores AS
SELECT student_id, period, AVG(score) AS avg_score, COUNT(*) AS n_criteria
FROM evaluations
GROUP BY student_id, period;
