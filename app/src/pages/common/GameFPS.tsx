import { useEffect, useRef, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { useT } from '@/i18n/LanguageContext'

const CW = 800
const CH = 500
const FOV = Math.PI / 3
const HALF_FOV = FOV / 2
const NUM_RAYS = 320
const MAX_DEPTH = 20
const TILE = 1
const MOVE_SPEED = 0.04
const ROT_SPEED = 0.03
const SHOOT_COOLDOWN = 15

// Map: 1 = wall, 0 = empty
const MAP = [
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,1,1,0,0,0,1,1,0,0,0,1,1,0,1],
  [1,0,1,0,0,0,0,0,0,0,0,0,0,1,0,1],
  [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],
  [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],
  [1,0,1,0,0,0,0,0,0,0,0,0,0,1,0,1],
  [1,0,1,0,0,0,0,0,0,0,0,0,0,1,0,1],
  [1,0,0,0,0,0,0,1,1,0,0,0,0,0,0,1],
  [1,0,0,0,1,0,0,0,0,0,0,1,0,0,0,1],
  [1,0,1,0,1,0,0,0,0,0,0,1,0,1,0,1],
  [1,0,1,0,0,0,0,0,0,0,0,0,0,1,0,1],
  [1,0,0,0,0,0,1,0,0,1,0,0,0,0,0,1],
  [1,0,0,0,0,0,1,0,0,1,0,0,0,0,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
]
const MAP_H = MAP.length
const MAP_W = MAP[0].length

interface Enemy {
  x: number
  y: number
  hp: number
  alive: boolean
  flash: number
}

interface FPSState {
  px: number
  py: number
  angle: number
  enemies: Enemy[]
  score: number
  hp: number
  wave: number
  shootCooldown: number
  shooting: boolean
  gameOver: boolean
  playing: boolean
  frame: number
  killsThisWave: number
}

function spawnEnemies(wave: number, px: number, py: number): Enemy[] {
  const count = 3 + wave * 2
  const enemies: Enemy[] = []
  for (let i = 0; i < count; i++) {
    let ex: number, ey: number
    let attempts = 0
    do {
      ex = 1.5 + Math.random() * (MAP_W - 3)
      ey = 1.5 + Math.random() * (MAP_H - 3)
      attempts++
    } while (
      (MAP[Math.floor(ey)][Math.floor(ex)] === 1 ||
       Math.hypot(ex - px, ey - py) < 3) &&
      attempts < 50
    )
    enemies.push({ x: ex, y: ey, hp: 1 + Math.floor(wave / 3), alive: true, flash: 0 })
  }
  return enemies
}

function initFPS(): FPSState {
  const px = 1.5, py = 1.5
  return {
    px, py,
    angle: Math.PI / 4,
    enemies: spawnEnemies(1, px, py),
    score: 0,
    hp: 100,
    wave: 1,
    shootCooldown: 0,
    shooting: false,
    gameOver: false,
    playing: false,
    frame: 0,
    killsThisWave: 0,
  }
}

function castRay(px: number, py: number, angle: number): { dist: number; hitX: boolean } {
  const sin = Math.sin(angle)
  const cos = Math.cos(angle)
  for (let t = 0; t < MAX_DEPTH; t += 0.02) {
    const x = px + cos * t
    const y = py + sin * t
    const mx = Math.floor(x)
    const my = Math.floor(y)
    if (mx < 0 || mx >= MAP_W || my < 0 || my >= MAP_H) return { dist: t, hitX: true }
    if (MAP[my][mx] === 1) {
      const fracX = x - mx
      const hitX = (fracX < 0.02 || fracX > 0.98)
      return { dist: t, hitX }
    }
  }
  return { dist: MAX_DEPTH, hitX: true }
}

function drawFPS(ctx: CanvasRenderingContext2D, s: FPSState, labels: { start: string; over: string; restart: string; wave: string; hp: string; score: string }) {
  const w = CW
  const h = CH

  // Sky
  const skyGrad = ctx.createLinearGradient(0, 0, 0, h / 2)
  skyGrad.addColorStop(0, '#1a1a2e')
  skyGrad.addColorStop(1, '#16213e')
  ctx.fillStyle = skyGrad
  ctx.fillRect(0, 0, w, h / 2)

  // Floor
  const floorGrad = ctx.createLinearGradient(0, h / 2, 0, h)
  floorGrad.addColorStop(0, '#2d2d2d')
  floorGrad.addColorStop(1, '#1a1a1a')
  ctx.fillStyle = floorGrad
  ctx.fillRect(0, h / 2, w, h / 2)

  if (!s.playing && !s.gameOver) {
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 28px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('QUANTUM ARENA', w / 2, h / 2 - 40)
    ctx.font = '16px sans-serif'
    ctx.fillText(labels.start, w / 2, h / 2 + 10)
    ctx.font = '12px sans-serif'
    ctx.fillStyle = '#888'
    ctx.fillText('WASD = Move | Mouse = Aim | Click = Shoot', w / 2, h / 2 + 40)
    return
  }

  // Raycasting walls
  const stripW = w / NUM_RAYS
  const depthBuffer: number[] = []

  for (let i = 0; i < NUM_RAYS; i++) {
    const rayAngle = s.angle - HALF_FOV + (i / NUM_RAYS) * FOV
    const { dist, hitX } = castRay(s.px, s.py, rayAngle)
    const corrDist = dist * Math.cos(rayAngle - s.angle)
    depthBuffer.push(corrDist)

    const wallH = Math.min(h, (TILE / corrDist) * (h * 0.8))
    const wallTop = (h - wallH) / 2

    const shade = Math.max(0, 1 - corrDist / MAX_DEPTH)
    const base = hitX ? 40 : 60
    const r = Math.floor(base * shade)
    const g = Math.floor((base + 30) * shade)
    const b = Math.floor((base + 80) * shade)
    ctx.fillStyle = `rgb(${r},${g},${b})`
    ctx.fillRect(i * stripW, wallTop, stripW + 1, wallH)
  }

  // Enemies (sprite-style)
  const enemyRenders: { screenX: number; size: number; dist: number; enemy: Enemy }[] = []
  for (const e of s.enemies) {
    if (!e.alive) continue
    const dx = e.x - s.px
    const dy = e.y - s.py
    const dist = Math.hypot(dx, dy)
    if (dist < 0.3) continue

    let enemyAngle = Math.atan2(dy, dx) - s.angle
    while (enemyAngle > Math.PI) enemyAngle -= 2 * Math.PI
    while (enemyAngle < -Math.PI) enemyAngle += 2 * Math.PI

    if (Math.abs(enemyAngle) > HALF_FOV + 0.1) continue

    const screenX = (0.5 + enemyAngle / FOV) * w
    const size = Math.min(h * 0.8, (TILE / dist) * (h * 0.6))
    enemyRenders.push({ screenX, size, dist, enemy: e })
  }

  enemyRenders.sort((a, b) => b.dist - a.dist)

  for (const { screenX, size, dist, enemy } of enemyRenders) {
    const stripIdx = Math.floor(screenX / stripW)
    const halfSprite = Math.floor(size / stripW / 2)
    let visible = false
    for (let si = stripIdx - halfSprite; si <= stripIdx + halfSprite; si++) {
      if (si >= 0 && si < NUM_RAYS && depthBuffer[si] > dist) { visible = true; break }
    }
    if (!visible) continue

    const y = (h - size) / 2
    const flash = enemy.flash > 0

    // Enemy body
    ctx.fillStyle = flash ? '#fff' : '#e63946'
    ctx.fillRect(screenX - size * 0.2, y + size * 0.15, size * 0.4, size * 0.5)

    // Enemy head
    ctx.beginPath()
    ctx.arc(screenX, y + size * 0.15, size * 0.15, 0, Math.PI * 2)
    ctx.fillStyle = flash ? '#fff' : '#ff6b6b'
    ctx.fill()

    // Eyes
    if (size > 20) {
      ctx.fillStyle = '#fff'
      ctx.fillRect(screenX - size * 0.08, y + size * 0.1, size * 0.05, size * 0.05)
      ctx.fillRect(screenX + size * 0.03, y + size * 0.1, size * 0.05, size * 0.05)
    }

    // HP bar
    if (enemy.hp > 1) {
      const barW = size * 0.4
      const barH = 4
      ctx.fillStyle = '#333'
      ctx.fillRect(screenX - barW / 2, y - 8, barW, barH)
      ctx.fillStyle = '#4ecdc4'
      ctx.fillRect(screenX - barW / 2, y - 8, barW * (enemy.hp / (1 + Math.floor(s.wave / 3))), barH)
    }
  }

  // Crosshair
  ctx.strokeStyle = s.shootCooldown > 0 ? '#ff4444' : '#00ff88'
  ctx.lineWidth = 2
  const cx = w / 2, cy = h / 2
  ctx.beginPath()
  ctx.moveTo(cx - 15, cy); ctx.lineTo(cx - 5, cy)
  ctx.moveTo(cx + 5, cy); ctx.lineTo(cx + 15, cy)
  ctx.moveTo(cx, cy - 15); ctx.lineTo(cx, cy - 5)
  ctx.moveTo(cx, cy + 5); ctx.lineTo(cx, cy + 15)
  ctx.stroke()

  // Muzzle flash
  if (s.shooting && s.shootCooldown > SHOOT_COOLDOWN - 3) {
    ctx.fillStyle = 'rgba(255,200,50,0.6)'
    ctx.beginPath()
    ctx.arc(cx, h - 80, 20, 0, Math.PI * 2)
    ctx.fill()
  }

  // Gun
  ctx.fillStyle = '#444'
  ctx.fillRect(w / 2 - 8, h - 90, 16, 90)
  ctx.fillStyle = '#333'
  ctx.fillRect(w / 2 - 20, h - 50, 40, 50)
  ctx.fillStyle = '#555'
  ctx.fillRect(w / 2 - 4, h - 90, 8, 60)

  // HUD
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 16px monospace'
  ctx.textAlign = 'left'
  ctx.fillText(`${labels.hp}: ${s.hp}`, 15, 25)
  ctx.fillText(`${labels.score}: ${s.score}`, 15, 48)
  ctx.textAlign = 'right'
  ctx.fillText(`${labels.wave} ${s.wave}`, w - 15, 25)

  // HP bar
  ctx.fillStyle = '#333'
  ctx.fillRect(15, 32, 150, 8)
  ctx.fillStyle = s.hp > 30 ? '#4ecdc4' : '#ff4444'
  ctx.fillRect(15, 32, 150 * (s.hp / 100), 8)

  // Game over overlay
  if (s.gameOver) {
    ctx.fillStyle = 'rgba(0,0,0,0.7)'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#e63946'
    ctx.font = 'bold 40px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(labels.over, w / 2, h / 2 - 20)
    ctx.fillStyle = '#fff'
    ctx.font = '18px sans-serif'
    ctx.fillText(`${labels.score}: ${s.score}`, w / 2, h / 2 + 20)
    ctx.font = '14px sans-serif'
    ctx.fillStyle = '#888'
    ctx.fillText(labels.restart, w / 2, h / 2 + 50)
  }
}

export function FPSCanvas({ onGameOver }: { onGameOver: (score: number) => void }) {
  const t = useT()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stateRef = useRef<FPSState>(initFPS())
  const rafRef = useRef<number>(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const keysRef = useRef<Set<string>>(new Set())
  const mouseXRef = useRef(0)
  const lockedRef = useRef(false)

  const labelsRef = useRef({
    start: t('game.fps.start'),
    over: t('game.fps.gameOver'),
    restart: t('game.fps.restart'),
    wave: t('game.fps.wave'),
    hp: t('game.fps.hp'),
    score: t('game.score'),
  })
  labelsRef.current = {
    start: t('game.fps.start'),
    over: t('game.fps.gameOver'),
    restart: t('game.fps.restart'),
    wave: t('game.fps.wave'),
    hp: t('game.fps.hp'),
    score: t('game.score'),
  }

  const tick = useCallback(() => {
    const s = stateRef.current
    if (!s.playing || s.gameOver) {
      const ctx = canvasRef.current?.getContext('2d')
      if (ctx) drawFPS(ctx, s, labelsRef.current)
      if (!s.gameOver) rafRef.current = requestAnimationFrame(tick)
      return
    }

    s.frame++
    if (s.shootCooldown > 0) s.shootCooldown--

    // Mouse rotation
    if (mouseXRef.current !== 0) {
      s.angle += mouseXRef.current * 0.002
      mouseXRef.current = 0
    }

    // Keyboard rotation (fallback)
    if (keysRef.current.has('ArrowLeft')) s.angle -= ROT_SPEED
    if (keysRef.current.has('ArrowRight')) s.angle += ROT_SPEED

    // Movement
    let mx = 0, my = 0
    const cos = Math.cos(s.angle)
    const sin = Math.sin(s.angle)
    if (keysRef.current.has('KeyW') || keysRef.current.has('ArrowUp')) { mx += cos * MOVE_SPEED; my += sin * MOVE_SPEED }
    if (keysRef.current.has('KeyS') || keysRef.current.has('ArrowDown')) { mx -= cos * MOVE_SPEED; my -= sin * MOVE_SPEED }
    if (keysRef.current.has('KeyA')) { mx += sin * MOVE_SPEED; my -= cos * MOVE_SPEED }
    if (keysRef.current.has('KeyD')) { mx -= sin * MOVE_SPEED; my += cos * MOVE_SPEED }

    // Collision
    const margin = 0.2
    const newX = s.px + mx
    const newY = s.py + my
    if (MAP[Math.floor(s.py)][Math.floor(newX + (mx > 0 ? margin : -margin))] === 0) s.px = newX
    if (MAP[Math.floor(newY + (my > 0 ? margin : -margin))][Math.floor(s.px)] === 0) s.py = newY

    // Enemy AI - move toward player
    for (const e of s.enemies) {
      if (!e.alive) continue
      if (e.flash > 0) e.flash--
      const dx = s.px - e.x
      const dy = s.py - e.y
      const dist = Math.hypot(dx, dy)
      if (dist > 0.5) {
        const speed = 0.012 + s.wave * 0.002
        const enx = e.x + (dx / dist) * speed
        const eny = e.y + (dy / dist) * speed
        if (MAP[Math.floor(eny)][Math.floor(enx)] === 0) {
          e.x = enx
          e.y = eny
        }
      }
      // Damage player
      if (dist < 0.6 && s.frame % 30 === 0) {
        s.hp -= 5 + Math.floor(s.wave / 2)
      }
    }

    // Check death
    if (s.hp <= 0) {
      s.hp = 0
      s.gameOver = true
      onGameOver(s.score)
    }

    // Check wave clear
    const aliveCount = s.enemies.filter(e => e.alive).length
    if (aliveCount === 0) {
      s.wave++
      s.enemies = spawnEnemies(s.wave, s.px, s.py)
      s.hp = Math.min(100, s.hp + 20)
    }

    const ctx = canvasRef.current?.getContext('2d')
    if (ctx) drawFPS(ctx, s, labelsRef.current)
    rafRef.current = requestAnimationFrame(tick)
  }, [onGameOver])

  const shoot = useCallback(() => {
    const s = stateRef.current
    if (!s.playing || s.gameOver || s.shootCooldown > 0) return
    s.shootCooldown = SHOOT_COOLDOWN
    s.shooting = true
    setTimeout(() => { s.shooting = false }, 80)

    // Hit detection — check center ray
    const centerAngle = s.angle
    let hitEnemy: Enemy | null = null
    let hitDist = MAX_DEPTH

    for (const e of s.enemies) {
      if (!e.alive) continue
      const dx = e.x - s.px
      const dy = e.y - s.py
      const dist = Math.hypot(dx, dy)
      let enemyAngle = Math.atan2(dy, dx) - centerAngle
      while (enemyAngle > Math.PI) enemyAngle -= 2 * Math.PI
      while (enemyAngle < -Math.PI) enemyAngle += 2 * Math.PI
      const hitWidth = 0.3 / dist
      if (Math.abs(enemyAngle) < hitWidth && dist < hitDist) {
        // Check no wall between
        const wallDist = castRay(s.px, s.py, Math.atan2(dy, dx)).dist
        if (wallDist > dist) {
          hitEnemy = e
          hitDist = dist
        }
      }
    }

    if (hitEnemy) {
      hitEnemy.hp--
      hitEnemy.flash = 5
      if (hitEnemy.hp <= 0) {
        hitEnemy.alive = false
        s.score += 10 * s.wave
        s.killsThisWave++
      }
    }
  }, [])

  const startGame = useCallback(() => {
    const s = stateRef.current
    if (s.playing && !s.gameOver) return
    Object.assign(stateRef.current, initFPS())
    stateRef.current.playing = true
    rafRef.current = requestAnimationFrame(tick)
  }, [tick])

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d')
    if (ctx) drawFPS(ctx, stateRef.current, labelsRef.current)

    const el = containerRef.current
    if (!el) return

    const handleKeyDown = (e: KeyboardEvent) => {
      keysRef.current.add(e.code)
      if (e.code === 'Space') { e.preventDefault(); shoot() }
      if (e.code === 'KeyR' && stateRef.current.gameOver) startGame()
    }
    const handleKeyUp = (e: KeyboardEvent) => { keysRef.current.delete(e.code) }
    const handleMouseMove = (e: MouseEvent) => {
      if (lockedRef.current) mouseXRef.current += e.movementX
    }
    const handleClick = () => {
      if (!stateRef.current.playing) {
        startGame()
        el.requestPointerLock?.()
        return
      }
      if (!lockedRef.current) {
        el.requestPointerLock?.()
      }
      shoot()
    }
    const handleLockChange = () => {
      lockedRef.current = document.pointerLockElement === el
    }

    el.addEventListener('keydown', handleKeyDown)
    el.addEventListener('keyup', handleKeyUp)
    el.addEventListener('mousemove', handleMouseMove)
    el.addEventListener('click', handleClick)
    document.addEventListener('pointerlockchange', handleLockChange)

    return () => {
      cancelAnimationFrame(rafRef.current)
      el.removeEventListener('keydown', handleKeyDown)
      el.removeEventListener('keyup', handleKeyUp)
      el.removeEventListener('mousemove', handleMouseMove)
      el.removeEventListener('click', handleClick)
      document.removeEventListener('pointerlockchange', handleLockChange)
      if (document.pointerLockElement === el) document.exitPointerLock?.()
    }
  }, [shoot, startGame, tick])

  return (
    <div ref={containerRef} tabIndex={0} className="outline-none cursor-crosshair">
      <canvas ref={canvasRef} width={CW} height={CH} className="w-full border-0" style={{ background: '#1a1a2e' }} />
    </div>
  )
}

export function FPSInfo({ score, bestScore }: { score: number | null; bestScore: number }) {
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
      <div className="text-xs text-muted-foreground">
        <p>
          <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">WASD</kbd>{' '}
          {t('game.fps.moveHint')} &nbsp;|&nbsp;{' '}
          <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">Mouse</kbd>{' '}
          {t('game.fps.aimHint')} &nbsp;|&nbsp;{' '}
          <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">Click</kbd>{' '}
          {t('game.fps.shootHint')}
        </p>
      </div>
    </>
  )
}
