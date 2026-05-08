# PRD: Quantum Admissions 내부 관리 시스템 (QA Internal)

> **Version**: 0.4.0  
> **Last Updated**: 2026-04-13  
> **Status**: Draft  

---

## 1. 개요 (Overview)

### 1.1 배경
퀀텀어드미션즈(Quantum Admissions)는 미국/영국 대학 입시 컨설팅 회사로, 현재 다수의 구글 시트와 구글 캘린더를 통해 전사 업무를 관리하고 있다. 세일즈/마케팅 데이터, 컨설팅 고객 관리, 결제 추적, 이벤트 기획, 마케팅 지표가 3개의 구글 시트(10개+ 탭)와 5개의 구글 캘린더에 분산되어 있어 시각화/대시보드 부재, 데이터 중복 입력, 검색 어려움, 시트 간 데이터 동기화 문제가 발생하고 있다. 이를 **전사 통합 내부 웹서비스**로 대체한다.

### 1.2 현재 구글 시트 구조 (AS-IS)
| 탭명 | 용도 |
|------|------|
| 실적 분석 | KR 월별 매출 목표/실적, US 컨설팅 매출, 상담건수, 계약건수, 전환율 |
| 영업 현황 | 이벤트(세미나)별 신청자→참석자→상담→미팅→계약 퍼널 |
| 마케팅 현황 | 카카오채널/인스타그램/유튜브/블로그 KPI (연간목표 + 주차별 추적) |
| 마케팅 광고 현황 | 메타 광고, 카카오 채널 광고 성과 (노출/도달/클릭/비용/CTR/CPC) |
| 이벤트 현황 | 세미나 기획 체크리스트 (스피커/장소/카피/디자인/PPT 확정 여부) |
| Raw | 리드 원본 데이터 (유입시간, 학생/학부모 정보, 학교, 학년, 관심분야, 유입채널, 메모, Required Action, 1~3차 상담 상태) |
| Meeting | 월별 미팅 기록 (날짜, 차수, 고객정보, 메모, 다음미팅, Required Action) |
| Pipeline | 월별 진행 중 파이프라인 (상담→계약 진행 중인 리드) |
| Existing Contract | 기존 계약 목록 (계약자, 학생, 학교, 계약일, 만료일) |
| Payment Schedule | 결제 스케줄 (계약금/중도금/잔금, 총액, 납입액, 미수금, 지급현황%, 월별 납입 내역) |
| 영상 업무 현황 / 영상 주제 | 영상 콘텐츠 기획 및 진행 상황 |

**추가 데이터 소스:**
| 소스 | 설명 |
|------|------|
| 행사 참석자 리드소스 DB (구글 시트) | 세미나별 구글 폼 응답 (이벤트별 탭: 1/16 GIA 세미나, 2/28 EC&BIO 웨비나 등). 컬럼: timestamptz, 학부모/본인 구분, 성, 이름, 이메일, 연락처, 재학학교, 학년, 상담 신청 여부 |
| Survey Response DB (구글 시트) | 인스타그램에서 유입된 설문 응답. 관심분야별 탭 (AI 에세이, 인턴십, IB, 몰입, 전공 리서치, 강점코칭, 캡스톤, EC, DEI 등). 컬럼: timestamptz, 부모님 성함, 이메일, 국가, 도시, 전화번호, 학생명, 재학학교 |
| Google Calendar (5개) | wookhur@, samhan@(CEO), consulting@, seongwon@, 한국 공휴일. 상담 이벤트에 `[방문1차]`, `[줌미팅]` 등 패턴으로 미팅 유형/차수 + 학생/학부모 정보 + 상담 노트(description) 포함 |

### 1.3 목표
- 3개 구글 시트 + 구글 캘린더를 **전사 통합 웹서비스**로 대체
- **세일즈/마케팅 모듈** + **컨설팅 서비스 모듈**로 분리하되, KPI/할일/캘린더는 공통 접근
- 역할(Role) 기반 접근 제어로 각 팀이 자기 영역만 접근, 공통 영역은 모두 접근 가능
- 리드 파이프라인 시각화, 매출/마케팅 KPI 대시보드, 결제 추적 기능 제공
- **Google Calendar 양방향 연동** — 상담 스케줄 조회/생성, 미팅 기록 자동 동기화
- **외부 리드 소스 자동 수집** — 구글 폼(세미나 참석자), 인스타그램 설문 DB 연동
- 기존 구글 시트 데이터 전체 마이그레이션

