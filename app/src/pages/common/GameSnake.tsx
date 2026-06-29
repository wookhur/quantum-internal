import { useEffect, useRef, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { useT } from '@/i18n/LanguageContext'

const CELL = 20
const COLS = 25
const ROWS = 20
const CW = COLS * CELL
const CH = ROWS * CELL
const BASE_TICK_MS = 130
const MIN_TICK_MS = 55

type Dir = 'up' | 'down' | 'left' | 'right'
interface Cell { x: number; y: number }

interface SState {
  snake: Cell[]
  dir: Dir
  pendingDir: Dir
  food: Cell
  bonus: Cell | null
  bonusTimer: number
  score: number
  best: number
  playing: boolean
  gameOver: boolean
  tickMs: number
  lastTick: number
  flash: number
}

function randCell(exclude: Cell[]): Cell {
  while (true) {
    const c = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) }
    if (!exclude.some(e => e.x === c.x && e.y === c.y)) return c
  }
}

function init(best = 0): SState {
  const startSnake: Cell[] = [
    { x: 12, y: 10 },
    { x: 11, y: 10 },
    { x: 10, y: 10 },
  ]
  return {
    snake: startSnake,
    dir: 'right',
    pendingDir: 'right',
    food: randCell(startSnake),
    bonus: null,
    bonusTimer: 0,
    score: 0,
    best,
    playing: false,
    gameOver: false,
    tickMs: BASE_TICK_MS,
    lastTick: 0,
    flash: 0,
  }
}

function isOpposite(a: Dir, b: Dir) {
  return (a === 'up' && b === 'down') || (a === 'down' && b === 'up')
    || (a === 'left' && b === 'right') || (a === 'right' && b === 'left')
}

function draw(ctx: CanvasRenderingContext2D, s: SState, labels: Record<string, string>) {
  // Background
  const grad = ctx.createLinearGradient(0, 0, 0, CH)
  grad.addColorStop(0, '#0b3d2e')
  grad.addColorStop(1, '#06281f')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, CW, CH)

  // Grid
  ctx.strokeStyle = 'rgba(255,255,255,0.04)'
  ctx.lineWidth = 1
  for (let x = 0; x <= COLS; x++) {
    ctx.beginPath()
    ctx.moveTo(x * CELL, 0)
    ctx.lineTo(x * CELL, CH)
    ctx.stroke()
  }
  for (let y = 0; y <= ROWS; y++) {
    ctx.beginPath()
    ctx.moveTo(0, y * CELL)
    ctx.lineTo(CW, y * CELL)
    ctx.stroke()
  }

  // Flash on eat
  if (s.flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${s.flash * 0.06})`
    ctx.fillRect(0, 0, CW, CH)
  }

  // Food
  const fx = s.food.x * CELL + CELL / 2
  const fy = s.food.y * CELL + CELL / 2
  ctx.fillStyle = '#ff5252'
  ctx.beginPath()
  ctx.arc(fx, fy, CELL / 2 - 2, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#3a8c3a'
  ctx.fillRect(fx - 1, fy - CELL / 2 + 1, 2, 4)

  // Bonus (gold) — pulsates
  if (s.bonus) {
    const bx = s.bonus.x * CELL + CELL / 2
    const by = s.bonus.y * CELL + CELL / 2
    const pulse = 0.85 + Math.sin(s.bonusTimer * 0.25) * 0.15
    ctx.fillStyle = '#ffd93d'
    ctx.beginPath()
    ctx.arc(bx, by, (CELL / 2 - 2) * pulse, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#a87b00'
    ctx.font = `bold ${Math.round(CELL * 0.7)}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('★', bx, by + 1)
  }

  // Snake
  for (let i = s.snake.length - 1; i >= 0; i--) {
    const seg = s.snake[i]
    const sx = seg.x * CELL
    const sy = seg.y * CELL
    const isHead = i === 0
    const shade = Math.max(0.55, 1 - i * 0.015)
    ctx.fillStyle = isHead ? '#7dd87d' : `rgba(106,200,106,${shade})`
    ctx.fillRect(sx + 1, sy + 1, CELL - 2, CELL - 2)
    if (isHead) {
      // Eyes
      ctx.fillStyle = '#0b3d2e'
      const cx = sx + CELL / 2, cy = sy + CELL / 2
      const ex: [number, number][] =
        s.dir === 'right' ? [[CELL / 4, -CELL / 5], [CELL / 4, CELL / 5]] :
        s.dir === 'left' ? [[-CELL / 4, -CELL / 5], [-CELL / 4, CELL / 5]] :
        s.dir === 'up' ? [[-CELL / 5, -CELL / 4], [CELL / 5, -CELL / 4]] :
        [[-CELL / 5, CELL / 4], [CELL / 5, CELL / 4]]
      for (const [dx, dy] of ex) {
        ctx.beginPath()
        ctx.arc(cx + dx, cy + dy, 2, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }

  // HUD
  ctx.fillStyle = 'rgba(0,0,0,0.45)'
  ctx.fillRect(0, 0, CW, 30)
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 14px monospace'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(`${labels.score}: ${s.score}`, 10, 15)
  ctx.textAlign = 'right'
  ctx.fillStyle = '#ffd93d'
  ctx.fillText(`HI ${s.best}`, CW - 10, 15)
  ctx.textAlign = 'center'
  ctx.fillStyle = '#aaa'
  ctx.fillText(`${labels.length}: ${s.snake.length}`, CW / 2, 15)

  // Start screen
  if (!s.playing && !s.gameOver) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)'
    ctx.fillRect(0, CH / 2 - 70, CW, 140)
    ctx.fillStyle = '#7dd87d'
    ctx.font = 'bold 36px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('🐍 ' + labels.title, CW / 2, CH / 2 - 20)
    ctx.fillStyle = '#fff'
    ctx.font = '14px sans-serif'
    ctx.fillText(labels.start, CW / 2, CH / 2 + 15)
    ctx.fillStyle = '#aaa'
    ctx.font = '12px sans-serif'
    ctx.fillText(labels.controls, CW / 2, CH / 2 + 38)
  }

  // Game over
  if (s.gameOver) {
    ctx.fillStyle = 'rgba(0,0,0,0.7)'
    ctx.fillRect(0, 0, CW, CH)
    ctx.fillStyle = '#ff5252'
    ctx.font = 'bold 42px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(labels.gameOver, CW / 2, CH / 2 - 40)
    ctx.fillStyle = '#fff'
    ctx.font = '20px sans-serif'
    ctx.fillText(`${labels.score}: ${s.score}`, CW / 2, CH / 2 - 5)
    ctx.fillStyle = '#ffd93d'
    ctx.font = '16px sans-serif'
    ctx.fillText(`${labels.length}: ${s.snake.length}`, CW / 2, CH / 2 + 22)
    ctx.fillStyle = '#888'
    ctx.font = '13px sans-serif'
    ctx.fillText(labels.restart, CW / 2, CH / 2 + 55)
  }
}

