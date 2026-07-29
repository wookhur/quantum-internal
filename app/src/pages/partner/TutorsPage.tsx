import { ProgramsPage, TUTORING_VARIANT } from '@/pages/partner/ProgramsPage'

/** 과외강사관리 = 프로그램 관리와 동일 구조(브로셔·AI·리드추가·통화기록→담당자연동)를 tutoring 카테고리로 재사용.
 *  '신청' 단계가 되면 학생 Student360 Academic Support에 자동 연동(수업제목 = 과외선생님 + 1:1). */
export function TutorsPage() {
  return <ProgramsPage variant={TUTORING_VARIANT} />
}