### 1.4 비목표 (Non-Goals)
- 외부 고객(학생/학부모)이 직접 접속하는 포털
- PG사 결제 자동 연동 (수동 입력으로 관리)
- 모바일 네이티브 앱 (반응형 웹으로 대응)

### 1.5 배포 도메인
- `internal.quantumadmissions.com` (Vercel + 서브도메인)

---

## 2. 사용자 및 역할 (Users & Roles)

### 2.1 역할 정의

| 역할 | 대상 | 접근 범위 |
|------|------|-----------|
| **Admin** | 대표/경영진 | 전체 접근 (세일즈 + 컨설팅 + 설정) |
| **Sales** | 세일즈/마케팅 팀 (4명: 팀장1 + 담당자3) | 세일즈/마케팅 모듈 전체 + 공통 영역 |
| **Consultant** | 컨설턴트 | 컨설팅 서비스 모듈 + 공통 영역 |
| **Viewer** | 열람자/인턴 | 읽기 전용 (할당된 영역만) |

### 2.2 접근 권한 매트릭스

| 기능 영역 | Admin | Sales | Consultant | Viewer |
|-----------|-------|-------|------------|--------|
| **공통: 대시보드 (KPI)** | RW | R | R | R |
| **공통: 할일 목록** | RW | RW | RW | R |
| **공통: 알림** | RW | RW | RW | R |
| **세일즈: 리드/파이프라인** | RW | RW | - | - |
| **세일즈: 영업 현황** | RW | RW | - | - |
| **세일즈: 마케팅 지표** | RW | RW | - | - |
| **세일즈: 광고 성과** | RW | RW | - | - |
| **세일즈: 이벤트 관리** | RW | RW | - | - |
| **컨설팅: 계약 고객 관리** | RW | R | RW | - |
| **컨설팅: 상담 기록** | RW | - | RW | - |
| **컨설팅: 결제 관리** | RW | R | R | - |
| **설정: 사용자 관리** | RW | - | - | - |

> R = 읽기, RW = 읽기+쓰기, - = 접근 불가

---

## 3. 기능 요구사항: 공통 영역

### 3.1 인증 (Authentication)
- Google OAuth 로그인 (회사 계정 `@quantumadmissions.com`)
- 이메일/비밀번호 로그인
- Supabase Auth 사용
- 로그인 후 역할에 따라 기본 랜딩 페이지 분기
  - Admin/Sales → 세일즈 대시보드
  - Consultant → 컨설팅 대시보드

### 3.2 KPI 대시보드 (모든 역할 접근 가능)
전사 핵심 지표를 한 화면에 요약 표시

#### 3.2.1 KPI 요약 카드
- 이번 달 매출 목표 vs 실적 (₩, KR)
- 이번 달 매출 목표 vs 실적 ($, US)
- 목표 대비 달성률 (%)
- 이번 달 신규 리드 수
- 이번 달 상담 건수 (줌+대면)
- 이번 달 신규 계약 건수
- 상담 대비 계약률 (%)
- 미수금 총액

#### 3.2.2 차트
- 월별 매출 추이 (목표 vs 실적, 라인 차트)
- 리드 → 상담 → 계약 퍼널 차트
- 유입 채널별 리드 분포 (파이/바 차트)
- 월별 신규 계약 추이

### 3.3 할일 목록 (To-Do) - 모든 역할 접근 가능
- 개인별 할일 생성/수정/완료
- 고객(리드/계약 고객) 연결 가능
- 마감일 + 우선순위 설정
- 팀원별 필터링
- 완료/미완료 토글

### 3.4 Google Calendar 연동 (모든 역할 접근 가능)

> 현재 CEO 캘린더(samhan@)에 모든 상담 미팅이 `[방문1차] 학교 학년, 학생명 전화번호` 패턴으로 등록되어 있고, description에 상세 상담 내용이 포함됨.

#### 3.5.1 캘린더 뷰
- 주간/월간 캘린더 뷰 (회사 전체 일정)
- 5개 캘린더 통합 표시 (wookhur@, samhan@, consulting@, seongwon@, 공휴일)
- 캘린더별 색상 구분
- 미팅 유형별 아이콘: 방문(대면), 줌, 전화

#### 3.5.2 상담 미팅 연동
- Google Calendar API 양방향 동기화
- **캘린더 → 시스템**: 캘린더에 등록된 미팅을 자동 파싱하여 리드/미팅 데이터와 연결
  - 이벤트 제목에서 미팅 유형(`[방문1차]`, `[줌미팅]`), 학교, 학년, 학생명, 전화번호 파싱
  - description에서 상담 노트 자동 추출
