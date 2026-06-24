import { useEffect, useRef, useState, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useT } from '@/i18n/LanguageContext'
import { RotateCcw } from 'lucide-react'

const SIZE = 4
const CELL_SIZE = 100
const GAP = 12
const BOARD_SIZE = SIZE * CELL_SIZE + (SIZE + 1) * GAP

type Grid = number[][]

const TILE_COLORS: Record<number, { bg: string; text: string; fontSize: number }> = {
  0: { bg: '#cdc1b4', text: '', fontSize: 0 },
  2: { bg: '#eee4da', text: '#776e65', fontSize: 40 },
  4: { bg: '#ede0c8', text: '#776e65', fontSize: 40 },
  8: { bg: '#f2b179', text: '#f9f6f2', fontSize: 40 },
  16: { bg: '#f59563', text: '#f9f6f2', fontSize: 36 },
  32: { bg: '#f67c5f', text: '#f9f6f2', fontSize: 36 },
  64: { bg: '#f65e3b', text: '#f9f6f2', fontSize: 36 },
  128: { bg: '#edcf72', text: '#f9f6f2', fontSize: 32 },
  256: { bg: '#edcc61', text: '#f9f6f2', fontSize: 32 },
  512: { bg: '#edc850', text: '#f9f6f2', fontSize: 32 },
  1024: { bg: '#edc53f', text: '#f9f6f2', fontSize: 26 },
  2048: { bg: '#edc22e', text: '#f9f6f2', fontSize: 26 },
}

function getTileStyle(val: number) {
  if (TILE_COLORS[val]) return TILE_COLORS[val]
  return { bg: '#3c3a32', text: '#f9f6f2', fontSize: 22 }
}

function emptyGrid(): Grid {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(0))
}

function cloneGrid(g: Grid): Grid {
  return g.map(r => [...r])
}

function addRandomTile(g: Grid): boolean {
  const empty: [number, number][] = []
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++)
      if (g[r][c] === 0) empty.push([r, c])
  if (empty.length === 0) return false
  const [r, c] = empty[Math.floor(Math.random() * empty.length)]
  g[r][c] = Math.random() < 0.9 ? 2 : 4
  return true
}

function slideRow(row: number[]): { newRow: number[]; score: number; moved: boolean } {
  const filtered = row.filter(v => v !== 0)
  const result: number[] = []
  let score = 0
  let i = 0
  while (i < filtered.length) {
    if (i + 1 < filtered.length && filtered[i] === filtered[i + 1]) {
      const merged = filtered[i] * 2
      result.push(merged)
      score += merged
      i += 2
    } else {
      result.push(filtered[i])
      i++
    }
  }
  while (result.length < SIZE) result.push(0)
  const moved = row.some((v, idx) => v !== result[idx])
  return { newRow: result, score, moved }
}

function moveGrid(grid: Grid, dir: 'left' | 'right' | 'up' | 'down'): { newGrid: Grid; score: number; moved: boolean } {
  const g = cloneGrid(grid)
  let totalScore = 0
  let anyMoved = false

  if (dir === 'left') {
    for (let r = 0; r < SIZE; r++) {
      const { newRow, score, moved } = slideRow(g[r])
      g[r] = newRow
      totalScore += score
      if (moved) anyMoved = true
    }
  } else if (dir === 'right') {
    for (let r = 0; r < SIZE; r++) {
      const { newRow, score, moved } = slideRow([...g[r]].reverse())
      g[r] = newRow.reverse()
      totalScore += score
      if (moved) anyMoved = true
    }
  } else if (dir === 'up') {
    for (let c = 0; c < SIZE; c++) {
      const col = Array.from({ length: SIZE }, (_, r) => g[r][c])
      const { newRow, score, moved } = slideRow(col)
      for (let r = 0; r < SIZE; r++) g[r][c] = newRow[r]
      totalScore += score
      if (moved) anyMoved = true
    }
  } else {
    for (let c = 0; c < SIZE; c++) {
      const col = Array.from({ length: SIZE }, (_, r) => g[r][c]).reverse()
      const { newRow, score, moved } = slideRow(col)
      const reversed = newRow.reverse()
      for (let r = 0; r < SIZE; r++) g[r][c] = reversed[r]
      totalScore += score
      if (moved) anyMoved = true
    }
  }

  return { newGrid: g, score: totalScore, moved: anyMoved }
}

function canMove(grid: Grid): boolean {
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++) {
      if (grid[r][c] === 0) return true
      if (c + 1 < SIZE && grid[r][c] === grid[r][c + 1]) return true
      if (r + 1 < SIZE && grid[r][c] === grid[r + 1][c]) return true
    }
  return false
}

