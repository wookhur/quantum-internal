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

export type HomepageInquiry = {
  /** YYYY-MM-DD */
  date: string
  /** 표시 뒤에 이어지는 문의 내용 (없을 수 있음) */
  content: string
}

/** 메모에 남은 '[홈페이지 재문의 YYYY-MM-DD]' 표시를 모두 찾아 최신순으로 돌려준다. */
export function parseHomepageInquiries(memo?: string | null): HomepageInquiry[] {
  if (!memo) return []

  const marker = /\[홈페이지\s*재문의\s*(\d{4}-\d{2}-\d{2})\]/g
  const hits: { date: string; start: number; end: number }[] = []
  let m: RegExpExecArray | null
  while ((m = marker.exec(memo)) !== null) {
    hits.push({ date: m[1], start: m.index, end: m.index + m[0].length })
  }
  if (hits.length === 0) return []

  return hits
    .map((h, i) => ({
      date: h.date,
      // 다음 표시 전까지가 이번 문의 내용
      content: memo.slice(h.end, i + 1 < hits.length ? hits[i + 1].start : undefined).trim(),
    }))
    .sort((a, b) => b.date.localeCompare(a.date))
}

/** 최초 유입이 홈페이지인 리드 (기존 빨간 '홈페이지' 배지 조건) */
export function isHomepageOrigin(sourceChannel?: string | null): boolean {
  return (sourceChannel || '').includes('홈페이지')
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
