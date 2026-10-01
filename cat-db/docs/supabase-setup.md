# 내부 포털 DB(Supabase)에 분석용 공간 만들기

대상 프로젝트: `quantum-internal` (ref `fojabxikzvykkscwckyf`)

## 만들어지는 것

| 스키마 | 내용 | 누가 볼 수 있나 |
|---|---|---|
| `cat` | 가명(STU-xxxx) 학생 사례, 상담 회차, 태그, 원본 위치, 지식 자료 | 조회: admin·c_level 계정만 / 쓰기: service_role(동기화·태깅 스크립트)만 |
| `cat_private` | 실명 ↔ 가명 매핑, 컨설턴트 이름 ↔ 코드 매핑 | service_role과 SQL Editor만. 앱 사용자는 접근 불가 |

- 포털의 기존 테이블(`public.service_*`)은 **수정하지 않습니다.** 읽기만 합니다.
- 포털에서 학생을 지우면 매핑도 함께 지워집니다(CASCADE). 이후 동기화 때 `cat`의 해당 학생 행은 남으므로,
  완전 삭제가 필요하면 `DELETE FROM cat.students WHERE student_id = 'STU-xxxx'`를 실행합니다.

## 적용 순서 (Supabase 대시보드 → SQL Editor)

1. `app/supabase/migration-cat-analysis-schema.sql` 전체를 붙여 넣고 실행
   - 여러 번 실행해도 안전합니다.
2. `app/supabase/seed-cat-tags-v0.2.sql` 실행
   - 태그 사전 103개를 적재합니다.
3. 동기화 실행: `SELECT * FROM cat.sync_from_portal();`
   - 학생에게 STU 번호를 부여하고 상담 회차를 가져옵니다.
   - 제출 완료된 상담 보고서의 링크는 원본 위치로 등록됩니다.
4. 확인
   ```sql
   SELECT count(*) FROM cat.students;
   SELECT count(*) FROM cat.meetings WHERE source_id IS NOT NULL;   -- 보고서가 연결된 회차
   SELECT * FROM cat.v_student_progress ORDER BY student_id;          -- 중간 평가 전 대리 지표
   ```

⚠️ **Settings → API → Exposed schemas에 `cat`, `cat_private`를 추가하지 마세요.**
추가하지 않으면 앱 API로는 보이지 않고 SQL로만 접근할 수 있습니다.

## 검증 결과 (2026-10-01, 로컬 PostgreSQL 16 + Supabase 역할 흉내, 가짜 데이터)

| 시험 | 결과 |
|---|---|
| 마이그레이션 2회 연속 실행 | 오류 없음 |
| 동기화 2회 실행 | 중복 생성 없음 |
| `cat` 스키마에 실명·연락처·컨설턴트 이름이 남았는지 | 0건 |
| 포털 상담 `summary`(실명이 섞일 수 있음) | 복사하지 않음 |
| admin 계정 조회 / staff 계정 조회 / 비로그인 조회 | 가능 / 0행 / 거부 |
| 앱 사용자의 매핑 조회, 동기화 실행, 대리 지표 뷰 조회, 태그 쓰기 | 모두 거부 |
| 사전에 없는 태그 코드 저장 | 거부 |

실제 Supabase에는 아직 적용하지 않았습니다(이 작업 환경에는 DB 접속 정보가 없음).

## 다음 단계: 보고서 추출 파이프라인

동기화 다음에는 보고서 본문을 가명화하고 LLM으로 추출해 `cat.meetings.summary`, `meeting_tags`,
`projects`, `action_items`, `comments`를 채웁니다(`scripts/prompts/extract_consultation_report.md`).
이 작업에는 아래 두 가지가 필요합니다.
- DB 쓰기 권한: 작업 환경의 환경 변수 `CAT_DB_URL`(Postgres 연결 문자열)
- 보고서 태깅용 LLM의 회사 승인(운영 매뉴얼 5.8, 11.12)
