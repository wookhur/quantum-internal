/**
 * Student360 학생을 지우기 전에 리드관리로 보관하기 위한 요약 생성.
 *
 * 왜 필요한가: 리드관리에 기록이 없는 학생을 360에서 지우면 입력해 둔 연락처·
 * 학교·상담 이력이 함께 사라진다. 나중에 같은 학생을 다시 만났을 때 "예전에
 * 우리 서비스를 받았던 학생"이라는 사실을 알 방법이 없다. 그래서 지우기 전에
 * 리드 한 건으로 옮겨 두고, 다시 만났을 때 바로 눈에 띄도록 리마인드 문구를 남긴다.
 *
 * 360과 리드의 칸이 1:1로 맞지 않는 점을 여기서 흡수한다.
 *   · service_students.parent_name 은 이름이 아니라 '학부모 연락처'다.
 *     ('010-0000-0000 김정은' 처럼 번호와 이름이 한 칸에 섞여 들어온다)
 *   · 리드는 학부모 이름(parentName)과 전화(phone)를 따로 갖는다.
 */

/** 보관 시 남길 문구 묶음 */
export interface StudentArchiveTexts {
  /** 리드 메모에 넣을 과거 서비스 이력 요약 */
  memo: string
  /** 리드 상세 상단에 배지로 뜨는 리마인드 문구 */
  requiredAction: string
  /** 리드 활동 기록(system)에 남길 본문 */
  activityContent: string
}

export interface ArchiveMeeting {
  meetingDate?: string
  status?: string
}

export interface ArchiveStudentInput {
  name?: string
  koreanName?: string
  email?: string
  parentEmail?: string
  /** 학생 연락처 */
  contact?: string
  /** 학부모 연락처 (이름이 섞여 있을 수 있음) */
  parentName?: string
  nationality?: string
  region?: string
  grade?: string
  school?: string
  essayEditor?: string
  contractType?: string
  majorTrack?: string
  majorDetail?: string
  startDate?: string
  endDate?: string
  status?: string
  notes?: string
  scholarship?: boolean
}

/**
 * '010-4066-8218 김정은' → { phone: '010-4066-8218', name: '김정은' }
 * 번호만 있으면 name 은 빈 문자열. 이름만 있으면 phone 이 빈 문자열.
 */
export function splitParentContact(raw?: string): { phone: string; name: string } {
  const s = (raw || '').trim()
  if (!s) return { phone: '', name: '' }
  // 전화번호로 볼 수 있는 가장 긴 조각(숫자 7자 이상 포함)
  const phoneMatch = s.match(/\+?[\d][\d\-().\s]{5,}\d/)
  const phone = (phoneMatch?.[0] || '').trim()
  const name = (phone ? s.replace(phone, '') : s).replace(/[()\-·,/|]/g, ' ').replace(/\s+/g, ' ').trim()
  return { phone, name }
}

const dash = (v?: string) => (v && v.trim() ? v.trim() : '—')

/** 학생 표시명: 한글명 우선, 영문명을 괄호로. */
export function archiveDisplayName(s: ArchiveStudentInput): string {
  const ko = (s.koreanName || '').trim()
  const en = (s.name || '').trim()
  if (ko && en) return `${ko} (${en})`
  return ko || en || '(이름 없음)'
}

/**
 * @param today 보관 처리한 날짜 (YYYY-MM-DD)
 * @param consultantName 담당 컨설턴트 이름 (id 가 아니라 해석된 이름)
 */
export function buildStudentArchiveTexts(input: {
  student: ArchiveStudentInput
  consultantName?: string
  meetings?: readonly ArchiveMeeting[]
  diaryCount?: number
  today: string
}): StudentArchiveTexts {
  const { student: s, consultantName, meetings = [], diaryCount = 0, today } = input

  const held = meetings.filter(m => m.status === 'held').length
  const cancelled = meetings.filter(m => m.status === 'cancelled' || m.status === 'no_show').length
  const dates = meetings.map(m => m.meetingDate).filter((d): d is string => !!d).sort()
  const lastMeeting = dates.length ? dates[dates.length - 1] : ''
  const firstMeeting = dates.length ? dates[0] : ''

  const major = [s.majorTrack, s.majorDetail].filter(Boolean).join(' · ')
  const period = [s.startDate || firstMeeting, s.endDate || lastMeeting].filter(Boolean).join(' ~ ')

  const lines = [
    `[Student360 보관 · ${today}] 과거 서비스 이력`,
    `· 담당 컨설턴트: ${dash(consultantName)}`,
    `· 계약 유형: ${dash(s.contractType)}${s.scholarship ? ' (장학생 · 무료)' : ''}`,
    `· 서비스 기간: ${dash(period)}`,
    `· 미팅: 총 ${meetings.length}회 (완료 ${held}, 취소·노쇼 ${cancelled})${lastMeeting ? ` · 마지막 ${lastMeeting}` : ''}`,
    `· 미팅 다이어리: ${diaryCount}건`,
    `· 학교/학년: ${dash(s.school)} / ${dash(s.grade)}`,
    `· 지역/국적: ${dash(s.region)} / ${dash(s.nationality)}`,
    `· 학생 연락처: ${dash(s.contact)}`,
    `· 학생 이메일: ${dash(s.email)}`,
    `· 학부모 이메일: ${dash(s.parentEmail)}`,
    `· 에세이 에디터: ${dash(s.essayEditor)}`,
    `· 전공: ${dash(major)}`,
  ]
  const prev = (s.notes || '').trim()
  if (prev) lines.push('', '── 360 메모 ──', prev)

  const memo = lines.join('\n')

  // 리드 상세 상단 배지. 길면 잘리므로 한 줄로 짧게.
  const requiredAction = `🔁 과거 서비스 학생${consultantName ? ` (담당 ${consultantName})` : ''} — 재상담 시 이력 확인`

  const activityContent = [
    `${archiveDisplayName(s)} 학생을 Student360 에서 삭제하고 리드로 보관했습니다.`,
    `다시 상담하게 되면 아래 이력을 먼저 확인하세요.`,
    '',
    memo,
  ].join('\n')

  return { memo, requiredAction, activityContent }
}
