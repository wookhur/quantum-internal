# 태그 사전 v0.1 (검토용)

> `tags-v0.1.yaml`에서 자동 생성 · 2026-10-01 · 이 파일은 직접 고치지 마세요.
> 의견은 '검토 의견' 칸에 적거나 메시지로 알려 주시면 YAML에 반영합니다.

## 항목 한눈에 보기

| 항목 | 적용 대상 | 여러 개 선택 | 값 개수 |
|---|---|---|---|
| 학년 (`grade`) | 공통 | 예 | 6 |
| 전공 계열 (`major`) | 공통 | 예 | 13 |
| 목표/관련 학교 (`target_school`) | 공통 | 예 | 별도 목록 |
| 진학 단계 (`school_level`) | 공통 | 아니오 | 4 |
| 프로젝트/활동 유형 (`project_type`) | 공통 | 예 | 12 |
| 주제 영역 (`topic`) | 공통 | 예 | 10 |
| 자료 유형 (`doc_type`) | 지식 자료 | 아니오 | 10 |
| 대상 독자 (`audience`) | 지식 자료 | 아니오 | 3 |
| 잘한 점 (`strength`) | 학생 사례 | 예 | 8 |
| 문제점 (`issue`) | 학생 사례 | 예 | 9 |

## 학년 (`grade`) — 공통

| 값 | 코드 | 검토 의견 |
|---|---|---|
| 8학년 이하 | `g8_below` | |
| 9학년 | `g9` | |
| 10학년 | `g10` | |
| 11학년 | `g11` | |
| 12학년 | `g12` | |
| 편입 | `transfer` | |

## 전공 계열 (`major`) — 공통

| 값 | 코드 | 검토 의견 |
|---|---|---|
| 컴퓨터과학·AI | `cs` | |
| 공학 | `engineering` | |
| 생명과학·프리메드 | `bio_premed` | |
| 의·치대 | `med_dental` | |
| 보건 | `public_health` | |
| 물리·화학·수학 | `physical_sci` | |
| 경영·경제 | `business` | |
| 사회과학·법·정치 | `social_sci` | |
| 심리 | `psychology` | |
| 인문 | `humanities` | |
| 예술·미디어·건축 | `arts` | |
| 다학제·융합 | `interdisciplinary` | |
| 미정 | `undecided` | |

## 목표/관련 학교 (`target_school`) — 공통

- 학교 마스터는 schools 테이블로 관리(코드 = 소문자 약칭, 예 upenn, jhu, cambridge, exeter)


## 진학 단계 (`school_level`) — 공통

| 값 | 코드 | 검토 의견 |
|---|---|---|
| 미국 학부 | `undergrad_us` | |
| 영국 학부 | `undergrad_uk` | |
| 보딩스쿨 | `boarding` | |
| 의대·대학원 | `grad_med` | |

## 프로젝트/활동 유형 (`project_type`) — 공통

| 값 | 코드 | 검토 의견 |
|---|---|---|
| 리서치·논문 | `research` | |
| 대회·올림피아드 | `competition` | |
| 여름 프로그램 | `summer_program` | |
| 인턴십 | `internship` | |
| 열정 프로젝트·제작 | `passion_project` | |
| 봉사·소셜임팩트·비영리 | `social_impact` | |
| 리더십·동아리 창립 | `leadership` | |
| 캡스톤·전공조합 | `capstone` | |
| 에세이 대회 | `essay_competition` | |
| 예술 포트폴리오 | `arts_portfolio` | |
| 운동 | `athletics` | |
| 온라인 코스 | `online_course` | |

## 주제 영역 (`topic`) — 공통

| 값 | 코드 | 검토 의견 |
|---|---|---|
| 학업(GPA·과목 선택) | `academics` | |
| 시험(SAT·AP·영어) | `testing` | |
| 비교과(EC) | `ec` | |
| 에세이 | `essay` | |
| 원서 작성(액티비티·추가정보) | `application` | |
| 추천서 | `recommendation` | |
| 조기전형 | `early_round` | |
| 재정보조·장학 | `financial_aid` | |
| 인터뷰 | `interview` | |
| 학교 선정 | `school_selection` | |

## 자료 유형 (`doc_type`) — 지식 자료

| 값 | 코드 | 검토 의견 |
|---|---|---|
| 학교별 합격가이드 | `school_guide` | |
| 합격 사례 프로필 | `admit_case` | |
| CDS·소송기록 등 데이터 분석 | `data_analysis` | |
| 시험·전형 정책표 | `policy_table` | |
| 학년별 캘린더·체크리스트 | `timeline` | |
| EC·대회·프로그램 리스트 | `opportunity_list` | |
| 전략 가이드 | `strategy_guide` | |
| 전공 트랙 | `major_track` | |
| 웨비나(녹음·요약) | `webinar` | |
| 인스타·SNS 영상 | `sns_video` | |

## 대상 독자 (`audience`) — 지식 자료

| 값 | 코드 | 검토 의견 |
|---|---|---|
| 학부모 | `parent` | |
| 학생 | `student` | |
| 내부(컨설턴트) | `internal` | |

## 잘한 점 (`strength`) — 학생 사례

| 값 | 코드 | 검토 의견 |
|---|---|---|
| 활동이 한 문장/한 관심사로 꿰임 | `coherent_narrative` | |
| 전공과 결이 맞는 수상 | `major_aligned_awards` | |
| 대상·산출물·측정된 변화가 있음 | `measurable_impact` | |
| 외부 검증(게재·입상·채택) | `external_validation` | |
| 자기주도(콜드메일·창립·제안) | `initiative` | |
| 도전적 과목 선택 | `rigor` | |
| 깊이 있는 소수 트랙 | `depth_over_breadth` | |
| 공백·어려움을 소명하고 재료로 씀 | `gap_explained` | |

## 문제점 (`issue`) — 학생 사례

| 값 | 코드 | 검토 의견 |
|---|---|---|
| 활동 산만·방향 없음 | `scattered_activities` | |
| 대상(누구에게) 불명확 | `no_target_audience` | |
| 기준선(Before) 측정 없음 | `no_baseline` | |
| 남는 산출물 없음 | `no_output` | |
| 직함만 있는 리더십 | `title_only_leadership` | |
| 착수 시기 늦음 | `late_start` | |
| 전공과 무관한 수상 나열 | `unrelated_awards` | |
| 미국/영국 트랙 혼선 | `us_uk_mismatch` | |
| 과목 난이도 부족 | `weak_rigor` | |

## 성과 지표

### 연차별 중간 평가 (y1, y2, y3, 1~5점)

| 평가 기준 | 코드 | 검토 의견 |
|---|---|---|
| 학업 성취·과목 난이도 | `academics` | |
| 핵심 트랙 깊이 | `ec_depth` | |
| 측정 가능한 임팩트 | `impact` | |
| 외부 인정(수상·게재·선발) | `external_recognition` | |
| 서사 일관성 | `narrative` | |

### 최종 결과

| 값 | 코드 |
|---|---|
| 합격 | `admitted` |
| 대기 | `waitlisted` |
| 보류(조기→정시) | `deferred` |
| 불합격 | `rejected` |
| 최종 등록 | `enrolled` |