- **시스템 → 캘린더**: 시스템에서 미팅 생성 시 Google Calendar에 자동 등록
- 미팅 리마인더 자동 설정

#### 3.5.3 스케줄링 지원
- 팀원별 가용 시간 조회
- 다음 미팅 잡기 (리드 상세에서 바로 캘린더 이벤트 생성)
- 충돌 감지 (같은 시간 중복 미팅 경고)

### 3.6 외부 리드 소스 통합

#### 3.6.1 세미나 신청폼 (자체 구축, 구글 폼 대체)
- 시스템 내에서 세미나별 신청폼 생성/관리
- 공개 URL로 외부 학부모가 직접 작성 (`internal.quantumadmissions.com/form/{event-slug}`)
- 제출 즉시 리드 자동 생성 (중복 체크: 연락처/이메일)
- 기존 구글 폼 응답 데이터(행사 참석자 리드소스 DB) 마이그레이션

#### 3.6.2 인스타그램 설문 연동
- 기존 Survey Response DB(구글 시트) 데이터 초기 마이그레이션
- 향후 인스타 바이오 링크 → 자체 설문폼으로 전환
- 관심분야별(AI 에세이, 인턴십, IB, EC 등) 자동 태깅
- 국가/도시 정보로 KR/US 리드 자동 분류

### 3.7 알림 (Notifications)
- 인앱 알림 (기본)
- Slack 웹훅 연동 (Phase 2)
- 카카오톡 알림톡 연동 (Phase 3)
- 알림 트리거:
  - 새 리드 유입 시 (수동 입력 + 구글 폼 + 인스타 설문)
  - 할일 마감 임박 (D-3, D-1)
  - 할일 할당 시
  - 파이프라인 단계 변경 시
  - 결제 예정일 임박 시
  - 내일 예정 미팅 리마인더 (캘린더 연동)

---

## 4. 기능 요구사항: 세일즈/마케팅 모듈

> 접근 권한: Admin, Sales

### 4.1 리드 관리 (Raw 탭 대체)

#### 4.1.1 리드 목록
- 테이블 뷰 (기본) + 카드 뷰 전환
- 컬럼: 유입일, 부모님 성함, 학생 이름, 이메일, 연락처, 재학 학교, 학년, 지역, 관심분야, 유입채널, Required Action, 상담 진행 상태
- 검색: 이름, 학교, 연락처, 이메일
- 필터: 유입 채널, 관심분야, Required Action 상태, 유입 기간, 학년
- 정렬: 유입일, 이름, 최근 활동일
- 색상 코딩: Required Action 상태별 (노랑=진행중, 초록=계약완료, 회색=비활성)

#### 4.1.2 리드 상세 페이지
- **기본 정보**: 학생명, 부모님 성함, 연락처, 이메일, 재학 학교, 학년, 지역
- **관심분야**: 해외대학 입시(대입-Overseas), EC(대외활동-Extracurricular), 리서치 프로그램, 학업 성취도 및 내신 관리, 표준 시험(SAT/ACT) 전략, 해외대학 편입 등
- **유입 정보**: 유입 채널 (인스타그램, 카카오톡채널, 세미나, 소개/추천), 유입일
- **상담 추적**: 1차/2차/3차 상담 상태 (미진행/완료/날짜), 상담 방식 (대면/줌/전화/카톡)
- **Required Action**: 현재 필요한 다음 액션
- **메모**: 자유 형식 메모 (타임라인)
- **활동 로그**: 상태 변경 자동 기록

#### 4.1.3 파이프라인 보드 (Pipeline 탭 대체)
- 칸반 보드: 신규리드 → 카톡발송 → 1차상담 → 2차상담 → 계약검토 → 계약완료
- 드래그 앤 드롭으로 단계 이동
- 각 단계별 리드 수 표시
- 월별 파이프라인 필터
- 카드에 표시: 학생명, 부모님 성함, 학교, 유입채널, 체류일수

### 4.2 영업 현황 (영업 현황 탭 대체)
- 이벤트(세미나)별 세일즈 퍼널 테이블
- 컬럼: 이벤트명, 신청자 수, 참석자 수, 전화 상담자 수, 줌 미팅 예약자 수, 대면 미팅 예약자 수, 줌+대면 미팅 수, 계약 성사 수, 계약 성공률
- 월별 소계 자동 계산
- 퍼널 시각화 차트 (이벤트별)

### 4.3 마케팅 지표 (마케팅 현황 탭 대체)

