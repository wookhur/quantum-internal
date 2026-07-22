// 리드 거주지/현지 시각 해석 유틸 (외부 API 없이 오프라인 사전 기반).
//
// 우선순위: 수동 입력 거주도시 > 학교명 자동 인식 > 전화번호 국가코드(명시적 + 접두 필요).
// 전화번호는 국제표시(+, 00)가 있을 때만 국가를 판단한다 — 미국 지역번호(예: 917)가
// 국가코드(+91 인도)와 겹쳐 오탐하던 문제를 방지하기 위함.

// ── IANA 시간대 상수 ──
const TZ = {
  ET: 'America/New_York', CT: 'America/Chicago', MT: 'America/Denver', AZ: 'America/Phoenix',
  PT: 'America/Los_Angeles', AK: 'America/Anchorage', HI: 'Pacific/Honolulu',
  TOR: 'America/Toronto', VAN: 'America/Vancouver', EDM: 'America/Edmonton',
  WPG: 'America/Winnipeg', HAL: 'America/Halifax', STJ: 'America/St_Johns',
  LON: 'Europe/London', DUB: 'Europe/Dublin', PAR: 'Europe/Paris', BER: 'Europe/Berlin',
  MAD: 'Europe/Madrid', ROM: 'Europe/Rome', AMS: 'Europe/Amsterdam', ZRH: 'Europe/Zurich',
  STO: 'Europe/Stockholm', IST: 'Europe/Istanbul', MOW: 'Europe/Moscow', LIS: 'Europe/Lisbon',
  SYD: 'Australia/Sydney', MEL: 'Australia/Melbourne', BNE: 'Australia/Brisbane',
  ADL: 'Australia/Adelaide', PER: 'Australia/Perth', AKL: 'Pacific/Auckland',
  HK: 'Asia/Hong_Kong', SG: 'Asia/Singapore', TYO: 'Asia/Tokyo', SEL: 'Asia/Seoul',
  SHA: 'Asia/Shanghai', DXB: 'Asia/Dubai', BKK: 'Asia/Bangkok', MNL: 'Asia/Manila',
  SGN: 'Asia/Ho_Chi_Minh', JKT: 'Asia/Jakarta', DPS: 'Asia/Makassar', KUL: 'Asia/Kuala_Lumpur',
  DEL: 'Asia/Kolkata', RUH: 'Asia/Riyadh', DOH: 'Asia/Qatar', TLV: 'Asia/Jerusalem',
  MEX: 'America/Mexico_City', GRU: 'America/Sao_Paulo',
} as const

type Tz = string

export interface ResolvedLocation {
  timezone: Tz | null   // 시간대(다국시간대 국가를 도시 없이 판단 못하면 null)
  country: string       // 한글 국가명
  city?: string         // 표시용 도시/지역 라벨
  source: 'city' | 'school' | 'region' | 'phone' | 'geocode'
}

interface Place { tz: Tz | null; country: string; label?: string; multiZone?: boolean }

