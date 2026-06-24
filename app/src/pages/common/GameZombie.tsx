import { useEffect, useRef, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { useT } from '@/i18n/LanguageContext'

const CW = 800
const CH = 500
const PLAYER_R = 12
const ZOMBIE_R = 10
const ITEM_R = 8
const PLAYER_SPEED = 2.8
const ZOMBIE_BASE_SPEED = 1.0
const SPAWN_INTERVAL = 120
const ITEM_INTERVAL = 300

interface Player {
  x: number
  y: number
  hp: number
  maxHp: number
  speed: number
  speedBoostTimer: number
  shieldTimer: number
  invincibleTimer: number
}

interface Zombie {
  x: number
  y: number
  speed: number
  type: 'normal' | 'fast' | 'tank'
  hp: number
  flash: number
}

interface Item {
  x: number
  y: number
  type: 'heal' | 'speed' | 'shield' | 'bomb'
  timer: number
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  color: string
}

interface ZState {
  player: Player
  zombies: Zombie[]
  items: Item[]
  particles: Particle[]
  score: number
  time: number
  frame: number
  playing: boolean
  gameOver: boolean
}

function init(): ZState {
  return {
    player: { x: CW / 2, y: CH / 2, hp: 100, maxHp: 100, speed: PLAYER_SPEED, speedBoostTimer: 0, shieldTimer: 0, invincibleTimer: 0 },
    zombies: [],
    items: [],
    particles: [],
    score: 0,
    time: 0,
    frame: 0,
    playing: false,
    gameOver: false,
  }
}

function spawnZombie(s: ZState): Zombie {
  const side = Math.floor(Math.random() * 4)
  let x: number, y: number
  if (side === 0) { x = Math.random() * CW; y = -20 }
  else if (side === 1) { x = CW + 20; y = Math.random() * CH }
  else if (side === 2) { x = Math.random() * CW; y = CH + 20 }
  else { x = -20; y = Math.random() * CH }

  const diff = Math.floor(s.time / 600)
  const r = Math.random()
  if (r < 0.1 + diff * 0.02) {
    return { x, y, speed: ZOMBIE_BASE_SPEED * 0.6 + diff * 0.05, type: 'tank', hp: 3, flash: 0 }
  } else if (r < 0.3 + diff * 0.03) {
    return { x, y, speed: ZOMBIE_BASE_SPEED * 1.8 + diff * 0.1, type: 'fast', hp: 1, flash: 0 }
  }
  return { x, y, speed: ZOMBIE_BASE_SPEED + diff * 0.08, type: 'normal', hp: 1, flash: 0 }
}

function spawnItem(): Item {
  const types: Item['type'][] = ['heal', 'speed', 'shield', 'bomb']
  const weights = [0.35, 0.25, 0.2, 0.2]
  let r = Math.random()
  let type: Item['type'] = 'heal'
  for (let i = 0; i < types.length; i++) {
    r -= weights[i]
    if (r <= 0) { type = types[i]; break }
  }
  return {
    x: 30 + Math.random() * (CW - 60),
    y: 30 + Math.random() * (CH - 60),
    type,
    timer: 600,
  }
}

function addParticles(particles: Particle[], x: number, y: number, color: string, count: number) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2
    const speed = 1 + Math.random() * 3
    particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 20 + Math.random() * 20, color })
  }
}