#### 4.3.1 채널별 KPI 트래킹
- 항목: 카카오 채널 친구 수, 인스타그램 팔로워 수, 유튜브 팔로워 수, 입시 뉴스 발행 수, 블로그 조회수, 블로그 순 방문자 수
- 연간 목표 설정
- 월별 실적 입력
- 주차별 세부 추적 (1~5주차)
- 목표 대비 달성률 자동 계산

#### 4.3.2 광고 성과 (마케팅 광고 현황 탭 대체)
**메타(Instagram/Facebook) 광고:**
- 이벤트명, 노출, 도달, 클릭, 비용, CTR(클릭률), CPC(클릭당 비용), 댓글(신청) 수, 댓글(신청)율, 댓글당 비용, 비고

**카카오 채널 광고:**
- 이벤트명, 노출, 도달, 클릭, 비용, CTR, CPC, 기존 친구수, 광고 후 친구수

- ROI 자동 계산 (광고비 대비 계약 전환)
- 채널별 성과 비교 차트

### 4.4 이벤트 관리 (이벤트 현황 탭 대체)
- 월별 세미나/이벤트 계획
- 주차별 배치
- 체크리스트: 스피커 확정, 장소 확정, 카피 작성, 디자인 완성, PPT 완성, 업로드 완료
- 각 항목 O/X 토글
- 이벤트 상세: 행사명, 날짜/시간, 장소, 스피커 목록

### 4.5 세미나 신청폼 (구글 폼 대체)
- 세미나별 커스텀 신청폼 생성/관리
- 폼 필드: 학부모/본인 구분, 성, 이름, 이메일, 연락처, 재학학교, 학년, 상담 신청 여부
- 공개 URL 발급 (외부 학부모가 접속하여 작성)
- 제출 시 → 리드 자동 생성 (sourceChannel: 해당 세미나명, 중복 체크)
- 세미나별 신청자 목록 조회
- 기존 구글 폼 데이터 마이그레이션 지원

### 4.6 영상 콘텐츠 관리 (영상 업무 현황/영상 주제/영상별 Insight 탭 대체)

#### 4.6.1 영상 업무 현황
- 영상 프로젝트 목록 (테이블/칸반)
- 상태: 기획 → 촬영 → 편집 → 검수 → 업로드
- 담당자 할당, 마감일 설정
- 체크리스트 기능 (촬영일정 확정, 대본 완성, 편집 완료 등)

#### 4.6.2 영상 주제 관리
- 콘텐츠 아이디어/주제 목록
- 카테고리 분류 (입시 정보, 학교 소개, 합격 사례 등)
- 우선순위, 예상 퍼블리싱 일정
- 상태: 아이디어 → 승인 → 제작중 → 완료

#### 4.6.3 영상별 성과 인사이트
- 업로드 후 성과 추적: 조회수, 좋아요, 댓글, 공유
- 플랫폼별 (유튜브, 인스타 릴스 등)
- 콘텐츠 유형별 성과 비교 차트

### 4.7 미팅 기록 (Meeting 탭 대체)
- 월별 미팅 목록
- 컬럼: 날짜, 차수(1/2/3차), 부모님 성함, 학생 이름, 연락처, 재학 학교, 학년, 지역, 관심분야, 유입 채널, 메모, 노트 전달 여부, 다음 미팅 일정, Required Action
- 상담 기록 드라이브 링크 연동
- 리드 데이터와 자동 연결

---

## 5. 기능 요구사항: 컨설팅 서비스 모듈

> 접근 권한: Admin, Consultant (일부 Sales 읽기 가능)

### 5.1 계약 고객 관리 (Existing Contract 탭 대체)
- 계약 고객 목록 (테이블)
- 컬럼: 계약자명(부/모), 학생명, 학교명, 계약 시 학년, 계약일, 만료일
- 계약 상태: 진행 중 / 만료 임박 / 만료 자동 표시
- 학생 상세 페이지:
  - 기본 정보 + 목표 학교
  - 컨설팅 진행 상황 타임라인
  - 상담 기록 (노트)
  - 첨부 파일 (에세이, 서류 등)
  - 결제 현황 요약

### 5.2 상담 기록
- 고객별 상담 이력 타임라인
- 상담일, 방식(대면/줌/전화), 내용, 다음 할일
- 상담 기록 드라이브 연동 (Google Drive 폴더 링크)
- 첨부 파일 업로드

### 5.3 결제 관리 (Payment Schedule 탭 대체)
- 고객별 결제 스케줄 관리
- 필드:
  - 계약자명, 학생명, 학교명, 계약시 학년
  - 계약일, 만료일
  - 계약금, 중도금, 2차 중도금, 잔금 (각 납입일)
  - 총 계약 금액 (₩)
  - 납입 금액
  - 미수금 (자동 계산, 빨간색 강조)
  - 지급 현황 (%, 프로그레스 바)
