# 작업 히스토리

새 항목은 맨 위에 추가합니다.

---

## 2026-10-01 — 프로젝트 초기 설정

**한 일**
- `cat-db/` 하위 프로젝트 폴더 구조 생성
- `CLAUDE.md`(규칙, 설계 원칙, 단계별 상태), `README.md`, 이 작업 로그, ADR 템플릿 작성
- 원본(`data/raw/`)과 실명 대조표(`private/`)를 git에서 제외하도록 `.gitignore` 설정

**결정**
- 기존 `quantum-internal` 저장소 안에 하위 폴더로 둠(앱과 같은 Supabase를 쓸 가능성 고려)
- DB 엔진은 미결(ADR 0001 초안: 파일럿 SQLite → 운영 Supabase Postgres 제안)

**다음 할 일**
- 샘플 CAT 자료 받기 → 1단계: 태그 체계(taxonomy) 초안 + 테이블 구조 설계
