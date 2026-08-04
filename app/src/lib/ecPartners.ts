/** Master list of EC (Extra Curricular) service partners.
 *  Used by Student 360 (record an EC activity) and 수수료관리 (set a commission
 *  rate per partner) so both dropdowns share one source of truth.
 *  정렬은 알파벳순(영문 A–Z → 한글 ㄱㄴㄷ). QA(퀀텀 자체운영)는 프로그램별로
 *  QA-밀키트사업 / QA-봉사 로 분리 — 좌석 현황판의 밀키트사업·봉사 열과 자동 연동됨. */
export const EC_PARTNERS = [
  'ASDA Korea',
  'IRIS Edu',
  'KYN',
  'Next Bound',
  'QA-밀키트사업',
  'QA-봉사',
  'Stanley Prep-internship',
  'Stanley Prep-UNAT',
  '넥스튼융합',
  '앱개발',
  '허브커넥서스',
  '허브커넥서스-리더십코칭',
  '허브커넥서스-리서치',
] as const