- 월별 납입 내역 기록
- 미수금 알림 (결제 예정일 D-7, D-1)
- 전체 미수금 요약 대시보드

### 5.4 컨설팅 대시보드
- 진행 중 고객 수
- 만료 임박 계약 (30일 이내)
- 미수금 총액 + 상위 미수금 고객
- 이번 주 예정 상담 목록
- 최근 상담 기록

---

## 6. 기술 스택 (Tech Stack)

| 영역 | 기술 | 비고 |
|------|------|------|
| **Frontend** | React 18 + TypeScript | Vite 빌드 |
| **UI 라이브러리** | Tailwind CSS + shadcn/ui | 일관된 디자인 시스템 |
| **상태 관리** | TanStack Query (React Query) | 서버 상태 관리 |
| **라우팅** | React Router v6 | 역할 기반 라우트 가드 |
| **Backend** | Supabase Edge Functions / API | 서버리스, PostgreSQL 직접 접근 |
| **Database** | Supabase (PostgreSQL) | 관계형 DB, 복잡한 집계/리포트에 적합 |
| **Authentication** | Supabase Auth | Google OAuth + Email/Password |
| **File Storage** | Supabase Storage | 첨부 파일 (에세이, 서류 등) |
| **실시간** | Supabase Realtime | 리드/할일 실시간 업데이트 |
| **배포** | Vercel | `internal.quantumadmissions.com` |
| **차트** | Recharts | React 네이티브 차트 |
| **드래그앤드롭** | @dnd-kit | 칸반 보드 |
| **캘린더 연동** | Google Calendar API v3 | 양방향 미팅 동기화 |
| **폼** | 자체 구축 (React Hook Form) | 세미나 신청폼 직접 운영 (구글 폼 대체) |
| **알림 (Phase 2)** | Slack Webhook API | 슬랙 연동 |
| **알림 (Phase 3)** | 카카오 알림톡 API | 카카오 연동 |

---

## 7. 데이터 모델 (Data Model)

### 7.1 Users
```typescript
{
  uid: string                    // Supabase Auth UID
  email: string
  name: string
  role: "admin" | "sales" | "consultant" | "viewer"
  avatarUrl?: string
  createdAt: timestamptz
}
```

### 7.2 Leads (리드) — Raw 탭 기반
```typescript
{
  id: string
  leadDate: timestamptz              // 유입 시간
  parentName: string               // 부모님 성함
  studentName: string              // 학생 이름
  email?: string                   // 이메일
  phone: string                    // 연락처
  currentSchool: string            // 재학 학교
  grade: string                    // 학년 (G8, 10, Y11, Freshman 등)
  region: string                   // 지역 (서울, CA, Hong Kong 등)
  interestArea: string             // 관심분야
  sourceChannel: string            // 유입 채널 (Instagram, GIA Seminar, 카카오톡, 소개 등)
  memo: string                     // 메모
  requiredAction?: string          // Required Action
  consultations: {                 // 상담 진행 상태
    first?: { status: "pending" | "completed", date?: string, method?: string }
    second?: { status: "pending" | "completed", date?: string, method?: string }
    third?: { status: "pending" | "completed", date?: string, method?: string }
  }
  pipelineStage: "new_lead" | "katalk_sent" | "first_consultation" | "second_consultation" | "contract_review" | "contracted" | "lost"
  assignedTo?: string              // 담당자 uid
  createdAt: timestamptz
  updatedAt: timestamptz
}
```

### 7.3 Meetings (미팅 기록)
```typescript
{
  id: string
  leadId: string                   // 연결된 리드
  date: timestamptz                  // 미팅 날짜
  meetingNumber: 1 | 2 | 3         // 1차/2차/3차
  parentName: string
  studentName: string
  phone: string
  currentSchool: string
  grade: string
  region: string
  interestArea: string
  sourceChannel: string
  memo: string
  noteDelivered: boolean           // 노트 전달 여부
  nextMeetingDate?: timestamptz      // 다음 미팅
  requiredAction?: string
  createdAt: timestamptz
}
```

### 7.4 SalesEvents (영업 현황)
```typescript
{
  id: string
  month: string                    // "2026-01"
  eventName: string                // 이벤트명 (예: "1/16 GIA 세미나")
  applicants: number               // 신청자 수(팀)
  attendees: number                // 참석자 수(팀)
  phoneConsultations: number       // 전화 상담자 수
  zoomBookings: number             // 줌 미팅 예약자 수
  inPersonBookings: number         // 대면 미팅 예약자 수
  totalMeetings: number            // 줌 + 대면 미팅 수
  contracts: number                // 계약 성사 수
  contractRate: number             // 계약 성공률 (%)
  createdAt: timestamptz
}
```

