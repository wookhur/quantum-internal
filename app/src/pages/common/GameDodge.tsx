import { useEffect, useRef, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { useT } from '@/i18n/LanguageContext'

const CW = 500
const CH = 600
const PLAYER_W = 36
const POOP_SIZE = 28
const STAR_SIZE = 22
const PLAYER_SPEED = 5
const BASE_FALL_SPEED = 2.5
const SPAWN_INTERVAL = 40

interface Player { x: number; y: number }
interface FallingObj { x: number; y: number; speed: number; type: 'poop' | 'gold' | 'star'; rotation: number }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; color: string; size: number }

interface DState {
  player: Player
  objects: FallingObj[]
  particles: Particle[]
  score: number
  hp: number
  frame: number
  playing: boolean
  gameOver: boolean
  combo: number
  maxCombo: number
}

function init(): DState {
  return {
    player: { x: CW / 2, y: CH - 50 },
    objects: [],
    particles: [],
    score: 0,
    hp: 3,
    frame: 0,
    playing: false,
    gameOver: false,
    combo: 0,
    maxCombo: 0,
  }
}

function addParticles(particles: Particle[], x: number, y: number, color: string, count: number) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2
    const speed = 1 + Math.random() * 3
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 1,
      life: 15 + Math.random() * 15,
      color,
      size: 2 + Math.random() * 3,
    })
  }
}

function drawPoop(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, rotation: number) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(rotation)
  ctx.font = `${size}px serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('💩', 0, 0)
  ctx.restore()
}

function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, frame: number) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(frame * 0.05)
  ctx.font = `${size}px serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('⭐', 0, 0)
  ctx.restore()
}

function drawGold(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, frame: number) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(Math.sin(frame * 0.08) * 0.3)
  ctx.font = `${size}px serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('🪙', 0, 0)
  ctx.restore()
}

function draw(ctx: CanvasRenderingContext2D, s: DState, labels: Record<string, string>) {
  // Sky gradient
  const grad = ctx.createLinearGradient(0, 0, 0, CH)
  grad.addColorStop(0, '#1a1a2e')
  grad.addColorStop(0.5, '#16213e')
  grad.addColorStop(1, '#0f3460')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, CW, CH)

  // Stars background
  ctx.fillStyle = 'rgba(255,255,255,0.3)'
  for (let i = 0; i < 30; i++) {
    const sx = (i * 137.5 + s.frame * 0.1) % CW
    const sy = (i * 73.1) % (CH - 100)
    ctx.beginPath()
    ctx.arc(sx, sy, 1, 0, Math.PI * 2)
    ctx.fill()
  }

  // Ground
  ctx.fillStyle = '#2d4a3e'
  ctx.fillRect(0, CH - 20, CW, 20)
  ctx.fillStyle = '#3a5f50'
  for (let gx = 0; gx < CW; gx += 15) {
    ctx.fillRect(gx, CH - 22, 2, 6)
  }

  if (!s.playing && !s.gameOver) {
    ctx.font = 'bold 40px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillStyle = '#e8d44d'
    ctx.fillText('💩 ' + labels.title + ' 💩', CW / 2, CH / 2 - 60)
    ctx.font = '16px sans-serif'
    ctx.fillStyle = '#fff'
    ctx.fillText(labels.start, CW / 2, CH / 2)
    ctx.font = '13px sans-serif'
    ctx.fillStyle = '#aaa'
    ctx.fillText(labels.controls, CW / 2, CH / 2 + 30)
    return
  }

  // Particles
  for (const p of s.particles) {
    ctx.globalAlpha = Math.min(1, p.life / 15)
    ctx.fillStyle = p.color
    ctx.beginPath()
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1

  // Falling objects
  for (const obj of s.objects) {
    if (obj.type === 'poop') {
      drawPoop(ctx, obj.x, obj.y, POOP_SIZE, obj.rotation)
    } else if (obj.type === 'star') {
      drawStar(ctx, obj.x, obj.y, STAR_SIZE, s.frame)
    } else {
      drawGold(ctx, obj.x, obj.y, STAR_SIZE, s.frame)
    }
  }

  // Player
  const p = s.player
  ctx.save()
  ctx.translate(p.x, p.y)
  ctx.font = `${PLAYER_W}px serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('🏃', 0, 0)
  ctx.restore()

  // HUD
  ctx.fillStyle = 'rgba(0,0,0,0.5)'
  ctx.fillRect(0, 0, CW, 40)

  ctx.font = 'bold 16px monospace'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#fff'
  ctx.fillText(`${labels.score}: ${s.score}`, 12, 20)

  // HP as hearts
  ctx.textAlign = 'center'
  let hpStr = ''
  for (let i = 0; i < 3; i++) hpStr += i < s.hp ? '❤️' : '🖤'
  ctx.font = '18px serif'
  ctx.fillText(hpStr, CW / 2, 20)

  // Combo
  if (s.combo >= 3) {
    ctx.textAlign = 'right'
    ctx.font = 'bold 14px monospace'
    ctx.fillStyle = '#ffd93d'
    ctx.fillText(`${s.combo} COMBO!`, CW - 12, 20)
  }

  // Level indicator
  const level = Math.floor(s.frame / 600) + 1
  ctx.textAlign = 'right'
  ctx.font = '12px monospace'
  ctx.fillStyle = '#aaa'
  ctx.fillText(`Lv.${level}`, CW - 12, 38)

  // Game over
  if (s.gameOver) {
    ctx.fillStyle = 'rgba(0,0,0,0.7)'
    ctx.fillRect(0, 0, CW, CH)

    ctx.fillStyle = '#e63946'
    ctx.font = 'bold 42px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(labels.gameOver, CW / 2, CH / 2 - 50)

    ctx.fillStyle = '#fff'
    ctx.font = '20px sans-serif'
    ctx.fillText(`${labels.score}: ${s.score}`, CW / 2, CH / 2)

    if (s.maxCombo >= 3) {
      ctx.fillStyle = '#ffd93d'
      ctx.font = '16px sans-serif'
      ctx.fillText(`${labels.maxCombo}: ${s.maxCombo}`, CW / 2, CH / 2 + 30)
    }

    ctx.fillStyle = '#888'
    ctx.font = '14px sans-serif'
    ctx.fillText(labels.restart, CW / 2, CH / 2 + 65)
  }
}

