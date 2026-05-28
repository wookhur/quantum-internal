import { useEffect, useRef, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Trophy, Gamepad2, Loader2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useT } from '@/i18n/LanguageContext'
import { useGameLeaderboard, useSubmitScore } from '@/hooks/useGameLeaderboard'

// ─── Simple Dino Runner (pure canvas, no external deps) ───

interface Obstacle {
  x: number
  w: number
  h: number
  y: number
  type: 'cactus' | 'bird'
}

interface GameState {
  dino: { y: number; vy: number; ducking: boolean; grounded: boolean }
  obstacles: Obstacle[]
  ground: number
  speed: number
  score: number
  highScore: number
  playing: boolean
  gameOver: boolean
  frame: number
  /** Distance since last obstacle spawn */
  distSinceSpawn: number
}

const CANVAS_W = 800
const CANVAS_H = 200
const GROUND_Y = 160
const DINO_W = 30
const DINO_H = 40
const DINO_DUCK_H = 20
const GRAVITY = 0.9
const JUMP_VEL = -12.5
const FAST_FALL_GRAVITY = 2.0

/** Bird altitude variants */
const BIRD_Y_LOW = GROUND_Y - 30   // must duck
const BIRD_Y_MID = GROUND_Y - 55   // can duck or jump
const BIRD_Y_HIGH = GROUND_Y - 80  // can run under

function initState(): GameState {
  return {
    dino: { y: GROUND_Y - DINO_H, vy: 0, ducking: false, grounded: true },
    obstacles: [],
    ground: 0,
    speed: 5,
    score: 0,
    highScore: 0,
    playing: false,
    gameOver: false,
    frame: 0,
    distSinceSpawn: 0,
  }
}

function drawGame(ctx: CanvasRenderingContext2D, s: GameState, labels?: { gameOver: string; restart: string; start: string }) {
  const w = ctx.canvas.width
  const h = ctx.canvas.height

  // Clear
  ctx.fillStyle = '#f7f7f7'
  ctx.fillRect(0, 0, w, h)

  // Ground
  ctx.strokeStyle = '#535353'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, GROUND_Y)
  ctx.lineTo(w, GROUND_Y)
  ctx.stroke()

  // Ground texture
  ctx.fillStyle = '#d0d0d0'
  for (let i = 0; i < w; i += 12) {
    const gx = (i + Math.floor(s.ground)) % w
    if (Math.random() > 0.7) ctx.fillRect(gx, GROUND_Y + 2, 4, 1)
  }

  // Dino
  const dinoH = s.dino.ducking ? DINO_DUCK_H : DINO_H
  const dinoY = s.dino.ducking ? GROUND_Y - DINO_DUCK_H : s.dino.y
  ctx.fillStyle = '#535353'

  // Body
  ctx.fillRect(50, dinoY, DINO_W, dinoH)

  // Eye
  ctx.fillStyle = '#f7f7f7'
  ctx.fillRect(68, dinoY + 4, 4, 4)

  // Legs (animated)
  ctx.fillStyle = '#535353'
  if (s.playing && s.dino.grounded) {
    if (Math.floor(s.frame / 4) % 2 === 0) {
      ctx.fillRect(55, dinoY + dinoH, 5, 6)
      ctx.fillRect(67, dinoY + dinoH, 5, 4)
    } else {
      ctx.fillRect(55, dinoY + dinoH, 5, 4)
      ctx.fillRect(67, dinoY + dinoH, 5, 6)
    }
  } else {
    ctx.fillRect(55, dinoY + dinoH, 5, 5)
    ctx.fillRect(67, dinoY + dinoH, 5, 5)
  }

  // Obstacles
  s.obstacles.forEach(o => {
    if (o.type === 'cactus') {
      ctx.fillStyle = '#535353'
      ctx.fillRect(o.x, o.y, o.w, o.h)
      if (o.h > 25) {
        ctx.fillRect(o.x - 4, o.y + 8, 4, 10)
        ctx.fillRect(o.x + o.w, o.y + 12, 4, 8)
      }
    } else {
      // Bird — draw as a simple pterodactyl shape
      ctx.fillStyle = '#535353'
      const bx = o.x
      const by = o.y
      // Body
      ctx.fillRect(bx + 6, by + 8, 20, 8)
      // Head
      ctx.fillRect(bx + 26, by + 6, 8, 8)
      // Beak
      ctx.fillRect(bx + 34, by + 8, 6, 4)
      // Eye
      ctx.fillStyle = '#f7f7f7'
      ctx.fillRect(bx + 30, by + 7, 3, 3)
      // Wings (animated)
      ctx.fillStyle = '#535353'
      if (Math.floor(s.frame / 8) % 2 === 0) {
        // Wings up
        ctx.fillRect(bx + 8, by, 14, 8)
      } else {
        // Wings down
        ctx.fillRect(bx + 8, by + 16, 14, 8)
      }
    }
  })

  // Clouds
  ctx.fillStyle = '#e0e0e0'
  const cloudPositions = [100, 300, 550, 720]
  cloudPositions.forEach((cx, i) => {
    const cy = 30 + (i % 3) * 20
    const cxOffset = (cx - s.ground * 0.3) % (w + 100)
    ctx.beginPath()
    ctx.ellipse(cxOffset, cy, 25, 8, 0, 0, Math.PI * 2)
    ctx.fill()
  })

  // Score
  ctx.fillStyle = '#535353'
  ctx.font = '14px monospace'
  ctx.textAlign = 'right'
  ctx.fillText(`HI ${String(s.highScore).padStart(5, '0')}  ${String(s.score).padStart(5, '0')}`, w - 10, 25)

  // Game Over
  if (s.gameOver) {
    ctx.fillStyle = '#535353'
    ctx.font = 'bold 20px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('GAME OVER', w / 2, h / 2 - 15)
    ctx.font = '13px sans-serif'
    ctx.fillText(labels?.restart || 'Press Space to restart', w / 2, h / 2 + 10)
  }

  // Start
  if (!s.playing && !s.gameOver) {
    ctx.fillStyle = '#535353'
    ctx.font = 'bold 16px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(labels?.start || 'Press Space to start!', w / 2, h / 2)
  }
}