### 7.5 MarketingMetrics (마케팅 지표)
```typescript
{
  id: string
  year: number                     // 2026
  month: number                    // 1~12
  week?: number                    // 1~5 (주차별 세부 데이터)
  channel: "kakao" | "instagram" | "youtube" | "blog" | "news"
  metric: string                   // "friends" | "followers" | "views" | "visitors" | "published"
  annualTarget: number
  value: number
  createdAt: timestamptz
}
```

### 7.6 AdCampaigns (광고 성과)
```typescript
{
  id: string
  platform: "meta" | "kakao"       // 광고 플랫폼
  eventName: string                // 이벤트/캠페인명
  impressions: number              // 노출
  reach: number                    // 도달
  clicks: number                   // 클릭
  cost: number                     // 비용 (₩)
  ctr: number                      // CTR (%)
  cpc: number                      // CPC (₩)
  // 메타 전용
  comments?: number                // 댓글(신청) 수
  commentRate?: number             // 댓글율 (%)
  costPerComment?: number          // 댓글당 비용
  // 카카오 전용
  friendsBefore?: number           // 기존 친구수
  friendsAfter?: number            // 광고 후 친구수
  note?: string                    // 비고
  createdAt: timestamptz
}
```

### 7.7 Events (이벤트/세미나 관리)
```typescript
{
  id: string
  month: string                    // "2026-04"
  week: number                     // 주차
  eventName: string                // 행사 이름
  dateTime: string                 // 날짜/시간
  venue: string                    // 장소
  speakers: string[]               // 스피커 목록
  checklist: {
    speakerConfirmed: boolean      // 스피커 확정
    venueConfirmed: boolean        // 장소 확정
    copyWritten: boolean           // 카피 작성
    designCompleted: boolean       // 디자인 완성
    pptCompleted: boolean          // PPT 완성
    uploaded: boolean              // 업로드 완료
  }
  createdAt: timestamptz
}
```

### 7.8 Contracts (기존 계약)
```typescript
{
  id: string
  contractorName: string           // 계약자명 (부/모 표시)
  studentName: string
  schoolName: string               // 학교명
  gradeAtContract: string          // 계약 시 학년
  contractDate: timestamptz          // 계약일
  expiryDate: timestamptz            // 만료일
  status: "active" | "expiring_soon" | "expired"
  leadId?: string                  // 원본 리드 연결
  createdAt: timestamptz
}
```

### 7.9 Payments (결제 스케줄)
```typescript
{
  id: string
  contractId: string               // 연결된 계약
  contractorName: string
  studentName: string
  schoolName: string
  gradeAtContract: string
  contractDate: timestamptz
  expiryDate: timestamptz
  // 결제 단계별 금액 & 날짜
  deposit?: { amount: number, date?: timestamptz }            // 계약금
  interim1?: { amount: number, date?: timestamptz }           // 중도금
  interim2?: { amount: number, date?: timestamptz }           // 2차 중도금
  balance?: { amount: number, date?: timestamptz }            // 잔금
  totalAmount: number              // 총 계약 금액 (₩)
  paidAmount: number               // 납입 금액
  outstandingAmount: number        // 미수금 (자동 계산)
  paymentProgress: number          // 지급 현황 (%)
  monthlyPayments: {               // 월별 납입 내역
    [yearMonth: string]: number    // "2026-01": 11000000
  }
  currency: "KRW" | "USD"
  createdAt: timestamptz
  updatedAt: timestamptz
}
```

### 7.10 MonthlyPerformance (실적 분석)
```typescript
{
  id: string
  year: number
  month: number
  region: "KR" | "US"
  target: number                   // 경영 목표
  actual: number                   // 사업 실적
  achievementRate: number          // 달성률 (%)
  expenses?: number                // 비용
  profit?: number                  // 손익
  consultationCount?: number       // 상담건수 (줌+대면)
  newContracts?: number            // 신규 계약 건수
  conversionRate?: number          // 상담 대비 계약률 (%)
  currency: "KRW" | "USD"
  createdAt: timestamptz
}
```

### 7.11 Todos (할일)
```typescript
{
  id: string
  title: string
  description?: string
  assignedTo: string               // 담당자 uid
  linkedEntityType?: "lead" | "contract" | "event"
  linkedEntityId?: string
  status: "todo" | "in_progress" | "done"
  priority: "low" | "medium" | "high"
  dueDate?: timestamptz
  createdBy: string
  createdAt: timestamptz
  updatedAt: timestamptz
}
```

