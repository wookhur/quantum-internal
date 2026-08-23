/**
 * 홈페이지 상담신청 표시 기준 — 배지와 타임라인이 같은 규칙을 쓰도록 한 곳에 모은다.
 *
 * 배경
 *  홈페이지 상담폼(/consult)은 전화·이메일이 같으면 새 리드를 만들지 않고
 *  기존 리드에 병합한다. 이때 유입 채널은 최초 값을 그대로 둔다
 *  (마케팅 채널 분석과 인센티브 최초 담당자 귀속이 흔들리면 안 되므로).
 *  대신 메모에 아래 형태의 표시를 남긴다.
 *
 *      [홈페이지 재문의 2026-08-20] 원서서비스비용문의
 *      알게된 경로: 지인 소개
 *
 *  그래서 "홈페이지로 다시 문의했다"는 사실이 메모 안에 묻혀 목록에서 보이지 않았다.
 *  이 표시를 읽어 배지와 타임라인에 드러낸다. 과거 기록에도 그대로 적용된다.
 */

export type HomepageInquiryKind = 'consult' | 'qna'

export type HomepageInquiry = {
  /** YYYY-MM-DD */
  date: string
  /** 어느 창구로 들어왔는지 */
  kind: HomepageInquiryKind
  /** 표시 뒤에 이어지는 문의 내용 (없을 수 있음) */
  content: string
}

/**
 * 메모에 남은 홈페이지 문의 표시를 모두 찾아 최신순으로 돌려준다.
 * 창구가 둘이라 표시 문구도 둘이다.
 *   [홈페이지 재문의 2026-08-20]  ← 상담 신청 폼
 *   [홈페이지 질문 2026-08-23]    ← Q&A 게시판
 */
export function parseHomepageInquiries(memo?: string | null): HomepageInquiry[] {
  if (!memo) return []

  const marker = /\[홈페이지\s*(재문의|질문)\s*(\d{4}-\d{2}-\d{2})\]/g
  const hits: { date: string; kind: HomepageInquiryKind; start: number; end: number }[] = []
  let m: RegExpExecArray | null
  while ((m = marker.exec(memo)) !== null) {
    hits.push({
      date: m[2],
      kind: m[1] === '질문' ? 'qna' : 'consult',
      start: m.index,
      end: m.index + m[0].length,
    })
  }
  if (hits.length === 0) return []

  return hits
    .map((h, i) => ({
      date: h.date,
      kind: h.kind,
      // 다음 표시 전까지가 이번 문의 내용
      content: memo.slice(h.end, i + 1 < hits.length ? hits[i + 1].start : undefined).trim(),
    }))
    .sort((a, b) => b.date.localeCompare(a.date))
}

/**
 * 리드를 '홈페이지 유입' 으로 묶어 보기 위한 판정.
 * 최초 유입이 홈페이지든, 나중에 홈페이지로 다시 문의했든 모두 포함한다.
 * 유입채널만 보면 2026년 1월에 인스타로 들어온 학부모가 오늘 홈페이지로
 * 문의해도 '인스타그램' 으로만 잡혀, 홈페이지가 얼마나 일하고 있는지 알 수 없다.
 */
export type HomepageTouch = { touched: boolean; kinds: HomepageInquiryKind[]; latest: string }

export function homepageTouch(sourceChannel?: string | null, memo?: string | null): HomepageTouch {
  const kinds = new Set<HomepageInquiryKind>()
  const origin = homepageOriginKind(sourceChannel)
  if (origin === 'consult') kinds.add('consult')
  if (origin === 'qna') kinds.add('qna')
  if (origin === 'other') kinds.add('consult')

  const inquiries = parseHomepageInquiries(memo)
  for (const i of inquiries) kinds.add(i.kind)

  return {
    touched: kinds.size > 0,
    kinds: [...kinds],
    latest: inquiries[0]?.date ?? '',
  }
}

/** 최초 유입이 홈페이지인 리드 (기존 빨간 '홈페이지' 배지 조건) */
export function isHomepageOrigin(sourceChannel?: string | null): boolean {
  return (sourceChannel || '').includes('홈페이지')
}

/**
 * 홈페이지에서 들어왔다면 어느 창구인지.
 * 상담신청은 바로 통화로 이어지고, Q&A 는 먼저 답변을 써야 하는 리드라
 * 응대 순서가 다르다. 목록에서 한눈에 갈라 보이도록 나눈다.
 *
 *   intake-lead → '홈페이지 상담신청'
 *   intake-qna  → '홈페이지 질문'
 */
export type HomepageOriginKind = 'consult' | 'qna' | 'other'

export function homepageOriginKind(sourceChannel?: string | null): HomepageOriginKind | null {
  const c = sourceChannel || ''
  if (!c.includes('홈페이지')) return null
  if (c.includes('질문')) return 'qna'
  if (c.includes('상담')) return 'consult'
  return 'other'
}

/** 배지에 쓸 문구와 색 */
export function homepageOriginBadge(sourceChannel?: string | null): { label: string; className: string } | null {
  switch (homepageOriginKind(sourceChannel)) {
    case 'consult': return { label: '상담신청', className: 'bg-red-500 text-white' }
    case 'qna':     return { label: 'Q&A',     className: 'bg-violet-500 text-white' }
    case 'other':   return { label: '홈페이지', className: 'bg-red-500 text-white' }
    default:        return null
  }
}

/**
 * 다른 경로로 들어왔지만 홈페이지로 추가 문의한 리드.
 * 최초 유입이 홈페이지면 이미 빨간 배지가 붙으므로 중복 표시하지 않는다.
 */
export function hasHomepageReinquiry(
  sourceChannel?: string | null,
  memo?: string | null,
): boolean {
  return !isHomepageOrigin(sourceChannel) && parseHomepageInquiries(memo).length > 0
}

/** 재문의 배지에 쓸 문구 — 어느 창구로 다시 왔는지까지 보인다 */
export function reinquiryBadge(
  sourceChannel?: string | null,
  memo?: string | null,
): { label: string; className: string; date: string } | null {
  if (!hasHomepageReinquiry(sourceChannel, memo)) return null
  const latest = parseHomepageInquiries(memo)[0]
  return latest.kind === 'qna'
    ? { label: '홈페이지 Q&A', className: 'bg-violet-500 text-white', date: latest.date }
    : { label: '홈페이지 재문의', className: 'bg-blue-500 text-white', date: latest.date }
}

/**
 * 목록에서 쓸 "최근 문의일".
 * 유입일과 홈페이지 재문의일 중 더 최근 값. 기존 고객이 다시 문의하면
 * 이 값이 올라가므로, 이 기준으로 정렬하면 신규 리드와 함께 위로 떠오른다.
 */
export function latestInquiryDate(
  leadDate?: string | null,
  memo?: string | null,
): string {
  const base = (leadDate || '').slice(0, 10)
  const re = parseHomepageInquiries(memo)[0]?.date || ''
  return re > base ? re : base
}