function draw(ctx: CanvasRenderingContext2D, s: ZState, labels: Record<string, string>) {
  // Background
  ctx.fillStyle = '#1a1a1a'
  ctx.fillRect(0, 0, CW, CH)

  // Grid pattern
  ctx.strokeStyle = '#222'
  ctx.lineWidth = 1
  for (let x = 0; x < CW; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CH); ctx.stroke() }
  for (let y = 0; y < CH; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CW, y); ctx.stroke() }

  if (!s.playing && !s.gameOver) {
    ctx.fillStyle = '#e63946'
    ctx.font = 'bold 36px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('ZOMBIE ESCAPE', CW / 2, CH / 2 - 50)
    ctx.fillStyle = '#fff'
    ctx.font = '16px sans-serif'
    ctx.fillText(labels.start, CW / 2, CH / 2)
    ctx.font = '12px sans-serif'
    ctx.fillStyle = '#888'
    ctx.fillText(labels.controls, CW / 2, CH / 2 + 30)
    return
  }

  // Items
  for (const item of s.items) {
    const pulse = 1 + Math.sin(s.frame * 0.1) * 0.15
    const r = ITEM_R * pulse
    ctx.beginPath()
    ctx.arc(item.x, item.y, r + 3, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255,255,255,0.1)'
    ctx.fill()

    ctx.beginPath()
    ctx.arc(item.x, item.y, r, 0, Math.PI * 2)
    if (item.type === 'heal') ctx.fillStyle = '#4ecdc4'
    else if (item.type === 'speed') ctx.fillStyle = '#ffd93d'
    else if (item.type === 'shield') ctx.fillStyle = '#6c5ce7'
    else ctx.fillStyle = '#ff6b6b'
    ctx.fill()

    ctx.fillStyle = '#fff'
    ctx.font = 'bold 10px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    if (item.type === 'heal') ctx.fillText('+', item.x, item.y)
    else if (item.type === 'speed') ctx.fillText('⚡', item.x, item.y)
    else if (item.type === 'shield') ctx.fillText('🛡', item.x, item.y)
    else ctx.fillText('💥', item.x, item.y)
  }

  // Particles
  for (const p of s.particles) {
    ctx.globalAlpha = p.life / 40
    ctx.fillStyle = p.color
    ctx.fillRect(p.x - 2, p.y - 2, 4, 4)
  }
  ctx.globalAlpha = 1

  // Zombies
  for (const z of s.zombies) {
    const dx = s.player.x - z.x
    const dy = s.player.y - z.y
    const angle = Math.atan2(dy, dx)

    ctx.save()
    ctx.translate(z.x, z.y)
    ctx.rotate(angle)

    const r = z.type === 'tank' ? ZOMBIE_R + 4 : z.type === 'fast' ? ZOMBIE_R - 2 : ZOMBIE_R
    const bodyColor = z.flash > 0 ? '#fff' : z.type === 'tank' ? '#556b2f' : z.type === 'fast' ? '#8b0000' : '#2d5a27'

    // Body
    ctx.fillStyle = bodyColor
    ctx.beginPath()
    ctx.arc(0, 0, r, 0, Math.PI * 2)
    ctx.fill()

    // Arms
    ctx.fillStyle = z.flash > 0 ? '#ddd' : '#3a7a33'
    ctx.fillRect(r * 0.5, -r * 0.8, r * 0.8, r * 0.3)
    ctx.fillRect(r * 0.5, r * 0.5, r * 0.8, r * 0.3)

    // Eyes
    ctx.fillStyle = '#ff0'
    ctx.beginPath()
    ctx.arc(r * 0.3, -r * 0.25, 2.5, 0, Math.PI * 2)
    ctx.arc(r * 0.3, r * 0.25, 2.5, 0, Math.PI * 2)
    ctx.fill()

    ctx.restore()
  }

  // Player
  const p = s.player

  // Shield aura
  if (p.shieldTimer > 0) {
    ctx.beginPath()
    ctx.arc(p.x, p.y, PLAYER_R + 8, 0, Math.PI * 2)
    ctx.strokeStyle = `rgba(108,92,231,${0.3 + Math.sin(s.frame * 0.15) * 0.2})`
    ctx.lineWidth = 3
    ctx.stroke()
  }

  // Invincible blink
  if (p.invincibleTimer > 0 && s.frame % 6 < 3) {
    ctx.globalAlpha = 0.4
  }

  // Body
  ctx.fillStyle = p.speedBoostTimer > 0 ? '#ffd93d' : '#4a90d9'
  ctx.beginPath()
  ctx.arc(p.x, p.y, PLAYER_R, 0, Math.PI * 2)
  ctx.fill()

  // Face
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  ctx.arc(p.x - 4, p.y - 3, 3, 0, Math.PI * 2)
  ctx.arc(p.x + 4, p.y - 3, 3, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#333'
  ctx.beginPath()
  ctx.arc(p.x - 4, p.y - 3, 1.5, 0, Math.PI * 2)
  ctx.arc(p.x + 4, p.y - 3, 1.5, 0, Math.PI * 2)
  ctx.fill()

  ctx.globalAlpha = 1

  // HUD
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 14px monospace'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText(`${labels.score}: ${s.score}`, 12, 12)
  const timeStr = `${Math.floor(s.time / 3600).toString().padStart(2, '0')}:${(Math.floor(s.time / 60) % 60).toString().padStart(2, '0')}`
  ctx.textAlign = 'right'
  ctx.fillText(`${labels.time}: ${timeStr}`, CW - 12, 12)
  ctx.fillText(`${labels.zombies}: ${s.zombies.length}`, CW - 12, 30)

  // HP bar
  ctx.textAlign = 'left'
  ctx.fillText(`HP`, 12, 32)
  ctx.fillStyle = '#333'
  ctx.fillRect(38, 34, 120, 12)
  ctx.fillStyle = p.hp > 30 ? '#4ecdc4' : '#e63946'
  ctx.fillRect(38, 34, 120 * (p.hp / p.maxHp), 12)
  ctx.strokeStyle = '#555'
  ctx.strokeRect(38, 34, 120, 12)

  // Active effects
  let effectY = 52
  if (p.speedBoostTimer > 0) {
    ctx.fillStyle = '#ffd93d'
    ctx.font = '11px sans-serif'
    ctx.fillText(`⚡ ${Math.ceil(p.speedBoostTimer / 60)}s`, 12, effectY)
    effectY += 14
  }
  if (p.shieldTimer > 0) {
    ctx.fillStyle = '#6c5ce7'
    ctx.font = '11px sans-serif'
    ctx.fillText(`🛡 ${Math.ceil(p.shieldTimer / 60)}s`, 12, effectY)
  }

  // Game over
  if (s.gameOver) {
    ctx.fillStyle = 'rgba(0,0,0,0.75)'
    ctx.fillRect(0, 0, CW, CH)
    ctx.fillStyle = '#e63946'
    ctx.font = 'bold 44px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(labels.gameOver, CW / 2, CH / 2 - 30)
    ctx.fillStyle = '#fff'
    ctx.font = '18px sans-serif'
    ctx.fillText(`${labels.score}: ${s.score}  |  ${labels.time}: ${timeStr}`, CW / 2, CH / 2 + 15)
    ctx.font = '14px sans-serif'
    ctx.fillStyle = '#888'
    ctx.fillText(labels.restart, CW / 2, CH / 2 + 50)
  }
}

