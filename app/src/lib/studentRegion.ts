// 학생 거주지역을 한국 / 미국 / 그 외 지역으로 분류한다.
//
// service_students.region 은 자유 입력 칸이라 "서울", "경기도 성남시", "New Jersey",
// "미국 뉴욕", "London" 처럼 표기가 제각각이다. 그래서 값을 그대로 쓰지 않고
// 아래 순서로 해석한다.
//   1) 지역(region)  2) 주소(address)  3) 학교(school, 학교 소재지로 추정)
// 셋 다 해석되지 않으면 '미입력'으로 두고 임의로 '그 외'에 넣지 않는다 —
// 입력이 비어서 모르는 것과 실제로 제3국에 있는 것은 다르기 때문.
//
// 연락처(전화번호)는 쓰지 않는다. 미국에 사는 학생도 학부모 010 번호를 적어두는
// 경우가 많아 한국으로 잘못 분류된다.
import { lookupText, resolveBySchool } from './leadLocation'

export type RegionGroup = 'kr' | 'us' | 'other' | 'unknown'

export const REGION_GROUP_LABEL: Record<RegionGroup, string> = {
  kr: '한국',
  us: '미국',
  other: '그 외 지역',
  unknown: '지역 미입력',
}

/** 드롭다운에 노출할 순서. */
export const REGION_GROUPS: RegionGroup[] = ['kr', 'us', 'other', 'unknown']

function norm(s: string): string {
  return s.toLowerCase().replace(/[\s.,'’\-()·/]/g, '')
}

// 한국 지명. region/address 는 "경기도 성남시 분당구"처럼 이어 쓰는 경우가 많아
// 부분 일치로 본다(사전은 '서울'만 알고 있어 그대로는 대부분 미분류가 된다).
const KR_PARTS = [
  '한국', '대한민국', 'korea',
  '서울', 'seoul', '경기', 'gyeonggi', '인천', 'incheon', '부산', 'busan', '대구', 'daegu',
  '대전', 'daejeon', '광주', '울산', '세종', '강원', '충북', '충남', '전북', '전남',
  '경북', '경남', '제주', 'jeju',
  '성남', '분당', 'bundang', '판교', 'pangyo', '수원', 'suwon', '용인', 'yongin',
  '고양', '일산', 'ilsan', '안양', '과천', '송도', 'songdo', '동탄', '천안', '청주',
  '김포', '하남', '위례', '평택', '화성', '안산', '부천', '의정부', '남양주', '광명',
  '시흥', '파주', '포항', '창원', '김해', '전주', '구리',
  '강남', 'gangnam', '서초', 'seocho', '송파', '잠실', '반포', '대치', '압구정',
  '여의도', '목동', '마포', '용산', '노원', '한남', '청담', '이태원',
]

// 미국. 'US'·'LA' 같은 짧은 표기는 부분 일치로 보면 오탐이 커서(예: 'Austria' 안의 'us')
// 아래 목록은 오탐 위험이 없는 표기만 두고, 나머지는 주·도시 사전 조회에 맡긴다.
const US_PARTS = ['미국', 'usa', 'unitedstates', 'america']

/** 자유 입력 지역 텍스트 한 건을 분류. 해석 실패 시 null. */
export function classifyRegionText(raw?: string | null): RegionGroup | null {
  if (!raw || !raw.trim()) return null
  const n = norm(raw)
  if (!n) return null
  if (KR_PARTS.some(k => n.includes(k))) return 'kr'
  if (US_PARTS.some(k => n.includes(k))) return 'us'
  const place = lookupText(raw)          // 도시/주/국가 사전 (미국 주, 해외 도시 등)
  if (!place) return null
  if (place.country === '대한민국') return 'kr'
  if (place.country === '미국') return 'us'
  return 'other'
}

export interface StudentRegionInput {
  region?: string | null
  address?: string | null
  school?: string | null
}

/** 학생 한 명의 지역 그룹. 아무것도 해석되지 않으면 'unknown'. */
export function classifyStudentRegion(s: StudentRegionInput): RegionGroup {
  const byRegion = classifyRegionText(s.region)
  if (byRegion) return byRegion
  const byAddress = classifyRegionText(s.address)
  if (byAddress) return byAddress
  // 학교 사전(대학 위주)에 걸리면 그 소재지, 아니면 학교 이름에 들어간 지명으로
  // 한 번 더 시도한다(예: 'Seoul Foreign School', 'Korea International School').
  const school = resolveBySchool(s.school)
  if (school) {
    if (school.country === '대한민국') return 'kr'
    if (school.country === '미국') return 'us'
    return 'other'
  }
  return classifyRegionText(s.school) || 'unknown'
}