export function SnakeCanvas({ onGameOver }: { onGameOver: (score: number) => void }) {
  const t = useT()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stateRef = useRef<SState>(init())
  const rafRef = useRef(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const labelsRef = useRef({
    title: t('game.snake.title'),
    start: t('game.snake.start'),
    controls: t('game.snake.controls'),
    gameOver: t('game.snake.gameOver'),
    restart: t('game.snake.restart'),
    score: t('game.score'),
    length: t('game.snake.length'),
  })
  labelsRef.current = {
    title: t('game.snake.title'),
    start: t('game.snake.start'),
    controls: t('game.snake.controls'),
    gameOver: t('game.snake.gameOver'),
    restart: t('game.snake.restart'),
    score: t('game.score'),
    length: t('game.snake.length'),
  }

  const loop = useCallback((ts: number) => {
    const s = stateRef.current
    const ctx = canvasRef.current?.getContext('2d')

    if (s.playing && !s.gameOver) {
      if (!s.lastTick) s.lastTick = ts
      if (ts - s.lastTick >= s.tickMs) {
        s.lastTick = ts
        // Apply pending direction (no 180° reversal)
        if (!isOpposite(s.dir, s.pendingDir)) s.dir = s.pendingDir

        const head = s.snake[0]
        const next: Cell = { x: head.x, y: head.y }
        if (s.dir === 'up') next.y--
        else if (s.dir === 'down') next.y++
        else if (s.dir === 'left') next.x--
        else next.x++

        // Wall collision
        if (next.x < 0 || next.x >= COLS || next.y < 0 || next.y >= ROWS) {
          s.gameOver = true
          s.playing = false
          s.best = Math.max(s.best, s.score)
          onGameOver(s.score)
        } else if (s.snake.some(seg => seg.x === next.x && seg.y === next.y)) {
          s.gameOver = true
          s.playing = false
          s.best = Math.max(s.best, s.score)
          onGameOver(s.score)
        } else {
          s.snake.unshift(next)
          let ate = false
          if (next.x === s.food.x && next.y === s.food.y) {
            s.score += 1
            s.flash = 6
            ate = true
            s.food = randCell(s.snake)
            // Speed up
            s.tickMs = Math.max(MIN_TICK_MS, BASE_TICK_MS - Math.floor(s.score / 2) * 3)
            // Spawn bonus every 5 eats
            if (s.score % 5 === 0 && !s.bonus) {
              s.bonus = randCell([...s.snake, s.food])
              s.bonusTimer = 80 // ticks before it disappears
            }
          }
          if (s.bonus && next.x === s.bonus.x && next.y === s.bonus.y) {
            s.score += 5
            s.flash = 10
            ate = true
            s.bonus = null
            s.bonusTimer = 0
          }
          if (!ate) s.snake.pop()
        }

        if (s.bonus) {
          s.bonusTimer--
          if (s.bonusTimer <= 0) s.bonus = null
        }
        if (s.flash > 0) s.flash--
      }
    }

    if (ctx) draw(ctx, s, labelsRef.current)
    rafRef.current = requestAnimationFrame(loop)
  }, [onGameOver])

  const startGame = useCallback(() => {
    const best = stateRef.current.best
    stateRef.current = init(best)
    stateRef.current.playing = true
    stateRef.current.lastTick = 0
  }, [])

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d')
    if (ctx) draw(ctx, stateRef.current, labelsRef.current)
    rafRef.current = requestAnimationFrame(loop)

    const el = containerRef.current
    if (!el) return

    const handleKey = (e: KeyboardEvent) => {
      const s = stateRef.current
      const code = e.code
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(code)) {
        e.preventDefault()
      }
      if (code === 'KeyR' && s.gameOver) { startGame(); return }
      if ((code === 'Space') && !s.playing) { startGame(); return }
      if (!s.playing) { startGame() }
      if (code === 'ArrowUp' || code === 'KeyW') s.pendingDir = 'up'
      else if (code === 'ArrowDown' || code === 'KeyS') s.pendingDir = 'down'
      else if (code === 'ArrowLeft' || code === 'KeyA') s.pendingDir = 'left'
      else if (code === 'ArrowRight' || code === 'KeyD') s.pendingDir = 'right'
    }

    const handleClick = () => {
      const s = stateRef.current
      if (!s.playing || s.gameOver) startGame()
      el.focus()
    }

    // Touch / swipe
    let touchStart: { x: number; y: number } | null = null
    const handleTouchStart = (e: TouchEvent) => {
      const s = stateRef.current
      if (!s.playing || s.gameOver) startGame()
      touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    }
    const handleTouchEnd = (e: TouchEvent) => {
      if (!touchStart) return
      const dx = e.changedTouches[0].clientX - touchStart.x
      const dy = e.changedTouches[0].clientY - touchStart.y
      if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return
      const s = stateRef.current
      if (Math.abs(dx) > Math.abs(dy)) s.pendingDir = dx > 0 ? 'right' : 'left'
      else s.pendingDir = dy > 0 ? 'down' : 'up'
      touchStart = null
    }

    el.addEventListener('keydown', handleKey)
    el.addEventListener('click', handleClick)
    el.addEventListener('touchstart', handleTouchStart, { passive: true })
    el.addEventListener('touchend', handleTouchEnd, { passive: true })

    return () => {
      cancelAnimationFrame(rafRef.current)
      el.removeEventListener('keydown', handleKey)
      el.removeEventListener('click', handleClick)
      el.removeEventListener('touchstart', handleTouchStart)
      el.removeEventListener('touchend', handleTouchEnd)
    }
  }, [loop, startGame])

  return (
    <div ref={containerRef} tabIndex={0} className="outline-none cursor-pointer" onClick={() => containerRef.current?.focus()}>
      <canvas ref={canvasRef} width={CW} height={CH} className="w-full border-0" style={{ background: '#06281f' }} />
    </div>
  )
}

export function SnakeInfo({ score, bestScore }: { score: number | null; bestScore: number }) {
  const t = useT()
  return (
    <>
      <div className="flex gap-3">
        <Card className="flex-1">
          <CardContent className="py-3 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t('game.lastScore')}</span>
            <span className="text-xl font-bold font-mono">{score ?? '-'}</span>
          </CardContent>
        </Card>
        <Card className="flex-1">
          <CardContent className="py-3 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t('game.myHighScore')}</span>
            <span className="text-xl font-bold font-mono text-primary">{bestScore || '-'}</span>
          </CardContent>
        </Card>
      </div>
      <div className="text-xs text-muted-foreground space-y-1">
        <p>
          <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">↑↓←→</kbd>{' / '}
          <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">W A S D</kbd>{' '}
          {t('game.snake.moveHint')}
        </p>
        <p className="text-muted-foreground/70">
          🍎 {t('game.snake.foodDesc')} &nbsp;
          ★ {t('game.snake.bonusDesc')}
        </p>
      </div>
    </>
  )
}
