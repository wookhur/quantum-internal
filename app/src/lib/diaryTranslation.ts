/**
 * 미팅일지 영어 번역 — 저장 형태와 '원문이 바뀌었는지' 판정
 *
 * 번역은 원문을 건드리지 않는다. service_diary.translations(jsonb) 에
 * 언어별로 따로 담고, 원문이 수정되면 그 번역은 '오래된 것'으로 표시한다.
 * 그래야 컨설턴트가 일지를 고친 뒤에도 옛 영어본이 사실인 양 남아 있지 않다.
 *
 *   translations = { "en": { fields: {...}, sourceHash: "…", translatedAt: "…" } }
 */

/** 번역 대상 텍스트 칸 — 추출 함수의 JSON 키와 같다. */
export const DIARY_TRANSLATABLE_KEYS = [
  'agendaItems', 'meetingSummary', 'extracurricularNotes', 'identityNarrativeNotes',
  'questionsConcerns', 'nextMeetingAgenda', 'followUpCommitments', 'assignments',
  'criticalDates', 'criticalIssue',
] as const

export type DiaryTextKey = (typeof DIARY_TRANSLATABLE_KEYS)[number]
export type DiaryFields = Partial<Record<DiaryTextKey, string>>

export interface DiaryTranslation {
  fields: DiaryFields
  /** 번역할 때 쓴 원문의 지문. 지금 원문과 다르면 번역이 뒤처진 것이다. */
  sourceHash: string
  translatedAt?: string
  model?: string
}

export type TranslationLang = 'en'
export type DiaryTranslations = Partial<Record<TranslationLang, DiaryTranslation>>

/** 내용이 있는 칸만 추린다 — 빈 칸을 번역에 보낼 이유가 없다. */
export function translatableFields(entry: Record<string, unknown>): DiaryFields {
  const out: DiaryFields = {}
  for (const k of DIARY_TRANSLATABLE_KEYS) {
    const v = entry[k]
    if (typeof v === 'string' && v.trim()) out[k] = v
  }
  return out
}

/**
 * 원문의 지문 (FNV-1a 32bit).
 * 암호용이 아니라 '바뀌었나'만 보는 용도다. 키 순서가 달라도 같은 값이 나오도록 정렬한다.
 */
export function sourceHash(fields: DiaryFields): string {
  const parts: string[] = []
  for (const k of [...DIARY_TRANSLATABLE_KEYS].sort()) {
    const v = fields[k]
    if (v) parts.push(`${k}\u0000${v}`)
  }
  const s = parts.join('\u0001')
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

/** 한글이 한 글자라도 있나 — 이미 영어로만 쓴 일지에는 번역 버튼을 띄우지 않는다. */
export function hasKorean(text: string): boolean {
  return /[가-힣ᄀ-ᇿ㄰-㆏]/.test(text)
}

export function entryHasKorean(entry: Record<string, unknown>): boolean {
  return Object.values(translatableFields(entry)).some(v => hasKorean(v || ''))
}

export interface TranslationState {
  /** 보여 줄 영어 칸들. 번역이 없으면 null. */
  fields: DiaryFields | null
  /** 번역이 아직 없다. */
  missing: boolean
  /** 번역은 있는데 그 뒤로 원문이 바뀌었다. */
  stale: boolean
  translatedAt?: string
}

export function readTranslation(
  translations: DiaryTranslations | null | undefined,
  entry: Record<string, unknown>,
  lang: TranslationLang = 'en',
): TranslationState {
  const t = translations?.[lang]
  if (!t || !t.fields) return { fields: null, missing: true, stale: false }
  return {
    fields: t.fields,
    missing: false,
    stale: t.sourceHash !== sourceHash(translatableFields(entry)),
    translatedAt: t.translatedAt,
  }
}

/** 다른 언어의 번역은 건드리지 않고 한 언어만 갈아 끼운다. */
export function mergeTranslation(
  prev: DiaryTranslations | null | undefined,
  lang: TranslationLang,
  fields: DiaryFields,
  hash: string,
  model?: string,
): DiaryTranslations {
  return {
    ...(prev || {}),
    [lang]: { fields, sourceHash: hash, translatedAt: new Date().toISOString(), model },
  }
}
