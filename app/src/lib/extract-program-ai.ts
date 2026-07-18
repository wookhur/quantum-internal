import { supabase } from './supabase'

export interface ExtractedProgramInfo {
  /** A clean, organized program guide in Korean (markdown-ish plain text). */
  guide: string | null
}

/**
 * Send a brochure image (base64, no data: prefix) to the Supabase Edge
 * Function which calls Claude Vision to read the brochure and produce an
 * organized program guide. Falls back gracefully — callers should treat a
 * thrown error as "auto-summary unavailable, edit manually".
 */
export async function extractProgramGuideFromImage(imageBase64: string): Promise<ExtractedProgramInfo> {
  if (!imageBase64) throw new Error('브로셔 이미지를 읽을 수 없습니다.')

  const { data, error } = await supabase.functions.invoke('extract-program-brochure', {
    body: { image: imageBase64 },
  })

  if (error) {
    // supabase-js hides the response body behind error.context on non-2xx —
    // dig it out so the user sees the real reason (API key / model / size).
    let detail = error.message
    try {
      const ctx = (error as unknown as { context?: Response }).context
      if (ctx && typeof ctx.text === 'function') {
        const raw = await ctx.text()
        try {
          const body = JSON.parse(raw)
          if (body?.error) detail = body.error + (body.details ? ` — ${String(body.details).slice(0, 300)}` : '')
        } catch {
          if (raw) detail = raw.slice(0, 300)
        }
      }
    } catch { /* keep generic message */ }
    throw new Error(`브로셔 분석 실패: ${detail}`)
  }
  if (data?.error) throw new Error(`브로셔 분석 실패: ${data.error}`)

  return { guide: (data?.guide as string) ?? null }
}

/** Read a File as a base64 string (without the data: URL prefix). */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/**
 * Downscale an image blob to a safe size for Claude Vision and return base64
 * (no data: prefix). Keeps the long edge <= maxDim and re-encodes as JPEG so
 * the payload stays well under the size limit. Falls back to raw base64 if the
 * canvas path fails.
 */
export async function imageToDownscaledBase64(src: Blob, maxDim = 2048, quality = 0.85): Promise<string> {
  try {
    const bitmap = await createImageBitmap(src)
    let { width, height } = bitmap
    const scale = Math.min(1, maxDim / Math.max(width, height))
    width = Math.max(1, Math.round(width * scale))
    height = Math.max(1, Math.round(height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('no 2d context')
    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close?.()
    const dataUrl = canvas.toDataURL('image/jpeg', quality)
    const comma = dataUrl.indexOf(',')
    return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl
  } catch {
    // Fallback: send raw bytes
    return new Promise<string>((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => { const s = r.result as string; const c = s.indexOf(','); resolve(c >= 0 ? s.slice(c + 1) : s) }
      r.onerror = reject
      r.readAsDataURL(src)
    })
  }
}