function drawBoard(ctx: CanvasRenderingContext2D, grid: Grid, score: number, gameOver: boolean, labels: { score: string; gameOver: string; restart: string }) {
  const w = BOARD_SIZE
  const h = BOARD_SIZE + 60

  ctx.fillStyle = '#faf8ef'
  ctx.fillRect(0, 0, w, h)

  // Score header
  ctx.fillStyle = '#776e65'
  ctx.font = 'bold 24px sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText(`${labels.score}: ${score}`, GAP, 38)

  // Board background
  const boardY = 55
  ctx.fillStyle = '#bbada0'
  const radius = 8
  ctx.beginPath()
  ctx.roundRect(0, boardY, w, w, radius)
  ctx.fill()

  // Tiles
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const val = grid[r][c]
      const style = getTileStyle(val)
      const x = GAP + c * (CELL_SIZE + GAP)
      const y = boardY + GAP + r * (CELL_SIZE + GAP)

      ctx.fillStyle = style.bg
      ctx.beginPath()
      ctx.roundRect(x, y, CELL_SIZE, CELL_SIZE, 4)
      ctx.fill()

      if (val > 0) {
        ctx.fillStyle = style.text
        ctx.font = `bold ${style.fontSize}px sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(String(val), x + CELL_SIZE / 2, y + CELL_SIZE / 2)
      }
    }
  }

  // Game over overlay
  if (gameOver) {
    ctx.fillStyle = 'rgba(238,228,218,0.73)'
    ctx.beginPath()
    ctx.roundRect(0, boardY, w, w, radius)
    ctx.fill()
    ctx.fillStyle = '#776e65'
    ctx.font = 'bold 36px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(labels.gameOver, w / 2, boardY + w / 2 - 20)
    ctx.font = '16px sans-serif'
    ctx.fillText(labels.restart, w / 2, boardY + w / 2 + 25)
  }
}

export function Game2048Canvas({ onGameOver }: { onGameOver: (score: number) => void }) {
  const t = useT()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gridRef = useRef<Grid>(emptyGrid())
  const scoreRef = useRef(0)
  const gameOverRef = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const [, forceUpdate] = useState(0)

  const labelsRef = useRef({
    score: t('game.score'),
    gameOver: t('game.gameOver'),
    restart: t('game.pressRToRestart'),
  })
  labelsRef.current = {
    score: t('game.score'),
    gameOver: t('game.gameOver'),
    restart: t('game.pressRToRestart'),
  }

  const redraw = useCallback(() => {
    const ctx = canvasRef.current?.getContext('2d')
    if (ctx) drawBoard(ctx, gridRef.current, scoreRef.current, gameOverRef.current, labelsRef.current)
  }, [])

  const initGame = useCallback(() => {
    const g = emptyGrid()
    addRandomTile(g)
    addRandomTile(g)
    gridRef.current = g
    scoreRef.current = 0
    gameOverRef.current = false
    redraw()
    forceUpdate(n => n + 1)
  }, [redraw])

  const handleMove = useCallback((dir: 'left' | 'right' | 'up' | 'down') => {
    if (gameOverRef.current) return
    const { newGrid, score, moved } = moveGrid(gridRef.current, dir)
    if (!moved) return
    gridRef.current = newGrid
    scoreRef.current += score
    addRandomTile(newGrid)
    if (!canMove(newGrid)) {
      gameOverRef.current = true
      onGameOver(scoreRef.current)
    }
    redraw()
    forceUpdate(n => n + 1)
  }, [onGameOver, redraw])

  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.code === 'KeyR') { initGame(); return }
    if (gameOverRef.current) return
    const map: Record<string, 'left' | 'right' | 'up' | 'down'> = {
      ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
      KeyA: 'left', KeyD: 'right', KeyW: 'up', KeyS: 'down',
    }
    const dir = map[e.code]
    if (dir) { e.preventDefault(); handleMove(dir) }
  }, [handleMove, initGame])

  // Touch/swipe support
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)

  const handleTouchStart = useCallback((e: TouchEvent) => {
    const touch = e.touches[0]
    touchStartRef.current = { x: touch.clientX, y: touch.clientY }
  }, [])

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    if (!touchStartRef.current) return
    const touch = e.changedTouches[0]
    const dx = touch.clientX - touchStartRef.current.x
    const dy = touch.clientY - touchStartRef.current.y
    touchStartRef.current = null
    const minSwipe = 30
    if (Math.abs(dx) > Math.abs(dy)) {
      if (Math.abs(dx) > minSwipe) handleMove(dx > 0 ? 'right' : 'left')
    } else {
      if (Math.abs(dy) > minSwipe) handleMove(dy > 0 ? 'down' : 'up')
    }
    e.preventDefault()
  }, [handleMove])

  useEffect(() => {
    initGame()
  }, [initGame])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.addEventListener('keydown', handleKey as EventListener)
    el.addEventListener('touchstart', handleTouchStart as EventListener, { passive: true })
    el.addEventListener('touchend', handleTouchEnd as EventListener, { passive: false })
    return () => {
      el.removeEventListener('keydown', handleKey as EventListener)
      el.removeEventListener('touchstart', handleTouchStart as EventListener)
      el.removeEventListener('touchend', handleTouchEnd as EventListener)
    }
  }, [handleKey, handleTouchStart, handleTouchEnd])

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      className="outline-none cursor-pointer flex flex-col items-center"
      onClick={() => containerRef.current?.focus()}
    >
      <canvas
        ref={canvasRef}
        width={BOARD_SIZE}
        height={BOARD_SIZE + 60}
        className="max-w-full border-0"
        style={{ background: '#faf8ef' }}
      />
    </div>
  )
}

export function Game2048Info({ score, bestScore }: { score: number | null; bestScore: number }) {
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
          <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">←→↑↓</kbd>{' '}
          {t('game.2048.moveHint')} &nbsp;|&nbsp;{' '}
          <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">R</kbd>{' '}
          {t('game.2048.restartHint')}
        </p>
      </div>
    </>
  )
}

export function Game2048ResetButton({ onReset }: { onReset: () => void }) {
  const t = useT()
  return (
    <Button variant="outline" size="sm" className="gap-1.5" onClick={onReset}>
      <RotateCcw className="size-3.5" />
      {t('game.2048.newGame')}
    </Button>
  )
}
