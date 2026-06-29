import { useEffect, useRef, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { useT } from '@/i18n/LanguageContext'

// ─── World / Viewport ───
const CW = 700
const CH = 500
const WORLD_W = 2400
const WORLD_H = 2400
const SEG_SPACING = 6
const HEAD_RADIUS = 9
const BASE_SPEED = 2.4
const BOOST_SPEED = 4.2
const TURN_RATE = 0.12
const FOOD_COUNT_TARGET = 380
const FOOD_RADIUS = 4
const BONUS_RADIUS = 6
const STARTING_LENGTH = 18
const MIN_LENGTH = 12
const BOOST_DRAIN_FRAMES = 18 // every N frames while boosting, lose 1 length
const AI_COUNT = 7

interface Pt { x: number; y: number }
interface Food { x: number; y: number; color: string; value: number; r: number }

interface Snake {
  id: number
  isPlayer: boolean
  alive: boolean
  segments: Pt[]      // index 0 = head
  angle: number       // radians
  targetAngle: number
  length: number      // target length (segments grow toward this)
  speed: number
  boosting: boolean
  boostFrames: number
  color: string
  outline: string
  name: string
  // AI wander state
  wanderTimer: number
  wanderAngle: number
}

interface SState {
  snakes: Snake[]
  food: Food[]
  score: number
  best: number
  playing: boolean
  gameOver: boolean
  cameraX: number
  cameraY: number
  mouseX: number
  mouseY: number
  frame: number
  nextSnakeId: number
}

const SNAKE_COLORS: { body: string; outline: string }[] = [
  { body: '#4ade80', outline: '#166534' }, // player green
  { body: '#60a5fa', outline: '#1e3a8a' },
  { body: '#f472b6', outline: '#9d174d' },
  { body: '#fb923c', outline: '#9a3412' },
  { body: '#a78bfa', outline: '#5b21b6' },
  { body: '#facc15', outline: '#854d0e' },
  { body: '#22d3ee', outline: '#155e75' },
  { body: '#f87171', outline: '#991b1b' },
  { body: '#34d399', outline: '#065f46' },
]

const AI_NAMES = ['BotZilla', 'Wormy', 'Slither', 'Viper', 'Hisss', 'Mamba', 'Cobra', 'Anaconda', 'Python']

function rand(min: number, max: number) {
  return min + Math.random() * (max - min)
}

function randFoodColor() {
  const colors = ['#fde047', '#f472b6', '#60a5fa', '#a78bfa', '#fb7185', '#34d399', '#fbbf24']
  return colors[Math.floor(Math.random() * colors.length)]
}

function spawnFood(): Food {
  const isBonus = Math.random() < 0.05
  return {
    x: rand(20, WORLD_W - 20),
    y: rand(20, WORLD_H - 20),
    color: isBonus ? '#ffd700' : randFoodColor(),
    value: isBonus ? 3 : 1,
    r: isBonus ? BONUS_RADIUS : FOOD_RADIUS,
  }
}

function spawnSnake(id: number, isPlayer: boolean, color: { body: string; outline: string }, name: string): Snake {
  const x = isPlayer ? WORLD_W / 2 : rand(100, WORLD_W - 100)
  const y = isPlayer ? WORLD_H / 2 : rand(100, WORLD_H - 100)
  const angle = rand(0, Math.PI * 2)
  const segments: Pt[] = []
  for (let i = 0; i < STARTING_LENGTH; i++) {
    segments.push({ x: x - Math.cos(angle) * i * SEG_SPACING, y: y - Math.sin(angle) * i * SEG_SPACING })
  }
  return {
    id,
    isPlayer,
    alive: true,
    segments,
    angle,
    targetAngle: angle,
    length: STARTING_LENGTH,
    speed: BASE_SPEED,
    boosting: false,
    boostFrames: 0,
    color: color.body,
    outline: color.outline,
    name,
    wanderTimer: 0,
    wanderAngle: angle,
  }
}

function init(best = 0): SState {
  const snakes: Snake[] = [spawnSnake(0, true, SNAKE_COLORS[0], 'You')]
  for (let i = 0; i < AI_COUNT; i++) {
    const c = SNAKE_COLORS[(i + 1) % SNAKE_COLORS.length]
    snakes.push(spawnSnake(i + 1, false, c, AI_NAMES[i % AI_NAMES.length]))
  }
  const food: Food[] = []
  for (let i = 0; i < FOOD_COUNT_TARGET; i++) food.push(spawnFood())
  return {
    snakes,
    food,
    score: 0,
    best,
    playing: false,
    gameOver: false,
    cameraX: WORLD_W / 2,
    cameraY: WORLD_H / 2,
    mouseX: CW / 2,
    mouseY: CH / 2,
    frame: 0,
    nextSnakeId: AI_COUNT + 1,
  }
}

function shortestAngleDelta(from: number, to: number): number {
  let d = to - from
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return d
}

function killSnake(s: Snake, food: Food[]) {
  s.alive = false
  // Drop food along body
  for (let i = 0; i < s.segments.length; i += 2) {
    const seg = s.segments[i]
    food.push({
      x: seg.x + rand(-4, 4),
      y: seg.y + rand(-4, 4),
      color: s.color,
      value: 2,
      r: FOOD_RADIUS + 1,
    })
  }
}

function checkCollision(head: Pt, headR: number, other: Snake): boolean {
  // skip first 3 segments (own neck) — caller handles
  for (let i = 3; i < other.segments.length; i++) {
    const seg = other.segments[i]
    const dx = head.x - seg.x
    const dy = head.y - seg.y
    if (dx * dx + dy * dy < (headR + HEAD_RADIUS * 0.85) * (headR + HEAD_RADIUS * 0.85)) {
      return true
    }
  }
  return false
}

function nearestFood(s: Snake, food: Food[], maxDist: number): Food | null {
  const head = s.segments[0]
  let best: Food | null = null
  let bestD = maxDist * maxDist
  for (const f of food) {
    const dx = f.x - head.x
    const dy = f.y - head.y
    const d2 = dx * dx + dy * dy
    if (d2 < bestD) { bestD = d2; best = f }
  }
  return best
}

function updateAI(s: Snake, snakes: Snake[], food: Food[]) {
  const head = s.segments[0]
  s.wanderTimer--

  // Danger detection: scan for snake bodies ahead
  const lookAhead = 50
  const dangerR = 40
  const fx = head.x + Math.cos(s.angle) * lookAhead
  const fy = head.y + Math.sin(s.angle) * lookAhead
  let danger = false
  for (const other of snakes) {
    if (!other.alive || other.id === s.id) continue
    for (let i = 0; i < other.segments.length; i += 2) {
      const seg = other.segments[i]
      const dx = fx - seg.x
      const dy = fy - seg.y
      if (dx * dx + dy * dy < dangerR * dangerR) {
        danger = true
        // Turn away
        const awayAngle = Math.atan2(head.y - seg.y, head.x - seg.x)
        s.targetAngle = awayAngle
        break
      }
    }
    if (danger) break
  }

  // Wall avoidance
  const wallMargin = 80
  if (head.x < wallMargin) s.targetAngle = 0
  else if (head.x > WORLD_W - wallMargin) s.targetAngle = Math.PI
  else if (head.y < wallMargin) s.targetAngle = Math.PI / 2
  else if (head.y > WORLD_H - wallMargin) s.targetAngle = -Math.PI / 2
  else if (!danger) {
    // Seek food
    const f = nearestFood(s, food, 200)
    if (f) {
      s.targetAngle = Math.atan2(f.y - head.y, f.x - head.x)
    } else if (s.wanderTimer <= 0) {
      s.wanderAngle += rand(-0.5, 0.5)
      s.targetAngle = s.wanderAngle
      s.wanderTimer = 60 + Math.floor(Math.random() * 60)
    }
  }

  // Occasional boost
  s.boosting = s.length > MIN_LENGTH + 5 && Math.random() < 0.005
}

function step(s: SState, onGameOver: (score: number) => void) {
  s.frame++

  // Replenish food
  if (s.food.length < FOOD_COUNT_TARGET && Math.random() < 0.4) {
    s.food.push(spawnFood())
  }

  // Player aim from mouse
  const player = s.snakes[0]
  if (player.alive) {
    const head = player.segments[0]
    const worldMouseX = s.cameraX - CW / 2 + s.mouseX
    const worldMouseY = s.cameraY - CH / 2 + s.mouseY
    player.targetAngle = Math.atan2(worldMouseY - head.y, worldMouseX - head.x)
  }

  // Update each snake
  for (const snake of s.snakes) {
    if (!snake.alive) continue
    if (!snake.isPlayer) updateAI(snake, s.snakes, s.food)

    // Smooth turn
    const delta = shortestAngleDelta(snake.angle, snake.targetAngle)
    const maxTurn = TURN_RATE
    snake.angle += Math.max(-maxTurn, Math.min(maxTurn, delta))

    // Boost
    const canBoost = snake.length > MIN_LENGTH
    const boosting = snake.boosting && canBoost
    snake.speed = boosting ? BOOST_SPEED : BASE_SPEED
    if (boosting) {
      snake.boostFrames++
      if (snake.boostFrames >= BOOST_DRAIN_FRAMES) {
        snake.boostFrames = 0
        snake.length = Math.max(MIN_LENGTH, snake.length - 1)
        // Drop a tiny food at tail when boosting
        const tail = snake.segments[snake.segments.length - 1]
        if (tail) {
          s.food.push({
            x: tail.x + rand(-3, 3),
            y: tail.y + rand(-3, 3),
            color: snake.color,
            value: 1,
            r: FOOD_RADIUS,
          })
        }
      }
    } else {
      snake.boostFrames = 0
    }

    // Move head
    const head = snake.segments[0]
    const nx = head.x + Math.cos(snake.angle) * snake.speed
    const ny = head.y + Math.sin(snake.angle) * snake.speed

    // Wall collision = death
    if (nx < 0 || nx > WORLD_W || ny < 0 || ny > WORLD_H) {
      killSnake(snake, s.food)
      if (snake.isPlayer) {
        s.gameOver = true
        s.playing = false
        s.best = Math.max(s.best, s.score)
        onGameOver(s.score)
      }
      continue
    }

    const newHead: Pt = { x: nx, y: ny }
    snake.segments.unshift(newHead)
    // Trim to length
    while (snake.segments.length > snake.length) snake.segments.pop()

    // Eat food
    for (let i = s.food.length - 1; i >= 0; i--) {
      const f = s.food[i]
      const dx = f.x - newHead.x
      const dy = f.y - newHead.y
      const eatR = HEAD_RADIUS + f.r + 2
      if (dx * dx + dy * dy < eatR * eatR) {
        snake.length += f.value
        s.food.splice(i, 1)
        if (snake.isPlayer) s.score += f.value
      } else {
        // Magnet effect when very close
        const magnetR = HEAD_RADIUS * 5
        if (dx * dx + dy * dy < magnetR * magnetR) {
          const d = Math.sqrt(dx * dx + dy * dy) || 1
          f.x -= (dx / d) * 1.2
          f.y -= (dy / d) * 1.2
        }
      }
    }
  }

  // Snake-vs-snake collisions
  for (const snake of s.snakes) {
    if (!snake.alive) continue
    const head = snake.segments[0]
    for (const other of s.snakes) {
      if (!other.alive || other.id === snake.id) continue
      if (checkCollision(head, HEAD_RADIUS, other)) {
        killSnake(snake, s.food)
        if (snake.isPlayer) {
          s.gameOver = true
          s.playing = false
          s.best = Math.max(s.best, s.score)
          onGameOver(s.score)
        }
        break
      }
    }
  }

  // Respawn dead AI
  for (let i = 0; i < s.snakes.length; i++) {
    const snake = s.snakes[i]
    if (!snake.alive && !snake.isPlayer) {
      const c = SNAKE_COLORS[(s.nextSnakeId) % SNAKE_COLORS.length]
      s.snakes[i] = spawnSnake(s.nextSnakeId++, false, c, AI_NAMES[Math.floor(Math.random() * AI_NAMES.length)])
    }
  }

  // Camera follows player
  if (player.alive) {
    const head = player.segments[0]
    s.cameraX = head.x
    s.cameraY = head.y
  }
}

function draw(ctx: CanvasRenderingContext2D, s: SState, labels: Record<string, string>) {
  ctx.fillStyle = '#0a1628'
  ctx.fillRect(0, 0, CW, CH)

  const camLeft = s.cameraX - CW / 2
  const camTop = s.cameraY - CH / 2

  // Hex grid background
  ctx.strokeStyle = 'rgba(96, 165, 250, 0.07)'
  ctx.lineWidth = 1
  const gridSize = 40
  const startX = Math.floor(camLeft / gridSize) * gridSize
  const startY = Math.floor(camTop / gridSize) * gridSize
  for (let gx = startX; gx < camLeft + CW + gridSize; gx += gridSize) {
    ctx.beginPath()
    ctx.moveTo(gx - camLeft, 0)
    ctx.lineTo(gx - camLeft, CH)
    ctx.stroke()
  }
  for (let gy = startY; gy < camTop + CH + gridSize; gy += gridSize) {
    ctx.beginPath()
    ctx.moveTo(0, gy - camTop)
    ctx.lineTo(CW, gy - camTop)
    ctx.stroke()
  }

  // World border
  ctx.strokeStyle = '#ff5252'
  ctx.lineWidth = 4
  ctx.strokeRect(-camLeft, -camTop, WORLD_W, WORLD_H)
  // Glow effect
  ctx.strokeStyle = 'rgba(255, 82, 82, 0.3)'
  ctx.lineWidth = 12
  ctx.strokeRect(-camLeft, -camTop, WORLD_W, WORLD_H)
  ctx.lineWidth = 1

  // Food (only on-screen)
  for (const f of s.food) {
    const fx = f.x - camLeft
    const fy = f.y - camTop
    if (fx < -10 || fx > CW + 10 || fy < -10 || fy > CH + 10) continue
    ctx.fillStyle = f.color
    ctx.beginPath()
    ctx.arc(fx, fy, f.r, 0, Math.PI * 2)
    ctx.fill()
    // Pulse highlight
    ctx.fillStyle = 'rgba(255,255,255,0.4)'
    ctx.beginPath()
    ctx.arc(fx - f.r * 0.3, fy - f.r * 0.3, f.r * 0.4, 0, Math.PI * 2)
    ctx.fill()
  }

  // Sort snakes by length so smaller ones render first
  const sorted = [...s.snakes].filter(sn => sn.alive).sort((a, b) => a.length - b.length)

  // Snakes
  for (const snake of sorted) {
    const segs = snake.segments
    // Draw body
    for (let i = segs.length - 1; i >= 0; i--) {
      const seg = segs[i]
      const sx = seg.x - camLeft
      const sy = seg.y - camTop
      if (sx < -20 || sx > CW + 20 || sy < -20 || sy > CH + 20) continue
      const isHead = i === 0
      const r = isHead ? HEAD_RADIUS : HEAD_RADIUS - 1
      ctx.fillStyle = snake.outline
      ctx.beginPath()
      ctx.arc(sx, sy, r + 1, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = snake.color
      if (snake.boosting && i < segs.length - 1) {
        // Glow trail
        ctx.shadowBlur = 10
        ctx.shadowColor = snake.color
      } else {
        ctx.shadowBlur = 0
      }
      ctx.beginPath()
      ctx.arc(sx, sy, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.shadowBlur = 0
    }
    // Eyes on head
    const head = segs[0]
    const hx = head.x - camLeft
    const hy = head.y - camTop
    if (hx > -20 && hx < CW + 20 && hy > -20 && hy < CH + 20) {
      const eyeR = 3
      const pupilR = 1.5
      const eyeOffset = 5
      const eyeSide = 4
      const a = snake.angle
      const lex = hx + Math.cos(a - Math.PI / 2) * eyeSide + Math.cos(a) * eyeOffset * 0.3
      const ley = hy + Math.sin(a - Math.PI / 2) * eyeSide + Math.sin(a) * eyeOffset * 0.3
      const rex = hx + Math.cos(a + Math.PI / 2) * eyeSide + Math.cos(a) * eyeOffset * 0.3
      const rey = hy + Math.sin(a + Math.PI / 2) * eyeSide + Math.sin(a) * eyeOffset * 0.3
      ctx.fillStyle = '#fff'
      ctx.beginPath(); ctx.arc(lex, ley, eyeR, 0, Math.PI * 2); ctx.fill()
      ctx.beginPath(); ctx.arc(rex, rey, eyeR, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#000'
      ctx.beginPath(); ctx.arc(lex + Math.cos(a) * 1, ley + Math.sin(a) * 1, pupilR, 0, Math.PI * 2); ctx.fill()
      ctx.beginPath(); ctx.arc(rex + Math.cos(a) * 1, rey + Math.sin(a) * 1, pupilR, 0, Math.PI * 2); ctx.fill()

      // Name label
      if (!snake.isPlayer) {
        ctx.fillStyle = 'rgba(255,255,255,0.75)'
        ctx.font = '11px sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(`${snake.name} · ${snake.length}`, hx, hy - 18)
      }
    }
  }

  // HUD top bar
  ctx.fillStyle = 'rgba(0,0,0,0.55)'
  ctx.fillRect(0, 0, CW, 32)
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 14px monospace'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(`${labels.score}: ${s.score}`, 10, 16)

  const player = s.snakes[0]
  ctx.textAlign = 'center'
  ctx.fillStyle = '#4ade80'
  ctx.fillText(`${labels.length}: ${player.length}`, CW / 2, 16)

  ctx.textAlign = 'right'
  ctx.fillStyle = '#ffd93d'
  ctx.fillText(`HI ${s.best}`, CW - 10, 16)

  // Leaderboard (right side)
  const leaderboard = [...s.snakes].filter(sn => sn.alive).sort((a, b) => b.length - a.length).slice(0, 5)
  ctx.fillStyle = 'rgba(0,0,0,0.5)'
  ctx.fillRect(CW - 130, 36, 124, 16 * leaderboard.length + 12)
  ctx.font = '11px monospace'
  ctx.textAlign = 'left'
  for (let i = 0; i < leaderboard.length; i++) {
    const sn = leaderboard[i]
    ctx.fillStyle = sn.color
    ctx.fillRect(CW - 124, 42 + i * 16, 6, 6)
    ctx.fillStyle = sn.isPlayer ? '#ffd93d' : '#fff'
    ctx.fillText(`${i + 1}. ${sn.name}`, CW - 114, 47 + i * 16)
    ctx.textAlign = 'right'
    ctx.fillText(String(sn.length), CW - 12, 47 + i * 16)
    ctx.textAlign = 'left'
  }

  // Minimap
  const mmSize = 100
  const mmX = 10, mmY = CH - mmSize - 10
  ctx.fillStyle = 'rgba(0,0,0,0.55)'
  ctx.fillRect(mmX, mmY, mmSize, mmSize)
  ctx.strokeStyle = '#ff5252'
  ctx.lineWidth = 1
  ctx.strokeRect(mmX, mmY, mmSize, mmSize)
  for (const sn of s.snakes) {
    if (!sn.alive) continue
    const px = mmX + (sn.segments[0].x / WORLD_W) * mmSize
    const py = mmY + (sn.segments[0].y / WORLD_H) * mmSize
    ctx.fillStyle = sn.isPlayer ? '#ffd93d' : sn.color
    ctx.beginPath()
    ctx.arc(px, py, sn.isPlayer ? 2.5 : 1.5, 0, Math.PI * 2)
    ctx.fill()
  }

  // Start screen
  if (!s.playing && !s.gameOver) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    ctx.fillRect(0, CH / 2 - 80, CW, 160)
    ctx.fillStyle = '#4ade80'
    ctx.font = 'bold 38px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('🐍 ' + labels.title, CW / 2, CH / 2 - 25)
    ctx.fillStyle = '#fff'
    ctx.font = '15px sans-serif'
    ctx.fillText(labels.start, CW / 2, CH / 2 + 8)
    ctx.fillStyle = '#aaa'
    ctx.font = '12px sans-serif'
    ctx.fillText(labels.controls, CW / 2, CH / 2 + 32)
  }

  // Game over
  if (s.gameOver) {
    ctx.fillStyle = 'rgba(0,0,0,0.75)'
    ctx.fillRect(0, 0, CW, CH)
    ctx.fillStyle = '#ff5252'
    ctx.font = 'bold 46px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(labels.gameOver, CW / 2, CH / 2 - 50)
    ctx.fillStyle = '#fff'
    ctx.font = '22px sans-serif'
    ctx.fillText(`${labels.score}: ${s.score}`, CW / 2, CH / 2 - 5)
    ctx.fillStyle = '#ffd93d'
    ctx.font = '16px sans-serif'
    ctx.fillText(`${labels.length}: ${s.snakes[0].length}`, CW / 2, CH / 2 + 22)
    ctx.fillStyle = '#aaa'
    ctx.font = '13px sans-serif'
    ctx.fillText(labels.restart, CW / 2, CH / 2 + 58)
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

  const loop = useCallback(() => {
    const s = stateRef.current
    if (s.playing && !s.gameOver) {
      step(s, onGameOver)
    }
    const ctx = canvasRef.current?.getContext('2d')
    if (ctx) draw(ctx, s, labelsRef.current)
    rafRef.current = requestAnimationFrame(loop)
  }, [onGameOver])

  const startGame = useCallback(() => {
    const best = stateRef.current.best
    stateRef.current = init(best)
    stateRef.current.playing = true
  }, [])

  useEffect(() => {
    rafRef.current = requestAnimationFrame(loop)
    const el = containerRef.current
    const canvas = canvasRef.current
    if (!el || !canvas) return

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      const scaleX = CW / rect.width
      const scaleY = CH / rect.height
      stateRef.current.mouseX = (e.clientX - rect.left) * scaleX
      stateRef.current.mouseY = (e.clientY - rect.top) * scaleY
    }
    const handleMouseDown = (e: MouseEvent) => {
      const s = stateRef.current
      if (!s.playing || s.gameOver) { startGame(); el.focus(); return }
      if (e.button === 0) s.snakes[0].boosting = true
    }
    const handleMouseUp = (e: MouseEvent) => {
      if (e.button === 0) stateRef.current.snakes[0].boosting = false
    }
    const handleKey = (e: KeyboardEvent) => {
      const s = stateRef.current
      if (e.code === 'KeyR' && s.gameOver) { e.preventDefault(); startGame(); return }
      if (e.code === 'Space') {
        e.preventDefault()
        if (!s.playing || s.gameOver) { startGame(); return }
        s.snakes[0].boosting = true
      }
    }
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') stateRef.current.snakes[0].boosting = false
    }

    // Touch — drag to aim, hold to boost
    let touchHolding = false
    const handleTouchStart = (e: TouchEvent) => {
      const s = stateRef.current
      if (!s.playing || s.gameOver) { startGame(); return }
      const rect = canvas.getBoundingClientRect()
      const scaleX = CW / rect.width
      const scaleY = CH / rect.height
      s.mouseX = (e.touches[0].clientX - rect.left) * scaleX
      s.mouseY = (e.touches[0].clientY - rect.top) * scaleY
      touchHolding = true
      // Boost after holding 200ms
      setTimeout(() => { if (touchHolding) s.snakes[0].boosting = true }, 200)
    }
    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault()
      const rect = canvas.getBoundingClientRect()
      const scaleX = CW / rect.width
      const scaleY = CH / rect.height
      stateRef.current.mouseX = (e.touches[0].clientX - rect.left) * scaleX
      stateRef.current.mouseY = (e.touches[0].clientY - rect.top) * scaleY
    }
    const handleTouchEnd = () => {
      touchHolding = false
      stateRef.current.snakes[0].boosting = false
    }

    canvas.addEventListener('mousemove', handleMouseMove)
    canvas.addEventListener('mousedown', handleMouseDown)
    window.addEventListener('mouseup', handleMouseUp)
    el.addEventListener('keydown', handleKey)
    el.addEventListener('keyup', handleKeyUp)
    canvas.addEventListener('touchstart', handleTouchStart, { passive: true })
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false })
    canvas.addEventListener('touchend', handleTouchEnd)

    return () => {
      cancelAnimationFrame(rafRef.current)
      canvas.removeEventListener('mousemove', handleMouseMove)
      canvas.removeEventListener('mousedown', handleMouseDown)
      window.removeEventListener('mouseup', handleMouseUp)
      el.removeEventListener('keydown', handleKey)
      el.removeEventListener('keyup', handleKeyUp)
      canvas.removeEventListener('touchstart', handleTouchStart)
      canvas.removeEventListener('touchmove', handleTouchMove)
      canvas.removeEventListener('touchend', handleTouchEnd)
    }
  }, [loop, startGame])

  return (
    <div ref={containerRef} tabIndex={0} className="outline-none cursor-crosshair" onClick={() => containerRef.current?.focus()}>
      <canvas ref={canvasRef} width={CW} height={CH} className="w-full border-0" style={{ background: '#0a1628' }} />
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
          🖱️ {t('game.snake.aimHint')} &nbsp;|&nbsp;
          <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">{t('game.snake.boostKey')}</kbd>{' '}
          {t('game.snake.boostHint')}
        </p>
        <p className="text-muted-foreground/70">
          🍎 {t('game.snake.foodDesc')} &nbsp;
          ⭐ {t('game.snake.bonusDesc')} &nbsp;
          ☠️ {t('game.snake.dieDesc')}
        </p>
      </div>
    </>
  )
}
