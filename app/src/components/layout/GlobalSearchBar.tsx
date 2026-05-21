import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, User, FileText, FolderKanban, GraduationCap, Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { useGlobalSearch, type GlobalSearchResult } from '@/hooks/useGlobalSearch'
import { useT } from '@/i18n/LanguageContext'
import { getStageConfig } from '@/types'
import type { PipelineStage } from '@/types'

const TYPE_CONFIG = {
  lead: { icon: User, labelKey: 'search.lead' as const, color: 'text-blue-600', bg: 'bg-blue-50' },
  contract: { icon: FileText, labelKey: 'search.contract' as const, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  student: { icon: GraduationCap, labelKey: 'search.student' as const, color: 'text-indigo-600', bg: 'bg-indigo-50' },
  project: { icon: FolderKanban, labelKey: 'search.project' as const, color: 'text-violet-600', bg: 'bg-violet-50' },
} as const

export function GlobalSearchBar() {
  const t = useT()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [selectedIdx, setSelectedIdx] = useState(-1)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Debounce: only search after 200ms of no typing
  const [debouncedQuery, setDebouncedQuery] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 200)
    return () => clearTimeout(timer)
  }, [query])

  const { data: results = [], isFetching } = useGlobalSearch(debouncedQuery)

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Reset selection when results change
  useEffect(() => {
    setSelectedIdx(-1)
  }, [results])

  const handleSelect = useCallback(
    (item: GlobalSearchResult) => {
      navigate(item.navigateTo)
      setQuery('')
      setOpen(false)
      inputRef.current?.blur()
    },
    [navigate],
  )

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open || results.length === 0) {
      if (e.key === 'Escape') {
        setQuery('')
        setOpen(false)
        inputRef.current?.blur()
      }
      return
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIdx((prev) => (prev < results.length - 1 ? prev + 1 : 0))
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIdx((prev) => (prev > 0 ? prev - 1 : results.length - 1))
        break
      case 'Enter':
        e.preventDefault()
        if (selectedIdx >= 0 && results[selectedIdx]) {
          handleSelect(results[selectedIdx])
        }
        break
      case 'Escape':
        setQuery('')
        setOpen(false)
        inputRef.current?.blur()
        break
    }
  }

  const showDropdown = open && query.trim().length >= 1

  // Group results by type
  const grouped = results.reduce<Record<string, GlobalSearchResult[]>>((acc, item) => {
    if (!acc[item.type]) acc[item.type] = []
    acc[item.type].push(item)
    return acc
  }, {})

  // Flat list for keyboard navigation index
  let flatIdx = 0

  return (
    <div ref={wrapperRef} className="relative flex-1 max-w-md mx-auto">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400 pointer-events-none" />
      {isFetching && (
        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-gray-400 animate-spin" />
      )}
      <Input
        ref={inputRef}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => query.trim() && setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={t('search.inputPlaceholder')}
        className="pl-9 pr-9 h-9 rounded-full bg-[#F6F7FB] border-0 text-sm text-gray-700 placeholder:text-gray-400 focus-visible:ring-1 focus-visible:ring-blue-200 focus-visible:bg-white transition-colors"
      />

      {/* Dropdown */}
      {showDropdown && (
        <div className="absolute top-full left-0 right-0 mt-1.5 rounded-xl bg-white shadow-lg border border-gray-200 overflow-hidden z-50 max-h-[420px] overflow-y-auto">
          {results.length === 0 && !isFetching ? (
            <div className="px-4 py-6 text-center text-sm text-gray-400">
              {t('search.noResults')}
            </div>
          ) : results.length === 0 && isFetching ? (
            <div className="px-4 py-6 text-center text-sm text-gray-400">
              {t('search.searching')}
            </div>
          ) : (
            <>
              {(['lead', 'contract', 'project'] as const).map((type) => {
                const items = grouped[type]
                if (!items || items.length === 0) return null
                const config = TYPE_CONFIG[type]
                const Icon = config.icon

                return (
                  <div key={type}>
                    <div className="px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Icon className={`size-3 ${config.color}`} />
                      {t(config.labelKey)} ({t('search.resultCount', { n: items.length })})
                    </div>
                    {items.map((item) => {
                      const currentIdx = flatIdx++
                      return (
                        <button
                          key={item.id}
                          onClick={() => handleSelect(item)}
                          onMouseEnter={() => setSelectedIdx(currentIdx)}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                            currentIdx === selectedIdx
                              ? 'bg-blue-50'
                              : 'hover:bg-gray-50'
                          }`}
                        >
                          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${config.bg} ${config.color}`}>
                            <Icon className="size-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-gray-900 truncate">
                                {highlightMatch(item.title, query)}
                              </span>
                              {item.stage && (
                                <StageBadge type={type} stage={item.stage} />
                              )}
                            </div>
                            {(item.subtitle || item.meta) && (
                              <p className="text-xs text-gray-500 truncate mt-0.5">
                                {highlightMatch(
                                  [item.subtitle, item.meta].filter(Boolean).join(' · '),
                                  query,
                                )}
                              </p>
                            )}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )
              })}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function StageBadge({ type, stage }: { type: string; stage: string }) {
  if (type === 'lead') {
    const config = getStageConfig(stage as PipelineStage)
    return (
      <span
        className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium status-pill status-pill--${config.color.replace('stage-', '')}`}
      >
        {config.label}
      </span>
    )
  }

  // Contract / project stage labels
  const colorMap: Record<string, string> = {
    '진행 중': 'bg-blue-100 text-blue-700',
    '만료 임박': 'bg-amber-100 text-amber-700',
    '만료': 'bg-gray-100 text-gray-600',
    '취소': 'bg-red-100 text-red-600',
    '대기': 'bg-gray-100 text-gray-600',
    '완료': 'bg-green-100 text-green-700',
    '지연': 'bg-orange-100 text-orange-700',
  }

  return (
    <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${colorMap[stage] || 'bg-gray-100 text-gray-600'}`}>
      {stage}
    </span>
  )
}

function highlightMatch(text: string, query: string) {
  if (!query.trim()) return text
  const escaped = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`(${escaped})`, 'gi')
  const parts = text.split(regex)

  return parts.map((part, i) =>
    regex.test(part) ? (
      <mark key={i} className="bg-yellow-100 text-yellow-900 rounded-sm px-0.5">
        {part}
      </mark>
    ) : (
      part
    ),
  )
}
