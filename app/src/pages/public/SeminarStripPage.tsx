import { useEffect, useMemo, useState } from 'react'
import { useSeminars } from '@/hooks/useSeminars'

/**
 * 홈페이지에 끼워 넣는 세미나·웨비나 세로 타임라인 (공개, 로그인 불필요)
 *
 * 왜 여기에 두는가
 *   세미나 기록은 사내 시스템에만 있는데, 홈페이지에는 세미나 이야기가 한 줄도
 *   없었다. "현장을 찾아가는 퀀텀"을 보여줄 가장 확실한 증거인데도 비어 있었다.
 *   같은 데이터를 홈페이지가 iframe 으로 그대로 가져다 쓰면, 세미나를 새로 열
 *   때마다 홈페이지가 자동으로 최신 상태가 된다(따로 올릴 필요 없음).
 *
 * 표현
 *   왼쪽에 세로선을 긋고 그 위에 점을 얹은 타임라인. 목록이 천천히 아래로
 *   흐르며, 마우스를 올리면 멈춘다. 제목은 홈페이지 쪽 섹션이 담당하므로
 *   여기서는 타임라인만 그린다.
 */
export function SeminarStripPage() {
  const { data: seminars = [], isLoading } = useSeminars()
  // 현재 시각은 최초 1회만 잡는다('모집 중' 판정용). 렌더마다 값이 달라지지 않게.
  const [now] = useState(() => Date.now())

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
    return seminars
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
      .slice(0, 12)
      // '모집 중' 판정은 목록을 만들 때 한 번만 한다(렌더 중 현재시각 조회 금지)
      .map(s => ({ ...s, upcoming: s.when!.getTime() > now }))
  }, [seminars, now])

  if (isLoading) return <div style={{ height: 200 }} />
  if (items.length === 0) return <div style={{ height: 0 }} />

  // 끊김 없이 순환하도록 목록을 두 번 이어 붙인다
  const loop = [...items, ...items]

  return (
    <div className="qa-tl">
      <style>{`
        .qa-tl{font-family:"Pretendard","Apple SD Gothic Neo","Noto Sans KR",-apple-system,sans-serif;
          background:transparent;padding:0;overflow:hidden}
        .qa-tl *{box-sizing:border-box}
        .qa-view{position:relative;height:430px;overflow:hidden;
          -webkit-mask-image:linear-gradient(180deg,transparent,#000 12%,#000 88%,transparent);
          mask-image:linear-gradient(180deg,transparent,#000 12%,#000 88%,transparent)}
        /* 왼쪽 세로선 — 목록과 무관하게 항상 이어져 보이도록 뷰 전체에 그린다 */
        .qa-view::before{content:"";position:absolute;left:15px;top:0;bottom:0;width:1px;
          background:linear-gradient(180deg,rgba(12,54,86,.06),rgba(12,54,86,.22) 18%,rgba(12,54,86,.22) 82%,rgba(12,54,86,.06))}
        .qa-track{position:absolute;left:0;right:0;top:0;
          animation:qa-down 44s linear infinite}
        .qa-view:hover .qa-track{animation-play-state:paused}
        /* 아래로 흐른다: 위에서 새 항목이 내려오는 방향 */
        @keyframes qa-down{from{transform:translateY(-50%)}to{transform:translateY(0)}}
        @media (prefers-reduced-motion: reduce){.qa-track{animation:none;transform:translateY(-50%)}}

        .qa-row{position:relative;padding:0 6px 26px 44px}
        /* 선 위에 얹는 점 */
        .qa-dot{position:absolute;left:9px;top:6px;width:13px;height:13px;border-radius:50%;
          background:#fff;border:2px solid #c3ced9}
        .qa-row.is-live .qa-dot{border-color:#a51c30;background:#a51c30;
          box-shadow:0 0 0 4px rgba(165,28,48,.14)}
        .qa-date{font-size:11.5px;font-weight:700;letter-spacing:.06em;color:#a51c30;line-height:1}
        .qa-title{margin-top:7px;font-size:15px;font-weight:700;color:#0c3656;line-height:1.5;
          word-break:keep-all}
        .qa-meta{margin-top:6px;display:flex;gap:10px;flex-wrap:wrap;font-size:12px;color:#7b8695}
        .qa-live{display:inline-block;margin-left:8px;font-size:10.5px;font-weight:700;
          padding:2px 8px;border-radius:999px;background:#a51c30;color:#fff;vertical-align:2px}
      `}</style>

      <div className="qa-view">
        <div className="qa-track">
          {loop.map((s, i) => {
            const d = s.when!
            const upcoming = s.upcoming
            return (
              <div
                className={`qa-row${upcoming ? ' is-live' : ''}`}
                key={`${s.id}-${i}`}
                aria-hidden={i >= items.length}
              >
                <span className="qa-dot" />
                <p className="qa-date">
                  {d.getFullYear()}.{String(d.getMonth() + 1).padStart(2, '0')}.{String(d.getDate()).padStart(2, '0')}
                  {upcoming && <span className="qa-live">모집 중</span>}
                </p>
                <p className="qa-title">{s.title}</p>
                {(s.location || (s.sessions?.length ?? 0) > 1) && (
                  <div className="qa-meta">
                    {s.location && <span>{s.location}</span>}
                    {(s.sessions?.length ?? 0) > 1 && <span>{s.sessions.length}개 세션</span>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
