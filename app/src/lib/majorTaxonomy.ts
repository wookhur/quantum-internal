// 전공 분류 (2단계): 1단계 계열(track) → 2단계 세부전공(detail, 영어·알파벳순)
//
// 세부전공은 학생들이 실제로 가장 많이 쓰는 큐레이션 목록이다. 목록에 없는 전공은
// 각 계열의 'Other' 선택 후 자유 입력(major_detail)으로 기록한다 → 커버리지 100%.
// ①번 현황판은 1단계 계열 × 학년으로 집계한다.

export interface MajorTrack {
  key: string        // DB 저장값(안정적 slug)
  label: string      // 화면 표시(한국어)
  majors: string[]   // 2단계 세부전공 (영어, 알파벳순)
}

export const OTHER_MAJOR = 'Other' // 목록에 없을 때 직접 입력용 옵션

export const MAJOR_TRACKS: MajorTrack[] = [
  {
    key: 'cs',
    label: '컴퓨터·CS',
    majors: [
      'Artificial Intelligence', 'Computer Science', 'Cybersecurity', 'Data Science',
      'Human-Computer Interaction', 'Information Systems', 'Information Technology', 'Software Engineering',
    ],
  },
  {
    key: 'engineering',
    label: '공학',
    majors: [
      'Aerospace Engineering', 'Biomedical Engineering', 'Chemical Engineering', 'Civil Engineering',
      'Computer Engineering', 'Electrical Engineering', 'Environmental Engineering', 'Industrial Engineering',
      'Materials Science and Engineering', 'Mechanical Engineering', 'Nuclear Engineering',
    ],
  },
  {
    key: 'natural_science',
    label: '자연과학·수학',
    majors: [
      'Astronomy', 'Chemistry', 'Earth Science', 'Environmental Science', 'Geology',
      'Mathematics', 'Physics', 'Statistics',
    ],
  },
  {
    key: 'life_science',
    label: '생명과학·의예',
    majors: [
      'Biochemistry', 'Bioinformatics', 'Biology', 'Biotechnology', 'Genetics', 'Kinesiology',
      'Microbiology', 'Molecular Biology', 'Neuroscience', 'Nursing', 'Nutrition', 'Pharmacy', 'Public Health',
    ],
  },
  {
    key: 'business',
    label: '경영·경제',
    majors: [
      'Accounting', 'Business Administration', 'Economics', 'Entrepreneurship', 'Finance',
      'Hospitality Management', 'International Business', 'Management', 'Management Information Systems',
      'Marketing', 'Real Estate', 'Supply Chain Management',
    ],
  },
  {
    key: 'social_science',
    label: '사회과학',
    majors: [
      'Anthropology', 'Criminology and Criminal Justice', 'Geography', 'International Relations',
      'Political Science', 'Psychology', 'Public Policy', 'Social Work', 'Sociology', 'Urban Studies',
    ],
  },
  {
    key: 'humanities',
    label: '인문',
    majors: [
      'Classics', 'Comparative Literature', 'East Asian Studies', 'English', 'History', 'Linguistics',
      'Philosophy', 'Religious Studies', 'Translation and Interpretation', 'World Languages',
    ],
  },
  {
    key: 'arts',
    label: '예술',
    majors: [
      'Animation', 'Architecture', 'Art History', 'Dance', 'Fashion Design', 'Film and Television',
      'Fine Arts', 'Graphic Design', 'Illustration', 'Industrial and Product Design', 'Interior Design',
      'Music', 'Music Performance', 'Photography', 'Theater and Drama',
    ],
  },
  {
    key: 'media',
    label: '미디어·커뮤니케이션',
    majors: [
      'Advertising', 'Communication Studies', 'Digital Media', 'Game Design', 'Journalism',
      'Media Studies', 'Public Relations',
    ],
  },
  {
    key: 'undecided',
    label: '미정·기타',
    majors: [
      'Interdisciplinary Studies', 'Liberal Arts / Undecided',
    ],
  },
]

export const MAJOR_TRACK_LABEL: Record<string, string> = Object.fromEntries(
  MAJOR_TRACKS.map(t => [t.key, t.label]),
)

export function majorsForTrack(trackKey?: string): string[] {
  return MAJOR_TRACKS.find(t => t.key === trackKey)?.majors || []
}

// ── 학년 정규화: 자유입력 grade를 G6~G12/기타 버킷으로 묶는다 ──
// (좌석표·전공표의 기본 학년은 G9~G12이지만, 데이터에 G8 등 다른 학년이 있으면 그 학년도 표시)
export const GRADE_BUCKETS = ['G9', 'G10', 'G11', 'G12', '기타'] as const
export type GradeBucket = string

/** 좌석표/전공표에 항상 표시하는 기본 학년 */
export const BASE_GRADES = ['G9', 'G10', 'G11', 'G12']
const GRADE_ORDER = ['G6', 'G7', 'G8', 'G9', 'G10', 'G11', 'G12', '기타']

/** 기본 학년(G9~G12) + 실제 데이터에 존재하는 학년만, 정해진 순서로 반환 */
export function gradesToShow(present: Iterable<string>): string[] {
  const set = new Set(present)
  return GRADE_ORDER.filter(g => BASE_GRADES.includes(g) || set.has(g))
}

export function gradeBucket(grade?: string): string {
  if (!grade) return '기타'
  const g = grade.toLowerCase().replace(/\s+/g, '')
  // 영어/한국어 학년 표기
  if (/freshman/.test(g)) return 'G9'
  if (/sophomore|고1|고일/.test(g)) return 'G10'
  if (/junior|고2|고이/.test(g)) return 'G11'
  if (/senior|고3|고삼/.test(g)) return 'G12'
  // 숫자 추출: 10~12 우선, 그다음 6~9 (예: "G8", "8", "7학년", "grade 11")
  const m = g.match(/1[0-2]|[6-9]/)
  if (m) return 'G' + m[0]
  return '기타'
}
