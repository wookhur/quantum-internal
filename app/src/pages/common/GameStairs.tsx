import { useEffect, useRef, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { useT } from '@/i18n/LanguageContext'

const CW = 400
const CH = 600
const STEP_W = 70
const STEP_H = 16
const PLAYER_W = 24
const PLAYER_H = 32
const TIME_LIMIT_BASE = 1.8
const TIME_LIMIT_MIN = 0.6
const CAMERA_Y_OFFSET = 400

interface Step {
  x: number
  y: number
  dir: 'left' | 'right'
}

interface SState {
  steps: Step[]
  currentStep: number
  playerX: number
  playerY: number
  targetX: number
  targetY: number
  animProgress: number
  score: number
  timer: number
  maxTimer: number
  playing: boolean
  gameOver: boolean
  cameraY: number
  particles: { x: number; y: number; vx: number; vy: number; life: number; color: string }[]
  flash: number
  lastDir: 'left' | 'right'
}

function generateSteps(startY: number, count: number, lastDir: 'left' | 'right', startX: number): Step[] {
  const steps: Step[] = []
  let x = startX
  let y = startY
  let dir = lastDir
  for (let i = 0; i < count; i++) {
    dir = Math.random() < 0.5 ? 'left' : 'right'
    x += dir === 'left' ? -STEP_W * 0.7 : STEP_W * 0.7
    x = Math.max(STEP_W, Math.min(CW - STEP_W, x))
    y -= 45
    steps.push({ x, y, dir })
  }
  return steps
}

function init(): SState {
  const startX = CW / 2
  const startY = CH - 100
  const steps: Step[] = [{ x: startX, y: startY, dir: 'right' }]
  steps.push(...generateSteps(startY, 30, 'right', startX))
  return {
    steps,
    currentStep: 0,
    playerX: startX,
    playerY: startY - PLAYER_H,
    targetX: startX,
    targetY: startY - PLAYER_H,
    animProgress: 1,
    score: 0,
    timer: TIME_LIMIT_BASE,
    maxTimer: TIME_LIMIT_BASE,
    playing: false,
    gameOver: false,
    cameraY: 0,
    particles: [],
    flash: 0,
    lastDir: 'right',
  }
}

function getTimeLimit(score: number): number {
  return Math.max(TIME_LIMIT_MIN, TIME_LIMIT_BASE - score * 0.008)
}

function draw(ctx: CanvasRenderingContext2D, s: SState, labels: Record<string, string>) {
  // Background gradient
  const bgGrad = ctx.createLinearGradient(0, 0, 0, CH)
  bgGrad.addColorStop(0, '#0a0a1a')
  bgGrad.addColorStop(1, '#1a1a3e')
  ctx.fillStyle = bgGrad
  ctx.fillRect(0, 0, CW, CH)

  if (!s.playing && !s.gameOver) {
    ctx.font = 'bold 32px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillStyle = '#7ec8e3'
    ctx.fillText('🏔️ ' + labels.title, CW / 2, CH / 2 - 60)
    ctx.font = '16px sans-serif'
    ctx.fillStyle = '#fff'
    ctx.fillText(labels.start, CW / 2, CH / 2)
    ctx.font = '13px sans-serif'
    ctx.fillStyle = '#aaa'
    ctx.fillText(labels.controls, CW / 2, CH / 2 + 30)
    return
  }

  ctx.save()
  ctx.translate(0, -s.cameraY)

  // Steps
  for (const step of s.steps) {
    const screenY = step.y - s.cameraY
    if (screenY < -50 || screenY > CH + 50) continue

    // Step shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)'
    ctx.fillRect(step.x - STEP_W / 2 + 3, step.y + 3, STEP_W, STEP_H)

    // Step body
    const stepGrad = ctx.createLinearGradient(0, step.y, 0, step.y + STEP_H)
    stepGrad.addColorStop(0, '#5dade2')
    stepGrad.addColorStop(1, '#2e86c1')
    ctx.fillStyle = stepGrad
    ctx.beginPath()
    ctx.roundRect(step.x - STEP_W / 2, step.y, STEP_W, STEP_H, 3)
    ctx.fill()

    // Step highlight
    ctx.fillStyle = 'rgba(255,255,255,0.2)'
    ctx.fillRect(step.x - STEP_W / 2 + 2, step.y + 1, STEP_W - 4, 3)
  }

  // Particles
  for (const p of s.particles) {
    ctx.globalAlpha = Math.min(1, p.life / 10)
    ctx.fillStyle = p.color
    ctx.beginPath()
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1

  // Player
  const px = s.playerX
  const py = s.playerY

  // Player shadow
  ctx.fillStyle = 'rgba(0,0,0,0.2)'
  ctx.beginPath()
  ctx.ellipse(px, py + PLAYER_H + 2, 12, 4, 0, 0, Math.PI * 2)
  ctx.fill()

  // Body
  ctx.fillStyle = s.flash > 0 ? '#fff' : '#ff6b6b'
  ctx.beginPath()
  ctx.roundRect(px - PLAYER_W / 2, py, PLAYER_W, PLAYER_H * 0.65, 4)
  ctx.fill()

  // Head
  ctx.fillStyle = s.flash > 0 ? '#fff' : '#ffd93d'
  ctx.beginPath()
  ctx.arc(px, py - 4, 10, 0, Math.PI * 2)
  ctx.fill()

  // Eyes
  const eyeDir = s.lastDir === 'left' ? -3 : 3
  ctx.fillStyle = '#333'
  ctx.beginPath()
  ctx.arc(px + eyeDir - 2, py - 5, 2, 0, Math.PI * 2)
  ctx.arc(px + eyeDir + 3, py - 5, 2, 0, Math.PI * 2)
  ctx.fill()

  // Legs (animate during jump)
  ctx.strokeStyle = s.flash > 0 ? '#fff' : '#ff6b6b'
  ctx.lineWidth = 4
  ctx.lineCap = 'round'
  const legSpread = s.animProgress < 1 ? Math.sin(s.animProgress * Math.PI) * 6 : 0
  ctx.beginPath()
  ctx.moveTo(px - 4, py + PLAYER_H * 0.65)
  ctx.lineTo(px - 4 - legSpread, py + PLAYER_H)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(px + 4, py + PLAYER_H * 0.65)
  ctx.lineTo(px + 4 + legSpread, py + PLAYER_H)
  ctx.stroke()

  ctx.restore()

  // HUD
  ctx.fillStyle = 'rgba(0,0,0,0.6)'
  ctx.fillRect(0, 0, CW, 50)

  // Score
  ctx.font = 'bold 24px monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#fff'
  ctx.fillText(`${s.score}`, CW / 2, 25)

  // Timer bar
  const timerRatio = Math.max(0, s.timer / s.maxTimer)
  const barW = CW - 24
  ctx.fillStyle = '#333'
  ctx.fillRect(12, 44, barW, 5)
  ctx.fillStyle = timerRatio > 0.3 ? '#4ecdc4' : '#e63946'
  ctx.fillRect(12, 44, barW * timerRatio, 5)

  // Game over
  if (s.gameOver) {
    ctx.fillStyle = 'rgba(0,0,0,0.75)'
    ctx.fillRect(0, 0, CW, CH)
    ctx.fillStyle = '#e63946'
    ctx.font = 'bold 40px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(labels.gameOver, CW / 2, CH / 2 - 40)
    ctx.fillStyle = '#fff'
    ctx.font = '22px sans-serif'
    ctx.fillText(`${labels.score}: ${s.score}`, CW / 2, CH / 2 + 10)
    ctx.fillStyle = '#888'
    ctx.font = '14px sans-serif'
    ctx.fillText(labels.restart, CW / 2, CH / 2 + 50)
  }
}

export function StairsCanvas({ onGameOver }: { onGameOver: (score: number) => void }) {
  const t = useT()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stateRef = useRef<SState>(init())
  const rafRef = useRef(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const lastTimeRef = useRef(0)

  const labelsRef = useRef({
    title: t('game.stairs.title'),
    start: t('game.stairs.start'),
    controls: t('game.stairs.controls'),
    gameOver: t('game.stairs.gameOver'),
    restart: t('game.stairs.restart'),
    score: t('game.score'),
  })
  labelsRef.current = {
    title: t('game.stairs.title'),
    start: t('game.stairs.start'),
    controls: t('game.stairs.controls'),
    gameOver: t('game.stairs.gameOver'),
    restart: t('game.stairs.restart'),
    score: t('game.score'),
  }

  const climbStep = useCallback((dir: 'left' | 'right') => {
    const s = stateRef.current
    if (!s.playing || s.gameOver || s.animProgress < 1) return

    const nextIdx = s.currentStep + 1
    if (nextIdx >= s.steps.length) return

    const nextStep = s.steps[nextIdx]
    const expectedDir = nextStep.x < s.steps[s.currentStep].x ? 'left' : 'right'

    if (dir !== expectedDir) {
      s.gameOver = true
      onGameOver(s.score)
      return
    }

    s.currentStep = nextIdx
    s.score++
    s.targetX = nextStep.x
    s.targetY = nextStep.y - PLAYER_H
    s.animProgress = 0
    s.lastDir = dir
    s.timer = getTimeLimit(s.score)
    s.maxTimer = s.timer
    s.flash = 5

    // Particles
    for (let i = 0; i < 5; i++) {
      s.particles.push({
        x: nextStep.x + (Math.random() - 0.5) * STEP_W,
        y: nextStep.y,
        vx: (Math.random() - 0.5) * 3,
        vy: -Math.random() * 3,
        life: 15 + Math.random() * 10,
        color: ['#7ec8e3', '#5dade2', '#fff'][Math.floor(Math.random() * 3)],
      })
    }

    // Generate more steps if needed
    if (nextIdx > s.steps.length - 15) {
      const lastStep = s.steps[s.steps.length - 1]
      s.steps.push(...generateSteps(lastStep.y, 20, lastStep.dir, lastStep.x))
    }
  }, [onGameOver])

  const tick = useCallback((timestamp: number) => {
    const s = stateRef.current
    const dt = lastTimeRef.current ? (timestamp - lastTimeRef.current) / 1000 : 0.016
    lastTimeRef.current = timestamp

    if (!s.playing || s.gameOver) {
      const ctx = canvasRef.current?.getContext('2d')
      if (ctx) draw(ctx, s, labelsRef.current)
      if (!s.gameOver) rafRef.current = requestAnimationFrame(tick)
      return
    }

    // Timer countdown
    s.timer -= dt
    if (s.timer <= 0) {
      s.gameOver = true
      onGameOver(s.score)
    }

    // Animation
    if (s.animProgress < 1) {
      s.animProgress = Math.min(1, s.animProgress + dt * 8)
      const ease = 1 - Math.pow(1 - s.animProgress, 3)
      const prevStep = s.steps[Math.max(0, s.currentStep - 1)]
      s.playerX = prevStep.x + (s.targetX - prevStep.x) * ease
      const jumpArc = -Math.sin(s.animProgress * Math.PI) * 30
      s.playerY = (prevStep.y - PLAYER_H) + (s.targetY - (prevStep.y - PLAYER_H)) * ease + jumpArc
    }

    if (s.flash > 0) s.flash--

    // Camera
    const targetCam = s.playerY - CAMERA_Y_OFFSET
    s.cameraY += (targetCam - s.cameraY) * 0.1

    // Particles
    for (let i = s.particles.length - 1; i >= 0; i--) {
      const p = s.particles[i]
      p.x += p.vx
      p.y += p.vy
      p.vy += 0.15
      p.life--
      if (p.life <= 0) s.particles.splice(i, 1)
    }

    const ctx = canvasRef.current?.getContext('2d')
    if (ctx) draw(ctx, s, labelsRef.current)
    rafRef.current = requestAnimationFrame(tick)
  }, [onGameOver])

  const startGame = useCallback(() => {
    const s = stateRef.current
    if (s.playing && !s.gameOver) return
    Object.assign(stateRef.current, init())
    stateRef.current.playing = true
    lastTimeRef.current = 0
    rafRef.current = requestAnimationFrame(tick)
  }, [tick])

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d')
    if (ctx) draw(ctx, stateRef.current, labelsRef.current)

    const el = containerRef.current
    if (!el) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return
      if (e.code === 'KeyR' && stateRef.current.gameOver) { startGame(); return }
      if (!stateRef.current.playing) { startGame(); return }
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') { e.preventDefault(); climbStep('left') }
      if (e.code === 'ArrowRight' || e.code === 'KeyD') { e.preventDefault(); climbStep('right') }
    }

    const handleClick = (e: MouseEvent) => {
      if (!stateRef.current.playing || stateRef.current.gameOver) { startGame(); el.focus(); return }
      const rect = canvasRef.current?.getBoundingClientRect()
      if (!rect) return
      const clickX = e.clientX - rect.left
      if (clickX < rect.width / 2) climbStep('left')
      else climbStep('right')
      el.focus()
    }

    const handleTouch = (e: TouchEvent) => {
      if (!stateRef.current.playing || stateRef.current.gameOver) { startGame(); return }
      const rect = canvasRef.current?.getBoundingClientRect()
      if (!rect) return
      const touchX = e.touches[0].clientX - rect.left
      if (touchX < rect.width / 2) climbStep('left')
      else climbStep('right')
      e.preventDefault()
    }

    el.addEventListener('keydown', handleKeyDown)
    el.addEventListener('click', handleClick)
    el.addEventListener('touchstart', handleTouch, { passive: false })

    return () => {
      cancelAnimationFrame(rafRef.current)
      el.removeEventListener('keydown', handleKeyDown)
      el.removeEventListener('click', handleClick)
      el.removeEventListener('touchstart', handleTouch)
    }
  }, [startGame, climbStep, tick])

  return (
    <div ref={containerRef} tabIndex={0} className="outline-none cursor-pointer flex justify-center">
      <canvas ref={canvasRef} width={CW} height={CH} className="max-w-full border-0" style={{ background: '#0a0a1a' }} />
    </div>
  )
}

export function StairsInfo({ score, bestScore }: { score: number | null; bestScore: number }) {
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
          <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">←</kbd>{' '}
          {t('game.stairs.leftHint')} &nbsp;
          <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">→</kbd>{' '}
          {t('game.stairs.rightHint')}
        </p>
        <p className="text-muted-foreground/70">
          {t('game.stairs.desc')}
        </p>
      </div>
    </>
  )
}
