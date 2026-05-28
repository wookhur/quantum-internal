import { useEffect, useRef, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { useT } from '@/i18n/LanguageContext'

// ─── Flappy Bird (pure canvas) ───

interface Pipe {
  x: number
  gapY: number   // center of gap
}

interface FlappyState {
  bird: { y: number; vy: number; rotation: number }
  pipes: Pipe[]
  score: number
  highScore: number
  playing: boolean
  gameOver: boolean
  frame: number
  distSinceSpawn: number
}

const CW = 400
const CH = 500
const BIRD_X = 80
const BIRD_R = 14
const GRAVITY = 0.45
const FLAP_VEL = -7.5
const PIPE_W = 48
const PIPE_GAP = 130
const PIPE_SPEED = 2.8
const SPAWN_DIST = 200

function initFlappy(): FlappyState {
  return {
    bird: { y: CH / 2, vy: 0, rotation: 0 },
    pipes: [],
    score: 0,
    highScore: 0,
    playing: false,
    gameOver: false,
    frame: 0,
    distSinceSpawn: SPAWN_DIST, // spawn first pipe immediately
  }
}

function drawFlappy(ctx: CanvasRenderingContext2D, s: FlappyState, labels: { start: string; restart: string }) {
  const w = CW
  const h = CH

  // Sky gradient
  const grad = ctx.createLinearGradient(0, 0, 0, h)
  grad.addColorStop(0, '#87CEEB')
  grad.addColorStop(1, '#E0F0FF')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, w, h)

  // Background clouds
  ctx.fillStyle = 'rgba(255,255,255,0.6)'
  const clouds = [
    { x: (120 - s.frame * 0.3) % (w + 80), y: 60, rx: 35, ry: 12 },
    { x: (320 - s.frame * 0.2) % (w + 80), y: 100, rx: 28, ry: 10 },
    { x: (50 - s.frame * 0.15) % (w + 80), y: 150, rx: 40, ry: 14 },
  ]
  clouds.forEach(c => {
    ctx.beginPath()
    ctx.ellipse(c.x, c.y, c.rx, c.ry, 0, 0, Math.PI * 2)
    ctx.fill()
  })

  // Pipes
  s.pipes.forEach(p => {
    const gapTop = p.gapY - PIPE_GAP / 2
    const gapBot = p.gapY + PIPE_GAP / 2

    // Top pipe
    ctx.fillStyle = '#2E8B57'
    ctx.fillRect(p.x, 0, PIPE_W, gapTop)
    // Top pipe cap
    ctx.fillStyle = '#3CB371'
    ctx.fillRect(p.x - 3, gapTop - 20, PIPE_W + 6, 20)

    // Bottom pipe
    ctx.fillStyle = '#2E8B57'
    ctx.fillRect(p.x, gapBot, PIPE_W, h - gapBot)
    // Bottom pipe cap
    ctx.fillStyle = '#3CB371'
    ctx.fillRect(p.x - 3, gapBot, PIPE_W + 6, 20)
  })

  // Ground
  ctx.fillStyle = '#8B6914'
  ctx.fillRect(0, h - 40, w, 40)
  ctx.fillStyle = '#6B8E23'
  ctx.fillRect(0, h - 40, w, 8)
  // Ground pattern
  ctx.fillStyle = '#7B7E14'
  for (let i = 0; i < w; i += 20) {
    const gx = (i + Math.floor(s.frame * 2)) % w
    ctx.fillRect(gx, h - 40, 12, 4)
  }

  // Bird
  ctx.save()
  ctx.translate(BIRD_X, s.bird.y)
  ctx.rotate(s.bird.rotation)

  // Body
  ctx.fillStyle = '#FFD700'
  ctx.beginPath()
  ctx.ellipse(0, 0, BIRD_R, BIRD_R - 2, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#DAA520'
  ctx.lineWidth = 1.5
  ctx.stroke()

  // Eye
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  ctx.arc(6, -4, 5, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#333'
  ctx.beginPath()
  ctx.arc(7.5, -4, 2.5, 0, Math.PI * 2)
  ctx.fill()

  // Beak
  ctx.fillStyle = '#FF6347'
  ctx.beginPath()
  ctx.moveTo(BIRD_R - 2, -2)
  ctx.lineTo(BIRD_R + 8, 1)
  ctx.lineTo(BIRD_R - 2, 4)
  ctx.closePath()
  ctx.fill()

  // Wing (animated)
  ctx.fillStyle = '#FFA500'
  const wingY = Math.sin(s.frame * 0.3) * 3
  ctx.beginPath()
  ctx.ellipse(-4, 2 + wingY, 9, 5, -0.2, 0, Math.PI * 2)
  ctx.fill()

  ctx.restore()

  // Score (big, centered)
  if (s.playing || s.gameOver) {
    ctx.fillStyle = '#fff'
    ctx.strokeStyle = '#333'
    ctx.lineWidth = 3
    ctx.font = 'bold 48px sans-serif'
    ctx.textAlign = 'center'
    ctx.strokeText(String(s.score), w / 2, 60)
    ctx.fillText(String(s.score), w / 2, 60)
  }

  // HI score
  if (s.highScore > 0) {
    ctx.font = '14px monospace'
    ctx.fillStyle = '#fff'
    ctx.strokeStyle = '#333'
    ctx.lineWidth = 2
    ctx.textAlign = 'right'
    ctx.strokeText(`HI ${s.highScore}`, w - 12, 24)
    ctx.fillText(`HI ${s.highScore}`, w - 12, 24)
  }

  // Game Over overlay
  if (s.gameOver) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)'
    ctx.fillRect(0, 0, w, h)

    ctx.fillStyle = '#fff'
    ctx.font = 'bold 28px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('GAME OVER', w / 2, h / 2 - 20)
    ctx.font = '15px sans-serif'
    ctx.fillText(labels.restart, w / 2, h / 2 + 15)
  }

  // Start screen
  if (!s.playing && !s.gameOver) {
    ctx.fillStyle = 'rgba(0,0,0,0.2)'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 22px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(labels.start, w / 2, h / 2)
  }
}

