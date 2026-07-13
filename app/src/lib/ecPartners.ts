/** Master list of EC (Extra Curricular) service partners.
 *  Used by Student 360 (record an EC activity) and 수수료관리 (set a commission
 *  rate per partner) so both dropdowns share one source of truth. */
export const EC_PARTNERS = [
  // Korean names first
  '넥스튼융합',
  '허브커넥서스',
  '허브커넥서스-리더십코칭',
  '허브커넥서스-리서치',
  // English names alphabetically
  'ASDA Korea',
  'IRIS Edu',
  'KYN',
  'Next Bound',
  'Stanley Prep-internship',
  'Stanley Prep-UNAT',
  '앱개발',
] as const
