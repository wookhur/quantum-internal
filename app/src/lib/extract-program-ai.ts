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

  if (error) throw new Error(`브로셔 분석 실패: ${error.message}`)
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