export function ZombieCanvas({ onGameOver }: { onGameOver: (score: number) => void }) {
  const t = useT()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stateRef = useRef<ZState>(init())
  const rafRef = useRef(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const keysRef = useRef(new Set<string>())

  const labelsRef = useRef({
    start: t('game.zombie.start'),
    controls: t('game.zombie.controls'),
    gameOver: t('game.zombie.gameOver'),
    restart: t('game.zombie.restart'),
    score: t('game.score'),
    time: t('game.zombie.time'),
    zombies: t('game.zombie.zombies'),
  })
  labelsRef.current = {
    start: t('game.zombie.start'),
    controls: t('game.zombie.controls'),
    gameOver: t('game.zombie.gameOver'),
    restart: t('game.zombie.restart'),
    score: t('game.score'),
    time: t('game.zombie.time'),
    zombies: t('game.zombie.zombies'),
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
    s.time++

    // Player movement
    const p = s.player
    const speed = p.speedBoostTimer > 0 ? p.speed * 1.6 : p.speed
    let mx = 0, my = 0
    if (keysRef.current.has('KeyW') || keysRef.current.has('ArrowUp')) my -= 1
    if (keysRef.current.has('KeyS') || keysRef.current.has('ArrowDown')) my += 1
    if (keysRef.current.has('KeyA') || keysRef.current.has('ArrowLeft')) mx -= 1
    if (keysRef.current.has('KeyD') || keysRef.current.has('ArrowRight')) mx += 1
    if (mx !== 0 && my !== 0) { mx *= 0.707; my *= 0.707 }
    p.x = Math.max(PLAYER_R, Math.min(CW - PLAYER_R, p.x + mx * speed))
    p.y = Math.max(PLAYER_R, Math.min(CH - PLAYER_R, p.y + my * speed))

    // Timers
    if (p.speedBoostTimer > 0) p.speedBoostTimer--
    if (p.shieldTimer > 0) p.shieldTimer--
    if (p.invincibleTimer > 0) p.invincibleTimer--

    // Spawn zombies
    const spawnRate = Math.max(30, SPAWN_INTERVAL - Math.floor(s.time / 300) * 10)
    if (s.frame % spawnRate === 0) {
      const count = 1 + Math.floor(s.time / 1800)
      for (let i = 0; i < count; i++) s.zombies.push(spawnZombie(s))
    }

    // Spawn items
    if (s.frame % ITEM_INTERVAL === 0 && s.items.length < 4) {
      s.items.push(spawnItem())
    }

    // Move zombies
    for (const z of s.zombies) {
      if (z.flash > 0) z.flash--
      const dx = p.x - z.x
      const dy = p.y - z.y
      const dist = Math.hypot(dx, dy)
      if (dist > 0) {
        z.x += (dx / dist) * z.speed
        z.y += (dy / dist) * z.speed
      }
    }

    // Zombie-player collision
    for (let i = s.zombies.length - 1; i >= 0; i--) {
      const z = s.zombies[i]
      const dist = Math.hypot(z.x - p.x, z.y - p.y)
      const hitR = PLAYER_R + (z.type === 'tank' ? ZOMBIE_R + 4 : ZOMBIE_R)
      if (dist < hitR) {
        if (p.invincibleTimer <= 0) {
          const dmg = p.shieldTimer > 0 ? 3 : z.type === 'tank' ? 15 : z.type === 'fast' ? 8 : 10
          p.hp -= dmg
          p.invincibleTimer = 30
          addParticles(s.particles, p.x, p.y, '#e63946', 5)

          // Knockback zombie
          if (dist > 0) {
            z.x -= ((p.x - z.x) / dist) * 30
            z.y -= ((p.y - z.y) / dist) * 30
          }
        }
      }
    }

    // Item pickup
    for (let i = s.items.length - 1; i >= 0; i--) {
      const item = s.items[i]
      item.timer--
      if (item.timer <= 0) { s.items.splice(i, 1); continue }
      const dist = Math.hypot(item.x - p.x, item.y - p.y)
      if (dist < PLAYER_R + ITEM_R) {
        if (item.type === 'heal') {
          p.hp = Math.min(p.maxHp, p.hp + 30)
          addParticles(s.particles, item.x, item.y, '#4ecdc4', 8)
        } else if (item.type === 'speed') {
          p.speedBoostTimer = 300
          addParticles(s.particles, item.x, item.y, '#ffd93d', 8)
        } else if (item.type === 'shield') {
          p.shieldTimer = 360
          addParticles(s.particles, item.x, item.y, '#6c5ce7', 8)
        } else if (item.type === 'bomb') {
          // Kill nearby zombies
          for (let j = s.zombies.length - 1; j >= 0; j--) {
            const zd = Math.hypot(s.zombies[j].x - item.x, s.zombies[j].y - item.y)
            if (zd < 120) {
              addParticles(s.particles, s.zombies[j].x, s.zombies[j].y, '#ff6b6b', 6)
              s.zombies.splice(j, 1)
              s.score += 15
            }
          }
          addParticles(s.particles, item.x, item.y, '#ff6b6b', 15)
        }
        s.items.splice(i, 1)
        s.score += 5
      }
    }

    // Particles
    for (let i = s.particles.length - 1; i >= 0; i--) {
      const pt = s.particles[i]
      pt.x += pt.vx
      pt.y += pt.vy
      pt.life--
      if (pt.life <= 0) s.particles.splice(i, 1)
    }

    // Survival score
    if (s.frame % 60 === 0) s.score += 1 + Math.floor(s.time / 600)

    // Death
    if (p.hp <= 0) {
      p.hp = 0
      s.gameOver = true
      onGameOver(s.score)
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
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault()
      if (e.code === 'KeyR' && stateRef.current.gameOver) startGame()
    }
    const handleKeyUp = (e: KeyboardEvent) => { keysRef.current.delete(e.code) }
    const handleClick = () => {
      if (!stateRef.current.playing) startGame()
      el.focus()
    }

    el.addEventListener('keydown', handleKeyDown)
    el.addEventListener('keyup', handleKeyUp)
    el.addEventListener('click', handleClick)

    return () => {
      cancelAnimationFrame(rafRef.current)
      el.removeEventListener('keydown', handleKeyDown)
      el.removeEventListener('keyup', handleKeyUp)
      el.removeEventListener('click', handleClick)
    }
  }, [startGame, tick])

  return (
    <div ref={containerRef} tabIndex={0} className="outline-none cursor-pointer">
      <canvas ref={canvasRef} width={CW} height={CH} className="w-full border-0" style={{ background: '#1a1a1a' }} />
    </div>
  )
}

export function ZombieInfo({ score, bestScore }: { score: number | null; bestScore: number }) {
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
          <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">WASD</kbd>{' / '}
          <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">←→↑↓</kbd>{' '}
          {t('game.zombie.moveHint')}
        </p>
        <p className="text-muted-foreground/70">
          💊 {t('game.zombie.healDesc')} &nbsp;
          ⚡ {t('game.zombie.speedDesc')} &nbsp;
          🛡 {t('game.zombie.shieldDesc')} &nbsp;
          💥 {t('game.zombie.bombDesc')}
        </p>
      </div>
    </>
  )
}
