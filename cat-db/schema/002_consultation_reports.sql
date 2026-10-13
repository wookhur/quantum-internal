-- CAT 자료 DB — 002 상담 보고서 구조 (태그 사전 v0.2, ADR 0003)
-- 원천: 내부 포털 service_meetings.report_url 의 상담 요약 보고서 (가명화 후 LLM 추출)

-- 상담 회차. 포털 service_meetings 1행 ↔ 1행
CREATE TABLE meetings (
  meeting_id        TEXT PRIMARY KEY,          -- MTG-000001
  student_id        TEXT NOT NULL REFERENCES students(student_id),
  meeting_date      TEXT NOT NULL,
  meeting_type      TEXT,                      -- online | in_person | ...
  source_id         TEXT REFERENCES sources(source_id),   -- 보고서 원본
  report_language   TEXT,                      -- ko | en (이중 언어 보고서는 ko만 적재)
  attendee_roles    TEXT,                      -- 예: consultant,tutor,student,parent
  consultant_code   TEXT,
  next_meeting_date TEXT,
  next_meeting_agenda TEXT,
  summary           TEXT                       -- 가명화된 요약 (LLM)
);

-- 회차 시점의 학생 상태 (학년, 희망 전공 원문)
CREATE TABLE student_snapshots (
  meeting_id            TEXT PRIMARY KEY REFERENCES meetings(meeting_id),
  student_id            TEXT NOT NULL REFERENCES students(student_id),
  as_of                 TEXT NOT NULL,
  grade                 TEXT,                  -- grade 코드 (예 g10). 'Rising G10' 은 g10
  intended_major_text   TEXT                   -- 보고서 원문 (전공 태그는 meeting_tags 에)
);

-- 회차에서 관찰된 태그: topic(논의 주제), major(당시 희망 전공), student_issue, strength_theme
CREATE TABLE meeting_tags (
  meeting_id       TEXT NOT NULL REFERENCES meetings(meeting_id),
  dimension        TEXT NOT NULL,
  code             TEXT NOT NULL,
  evidence         TEXT,                       -- 근거 문장 요약 (가명화)
  tagged_by        TEXT NOT NULL,
  confidence       REAL,
  taxonomy_version TEXT NOT NULL,
  PRIMARY KEY (meeting_id, dimension, code),
  FOREIGN KEY (dimension, code) REFERENCES tags(dimension, code)
);

-- 활동(=projects)의 현재 상태와 회차별 결정 이력
ALTER TABLE projects ADD COLUMN status TEXT;           -- activity_status 코드
ALTER TABLE projects ADD COLUMN first_meeting_id TEXT REFERENCES meetings(meeting_id);

CREATE TABLE activity_events (
  project_id  TEXT NOT NULL REFERENCES projects(project_id),
  meeting_id  TEXT NOT NULL REFERENCES meetings(meeting_id),
  status      TEXT NOT NULL,                   -- activity_status 코드
  reason      TEXT,                            -- 예: 시간 효율, 부상
  PRIMARY KEY (project_id, meeting_id)
);

-- 다음 미팅까지 준비 사항 (포털 service_followups 와 대조 가능)
CREATE TABLE action_items (
  item_id     TEXT PRIMARY KEY,                -- ACT-000001
  meeting_id  TEXT NOT NULL REFERENCES meetings(meeting_id),
  owner_role  TEXT NOT NULL,                   -- consultant | tutor | student | parent
  description TEXT NOT NULL,
  due_date    TEXT,
  status      TEXT NOT NULL DEFAULT 'open'     -- open | done | dropped (포털 동기화 시 갱신)
);

-- 컨설턴트 코멘트를 회차에 연결 (보고서 '핵심 하이라이트')
ALTER TABLE comments ADD COLUMN meeting_id TEXT REFERENCES meetings(meeting_id);

-- 학생별 최신 과제·위험과 해소 여부: 마지막 회차에 남아 있으면 open
CREATE VIEW student_issue_status AS
SELECT m.student_id, t.code AS issue,
       MIN(m.meeting_date) AS first_seen,
       MAX(m.meeting_date) AS last_seen,
       CASE WHEN MAX(m.meeting_date) = (SELECT MAX(m2.meeting_date) FROM meetings m2 WHERE m2.student_id = m.student_id)
            THEN 'open' ELSE 'resolved' END AS state
FROM meeting_tags t JOIN meetings m ON m.meeting_id = t.meeting_id
WHERE t.dimension = 'student_issue'
GROUP BY m.student_id, t.code;