export function FlappyCanvas({ onGameOver }: { onGameOver: (score: number, hi: number) => void }) {
  const t = useT()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stateRef = useRef<FlappyState>(initFlappy())
  const rafRef = useRef<number>(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const labelsRef = useRef({
    start: t('flappy.pressToStart'),
    restart: t('flappy.pressToRestart'),
  })
  labelsRef.current = {
    start: t('flappy.pressToStart'),
    restart: t('flappy.pressToRestart'),
  }

  const tick = useCallback(() => {
    const s = stateRef.current
    if (!s.playing) return

    s.frame++

    // Bird physics
    s.bird.vy += GRAVITY
    s.bird.y += s.bird.vy
    s.bird.rotation = Math.min(s.bird.vy * 0.06, Math.PI / 4)

    // Spawn pipes
    s.distSinceSpawn += PIPE_SPEED
    if (s.distSinceSpawn >= SPAWN_DIST) {
      s.distSinceSpawn = 0
      const minGapY = 80 + PIPE_GAP / 2
      const maxGapY = CH - 40 - 80 - PIPE_GAP / 2
      const gapY = minGapY + Math.random() * (maxGapY - minGapY)
      s.pipes.push({ x: CW + 10, gapY })
    }

    // Move pipes and score
    s.pipes.forEach(p => {
      const prevX = p.x
      p.x -= PIPE_SPEED
      // Score when bird passes pipe center
      if (prevX + PIPE_W / 2 >= BIRD_X && p.x + PIPE_W / 2 < BIRD_X) {
        s.score++
      }
    })
    s.pipes = s.pipes.filter(p => p.x + PIPE_W > -10)

    // Collision — ground / ceiling
    if (s.bird.y + BIRD_R > CH - 40 || s.bird.y - BIRD_R < 0) {
      s.bird.y = Math.max(BIRD_R, Math.min(s.bird.y, CH - 40 - BIRD_R))
      endGame(s)
    }

    // Collision — pipes (circle vs rect)
    for (const p of s.pipes) {
      const gapTop = p.gapY - PIPE_GAP / 2
      const gapBot = p.gapY + PIPE_GAP / 2

      // Check if bird x range overlaps pipe
      if (BIRD_X + BIRD_R > p.x && BIRD_X - BIRD_R < p.x + PIPE_W) {
        // Hit top pipe or bottom pipe?
        if (s.bird.y - BIRD_R + 4 < gapTop || s.bird.y + BIRD_R - 4 > gapBot) {
          endGame(s)
          break
        }
      }
    }

    function endGame(st: FlappyState) {
      st.playing = false
      st.gameOver = true
      st.highScore = Math.max(st.highScore, st.score)
      onGameOver(st.score, st.highScore)
    }

    const ctx = canvasRef.current?.getContext('2d')
    if (ctx) drawFlappy(ctx, s, labelsRef.current)

    if (s.playing) rafRef.current = requestAnimationFrame(tick)
  }, [onGameOver])

  const start = useCallback(() => {
    const s = stateRef.current
    if (s.playing) return
    const hi = s.highScore
    Object.assign(s, initFlappy())
    s.highScore = hi
    s.playing = true
    rafRef.current = requestAnimationFrame(tick)
  }, [tick])

  const flap = useCallback(() => {
    const s = stateRef.current
    if (!s.playing) {
      start()
      return
    }
    s.bird.vy = FLAP_VEL
  }, [start])

  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.code === 'Space' || e.code === 'ArrowUp') {
      e.preventDefault()
      flap()
    }
  }, [flap])

  const handleClick = useCallback(() => {
    containerRef.current?.focus()
    flap()
  }, [flap])

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d')
    if (ctx) drawFlappy(ctx, stateRef.current, labelsRef.current)

    const el = containerRef.current
    if (el) {
      el.addEventListener('keydown', handleKey as EventListener)
    }
    return () => {
      cancelAnimationFrame(rafRef.current)
      if (el) {
        el.removeEventListener('keydown', handleKey as EventListener)
      }
    }
  }, [handleKey])

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      className="outline-none cursor-pointer"
      onClick={handleClick}
    >
      <canvas
        ref={canvasRef}
        width={CW}
        height={CH}
        className="w-full border-0 rounded-b-lg"
        style={{ background: '#87CEEB' }}
      />
    </div>
  )
}

// ─── Score + Controls info ───
export function FlappyInfo({ lastScore, highScore }: { lastScore: number | null; highScore: number }) {
  const t = useT()
  return (
    <>
      <div className="flex gap-3">
        <Card className="flex-1">
          <CardContent className="py-3 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t('game.lastScore')}</span>
            <span className="text-xl font-bold font-mono">{lastScore ?? '-'}</span>
          </CardContent>
        </Card>
        <Card className="flex-1">
          <CardContent className="py-3 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t('game.myHighScore')}</span>
            <span className="text-xl font-bold font-mono text-primary">{highScore || '-'}</span>
          </CardContent>
        </Card>
      </div>
      <div className="text-xs text-muted-foreground">
        <p>
          <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">Space</kbd> {t('game.or')}{' '}
          <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">↑</kbd> {t('game.or')}{' '}
          <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">{t('flappy.click')}</kbd> {t('flappy.toFlap')}
        </p>
      </div>
    </>
  )
}
