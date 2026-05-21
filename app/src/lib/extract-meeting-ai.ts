import { supabase } from './supabase'

export interface ExtractedMeetingData {
  parentName: string | null
  studentName: string | null
  meetingDate: string | null
  meetingNumber: number | null
  phone: string | null
  currentSchool: string | null
  grade: string | null
  region: string | null
  interestArea: string | null
  sourceChannel: string | null
  memo: string | null
  nextMeetingDate: string | null
  requiredAction: string | null
}

const EMPTY_RESULT: ExtractedMeetingData = {
  parentName: null,
  studentName: null,
  meetingDate: null,
  meetingNumber: null,
  phone: null,
  currentSchool: null,
  grade: null,
  region: null,
  interestArea: null,
  sourceChannel: null,
  memo: null,
  nextMeetingDate: null,
  requiredAction: null,
}

/**
 * Send extracted PDF text to the Supabase Edge Function
 * which calls Claude to extract structured meeting data.
 */
export async function extractMeetingFields(
  pdfText: string,
): Promise<ExtractedMeetingData> {
  if (!pdfText || pdfText.trim().length < 20) {
    throw new Error('PDF에서 충분한 텍스트를 추출할 수 없습니다.')
  }

  const { data, error } = await supabase.functions.invoke('extract-meeting-note', {
    body: { text: pdfText },
  })

  if (error) {
    throw new Error(`미팅 노트 분석 실패: ${error.message}`)
  }

  if (data?.error) {
    throw new Error(`미팅 노트 분석 실패: ${data.error}${data.details ? ` — ${data.details.substring(0, 200)}` : ''}`)
  }

  return { ...EMPTY_RESULT, ...data }
}

/**
 * Send PDF page images to the Supabase Edge Function
 * which calls Claude Vision to extract structured meeting data.
 */
export async function extractMeetingFieldsFromImages(
  images: string[],
): Promise<ExtractedMeetingData> {
  if (!images || images.length === 0) {
    throw new Error('PDF 이미지를 생성할 수 없습니다.')
  }

  const totalSize = images.reduce((sum, img) => sum + img.length, 0)
  const totalSizeMB = totalSize / (1024 * 1024)
  console.log(`[extract-meeting-note] Sending ${images.length} images, total base64 size: ${totalSizeMB.toFixed(1)}MB`)

  if (totalSizeMB > 5) {
    throw new Error(
      `PDF 이미지 크기가 너무 큽니다 (${totalSizeMB.toFixed(1)}MB). 페이지 수가 적은 PDF를 사용해주세요.`,
    )
  }

  const { data, error } = await supabase.functions.invoke('extract-meeting-note', {
    body: { images },
  })

  if (error) {
    throw new Error(`미팅 노트 분석 실패: ${error.message}`)
  }

  if (data?.error) {
    throw new Error(`미팅 노트 분석 실패: ${data.error}${data.details ? ` — ${data.details.substring(0, 200)}` : ''}`)
  }

  return { ...EMPTY_RESULT, ...data }
}