function DinoCanvas({ onGameOver }: { onGameOver: (score: number, hi: number) => void }) {
  const t = useT()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stateRef = useRef<GameState>(initState())
  const rafRef = useRef<number>(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const keysRef = useRef<Set<string>>(new Set())
  const labelsRef = useRef({ gameOver: 'GAME OVER', restart: t('game.pressSpaceToRestart'), start: t('game.pressSpaceToStart') })
  labelsRef.current = { gameOver: 'GAME OVER', restart: t('game.pressSpaceToRestart'), start: t('game.pressSpaceToStart') }

  const tick = useCallback(() => {
    const s = stateRef.current
    if (!s.playing) return

    s.frame++
    s.ground += s.speed
    s.score = Math.floor(s.ground / 10)

    // Speed up over time (capped)
    s.speed = Math.min(5 + s.score * 0.004, 14)

    // Dino physics
    const isDownHeld = keysRef.current.has('ArrowDown')
    const gravity = isDownHeld && !s.dino.grounded ? FAST_FALL_GRAVITY : GRAVITY

    if (!s.dino.grounded) {
      s.dino.vy += gravity
    }
    s.dino.y += s.dino.vy

    if (s.dino.y >= GROUND_Y - DINO_H) {
      s.dino.y = GROUND_Y - DINO_H
      s.dino.vy = 0
      s.dino.grounded = true
    } else {
      s.dino.grounded = false
    }

    // Ducking only on the ground
    s.dino.ducking = isDownHeld && s.dino.grounded

    // Track distance since last spawn
    s.distSinceSpawn += s.speed

    // Minimum gap scales with speed so player always has time to react
    const minGap = 180 + s.speed * 18

    if (s.distSinceSpawn >= minGap) {
      const spawnChance = 0.03 + s.speed * 0.003
      if (Math.random() < spawnChance) {
        s.distSinceSpawn = 0

        // After score 80 start introducing birds, ramp up probability
        const birdChance = s.score > 80 ? Math.min((s.score - 80) * 0.003, 0.5) : 0
        const isBird = Math.random() < birdChance

        if (isBird) {
          const altitudes = [BIRD_Y_LOW, BIRD_Y_MID, BIRD_Y_HIGH]
          const by = altitudes[Math.floor(Math.random() * altitudes.length)]
          s.obstacles.push({ x: CANVAS_W + 20, w: 40, h: 24, y: by, type: 'bird' })
        } else {
          const h = 20 + Math.random() * 25
          s.obstacles.push({ x: CANVAS_W + 20, w: 12 + Math.random() * 10, h, y: GROUND_Y - h, type: 'cactus' })
        }
      }
    }

    // Move obstacles
    s.obstacles.forEach(o => { o.x -= s.speed })
    s.obstacles = s.obstacles.filter(o => o.x + o.w > -20)

    // Collision
    const dinoH = s.dino.ducking ? DINO_DUCK_H : DINO_H
    const dinoY = s.dino.ducking ? GROUND_Y - DINO_DUCK_H : s.dino.y
    // Slightly forgiving hitbox (shrink by 6px each side)
    const dinoBox = { x: 54, y: dinoY + 4, w: DINO_W - 8, h: dinoH - 8 }

    for (const o of s.obstacles) {
      // Obstacle hitbox — slightly forgiving too
      const ox = o.type === 'bird' ? o.x + 6 : o.x + 2
      const ow = o.type === 'bird' ? o.w - 12 : o.w - 4
      const oy = o.y + 2
      const oh = o.h - 4

      if (
        dinoBox.x < ox + ow &&
        dinoBox.x + dinoBox.w > ox &&
        dinoBox.y < oy + oh &&
        dinoBox.y + dinoBox.h > oy
      ) {
        s.playing = false
        s.gameOver = true
        s.highScore = Math.max(s.highScore, s.score)
        onGameOver(s.score, s.highScore)
        break
      }
    }

    // Draw
    const ctx = canvasRef.current?.getContext('2d')
    if (ctx) drawGame(ctx, s, labelsRef.current)

    if (s.playing) rafRef.current = requestAnimationFrame(tick)
  }, [onGameOver])

  const start = useCallback(() => {
    const s = stateRef.current
    if (s.playing) return

    const hi = s.highScore
    Object.assign(s, initState())
    s.highScore = hi
    s.playing = true
    rafRef.current = requestAnimationFrame(tick)
  }, [tick])

  const handleKey = useCallback((e: KeyboardEvent) => {
    const s = stateRef.current
    if (e.code === 'Space' || e.code === 'ArrowUp') {
      e.preventDefault()
      if (!s.playing) {
        start()
        return
      }
      // Jump — only when grounded
      if (s.dino.grounded) {
        s.dino.vy = JUMP_VEL
        s.dino.grounded = false
        s.dino.ducking = false
      }
    }
    if (e.code === 'ArrowDown') {
      e.preventDefault()
      keysRef.current.add('ArrowDown')
    }
  }, [start])

  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    if (e.code === 'ArrowDown') {
      keysRef.current.delete('ArrowDown')
    }
  }, [])

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d')
    if (ctx) drawGame(ctx, stateRef.current, labelsRef.current)

    const el = containerRef.current
    if (el) {
      el.addEventListener('keydown', handleKey as EventListener)
      el.addEventListener('keyup', handleKeyUp as EventListener)
    }
    return () => {
      cancelAnimationFrame(rafRef.current)
      if (el) {
        el.removeEventListener('keydown', handleKey as EventListener)
        el.removeEventListener('keyup', handleKeyUp as EventListener)
      }
    }
  }, [handleKey, handleKeyUp])

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      className="outline-none cursor-pointer"
      onClick={() => containerRef.current?.focus()}
    >
      <canvas
        ref={canvasRef}
        width={CANVAS_W}
        height={CANVAS_H}
        className="w-full border-0"
        style={{ background: '#f7f7f7', imageRendering: 'pixelated' }}
      />
    </div>
  )
}

