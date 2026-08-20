import { useEffect, useMemo } from 'react'
import { useSeminars } from '@/hooks/useSeminars'

/**
 * 홈페이지에 끼워 넣는 세미나·웨비나 타임라인 (공개, 로그인 불필요)
 *
 * 왜 여기에 두는가
 *   세미나 기록은 사내 시스템에만 있는데, 홈페이지에는 세미나 이야기가 한 줄도
 *   없었다. "현장을 찾아가는 퀀텀"을 보여줄 가장 확실한 증거인데도 비어 있었다.
 *   같은 데이터를 홈페이지가 iframe 으로 그대로 가져다 쓰면, 세미나를 새로 열
 *   때마다 홈페이지가 자동으로 최신 상태가 된다(따로 올릴 필요 없음).
 *
 * 부모(홈페이지)에 높이를 알려 스크롤이 겹치지 않게 한다.
 */
export function SeminarStripPage() {
  const { data: seminars = [], isLoading } = useSeminars()

  useEffect(() => {
    const post = () => {
      try {
        window.parent?.postMessage(
          { type: 'qa-seminar-height', height: document.body.scrollHeight },
          '*',
        )
      } catch { /* ignore */ }
    }
    post()
    const ro = new ResizeObserver(post)
    ro.observe(document.body)
    window.addEventListener('load', post)
    return () => { ro.disconnect(); window.removeEventListener('load', post) }
  }, [seminars.length, isLoading])

  const items = useMemo(() => {
    const withDate = seminars
      .map(s => {
        // 세미나 날짜 = date 값, 없으면 세션 중 가장 이른 일시
        const sessionDates = (s.sessions || [])
          .map(x => x.datetime)
          .filter((d): d is string => !!d)
          .sort()
        const raw = s.date || sessionDates[0] || null
        return { ...s, when: raw ? new Date(raw) : null }
      })
      .filter(s => s.when && !isNaN(s.when.getTime()))
      .sort((a, b) => b.when!.getTime() - a.when!.getTime())
    return withDate.slice(0, 14)
  }, [seminars])

  const thisYear = new Date().getFullYear()
  const countThisYear = items.filter(s => s.when!.getFullYear() === thisYear).length

  if (isLoading) {
    return <div style={{ height: 200 }} />
  }
  if (items.length === 0) {
    return <div style={{ height: 0 }} />
  }

  // 흐르는 효과를 위해 목록을 두 번 이어 붙인다(끊김 없이 순환)
  const loop = [...items, ...items]

  return (
    <div className="qa-strip">
      <style>{`
        .qa-strip{font-family:"Pretendard","Apple SD Gothic Neo","Noto Sans KR",-apple-system,sans-serif;
          background:transparent;padding:4px 0 10px;overflow:hidden}
        .qa-strip *{box-sizing:border-box}
        .qa-head{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;
          padding:0 4px 16px;justify-content:center}
        .qa-head b{font-size:26px;color:#0c3656;letter-spacing:-.02em}
        .qa-head span{font-size:13.5px;color:#6b7480}
        .qa-rail{position:relative;overflow:hidden;
          -webkit-mask-image:linear-gradient(90deg,transparent,#000 6%,#000 94%,transparent);
          mask-image:linear-gradient(90deg,transparent,#000 6%,#000 94%,transparent)}
        .qa-track{display:flex;gap:14px;width:max-content;animation:qa-slide 46s linear infinite}
        .qa-rail:hover .qa-track{animation-play-state:paused}
        @keyframes qa-slide{from{transform:translateX(0)}to{transform:translateX(-50%)}}
        @media (prefers-reduced-motion: reduce){.qa-track{animation:none}}
        .qa-card{flex:0 0 auto;width:268px;background:#fff;border:1px solid #e6ebf1;border-radius:14px;
          padding:16px 18px;box-shadow:0 2px 10px rgba(12,54,86,.05)}
        .qa-date{font-size:11px;font-weight:700;letter-spacing:.08em;color:#a51c30}
        .qa-title{margin-top:7px;font-size:14.5px;font-weight:700;color:#0c3656;line-height:1.45;
          word-break:keep-all;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
        .qa-meta{margin-top:9px;display:flex;gap:10px;flex-wrap:wrap;font-size:11.5px;color:#7b8695}
        .qa-badge{display:inline-block;margin-top:10px;font-size:10.5px;font-weight:700;
          padding:3px 9px;border-radius:999px;background:#eef3f8;color:#0c3656}
        .qa-badge.live{background:#a51c30;color:#fff}
      `}</style>

      <div className="qa-head">
        <b>세미나 · 웨비나</b>
        <span>
          최근 {items.length}회
          {countThisYear > 0 && ` · ${thisYear}년에만 ${countThisYear}회`} 진행했습니다
        </span>
      </div>

      <div className="qa-rail">
        <div className="qa-track">
          {loop.map((s, i) => {
            const d = s.when!
            const upcoming = d.getTime() > Date.now()
            return (
              <article className="qa-card" key={`${s.id}-${i}`} aria-hidden={i >= items.length}>
                <p className="qa-date">
                  {d.getFullYear()}.{String(d.getMonth() + 1).padStart(2, '0')}.{String(d.getDate()).padStart(2, '0')}
                </p>
                <p className="qa-title">{s.title}</p>
                <div className="qa-meta">
                  {s.location && <span>{s.location}</span>}
                  {s.sessions?.length > 1 && <span>{s.sessions.length}개 세션</span>}
                </div>
                {upcoming && <span className="qa-badge live">모집 중</span>}
              </article>
            )
          })}
        </div>
      </div>
    </div>
  )
}