### 7.12 VideoProjects (영상 프로젝트)
```typescript
{
  id: uuid PRIMARY KEY
  title: string                      // 영상 제목/주제
  category: string                   // 입시 정보, 학교 소개, 합격 사례 등
  status: "idea" | "approved" | "filming" | "editing" | "review" | "uploaded"
  assignedTo: uuid REFERENCES users(id)
  dueDate?: date
  platform: "youtube" | "instagram_reels" | "both"
  // 성과 지표 (업로드 후)
  views?: integer
  likes?: integer
  comments?: integer
  shares?: integer
  publishedUrl?: string
  checklist: jsonb                   // {scriptDone, filmingDone, editDone, reviewDone}
  notes?: text
  createdAt: timestamptz DEFAULT now()
  updatedAt: timestamptz DEFAULT now()
}
```

### 7.13 EventForms (세미나 신청폼)
```typescript
{
  id: uuid PRIMARY KEY
  eventId: uuid REFERENCES events(id)
  slug: string UNIQUE               // URL 슬러그 (/form/{slug})
  isActive: boolean DEFAULT true
  fields: jsonb                     // 폼 필드 구성 (커스터마이즈 가능)
  createdAt: timestamptz DEFAULT now()
}
```

### 7.14 FormSubmissions (폼 제출)
```typescript
{
  id: uuid PRIMARY KEY
  formId: uuid REFERENCES event_forms(id)
  respondentType: "parent" | "student" // 학부모/본인 구분
  lastName: string
  firstName: string
  email: string
  phone: string
  currentSchool: string
  grade: string
  wantsConsultation: boolean
  leadId?: uuid REFERENCES leads(id)   // 자동 생성된 리드 연결
  submittedAt: timestamptz DEFAULT now()
}
```

### 7.15 ActivityLog (활동 로그)
```typescript
{
  id: uuid PRIMARY KEY
  entityType: "lead" | "contract" | "payment" | "meeting" | "todo" | "video"
  entityId: uuid
  action: string                   // "created" | "updated" | "stage_changed" | "payment_recorded"
  userId: uuid REFERENCES users(id)
  details?: jsonb
  createdAt: timestamptz DEFAULT now()
}
```

---

## 8. 페이지 구조 (Page Structure)

```
/login                              로그인 페이지

── 공통 영역 ──
/dashboard                          전사 KPI 대시보드
/calendar                           캘린더 뷰 (Google Calendar 통합)
/todos                              할일 목록 (전체)
/todos/my                           내 할일

── 세일즈/마케팅 모듈 (Sales, Admin) ──
/sales/leads                        리드 목록 (테이블)
/sales/leads/:id                    리드 상세
/sales/pipeline                     파이프라인 칸반 보드
/sales/performance                  영업 현황 (이벤트별 퍼널)
/sales/meetings                     미팅 기록
/marketing/metrics                  마케팅 지표 (채널별 KPI)
/marketing/ads                      광고 성과 (메타/카카오)
/marketing/events                   이벤트/세미나 관리
/marketing/events/:id/form          세미나 신청폼 관리
/marketing/videos                   영상 콘텐츠 관리 (업무현황/주제/인사이트)

── 컨설팅 서비스 모듈 (Consultant, Admin) ──
/consulting/clients                 계약 고객 목록
/consulting/clients/:id             고객 상세 (상담기록, 파일, 결제)
/consulting/payments                결제 관리 (전체)
/consulting/dashboard               컨설팅 대시보드

── 공개 (인증 불필요) ──
/form/:slug                         세미나 신청폼 (외부 학부모용)

── 설정 (Admin only) ──
/settings                           시스템 설정
/settings/users                     사용자 관리
/settings/migration                 데이터 마이그레이션 도구
```

---

## 9. 개발 단계 (Phases)

### Phase 1: MVP — 핵심 인프라 + 리드 관리 (4~6주)
- [ ] 인증 (Google OAuth + Email, RBAC 4역할)
- [ ] 리드 CRUD + 목록/검색/필터 (Raw 탭 대체)
- [ ] 파이프라인 칸반 보드 (Pipeline 탭 대체)
- [ ] 기본 KPI 대시보드 (실적 분석 탭 대체)
- [ ] 할일 목록 (공통)
- [ ] Google Calendar 연동 (읽기: 캘린더 뷰 + 미팅 자동 파싱)
- [ ] 구글 시트 데이터 마이그레이션 도구 (CSV import)

