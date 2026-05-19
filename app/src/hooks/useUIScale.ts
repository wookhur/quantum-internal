import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'

export type UIScale = 'small' | 'medium' | 'large'

const SCALE_MAP: Record<UIScale, number> = {
  small: 16,   // default browser
  medium: 17,
  large: 18,
}

function getStorageKey(userId?: string) {
  return `ui-scale-${userId || 'default'}`
}

export function useUIScale() {
  const { user } = useAuth()
  const key = getStorageKey(user?.id)

  const [scale, setScaleState] = useState<UIScale>(() => {
    try {
      return (localStorage.getItem(key) as UIScale) || 'small'
    } catch {
      return 'small'
    }
  })

  // Re-read when user changes
  useEffect(() => {
    try {
      const saved = localStorage.getItem(key) as UIScale | null
      setScaleState(saved || 'small')
    } catch {
      setScaleState('small')
    }
  }, [key])

  // Apply to document root
  useEffect(() => {
    document.documentElement.style.fontSize = `${SCALE_MAP[scale]}px`
    return () => {
      document.documentElement.style.fontSize = ''
    }
  }, [scale])

  const setScale = useCallback(
    (newScale: UIScale) => {
      setScaleState(newScale)
      try {
        localStorage.setItem(key, newScale)
      } catch {
        // localStorage not available
      }
    },
    [key],
  )

  return { scale, setScale }
}

export const UI_SCALE_OPTIONS: { value: UIScale; labelKo: string; labelEn: string }[] = [
  { value: 'small', labelKo: '작게 (기본)', labelEn: 'Small (Default)' },
  { value: 'medium', labelKo: '보통', labelEn: 'Medium' },
  { value: 'large', labelKo: '크게', labelEn: 'Large' },
]