function norm(s: string): string {
  return s.toLowerCase().replace(/[\s.,'’\-()·/]/g, '')
}

// ── 도시 → 장소 ──
const US = '미국', CA_ = '캐나다', GB = '영국', AU = '호주', NZ = '뉴질랜드'
const CITIES: Record<string, Place> = {
  // 미국 동부(ET)
  newyork: { tz: TZ.ET, country: US, label: 'New York' }, ny: { tz: TZ.ET, country: US, label: 'New York' }, nyc: { tz: TZ.ET, country: US, label: 'New York' }, 뉴욕: { tz: TZ.ET, country: US, label: 'New York' },
  boston: { tz: TZ.ET, country: US, label: 'Boston' }, 보스턴: { tz: TZ.ET, country: US, label: 'Boston' },
  cambridge: { tz: TZ.ET, country: US, label: 'Cambridge, MA' },
  washington: { tz: TZ.ET, country: US, label: 'Washington DC' }, dc: { tz: TZ.ET, country: US, label: 'Washington DC' }, 워싱턴: { tz: TZ.ET, country: US, label: 'Washington DC' },
  philadelphia: { tz: TZ.ET, country: US, label: 'Philadelphia' }, 필라델피아: { tz: TZ.ET, country: US, label: 'Philadelphia' },
  atlanta: { tz: TZ.ET, country: US, label: 'Atlanta' }, 애틀랜타: { tz: TZ.ET, country: US, label: 'Atlanta' },
  miami: { tz: TZ.ET, country: US, label: 'Miami' }, 마이애미: { tz: TZ.ET, country: US, label: 'Miami' },
  orlando: { tz: TZ.ET, country: US, label: 'Orlando' }, pittsburgh: { tz: TZ.ET, country: US, label: 'Pittsburgh' },
  baltimore: { tz: TZ.ET, country: US, label: 'Baltimore' }, princeton: { tz: TZ.ET, country: US, label: 'Princeton, NJ' },
  newhaven: { tz: TZ.ET, country: US, label: 'New Haven, CT' }, exeter: { tz: TZ.ET, country: US, label: 'Exeter, NH' },
  andover: { tz: TZ.ET, country: US, label: 'Andover, MA' }, ithaca: { tz: TZ.ET, country: US, label: 'Ithaca, NY' },
  charlotte: { tz: TZ.ET, country: US, label: 'Charlotte' }, detroit: { tz: TZ.ET, country: US, label: 'Detroit' },
  // 미국 중부(CT)
  chicago: { tz: TZ.CT, country: US, label: 'Chicago' }, 시카고: { tz: TZ.CT, country: US, label: 'Chicago' },
  dallas: { tz: TZ.CT, country: US, label: 'Dallas' }, 댈러스: { tz: TZ.CT, country: US, label: 'Dallas' },
  houston: { tz: TZ.CT, country: US, label: 'Houston' }, 휴스턴: { tz: TZ.CT, country: US, label: 'Houston' },
  austin: { tz: TZ.CT, country: US, label: 'Austin' }, 오스틴: { tz: TZ.CT, country: US, label: 'Austin' },
  sanantonio: { tz: TZ.CT, country: US, label: 'San Antonio' }, minneapolis: { tz: TZ.CT, country: US, label: 'Minneapolis' },
  nashville: { tz: TZ.CT, country: US, label: 'Nashville' }, neworleans: { tz: TZ.CT, country: US, label: 'New Orleans' },
  stlouis: { tz: TZ.CT, country: US, label: 'St. Louis' }, kansascity: { tz: TZ.CT, country: US, label: 'Kansas City' },
  // 미국 산악(MT/AZ)
  denver: { tz: TZ.MT, country: US, label: 'Denver' }, 덴버: { tz: TZ.MT, country: US, label: 'Denver' },
  saltlakecity: { tz: TZ.MT, country: US, label: 'Salt Lake City' }, boulder: { tz: TZ.MT, country: US, label: 'Boulder' },
  phoenix: { tz: TZ.AZ, country: US, label: 'Phoenix' }, 피닉스: { tz: TZ.AZ, country: US, label: 'Phoenix' }, scottsdale: { tz: TZ.AZ, country: US, label: 'Scottsdale' },
  // 미국 서부(PT)
  losangeles: { tz: TZ.PT, country: US, label: 'Los Angeles' }, la: { tz: TZ.PT, country: US, label: 'Los Angeles' }, 로스앤젤레스: { tz: TZ.PT, country: US, label: 'Los Angeles' }, 엘에이: { tz: TZ.PT, country: US, label: 'Los Angeles' },
  sanfrancisco: { tz: TZ.PT, country: US, label: 'San Francisco' }, sf: { tz: TZ.PT, country: US, label: 'San Francisco' }, 샌프란시스코: { tz: TZ.PT, country: US, label: 'San Francisco' },
  seattle: { tz: TZ.PT, country: US, label: 'Seattle' }, 시애틀: { tz: TZ.PT, country: US, label: 'Seattle' },
  sandiego: { tz: TZ.PT, country: US, label: 'San Diego' }, 샌디에이고: { tz: TZ.PT, country: US, label: 'San Diego' },
  irvine: { tz: TZ.PT, country: US, label: 'Irvine' }, 어바인: { tz: TZ.PT, country: US, label: 'Irvine' },
  sanjose: { tz: TZ.PT, country: US, label: 'San Jose' }, portland: { tz: TZ.PT, country: US, label: 'Portland, OR' },
  paloalto: { tz: TZ.PT, country: US, label: 'Palo Alto' }, berkeley: { tz: TZ.PT, country: US, label: 'Berkeley' }, 버클리: { tz: TZ.PT, country: US, label: 'Berkeley' },
  lasvegas: { tz: TZ.PT, country: US, label: 'Las Vegas' }, sacramento: { tz: TZ.PT, country: US, label: 'Sacramento' },
  // 하와이/알래스카
  honolulu: { tz: TZ.HI, country: US, label: 'Honolulu' }, 호놀룰루: { tz: TZ.HI, country: US, label: 'Honolulu' }, hawaii: { tz: TZ.HI, country: US, label: 'Hawaii' }, 하와이: { tz: TZ.HI, country: US, label: 'Hawaii' },
  // 캐나다
  toronto: { tz: TZ.TOR, country: CA_, label: 'Toronto' }, 토론토: { tz: TZ.TOR, country: CA_, label: 'Toronto' },
  montreal: { tz: TZ.TOR, country: CA_, label: 'Montreal' }, 몬트리올: { tz: TZ.TOR, country: CA_, label: 'Montreal' }, ottawa: { tz: TZ.TOR, country: CA_, label: 'Ottawa' },
  vancouver: { tz: TZ.VAN, country: CA_, label: 'Vancouver' }, 밴쿠버: { tz: TZ.VAN, country: CA_, label: 'Vancouver' },
  calgary: { tz: TZ.EDM, country: CA_, label: 'Calgary' }, 캘거리: { tz: TZ.EDM, country: CA_, label: 'Calgary' }, edmonton: { tz: TZ.EDM, country: CA_, label: 'Edmonton' }, winnipeg: { tz: TZ.WPG, country: CA_, label: 'Winnipeg' },
  // 영국·유럽
  london: { tz: TZ.LON, country: GB, label: 'London' }, 런던: { tz: TZ.LON, country: GB, label: 'London' },
  oxford: { tz: TZ.LON, country: GB, label: 'Oxford' }, 옥스포드: { tz: TZ.LON, country: GB, label: 'Oxford' },
  manchester: { tz: TZ.LON, country: GB, label: 'Manchester' }, edinburgh: { tz: TZ.LON, country: GB, label: 'Edinburgh' }, bristol: { tz: TZ.LON, country: GB, label: 'Bristol' },
  paris: { tz: TZ.PAR, country: '프랑스', label: 'Paris' }, 파리: { tz: TZ.PAR, country: '프랑스', label: 'Paris' },
  berlin: { tz: TZ.BER, country: '독일', label: 'Berlin' }, munich: { tz: TZ.BER, country: '독일', label: 'Munich' }, frankfurt: { tz: TZ.BER, country: '독일', label: 'Frankfurt' },
  amsterdam: { tz: TZ.AMS, country: '네덜란드', label: 'Amsterdam' }, madrid: { tz: TZ.MAD, country: '스페인', label: 'Madrid' }, barcelona: { tz: TZ.MAD, country: '스페인', label: 'Barcelona' },
  rome: { tz: TZ.ROM, country: '이탈리아', label: 'Rome' }, milan: { tz: TZ.ROM, country: '이탈리아', label: 'Milan' }, zurich: { tz: TZ.ZRH, country: '스위스', label: 'Zurich' }, geneva: { tz: TZ.ZRH, country: '스위스', label: 'Geneva' },
  // 아시아·중동
  beijing: { tz: TZ.SHA, country: '중국', label: 'Beijing' }, 베이징: { tz: TZ.SHA, country: '중국', label: 'Beijing' }, 북경: { tz: TZ.SHA, country: '중국', label: 'Beijing' },
  shanghai: { tz: TZ.SHA, country: '중국', label: 'Shanghai' }, 상하이: { tz: TZ.SHA, country: '중국', label: 'Shanghai' }, 상해: { tz: TZ.SHA, country: '중국', label: 'Shanghai' }, shenzhen: { tz: TZ.SHA, country: '중국', label: 'Shenzhen' }, guangzhou: { tz: TZ.SHA, country: '중국', label: 'Guangzhou' },
  hongkong: { tz: TZ.HK, country: '홍콩', label: 'Hong Kong' }, 홍콩: { tz: TZ.HK, country: '홍콩', label: 'Hong Kong' },
  singapore: { tz: TZ.SG, country: '싱가포르', label: 'Singapore' }, 싱가포르: { tz: TZ.SG, country: '싱가포르', label: 'Singapore' },
  tokyo: { tz: TZ.TYO, country: '일본', label: 'Tokyo' }, 도쿄: { tz: TZ.TYO, country: '일본', label: 'Tokyo' }, osaka: { tz: TZ.TYO, country: '일본', label: 'Osaka' }, 오사카: { tz: TZ.TYO, country: '일본', label: 'Osaka' },
  dubai: { tz: TZ.DXB, country: '아랍에미리트', label: 'Dubai' }, 두바이: { tz: TZ.DXB, country: '아랍에미리트', label: 'Dubai' }, abudhabi: { tz: TZ.DXB, country: '아랍에미리트', label: 'Abu Dhabi' },
  bangkok: { tz: TZ.BKK, country: '태국', label: 'Bangkok' }, 방콕: { tz: TZ.BKK, country: '태국', label: 'Bangkok' },
  manila: { tz: TZ.MNL, country: '필리핀', label: 'Manila' }, hanoi: { tz: TZ.SGN, country: '베트남', label: 'Hanoi' }, 하노이: { tz: TZ.SGN, country: '베트남', label: 'Hanoi' },
  bali: { tz: TZ.DPS, country: '인도네시아', label: 'Bali' }, 발리: { tz: TZ.DPS, country: '인도네시아', label: 'Bali' }, jakarta: { tz: TZ.JKT, country: '인도네시아', label: 'Jakarta' },
  kualalumpur: { tz: TZ.KUL, country: '말레이시아', label: 'Kuala Lumpur' }, 쿠알라룸푸르: { tz: TZ.KUL, country: '말레이시아', label: 'Kuala Lumpur' },
  seoul: { tz: TZ.SEL, country: '대한민국', label: 'Seoul' }, 서울: { tz: TZ.SEL, country: '대한민국', label: 'Seoul' },
  // 오세아니아
  sydney: { tz: TZ.SYD, country: AU, label: 'Sydney' }, 시드니: { tz: TZ.SYD, country: AU, label: 'Sydney' }, canberra: { tz: TZ.SYD, country: AU, label: 'Canberra' },
  melbourne: { tz: TZ.MEL, country: AU, label: 'Melbourne' }, 멜버른: { tz: TZ.MEL, country: AU, label: 'Melbourne' },
  brisbane: { tz: TZ.BNE, country: AU, label: 'Brisbane' }, 브리즈번: { tz: TZ.BNE, country: AU, label: 'Brisbane' },
  perth: { tz: TZ.PER, country: AU, label: 'Perth' }, 퍼스: { tz: TZ.PER, country: AU, label: 'Perth' }, adelaide: { tz: TZ.ADL, country: AU, label: 'Adelaide' },
  auckland: { tz: TZ.AKL, country: NZ, label: 'Auckland' }, 오클랜드: { tz: TZ.AKL, country: NZ, label: 'Auckland' },
}

// ── 지역(미국 주 / 캐나다 주 / 호주 주) → 장소 ──
const REGIONS: Record<string, Place> = {}
function addRegion(tz: Tz, country: string, names: string[]) {
  for (const n of names) REGIONS[norm(n)] = { tz, country, label: names[0] }
}
// 미국 주 (대표 시간대; 여러 시간대에 걸친 주는 주요 시간대 기준)
addRegion(TZ.ET, US, ['Connecticut', 'CT', 'Delaware', 'DE', 'Florida', 'FL', 'Georgia', 'GA', 'Maine', 'ME', 'Maryland', 'MD', 'Massachusetts', 'MA', 'New Hampshire', 'NH', 'New Jersey', 'NJ', 'New York', 'New York State', 'NY', 'North Carolina', 'NC', 'Ohio', 'OH', 'Pennsylvania', 'PA', 'Rhode Island', 'RI', 'South Carolina', 'SC', 'Vermont', 'VT', 'Virginia', 'VA', 'West Virginia', 'WV', 'Michigan', 'MI', 'Indiana', 'IN', 'Washington DC', 'District of Columbia'])
addRegion(TZ.CT, US, ['Alabama', 'AL', 'Arkansas', 'AR', 'Illinois', 'IL', 'Iowa', 'IA', 'Kansas', 'KS', 'Louisiana', 'LA State', 'Minnesota', 'MN', 'Mississippi', 'MS', 'Missouri', 'MO', 'Nebraska', 'NE', 'North Dakota', 'ND', 'Oklahoma', 'OK', 'South Dakota', 'SD', 'Tennessee', 'TN', 'Texas', 'TX', 'Wisconsin', 'WI'])
addRegion(TZ.MT, US, ['Colorado', 'CO', 'Idaho', 'ID', 'Montana', 'MT', 'New Mexico', 'NM', 'Utah', 'UT', 'Wyoming', 'WY'])
addRegion(TZ.AZ, US, ['Arizona', 'AZ'])
addRegion(TZ.PT, US, ['California', 'CA', 'Nevada', 'NV', 'Oregon', 'OR', 'Washington', 'WA', 'Washington State'])
addRegion(TZ.AK, US, ['Alaska', 'AK'])
addRegion(TZ.HI, US, ['Hawaii'])
// 캐나다 주
addRegion(TZ.TOR, CA_, ['Ontario', 'ON', 'Quebec', 'QC'])
addRegion(TZ.VAN, CA_, ['British Columbia', 'BC'])
addRegion(TZ.EDM, CA_, ['Alberta', 'AB'])
addRegion(TZ.WPG, CA_, ['Manitoba', 'MB', 'Saskatchewan', 'SK'])
addRegion(TZ.HAL, CA_, ['Nova Scotia', 'NS', 'New Brunswick', 'NB'])
// 호주 주
addRegion(TZ.SYD, AU, ['New South Wales', 'NSW', 'Victoria', 'VIC', 'ACT', 'Tasmania', 'TAS'])
addRegion(TZ.BNE, AU, ['Queensland', 'QLD'])
addRegion(TZ.ADL, AU, ['South Australia'])
addRegion(TZ.PER, AU, ['Western Australia'])

// ── 국가명 → 장소 (단일 시간대만 도시 없이 시각 산출; 다국시간대는 multiZone) ──
const COUNTRIES: Record<string, Place> = {}
function addCountry(p: Place, names: string[]) { for (const n of names) COUNTRIES[norm(n)] = { ...p, label: p.label || names[0] } }
addCountry({ tz: null, country: US, multiZone: true }, ['United States', 'USA', 'US', 'America', '미국'])
addCountry({ tz: null, country: CA_, multiZone: true }, ['Canada', '캐나다'])
addCountry({ tz: null, country: AU, multiZone: true }, ['Australia', '호주'])
addCountry({ tz: null, country: '중국', multiZone: true }, ['China', '중국'])
addCountry({ tz: TZ.LON, country: GB }, ['United Kingdom', 'UK', 'England', 'Britain', '영국'])
addCountry({ tz: TZ.SEL, country: '대한민국' }, ['Korea', 'South Korea', '한국', '대한민국'])
addCountry({ tz: TZ.SG, country: '싱가포르' }, ['Singapore', '싱가포르'])
addCountry({ tz: TZ.HK, country: '홍콩' }, ['Hong Kong', '홍콩'])
addCountry({ tz: TZ.TYO, country: '일본' }, ['Japan', '일본'])
addCountry({ tz: TZ.DEL, country: '인도' }, ['India', '인도'])
addCountry({ tz: TZ.DXB, country: '아랍에미리트' }, ['UAE', 'Emirates', '아랍에미리트'])
addCountry({ tz: TZ.AKL, country: NZ }, ['New Zealand', '뉴질랜드'])
addCountry({ tz: TZ.BKK, country: '태국' }, ['Thailand', '태국'])
addCountry({ tz: TZ.MNL, country: '필리핀' }, ['Philippines', '필리핀'])
addCountry({ tz: TZ.KUL, country: '말레이시아' }, ['Malaysia', '말레이시아'])
addCountry({ tz: TZ.JKT, country: '인도네시아', multiZone: true }, ['Indonesia', '인도네시아'])
addCountry({ tz: TZ.SGN, country: '베트남' }, ['Vietnam', '베트남'])
addCountry({ tz: TZ.PAR, country: '프랑스' }, ['France', '프랑스'])
addCountry({ tz: TZ.BER, country: '독일' }, ['Germany', '독일'])
addCountry({ tz: TZ.ROM, country: '이탈리아' }, ['Italy', '이탈리아'])
addCountry({ tz: TZ.MAD, country: '스페인' }, ['Spain', '스페인'])
addCountry({ tz: TZ.AMS, country: '네덜란드' }, ['Netherlands', '네덜란드'])
addCountry({ tz: TZ.ZRH, country: '스위스' }, ['Switzerland', '스위스'])

// ── 주요 학교 → 장소 (부분 일치; 한글·영문 별칭 포함). 필요 시 계속 확장 가능. ──
interface SchoolEntry { keys: string[]; place: Place }
const P = (tz: Tz, country: string, label: string): Place => ({ tz, country, label })
const SCHOOLS: SchoolEntry[] = [
  // 미국 보딩스쿨
  { keys: ['phillipsexeter', 'exeteracademy', '필립스엑시터', '필립스엑서터', '엑시터아카데미'], place: P(TZ.ET, US, 'Exeter, NH') },
  { keys: ['phillipsandover', 'andoveracademy', '필립스앤도버', '필립스아카데미', '앤도버'], place: P(TZ.ET, US, 'Andover, MA') },
  { keys: ['deerfield', '디어필드'], place: P(TZ.ET, US, 'Deerfield, MA') },
  { keys: ['choate', 'choaterosemary', '초트'], place: P(TZ.ET, US, 'Wallingford, CT') },
  { keys: ['hotchkiss', '하치키스', '호치키스'], place: P(TZ.ET, US, 'Lakeville, CT') },
  { keys: ['lawrenceville', '로렌스빌'], place: P(TZ.ET, US, 'Lawrenceville, NJ') },
  { keys: ['thehillschool', '힐스쿨'], place: P(TZ.ET, US, 'Pottstown, PA') },
  { keys: ['groton', '그로튼'], place: P(TZ.ET, US, 'Groton, MA') },
  { keys: ['miltonacademy', '밀턴아카데미'], place: P(TZ.ET, US, 'Milton, MA') },
  { keys: ['stpaulsschool', 'stpauls', '세인트폴스'], place: P(TZ.ET, US, 'Concord, NH') },
  { keys: ['middlesexschool', '미들섹스'], place: P(TZ.ET, US, 'Concord, MA') },
  { keys: ['loomischaffee', '루미스채피'], place: P(TZ.ET, US, 'Windsor, CT') },
  { keys: ['taftschool', '태프트'], place: P(TZ.ET, US, 'Watertown, CT') },
  { keys: ['nmh', 'northfieldmounthermon', '노스필드마운트허먼'], place: P(TZ.ET, US, 'Gill, MA') },
  { keys: ['peddie', '페디'], place: P(TZ.ET, US, 'Hightstown, NJ') },
  { keys: ['blairacademy', '블레어아카데미'], place: P(TZ.ET, US, 'Blairstown, NJ') },
  { keys: ['mercersburg', '머서스버그'], place: P(TZ.ET, US, 'Mercersburg, PA') },
  { keys: ['kentschool', '켄트스쿨'], place: P(TZ.ET, US, 'Kent, CT') },
  { keys: ['emmawillard', '엠마윌라드'], place: P(TZ.ET, US, 'Troy, NY') },
  { keys: ['thomasjefferson', 'tjhsst', '토마스제퍼슨'], place: P(TZ.ET, US, 'Alexandria, VA') },
  { keys: ['stuyvesant', '스타이베선트'], place: P(TZ.ET, US, 'New York, NY') },
  { keys: ['cateschool', '케이트스쿨'], place: P(TZ.PT, US, 'Carpinteria, CA') },
  { keys: ['thacher', '대처스쿨'], place: P(TZ.PT, US, 'Ojai, CA') },
  { keys: ['webbschools', '웹스쿨'], place: P(TZ.PT, US, 'Claremont, CA') },
  { keys: ['cranbrook', '크랜브룩'], place: P(TZ.ET, US, 'Bloomfield Hills, MI') },
  { keys: ['culveracademies', '컬버'], place: P(TZ.ET, US, 'Culver, IN') },
  // 미국 대학
  { keys: ['harvard', '하버드'], place: P(TZ.ET, US, 'Cambridge, MA') },
  { keys: ['mit', 'massachusettsinstitute', '엠아이티'], place: P(TZ.ET, US, 'Cambridge, MA') },
  { keys: ['yale', '예일'], place: P(TZ.ET, US, 'New Haven, CT') },
  { keys: ['princeton', '프린스턴'], place: P(TZ.ET, US, 'Princeton, NJ') },
  { keys: ['columbiauniversity', '컬럼비아대'], place: P(TZ.ET, US, 'New York, NY') },
  { keys: ['nyu', 'newyorkuniversity', '뉴욕대'], place: P(TZ.ET, US, 'New York, NY') },
  { keys: ['cornell', '코넬'], place: P(TZ.ET, US, 'Ithaca, NY') },
  { keys: ['upenn', 'universityofpennsylvania', '펜실베이니아대', '유펜'], place: P(TZ.ET, US, 'Philadelphia, PA') },
  { keys: ['carnegiemellon', 'cmu', '카네기멜론'], place: P(TZ.ET, US, 'Pittsburgh, PA') },
  { keys: ['georgetown', '조지타운'], place: P(TZ.ET, US, 'Washington DC') },
  { keys: ['johnshopkins', '존스홉킨스'], place: P(TZ.ET, US, 'Baltimore, MD') },
  { keys: ['duke', '듀크'], place: P(TZ.ET, US, 'Durham, NC') },
  { keys: ['emory', '에모리'], place: P(TZ.ET, US, 'Atlanta, GA') },
  { keys: ['georgiatech', '조지아텍'], place: P(TZ.ET, US, 'Atlanta, GA') },
  { keys: ['brownuniversity', '브라운대'], place: P(TZ.ET, US, 'Providence, RI') },
  { keys: ['dartmouth', '다트머스'], place: P(TZ.ET, US, 'Hanover, NH') },
  { keys: ['bostonuniversity', 'bostoncollege', '보스턴대'], place: P(TZ.ET, US, 'Boston, MA') },
  { keys: ['stanford', '스탠퍼드', '스탠포드'], place: P(TZ.PT, US, 'Stanford, CA') },
  { keys: ['berkeley', 'ucberkeley', '버클리'], place: P(TZ.PT, US, 'Berkeley, CA') },
  { keys: ['ucla', '유씨엘에이'], place: P(TZ.PT, US, 'Los Angeles, CA') },
  { keys: ['usc', 'southerncalifornia', '남가주대'], place: P(TZ.PT, US, 'Los Angeles, CA') },
  { keys: ['ucsandiego', 'ucsd', '샌디에이고'], place: P(TZ.PT, US, 'San Diego, CA') },
  { keys: ['ucirvine', 'uci', '어바인'], place: P(TZ.PT, US, 'Irvine, CA') },
  { keys: ['caltech', '칼텍'], place: P(TZ.PT, US, 'Pasadena, CA') },
  { keys: ['universityofwashington', 'uwashington', '워싱턴대'], place: P(TZ.PT, US, 'Seattle, WA') },
  { keys: ['uchicago', 'universityofchicago', '시카고대'], place: P(TZ.CT, US, 'Chicago, IL') },
  { keys: ['northwestern', '노스웨스턴'], place: P(TZ.CT, US, 'Evanston, IL') },
  { keys: ['universityofmichigan', 'umich', '미시간대'], place: P(TZ.ET, US, 'Ann Arbor, MI') },
  { keys: ['utaustin', 'universityoftexas', '텍사스대', '텍사스오스틴'], place: P(TZ.CT, US, 'Austin, TX') },
  { keys: ['riceuniversity', '라이스대'], place: P(TZ.CT, US, 'Houston, TX') },
  { keys: ['vanderbilt', '밴더빌트'], place: P(TZ.CT, US, 'Nashville, TN') },
  { keys: ['notredame', '노트르담'], place: P(TZ.ET, US, 'Notre Dame, IN') },
  // 영국
  { keys: ['oxford', '옥스퍼드', '옥스포드'], place: P(TZ.LON, GB, 'Oxford') },
  { keys: ['cambridgeuniversity', '케임브리지', '캠브리지'], place: P(TZ.LON, GB, 'Cambridge, UK') },
  { keys: ['etoncollege', '이튼'], place: P(TZ.LON, GB, 'Windsor, UK') },
  { keys: ['harrowschool', '해로우'], place: P(TZ.LON, GB, 'London') },
  { keys: ['imperialcollege', '임페리얼'], place: P(TZ.LON, GB, 'London') },
  { keys: ['ucl', 'universitycollegelondon'], place: P(TZ.LON, GB, 'London') },
  { keys: ['lse', 'londonschoolofeconomics'], place: P(TZ.LON, GB, 'London') },
  { keys: ['kingscollegelondon', 'kcl'], place: P(TZ.LON, GB, 'London') },
  { keys: ['warwick', '워릭'], place: P(TZ.LON, GB, 'Coventry, UK') },
  // 캐나다 / 호주 / 아시아
  { keys: ['universityoftoronto', 'uoft', '토론토대'], place: P(TZ.TOR, CA_, 'Toronto') },
  { keys: ['ubc', 'britishcolumbia', '브리티시컬럼비아'], place: P(TZ.VAN, CA_, 'Vancouver') },
  { keys: ['mcgill', '맥길'], place: P(TZ.TOR, CA_, 'Montreal') },
  { keys: ['waterloo', '워털루'], place: P(TZ.TOR, CA_, 'Waterloo, ON') },
  { keys: ['universityofsydney', 'usyd', '시드니대'], place: P(TZ.SYD, AU, 'Sydney') },
  { keys: ['unsw', '뉴사우스웨일스'], place: P(TZ.SYD, AU, 'Sydney') },
  { keys: ['melbourneuniversity', 'unimelb', '멜버른대'], place: P(TZ.MEL, AU, 'Melbourne') },
  { keys: ['monash', '모나시'], place: P(TZ.MEL, AU, 'Melbourne') },
  { keys: ['anu', 'australiannational'], place: P(TZ.SYD, AU, 'Canberra') },
  { keys: ['universityofqueensland', 'uq'], place: P(TZ.BNE, AU, 'Brisbane') },
  { keys: ['hku', 'universityofhongkong', '홍콩대'], place: P(TZ.HK, '홍콩', 'Hong Kong') },
  { keys: ['hkust', '홍콩과기대'], place: P(TZ.HK, '홍콩', 'Hong Kong') },
  { keys: ['nus', 'nationaluniversityofsingapore', '싱가포르국립대'], place: P(TZ.SG, '싱가포르', 'Singapore') },
  { keys: ['ntu', 'nanyang', '난양'], place: P(TZ.SG, '싱가포르', 'Singapore') },
]

function lookupKey(key: string): Place | null {
  return CITIES[key] || REGIONS[key] || COUNTRIES[key] || null
}

/** 자유 입력 텍스트(도시/주/국가, "City, ST" 등)를 해석. */
export function lookupText(raw: string | null | undefined): Place | null {
  if (!raw) return null
  const whole = norm(raw)
  const direct = lookupKey(whole)
  if (direct) return direct
  // "Boston, MA" / "Austin TX" 등 → 콤마·슬래시로 분리 후 각 조각 시도 (도시 우선)
  const parts = raw.split(/[,/|]/).map(norm).filter(Boolean)
  for (const map of [CITIES, REGIONS, COUNTRIES]) {
    for (const p of parts) if (map[p]) return map[p]
  }
  return null
}

/** 학교명에서 위치를 추정 (부분 일치). */
export function resolveBySchool(school: string | null | undefined): Place | null {
  if (!school) return null
  const n = norm(school)
  if (!n) return null
  for (const s of SCHOOLS) {
    if (s.keys.some((k) => n.includes(k))) return s.place
  }
  return null
}

// ── 전화번호 국가 (명시적 국제표시 +, 00 이 있을 때만) ──
const DIAL: { code: string; country: string; tz: Tz | null; multiZone?: boolean }[] = [
  { code: '852', country: '홍콩', tz: TZ.HK }, { code: '971', country: '아랍에미리트', tz: TZ.DXB },
  { code: '353', country: '아일랜드', tz: TZ.DUB }, { code: '82', country: '대한민국', tz: TZ.SEL },
  { code: '86', country: '중국', tz: TZ.SHA }, { code: '81', country: '일본', tz: TZ.TYO },
  { code: '65', country: '싱가포르', tz: TZ.SG }, { code: '60', country: '말레이시아', tz: TZ.KUL },
  { code: '62', country: '인도네시아', tz: null, multiZone: true }, { code: '63', country: '필리핀', tz: TZ.MNL },
  { code: '66', country: '태국', tz: TZ.BKK }, { code: '84', country: '베트남', tz: TZ.SGN },
  { code: '91', country: '인도', tz: TZ.DEL }, { code: '44', country: GB, tz: TZ.LON },
  { code: '61', country: AU, tz: TZ.SYD }, { code: '64', country: NZ, tz: TZ.AKL },
  { code: '49', country: '독일', tz: TZ.BER }, { code: '33', country: '프랑스', tz: TZ.PAR },
  { code: '39', country: '이탈리아', tz: TZ.ROM }, { code: '34', country: '스페인', tz: TZ.MAD },
  { code: '31', country: '네덜란드', tz: TZ.AMS }, { code: '41', country: '스위스', tz: TZ.ZRH },
  { code: '52', country: '멕시코', tz: null, multiZone: true }, { code: '55', country: '브라질', tz: null, multiZone: true },
  { code: '1', country: US, tz: null, multiZone: true },
]

/**
 * 전화번호가 해외 번호인지 판정.
 * 규칙: 010(또는 +82 10 / 82 010)로 시작하면 국내(대한민국), 그 외 형식은 해외로 간주.
 * 빈 번호는 판정 불가(false).
 */
export function isOverseasPhone(phone: string | null | undefined): boolean {
  const raw = (phone || '').trim()
  if (!raw) return false
  let d = raw.replace(/[^\d]/g, '')
  if (!d) return false
  if (d.startsWith('00')) d = d.slice(2)
  // 국내 휴대폰: 010… / +82 10 → 8210… / 82 010 → 82010…
  if (d.startsWith('010') || d.startsWith('8210') || d.startsWith('82010')) return false
  return true
}

// ── NANP(북미) 지역번호 → 시간대 (미국 주/캐나다 주 기준, 결정적). ──
// 시간대 경계에 걸친 일부 지역번호는 주요 시간대로 배정.
const NANP_AREA: Record<string, { tz: Tz; country: string; label: string }> = {}
function addNanp(tz: Tz, country: string, label: string, codes: string[]) {
  for (const c of codes) NANP_AREA[c] = { tz, country, label }
}
// 미국 동부(ET)
addNanp(TZ.ET, US, 'New York', ['212', '315', '332', '347', '516', '518', '585', '607', '631', '646', '680', '716', '718', '838', '845', '914', '917', '929', '934'])
addNanp(TZ.ET, US, 'New Jersey', ['201', '551', '609', '640', '732', '848', '856', '862', '908', '973'])
addNanp(TZ.ET, US, 'Pennsylvania', ['215', '223', '267', '272', '412', '445', '484', '570', '582', '610', '717', '724', '814', '835', '878'])
addNanp(TZ.ET, US, 'Delaware', ['302'])
addNanp(TZ.ET, US, 'Maryland', ['227', '240', '301', '410', '443', '667'])
addNanp(TZ.ET, US, 'Washington DC', ['202'])
addNanp(TZ.ET, US, 'Virginia', ['276', '434', '540', '571', '703', '757', '804', '826', '948'])
addNanp(TZ.ET, US, 'West Virginia', ['304', '681'])
addNanp(TZ.ET, US, 'North Carolina', ['252', '336', '704', '743', '828', '910', '919', '980', '984'])
addNanp(TZ.ET, US, 'South Carolina', ['803', '839', '843', '854', '864'])
addNanp(TZ.ET, US, 'Georgia', ['229', '404', '470', '478', '678', '706', '762', '770', '912', '943'])
addNanp(TZ.ET, US, 'Florida', ['239', '305', '321', '352', '386', '407', '561', '689', '727', '754', '772', '786', '813', '904', '941', '954'])
addNanp(TZ.ET, US, 'Ohio', ['216', '220', '234', '326', '330', '380', '419', '440', '513', '567', '614', '740', '937'])
addNanp(TZ.ET, US, 'Michigan', ['231', '248', '269', '313', '517', '586', '616', '679', '734', '810', '906', '947', '989'])
addNanp(TZ.ET, US, 'Maine', ['207'])
addNanp(TZ.ET, US, 'New Hampshire', ['603'])
addNanp(TZ.ET, US, 'Vermont', ['802'])
addNanp(TZ.ET, US, 'Massachusetts', ['339', '351', '413', '508', '617', '774', '781', '857', '978'])
addNanp(TZ.ET, US, 'Rhode Island', ['401'])
addNanp(TZ.ET, US, 'Connecticut', ['203', '475', '860', '959'])
addNanp(TZ.ET, US, 'Indiana', ['317', '463', '260', '574', '765', '812', '930'])
addNanp(TZ.ET, US, 'Kentucky', ['502', '606', '859'])
addNanp(TZ.ET, US, 'Tennessee', ['423', '865'])
// 미국 중부(CT)
addNanp(TZ.CT, US, 'Illinois', ['217', '224', '309', '312', '331', '447', '464', '618', '630', '708', '730', '773', '779', '815', '861', '872'])
addNanp(TZ.CT, US, 'Iowa', ['319', '515', '563', '641', '712'])
addNanp(TZ.CT, US, 'Kansas', ['316', '620', '785', '913'])
addNanp(TZ.CT, US, 'Minnesota', ['218', '320', '507', '612', '651', '763', '952'])
addNanp(TZ.CT, US, 'Missouri', ['314', '417', '557', '573', '636', '660', '816', '975'])
addNanp(TZ.CT, US, 'Mississippi', ['228', '601', '662', '769'])
addNanp(TZ.CT, US, 'Alabama', ['205', '251', '256', '334', '483', '659', '938'])
addNanp(TZ.CT, US, 'Arkansas', ['327', '479', '501', '870'])
addNanp(TZ.CT, US, 'Louisiana', ['225', '318', '337', '504', '985'])
addNanp(TZ.CT, US, 'Oklahoma', ['405', '539', '572', '580', '918'])
addNanp(TZ.CT, US, 'South Dakota', ['605'])
addNanp(TZ.CT, US, 'North Dakota', ['701'])
addNanp(TZ.CT, US, 'Nebraska', ['402', '531'])
addNanp(TZ.CT, US, 'Wisconsin', ['262', '274', '414', '534', '608', '715', '920'])
addNanp(TZ.CT, US, 'Texas', ['210', '214', '254', '281', '325', '346', '361', '409', '430', '432', '469', '512', '682', '713', '726', '737', '806', '817', '830', '832', '903', '936', '940', '945', '956', '972', '979'])
addNanp(TZ.CT, US, 'Kentucky', ['270', '364'])
addNanp(TZ.CT, US, 'Tennessee', ['615', '629', '731', '901', '931'])
addNanp(TZ.CT, US, 'Indiana', ['219'])
addNanp(TZ.CT, US, 'Florida', ['850'])
// 미국 산악(MT) / 애리조나(AZ, DST 없음)
addNanp(TZ.MT, US, 'Colorado', ['303', '719', '720', '970', '983'])
addNanp(TZ.MT, US, 'Montana', ['406'])
addNanp(TZ.MT, US, 'Wyoming', ['307'])
addNanp(TZ.MT, US, 'New Mexico', ['505', '575'])
addNanp(TZ.MT, US, 'Utah', ['385', '435', '801'])
addNanp(TZ.MT, US, 'Idaho', ['208', '986'])
addNanp(TZ.MT, US, 'Texas (El Paso)', ['915'])
addNanp(TZ.MT, US, 'Nebraska (west)', ['308'])
addNanp(TZ.AZ, US, 'Arizona', ['480', '520', '602', '623', '928'])
// 미국 태평양(PT) / 알래스카 / 하와이
addNanp(TZ.PT, US, 'California', ['209', '213', '279', '310', '323', '341', '408', '415', '424', '442', '510', '530', '559', '562', '619', '626', '628', '650', '657', '661', '669', '707', '714', '747', '760', '805', '818', '820', '831', '840', '858', '909', '916', '925', '949', '951'])
addNanp(TZ.PT, US, 'Washington', ['206', '253', '360', '425', '509', '564'])
addNanp(TZ.PT, US, 'Oregon', ['458', '503', '541', '971'])
addNanp(TZ.PT, US, 'Nevada', ['702', '725', '775'])
addNanp(TZ.AK, US, 'Alaska', ['907'])
addNanp(TZ.HI, US, 'Hawaii', ['808'])
// 캐나다
addNanp(TZ.TOR, CA_, 'Ontario', ['226', '249', '289', '343', '365', '382', '416', '437', '519', '548', '613', '647', '705', '742', '905'])
addNanp(TZ.TOR, CA_, 'Quebec', ['263', '354', '367', '418', '438', '450', '468', '514', '579', '581', '819', '873'])
addNanp(TZ.HAL, CA_, 'Nova Scotia', ['782', '902'])
addNanp(TZ.HAL, CA_, 'New Brunswick', ['428', '506'])
addNanp(TZ.STJ, CA_, 'Newfoundland', ['709'])
addNanp(TZ.WPG, CA_, 'Manitoba', ['204', '431', '584'])
addNanp(TZ.WPG, CA_, 'Saskatchewan', ['306', '474', '639'])
addNanp(TZ.WPG, CA_, 'Ontario (NW)', ['807'])
addNanp(TZ.EDM, CA_, 'Alberta', ['368', '403', '587', '780', '825'])
addNanp(TZ.EDM, CA_, 'Canada (North)', ['867'])
addNanp(TZ.VAN, CA_, 'British Columbia', ['236', '250', '257', '604', '672', '778'])

/**
 * 전화번호 → 거주지/시간대. 국가코드 + (미국/캐나다는) 지역번호까지 인식해 시간대를 확정.
 * - 010/+82 10 → 국내(대한민국)
 * - +1 / 11자리(1…) / 10자리 지역번호 → NANP 지역번호로 미국·캐나다 시간대 확정
 * - 그 외 국가코드(국제표시 필요) → 국가 대표 시간대
 */
export function resolveByPhoneDetailed(phone: string | null | undefined): ResolvedLocation | null {
  const raw = (phone || '').trim()
  if (!raw) return null
  const hasPlus = raw.startsWith('+')
  const digitsRaw = raw.replace(/[^\d]/g, '')
  if (!digitsRaw) return null
  const had00 = digitsRaw.startsWith('00')
  const d = had00 ? digitsRaw.slice(2) : digitsRaw
  const hasIntl = hasPlus || had00
  // 국내(대한민국)
  if (d.startsWith('010') || d.startsWith('8210') || d.startsWith('82010')) {
    return { timezone: TZ.SEL, country: '대한민국', source: 'phone' }
  }
  // NANP 지역번호 추출
  let area: string | null = null
  if (d.startsWith('1') && d.length === 11) area = d.slice(1, 4)
  else if (hasPlus && d.startsWith('1') && d.length >= 4) area = d.slice(1, 4)
  else if (!hasIntl && d.length === 10 && !/^[01]/.test(d)) area = d.slice(0, 3)
  if (area && NANP_AREA[area]) {
    const a = NANP_AREA[area]
    return { timezone: a.tz, country: a.country, city: a.label, source: 'phone' }
  }
  // 그 외 국가코드 (국제표시가 있을 때만)
  if (!hasIntl) return null
  for (const c of DIAL) {
    if (d.startsWith(c.code)) {
      return { timezone: c.tz, country: c.country, source: 'phone' }
    }
  }
  return null
}

/**
 * 오프라인 사전만으로 즉시 해석(네트워크 없음).
 * 우선순위: 수동 거주도시 > 전화(국가코드+지역번호로 시간대 확정) > 학교(curated) > 거주지역 > 전화(국가만).
 * 전화번호 기반을 앞세워, 오류 많던 학교명 자동 인식 의존도를 낮춘다.
 */
export function resolveInstant(input: {
  city?: string | null
  school?: string | null
  region?: string | null
  phone?: string | null
}): ResolvedLocation | null {
  const byCity = lookupText(input.city)
  if (byCity) return { timezone: byCity.tz, country: byCity.country, city: byCity.label, source: 'city' }
  const byPhone = resolveByPhoneDetailed(input.phone)
  if (byPhone && byPhone.timezone) return byPhone // 시간대까지 확정되면 최우선
  const bySchool = resolveBySchool(input.school)
  if (bySchool) return { timezone: bySchool.tz, country: bySchool.country, city: bySchool.label, source: 'school' }
  const byRegion = lookupText(input.region)
  if (byRegion) return { timezone: byRegion.tz, country: byRegion.country, source: 'region' }
  if (byPhone) return byPhone // 국가만 나온 경우(시간대 미확정)
  return null
}

// ── 국가코드(ISO2) → 한글 국가명 ──
const COUNTRY_KO: Record<string, string> = {
  US: '미국', CA: '캐나다', GB: '영국', AU: '호주', NZ: '뉴질랜드', CN: '중국', HK: '홍콩',
  JP: '일본', SG: '싱가포르', KR: '대한민국', IN: '인도', AE: '아랍에미리트', TH: '태국',
  PH: '필리핀', MY: '말레이시아', ID: '인도네시아', VN: '베트남', FR: '프랑스', DE: '독일',
  IT: '이탈리아', ES: '스페인', NL: '네덜란드', CH: '스위스', SE: '스웨덴', IE: '아일랜드',
  PT: '포르투갈', TR: '튀르키예', RU: '러시아', MX: '멕시코', BR: '브라질', QA: '카타르',
  SA: '사우디아라비아', IL: '이스라엘', TW: '대만', MO: '마카오', KH: '캄보디아', LK: '스리랑카',
  BE: '벨기에', AT: '오스트리아', NO: '노르웨이', DK: '덴마크', FI: '핀란드', PL: '폴란드',
}

// 국가코드(ISO2) → 대표 시간대 (주 정보가 없거나 매칭 안 될 때의 폴백; 다국시간대는 null).
const CC_TZ: Record<string, Tz | null> = {
  US: null, CA: null, AU: null, CN: null, BR: null, RU: null, MX: null, ID: null,
  GB: TZ.LON, KR: TZ.SEL, SG: TZ.SG, HK: TZ.HK, JP: TZ.TYO, IN: TZ.DEL, AE: TZ.DXB,
  NZ: TZ.AKL, TH: TZ.BKK, PH: TZ.MNL, MY: TZ.KUL, VN: TZ.SGN, FR: TZ.PAR, DE: TZ.BER,
  IT: TZ.ROM, ES: TZ.MAD, NL: TZ.AMS, CH: TZ.ZRH, SE: TZ.STO, IE: TZ.DUB, PT: TZ.LIS,
  TR: TZ.IST, QA: TZ.DOH, SA: TZ.RUH, IL: TZ.TLV, TW: 'Asia/Taipei', MO: TZ.HK,
}

// ── 온라인 지오코딩 (둘 다 무료·키 불필요·브라우저 CORS 허용) ──
//  1) Open-Meteo: 도시명 → IANA 시간대를 '직접' 반환(주 매핑 불필요) → 도시 입력에 가장 정확.
//  2) Photon(OSM): 학교 전체명·POI도 해석하고 주(state)를 돌려줌 → Open-Meteo가 못 잡을 때 폴백.
//  (Nominatim은 CORS 헤더가 없어 브라우저에서 차단됨 → 사용 불가)
//  캐싱은 호출부(react-query)에서 처리 — 여기서는 매 호출마다 실제 조회.

interface OpenMeteoResult { name?: string; admin1?: string; timezone?: string; country?: string; country_code?: string }
async function geoOpenMeteo(q: string): Promise<ResolvedLocation | null> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=en&format=json`
  const res = await fetch(url)
  if (!res.ok) throw new Error('open-meteo http ' + res.status)
  const r = ((await res.json()) as { results?: OpenMeteoResult[] })?.results?.[0]
  if (!r || !r.timezone) return null
  const cc = (r.country_code || '').toUpperCase()
  return {
    timezone: r.timezone,
    country: COUNTRY_KO[cc] || r.country || '',
    city: r.name || undefined,
    source: 'geocode',
  }
}

interface PhotonProps { name?: string; city?: string; county?: string; district?: string; state?: string; country?: string; countrycode?: string }
async function geoPhoton(q: string): Promise<ResolvedLocation | null> {
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=1&lang=en`
  const res = await fetch(url)
  if (!res.ok) throw new Error('photon http ' + res.status)
  const p = ((await res.json()) as { features?: { properties?: PhotonProps }[] })?.features?.[0]?.properties
  if (!p) return null
  const cc = (p.countrycode || '').toUpperCase()
  const country = COUNTRY_KO[cc] || p.country || ''
  const stateName = p.state || ''
  let tz: Tz | null = REGIONS[norm(stateName)]?.tz || null
  if (!tz) {
    const byCountry = COUNTRIES[norm(p.country || '')]
    tz = (byCountry && !byCountry.multiZone ? byCountry.tz : null) || (cc in CC_TZ ? CC_TZ[cc] : null)
  }
  const cityLabel = p.city || p.county || p.district || p.name || stateName || ''
  return { timezone: tz, country, city: cityLabel || undefined, source: 'geocode' }
}

export async function geocodePlace(query: string | null | undefined): Promise<ResolvedLocation | null> {
  const q = (query || '').trim()
  if (!q || q.length < 2) return null
  let out: ResolvedLocation | null = null
  // 1) Open-Meteo (IANA 시간대 직접) — 실패/무결과면 2) Photon 폴백
  try { out = await geoOpenMeteo(q) } catch { /* try photon */ }
  if (!out || !out.timezone) {
    try {
      const ph = await geoPhoton(q)
      if (ph && (ph.timezone || !out)) out = ph
    } catch { /* keep out */ }
  }
  return out
}

/** 주어진 시간대의 현지 시각을 "화 09:32" 형태로 포맷. 실패 시 null. */
export function formatLocalTime(now: Date, timezone: string): string | null {
  try {
    return new Intl.DateTimeFormat('ko-KR', {
      timeZone: timezone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(now)
  } catch {
    return null
  }
}
