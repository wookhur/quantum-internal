/**
 * 마케팅 주간보고서 집계 — SNS 콘텐츠 성과.
 *
 * 인스타그램 콘텐츠 보고서처럼 '기간 안에 올린 콘텐츠'를 한 장에 모은다.
 * 숫자는 콘텐츠별로 입력된 값(조회·좋아요·댓글·저장·공유·팔로우)을 그대로 쓰고,
 * 참여율만 계산한다.
 */

export interface SnsContentLike {
  id: string
  postedAt: string        // YYYY-MM-DD
  title: string
  category?: string
  channel?: string
  url?: string
  views: number
  likes: number
  comments: number
  saves: number
  shares: number
  follows: number         // 이 콘텐츠로 늘어난 팔로워
}

export interface SnsTotals {
  posts: number
  views: number
  likes: number
  comments: number
  saves: number
  shares: number
  follows: number
  /** 참여(좋아요+댓글+저장+공유) 합계 */
  engagements: number
  /** 전체 참여율 = 참여 합계 / 조회수 */
  engagementRate: number | null
}

/** 기간(시작~종료, 양끝 포함) 안에 게시된 콘텐츠만. */
export function inPeriod<T extends { postedAt: string }>(
  rows: readonly T[],
  start: string,
  end: string,
): T[] {
  if (!start || !end) return []
  // 시작일이 종료일보다 뒤면 사용자가 거꾸로 넣은 것 — 뒤집어서 본다.
  const [from, to] = start <= end ? [start, end] : [end, start]
  return rows.filter(r => {
    const d = (r.postedAt || '').slice(0, 10)
    return !!d && d >= from && d <= to
  })
}

/** 콘텐츠 한 건의 참여 수(좋아요+댓글+저장+공유). */
export function engagementsOf(c: SnsContentLike): number {
  return (c.likes || 0) + (c.comments || 0) + (c.saves || 0) + (c.shares || 0)
}

/** 콘텐츠 한 건의 참여율(%). 조회수가 0이면 계산할 수 없어 null. */
export function engagementRateOf(c: SnsContentLike): number | null {
  const v = c.views || 0
  if (v <= 0) return null
  return (engagementsOf(c) / v) * 100
}

export function sumTotals(rows: readonly SnsContentLike[]): SnsTotals {
  const t: SnsTotals = {
    posts: rows.length,
    views: 0, likes: 0, comments: 0, saves: 0, shares: 0, follows: 0,
    engagements: 0, engagementRate: null,
  }
  for (const r of rows) {
    t.views += r.views || 0
    t.likes += r.likes || 0
    t.comments += r.comments || 0
    t.saves += r.saves || 0
    t.shares += r.shares || 0
    t.follows += r.follows || 0
  }
  t.engagements = t.likes + t.comments + t.saves + t.shares
  t.engagementRate = t.views > 0 ? (t.engagements / t.views) * 100 : null
  return t
}

export type SnsSortKey = 'follows' | 'views' | 'likes' | 'comments' | 'saves' | 'engagementRate' | 'postedAt'

/** 보고서 표 정렬. 기본은 팔로우 순(사진의 보고서와 같게), 동률이면 조회수 → 게시일. */
export function sortContents<T extends SnsContentLike>(rows: readonly T[], key: SnsSortKey = 'follows'): T[] {
  const val = (c: SnsContentLike): number => {
    switch (key) {
      case 'views': return c.views || 0
      case 'likes': return c.likes || 0
      case 'comments': return c.comments || 0
      case 'saves': return c.saves || 0
      case 'engagementRate': return engagementRateOf(c) ?? -1
      case 'postedAt': return 0
      default: return c.follows || 0
    }
  }
  return [...rows].sort((a, b) => {
    if (key === 'postedAt') {
      if (a.postedAt !== b.postedAt) return a.postedAt < b.postedAt ? 1 : -1
      return a.id < b.id ? 1 : -1
    }
    const d = val(b) - val(a)
    if (d !== 0) return d
    const v = (b.views || 0) - (a.views || 0)
    if (v !== 0) return v
    if (a.postedAt !== b.postedAt) return a.postedAt < b.postedAt ? 1 : -1
    return a.id < b.id ? 1 : -1   // 완전 동률이면 id 로 고정(렌더마다 순서가 바뀌지 않게)
  })
}

/** 큰 수를 읽기 쉽게: 352339 → '352,339' */
export function fmtNum(n: number): string {
  return (n || 0).toLocaleString('ko-KR')
}

/** 증감 표기: 725 → '+725' (0 이면 '0') */
export function fmtDelta(n: number): string {
  if (!n) return '0'
  return n > 0 ? `+${fmtNum(n)}` : `-${fmtNum(Math.abs(n))}`
}

/** 참여율 표기: 3.456 → '3.5%' / null → '—' */
export function fmtRate(r: number | null): string {
  return r === null ? '—' : `${r.toFixed(1)}%`
}