// ─── Main Page ───

export function GamePage() {
  const t = useT()
  const [lastScore, setLastScore] = useState<number | null>(null)
  const [highScore, setHighScore] = useState(0)
  const { user } = useAuth()
  const { data: leaderboard = [], isLoading } = useGameLeaderboard()
  const submitScore = useSubmitScore()

  const handleGameOver = useCallback((score: number, hi: number) => {
    setLastScore(score)
    setHighScore(prev => Math.max(prev, hi))
    if (user && score > 0) {
      submitScore.mutate({ userId: user.id, score })
    }
  }, [user, submitScore])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Gamepad2 className="size-6" /> T-Rex Runner
        </h1>
        <p className="text-muted-foreground">{t('game.subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Game Area */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              <DinoCanvas onGameOver={handleGameOver} />
            </CardContent>
          </Card>

          {/* Score Display */}
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
              <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">↑</kbd> {t('game.jump')} &nbsp;|&nbsp;{' '}
              <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">↓</kbd> {t('game.duck')}
              &nbsp;|&nbsp; {t('game.clickToFocus')}
            </p>
          </div>
        </div>

        {/* Leaderboard */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Trophy className="size-4 text-warning" /> {t('game.leaderboard')}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
              </div>
            ) : leaderboard.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">
                {t('game.noRecords')}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10 text-center">#</TableHead>
                    <TableHead>{t('game.colName')}</TableHead>
                    <TableHead className="text-right">{t('game.colScore')}</TableHead>
                    <TableHead className="text-right w-16">{t('game.colDate')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leaderboard.map((entry, idx) => {
                    const isMe = entry.userId === user?.id
                    return (
                      <TableRow key={`${entry.userId}-${entry.score}-${idx}`} className={isMe ? 'bg-primary/5' : ''}>
                        <TableCell className="text-center">
                          {entry.rank === 1 ? <span className="text-lg">🥇</span> :
                           entry.rank === 2 ? <span className="text-lg">🥈</span> :
                           entry.rank === 3 ? <span className="text-lg">🥉</span> :
                           <span className="text-sm text-muted-foreground">{entry.rank}</span>}
                        </TableCell>
                        <TableCell className={`text-sm font-medium ${isMe ? 'text-primary' : ''}`}>
                          {entry.name}
                          {isMe && <Badge className="ml-1.5 text-[9px] px-1 py-0 bg-primary">{t('game.me')}</Badge>}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm font-semibold">{entry.score.toLocaleString()}</TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">{entry.date}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