export function DodgeCanvas({ onGameOver }: { onGameOver: (score: number) => void }) {
  const t = useT()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stateRef = useRef<DState>(init())
  const rafRef = useRef(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const keysRef = useRef(new Set<string>())

  const labelsRef = useRef({
    title: t('game.dodge.title'),
    start: t('game.dodge.start'),
    controls: t('game.dodge.controls'),
    gameOver: t('game.dodge.gameOver'),
    restart: t('game.dodge.restart'),
    score: t('game.score'),
    maxCombo: t('game.dodge.maxCombo'),
  })
  labelsRef.current = {
    title: t('game.dodge.title'),
    start: t('game.dodge.start'),
    controls: t('game.dodge.controls'),
    gameOver: t('game.dodge.gameOver'),
    restart: t('game.dodge.restart'),
    score: t('game.score'),
    maxCombo: t('game.dodge.maxCombo'),
  }

  const tick = useCallback(() => {
    const s = stateRef.current
    if (!s.playing || s.gameOver) {
      const ctx = canvasRef.current?.getContext('2d')
      if (ctx) draw(ctx, s, labelsRef.current)
      if (!s.gameOver) rafRef.current = requestAnimationFrame(tick)
      return
    }

    s.frame++

    // Player movement
    const speed = PLAYER_SPEED + Math.floor(s.frame / 1800) * 0.5
    if (keysRef.current.has('ArrowLeft') || keysRef.current.has('KeyA')) {
      s.player.x = Math.max(PLAYER_W / 2, s.player.x - speed)
    }
    if (keysRef.current.has('ArrowRight') || keysRef.current.has('KeyD')) {
      s.player.x = Math.min(CW - PLAYER_W / 2, s.player.x + speed)
    }

    // Difficulty scaling
    const diff = Math.floor(s.frame / 600)
    const fallSpeed = BASE_FALL_SPEED + diff * 0.4
    const spawnRate = Math.max(12, SPAWN_INTERVAL - diff * 4)

    // Spawn objects
    if (s.frame % spawnRate === 0) {
      const count = 1 + Math.floor(diff / 3)
      for (let i = 0; i < count; i++) {
        const r = Math.random()
        const x = POOP_SIZE / 2 + Math.random() * (CW - POOP_SIZE)
        if (r < 0.12) {
          s.objects.push({ x, y: -20, speed: fallSpeed * 0.8, type: 'star', rotation: 0 })
        } else if (r < 0.22) {
          s.objects.push({ x, y: -20, speed: fallSpeed * 0.9, type: 'gold', rotation: 0 })
        } else {
          const speedVar = 0.7 + Math.random() * 0.6
          s.objects.push({ x, y: -20, speed: fallSpeed * speedVar, type: 'poop', rotation: Math.random() * 0.5 - 0.25 })
        }
      }
    }

    // Move objects & check collisions
    const px = s.player.x, py = s.player.y
    for (let i = s.objects.length - 1; i >= 0; i--) {
      const obj = s.objects[i]
      obj.y += obj.speed
      if (obj.type === 'poop') obj.rotation += 0.03

      // Off screen
      if (obj.y > CH + 30) {
        if (obj.type === 'poop') {
          s.combo++
          s.maxCombo = Math.max(s.maxCombo, s.combo)
          s.score += s.combo >= 5 ? 3 : s.combo >= 3 ? 2 : 1
        }
        s.objects.splice(i, 1)
        continue
      }

      // Collision
      const hitR = obj.type === 'poop' ? (PLAYER_W / 2 + POOP_SIZE / 2) * 0.6 : (PLAYER_W / 2 + STAR_SIZE / 2) * 0.65
      const dist = Math.hypot(obj.x - px, obj.y - py)
      if (dist < hitR) {
        if (obj.type === 'poop') {
          s.hp--
          s.combo = 0
          addParticles(s.particles, obj.x, obj.y, '#8B4513', 10)
          s.objects.splice(i, 1)
          if (s.hp <= 0) {
            s.gameOver = true
            onGameOver(s.score)
          }
        } else if (obj.type === 'star') {
          s.score += 10
          s.combo += 2
          s.maxCombo = Math.max(s.maxCombo, s.combo)
          addParticles(s.particles, obj.x, obj.y, '#ffd93d', 12)
          s.objects.splice(i, 1)
        } else {
          s.score += 5
          s.combo++
          s.maxCombo = Math.max(s.maxCombo, s.combo)
          addParticles(s.particles, obj.x, obj.y, '#f0c040', 8)
          s.objects.splice(i, 1)
        }
      }
    }

    // Particles
    for (let i = s.particles.length - 1; i >= 0; i--) {
      const p = s.particles[i]
      p.x += p.vx
      p.y += p.vy
      p.vy += 0.1
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
    rafRef.current = requestAnimationFrame(tick)
  }, [tick])

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d')
    if (ctx) draw(ctx, stateRef.current, labelsRef.current)

    const el = containerRef.current
    if (!el) return

    const handleKeyDown = (e: KeyboardEvent) => {
      keysRef.current.add(e.code)
      if (['ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault()
      if (e.code === 'KeyR' && stateRef.current.gameOver) startGame()
      if (e.code === 'Space' && !stateRef.current.playing) startGame()
    }
    const handleKeyUp = (e: KeyboardEvent) => { keysRef.current.delete(e.code) }
    const handleClick = () => {
      if (!stateRef.current.playing || stateRef.current.gameOver) startGame()
      el.focus()
    }

    // Touch support
    let touchX: number | null = null
    const handleTouchStart = (e: TouchEvent) => {
      touchX = e.touches[0].clientX
      if (!stateRef.current.playing || stateRef.current.gameOver) startGame()
    }
    const handleTouchMove = (e: TouchEvent) => {
      if (touchX === null) return
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const scale = CW / rect.width
      const newX = (e.touches[0].clientX - rect.left) * scale
      stateRef.current.player.x = Math.max(PLAYER_W / 2, Math.min(CW - PLAYER_W / 2, newX))
      e.preventDefault()
    }
    const handleTouchEnd = () => { touchX = null }

    el.addEventListener('keydown', handleKeyDown)
    el.addEventListener('keyup', handleKeyUp)
    el.addEventListener('click', handleClick)
    el.addEventListener('touchstart', handleTouchStart, { passive: true })
    el.addEventListener('touchmove', handleTouchMove, { passive: false })
    el.addEventListener('touchend', handleTouchEnd)

    return () => {
      cancelAnimationFrame(rafRef.current)
      el.removeEventListener('keydown', handleKeyDown)
      el.removeEventListener('keyup', handleKeyUp)
      el.removeEventListener('click', handleClick)
      el.removeEventListener('touchstart', handleTouchStart)
      el.removeEventListener('touchmove', handleTouchMove)
      el.removeEventListener('touchend', handleTouchEnd)
    }
  }, [startGame, tick])

  return (
    <div ref={containerRef} tabIndex={0} className="outline-none cursor-pointer">
      <canvas ref={canvasRef} width={CW} height={CH} className="w-full border-0" style={{ background: '#1a1a2e' }} />
    </div>
  )
}

export function DodgeInfo({ score, bestScore }: { score: number | null; bestScore: number }) {
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
          <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">←→</kbd>{' / '}
          <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">A D</kbd>{' '}
          {t('game.dodge.moveHint')}
        </p>
        <p className="text-muted-foreground/70">
          💩 {t('game.dodge.poopDesc')} &nbsp;
          ⭐ {t('game.dodge.starDesc')} &nbsp;
          🪙 {t('game.dodge.goldDesc')}
        </p>
      </div>
    </>
  )
}
