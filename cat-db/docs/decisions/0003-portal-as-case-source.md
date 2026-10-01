# 0003. 학생 사례(B층)는 내부 포털 데이터를 가명화해 받고, CAT DB는 분석 층만 담당

- 날짜: 2026-10-01
- 상태: 채택 (2026-10-01, 사용자가 '내부 포털 DB에 분석용 공간' 진행 결정)
- 관련: ADR 0001(DB 엔진), ADR 0002(두 층 구조)

## 배경
컨설턴트 운영 매뉴얼(5.5)상 모든 상담 산출물은 내부 포털(이 저장소의 Supabase 앱)의 학생 기록에 올라간다. 포털에는 이미 학생, 상담 회차와 보고서 링크, 다이어리, 액션 아이템, 강점검사·성적, 마일스톤, 진학 결과 컬럼이 있다.

## 선택지
1. CAT DB가 학생·상담 정보를 드라이브 문서에서 직접 다시 추출 → 포털과 중복되고 불일치 위험
2. 포털 테이블을 그대로 분석에 사용 → 실명이 LLM과 분석 결과에 노출됨
3. 포털을 원천으로, CAT DB는 **가명화된 사본 + LLM 태깅 결과**만 보관

## 결정
3번.
- **가명 키**: 포털 `service_students.id`(UUID) ↔ `STU-xxxx` 매핑은 Supabase `cat_private` 스키마에만 둔다(앱 사용자 접근 불가). CAT DB에는 `STU-xxxx`만 있다.
- **원본 위치**: `service_meetings.report_url`을 `sources.url`로 사용한다. 원본은 드라이브와 포털에 그대로 둔다.
- **LLM 입력 전 가명화**: 보고서 본문에서 학생, 학부모, 형제 이름과 학교, 교회, 지역 고유명사를 치환한 뒤 LLM에 넣는다(매뉴얼 5.8).
- **승인된 보고서만**: `report_status = 'submitted'`인 보고서만 적재한다.
- **엔진**: 파일럿부터 같은 Supabase의 별도 스키마(`cat`, 매핑은 `cat_private`)에 둔다. 마이그레이션: `app/supabase/migration-cat-analysis-schema.sql`, 적용 방법: `docs/supabase-setup.md`

## 영향
- 스키마 002: `meetings`, `student_snapshots`, `activities`(상태 이력), `action_items`, `meeting_tags`, `student_issues` 추가
- 태그 v0.2: `student_issue`, `strength_theme`, `activity_status` 항목과 활동 유형 2개 추가
- 운영 전 확인: 보고서 태깅용 LLM을 매뉴얼 11.12 승인 AI 도구 목록에 등록
