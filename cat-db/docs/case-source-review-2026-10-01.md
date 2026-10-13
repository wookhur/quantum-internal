# 학생 사례 원천 자료 검토 — 2026-10-01

사용자 승인을 받고 열람한 자료:
- 상담 요약 보고서 2건 (서로 다른 학생, 구글 문서 1건, PDF 1건)
- 이 문서에는 양식과 구조만 적고, 개별 학생의 상담 내용은 옮기지 않음
- `Consultants Service Operations Manual` (영/한 이중 언어, 약 17만 자)

## 1. 핵심 발견: 학생 사례의 뼈대는 이미 내부 포털에 있다

매뉴얼에 따르면 모든 상담 산출물은 **내부 포털의 학생 기록**에 올라갑니다(5.5).
"개인 드라이브에 파일을 남기지 않는다"가 원칙입니다.
이 저장소의 앱(`../app`, Supabase)이 바로 그 포털이고, 학생 사례 DB에 필요한 테이블이 이미 있습니다.

| 학생 사례 DB에 필요한 것 | 포털에 이미 있는 테이블·컬럼 | 비고 |
|---|---|---|
| 학생 마스터 | `service_students` (grade, majors, start_date, end_date, contract_type, assigned_consultant) | 실명 포함 → 가명 매핑 필요 |
| 상담 회차 + 보고서 원본 위치 | `service_meetings` (meeting_date, meeting_type, summary, **report_url**) | 보고서 PDF/구글 링크 = `sources` |
| 컨설턴트 내부 기록 | `service_diary` (entry_date, category, content) | 매뉴얼 5.7 "미팅 다이어리" |
| 액션 아이템 | `service_followups` (followup / assignment, 다이어리에 연결) | 실행률 지표의 원천 |
| 강점검사·성적 | `service_reports` (strength_result, grade_report 등, 학년별) | 연차별 비교의 원천 |
| 진행 상태 | `student_milestones` (type, status: on_track / behind / urgent / completed) | 중간 평가 제도가 생기기 전 대리 지표 |
| 활동 | `service_ec_activities` (partner, program, period) | 파트너 프로그램 위주 |
| 최종 결과 | `service_students.accepted_uni` | 학교별 결과(합격·불합격·대기)는 없음 |

→ 학생 사례 DB는 **학생 정보를 새로 모으지 않습니다.** 포털 데이터를 가명화해서 받고,
보고서 본문을 LLM으로 태깅하는 **분석 층**으로 설계합니다(ADR 0003).

## 2. 상담 요약 보고서 양식

매뉴얼 11.8, 5.10의 표준 템플릿(AI 활용 작성)을 따르고, 실제 2건도 같은 골격이었습니다.

| 보고서 영역 | 내용 | DB로 가는 곳 |
|---|---|---|
| 헤더 | 학생명, 학년, 희망 전공(자유 서술, 회차마다 바뀜), 상담일, 참석자, 다음 미팅 | `meetings`, `student_snapshots` |
| PART 01 상담 내용 요약 | 주제별 번호 단락 (SAT, 대학 전략, EC, 봉사, 스포츠, 강점검사 해설 등) | `meeting_tags`(topic), `activities`, `student_snapshots` |
| 핵심 하이라이트 (있는 경우) | 컨설턴트의 판단과 경고 | `comments` + strength/issue 태그 |
| PART 02 다음 미팅 준비 | 담당자별 액션 (컨설턴트 / 학생·학부모) | `action_items` (포털 `service_followups`와 대조) |

### 보고서에서 확인된, 태그 v0.1에 없던 정보
- **희망 전공은 회차마다 변합니다.** 자유 서술이고 복수 전공 조합이나 비중 변화도 적힙니다.
  시점별 스냅숏이 필요합니다.
- **활동은 '제안 → 수락/보류/중단' 단계를 거칩니다.** 시간 효율이나 건강 같은 이유로
  중단하거나 다른 활동으로 바꾸는 결정도 기록됩니다. 활동 상태와 결정 이력이 필요합니다.
- **문제점이 프로젝트 단위가 아니라 학생 단위로 나옵니다.**
  예: 시험 점수와 목표의 격차, 전공 미정, 활동과 실제 관심의 불일치, 미루는 습관, 글쓰기 자신감 부족,
  포트폴리오 준비 시한 위험, 부상. → `student_issue` 항목 신설
- **강점검사(CliftonStrengths 계열) 테마가 활동 설계의 근거로 쓰입니다.** → `strength_theme` 항목 신설
- **활동 유형이 추가로 필요합니다.** 기자단·학교 신문(`media_journalism`), 또래 상담·튜터링(`mentoring`)

## 3. 매뉴얼에서 DB 설계에 영향을 주는 규정

- **5.8 AI 도구 사용 기준**
  - "학생 개인정보는 회사가 명시적으로 승인한 AI 도구에만 입력할 수 있다"
  - → 보고서 태깅에 쓰는 LLM(Claude API 등)을 **승인 도구 목록(11.12)에 올려야** 합니다.
  - → 실명 제거(가명화)는 **LLM에 넣기 전에** 수행합니다.
- **5.9 녹화·전사본은 개인정보입니다.** 향후 Meet 1:1 녹화를 확장할 때도 같은 기준을 적용합니다.
- **5.4 보고서는 영/한 이중 언어입니다.** 한 언어만 추출하고(기본 한국어), 중복 적재하지 않습니다.
  - 파일명에 `_KR` 등의 언어 표시가 있으면 KR만 처리합니다.
- **5.4, 8.1 보고서는 승인 후 공유됩니다.** 승인된 보고서만 적재합니다(포털 `report_status = 'submitted'`).

## 4. 연차별 평가 (제도 없음, 웹사이트에서 구축 중) — 당장 쓸 수 있는 대리 지표

| 대리 지표 | 출처 | 의미 |
|---|---|---|
| 마일스톤 상태 비율 (on_track / behind / urgent) | `student_milestones` | 일정 대비 진척 |
| 액션 아이템 완료율 | `service_followups` | 실행력 |
| 상담 빈도·보고서 제출 | `service_meetings` | 관리 밀도 |
| 학년별 성적·강점검사 변화 | `service_reports` | 학업·자기이해 변화 |
| 문제점 태그의 해소 여부 | 보고서 태깅 결과 | 같은 이슈가 다음 회차에 사라졌는가 |

웹사이트 평가 제도가 생기면 `evaluations` 테이블로 받고, 위 지표는 보조로 둡니다.
