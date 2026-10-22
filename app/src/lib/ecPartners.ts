/** Master list of EC (Extra Curricular) service partners.
 *  Used by Student 360 (record an EC activity) and 수수료관리 (set a commission
 *  rate per partner) so both dropdowns share one source of truth.
 *
 *  **여기 적힌 순서가 Student 360 드롭다운에 보이는 순서다.** 가나다순으로
 *  정렬하면 함께 쓰는 파트너가 떨어져 버려(예: 상호글로벌센터가 QA 바로 아래
 *  있어야 하는데 맨 위로 올라감), 운영자가 고른 순서를 그대로 쓴다.
 *  바꾸려면 이 배열의 줄 순서만 옮기면 된다.
 *
 *  (수수료관리·파트너 강사 화면은 자료에 있던 파트너명까지 섞어 보여주므로
 *   거기서는 섞인 값을 가나다순으로 정렬한다 — 그쪽은 이 순서를 따르지 않는다.)
 *
 *  QA(퀀텀 자체운영)는 프로그램별로 QA-밀키트사업 / QA-봉사 로 분리 —
 *  좌석 현황판의 밀키트사업·봉사 열과 자동 연동됨. */
export const EC_PARTNERS = [
  '넥스튼융합',
  '백성현-AX 인턴십,리서치',
  '백성현-앱개발,수상',
  '앱개발',
  '허브커넥서스',
  '허브커넥서스-리더십코칭',
  '허브커넥서스-리서치',
  'ASDA Korea',
  'IRIS Edu',
  'KYN',
  'Next Bound',
  'QA-밀키트사업',
  'QA-봉사',
  '상호글로벌센터-인턴십,리서치',
  'Stanley Prep-internship',
  'Stanley Prep-UNAT',
] as const