### Phase 2: 세일즈 완성 + 캘린더 쓰기 (3~4주)
- [ ] 영업 현황 (이벤트별 퍼널)
- [ ] 미팅 기록 관리
- [ ] 마케팅 지표 트래킹
- [ ] 광고 성과 관리
- [ ] 이벤트/세미나 관리 (체크리스트)
- [ ] 세미나 신청폼 자체 구축 (구글 폼 대체)
- [ ] Google Calendar 양방향 동기화 (시스템에서 미팅 생성 → 캘린더 반영)
- [ ] 영상 콘텐츠 관리 모듈 (업무현황/주제/인사이트)
- [ ] 기존 데이터 마이그레이션 (세미나 참석자 DB, 인스타 Survey DB)

### Phase 3: 컨설팅 모듈 + 고도화 (3~4주)
- [ ] 계약 고객 관리 (Existing Contract 대체)
- [ ] 결제 관리 (Payment Schedule 대체)
- [ ] 상담 기록 + 파일 업로드 + 캘린더 상담노트 연동
- [ ] 컨설팅 대시보드
- [ ] 대시보드 차트 고도화 (퍼널, 추이, 채널별 ROI)
- [ ] 인앱 알림 시스템
- [ ] Slack 웹훅 연동

### Phase 4: 확장 (선택)
- [ ] 카카오 알림톡 연동
- [ ] 데이터 내보내기 (CSV/Excel)
- [ ] 리포트 자동 생성 (월간/주간)
- [ ] 스케줄링 고도화 (팀원 가용시간 조회, 충돌 감지)
- [ ] 인스타 바이오 링크 → 자체 설문폼 전환

---

## 10. UI/UX 가이드라인

- **디자인 시스템**: shadcn/ui 기반, Tailwind CSS
- **레이아웃**: 좌측 사이드바 (모듈별 그룹) + 상단 헤더 (알림, 프로필)
- **네비게이션**: 역할에 따라 사이드바 메뉴 동적 표시/숨김
- **반응형**: 데스크톱 우선 (1280px+), 태블릿 기본 대응
- **색상 체계**:
  - 파이프라인 단계별 색상 (시트의 노랑/초록/회색 패턴 유지)
  - 미수금: 빨간색 강조
  - 달성률: 녹색(100%+) / 주황(50-99%) / 빨강(50% 미만)
- **통화 표시**: KR 사업 = ₩, US 컨설팅 = $
- **한국어 UI** (기본), 영어 컬럼명 병행 (데이터 호환)

---

## 11. 데이터 마이그레이션 계획

### 11.1 대상
- Raw 탭 → Leads 컬렉션 (전체 리드)
- Existing Contract 탭 → Contracts 컬렉션
- Payment Schedule 탭 → Payments 컬렉션
- 실적 분석 탭 → MonthlyPerformance 컬렉션

### 11.2 방법
1. 구글 시트 → CSV 내보내기
2. 관리자 페이지에서 CSV 업로드
3. 필드 매핑 확인 후 import
4. 데이터 검증 리포트 생성

---

## 12. 성공 지표 (Success Metrics)

- 리드 정보 조회/검색 시간: 구글 시트 대비 70% 단축
- 파이프라인 현황 파악: 시트 탭 전환 없이 한 화면에서 확인
- 월간 KPI 리포트: 수동 집계 → 자동 대시보드
- 미수금 관리: 결제 예정일 알림으로 누락 방지
- 데이터 입력 오류: 폼 기반 입력으로 오류율 감소

---

## Changelog

| 날짜 | 버전 | 변경 내용 |
|------|------|-----------|
| 2026-04-13 | 0.1.0 | 초안 작성 (컨설팅 관리 도구로 잘못 설정) |
| 2026-04-13 | 0.2.0 | 전면 재작성: 세일즈/마케팅 + 컨설팅 2트랙 구조, 구글 시트 실제 구조 반영, RBAC 권한 체계, 데이터 모델 전면 재설계 |
| 2026-04-13 | 0.3.0 | 전사 웹서비스로 재정의, Google Calendar 양방향 연동 추가, 외부 리드 소스 자동 수집(세미나 구글폼/인스타 설문DB) 추가, 개발 단계 재조정 |
| 2026-04-13 | 0.4.0 | Firebase→Supabase(PostgreSQL) 전환, 영상 콘텐츠 관리 모듈 추가(마케팅 영역), 구글 폼→자체 세미나 신청폼 전환, 도메인 확정(internal.quantumadmissions.com), 데이터 모델 PostgreSQL 타입으로 변경 |
