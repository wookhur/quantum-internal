import { supabase } from './supabase'

export interface ExtractedContractData {
  contractorName: string | null
  studentName: string | null
  schoolName: string | null
  gradeAtContract: string | null
  contractDate: string | null
  expiryDate: string | null
  address: string | null
  phone: string | null
  totalAmount: number | null
  currency: 'KRW' | 'USD' | null
  paymentAccount: 'KR' | 'US' | null
  notes: string | null
}

const EMPTY_RESULT: ExtractedContractData = {
  contractorName: null,
  studentName: null,
  schoolName: null,
  gradeAtContract: null,
  contractDate: null,
  expiryDate: null,
  address: null,
  phone: null,
  totalAmount: null,
  currency: null,
  paymentAccount: null,
  notes: null,
}

/**
 * Send extracted PDF text to the Supabase Edge Function
 * which calls Claude to extract structured contract data.
 */
export async function extractContractFields(
  pdfText: string,
): Promise<ExtractedContractData> {
  if (!pdfText || pdfText.trim().length < 30) {
    throw new Error(
      'PDF에서 충분한 텍스트를 추출할 수 없습니다.',
    )
  }

  const { data, error } = await supabase.functions.invoke('extract-contract', {
    body: { text: pdfText },
  })

  if (error) {
    throw new Error(`계약서 분석 실패: ${error.message}`)
  }

  // Check if the response itself contains an error field
  if (data?.error) {
    throw new Error(`계약서 분석 실패: ${data.error}${data.details ? ` — ${data.details.substring(0, 200)}` : ''}`)
  }

  // Merge with empty result to ensure all fields exist
  return { ...EMPTY_RESULT, ...data }
}

/**
 * Send PDF page images to the Supabase Edge Function
 * which calls Claude Vision to extract structured contract data.
 * Used for scanned/image PDFs where text extraction fails.
 */
export async function extractContractFieldsFromImages(
  images: string[],
): Promise<ExtractedContractData> {
  if (!images || images.length === 0) {
    throw new Error('PDF 이미지를 생성할 수 없습니다.')
  }

  // Check total payload size — Supabase Edge Functions have body size limits
  const totalSize = images.reduce((sum, img) => sum + img.length, 0)
  const totalSizeMB = totalSize / (1024 * 1024)
  console.log(`[extract-contract] Sending ${images.length} images, total base64 size: ${totalSizeMB.toFixed(1)}MB`)

  if (totalSizeMB > 4) {
    throw new Error(
      `PDF 이미지 크기가 너무 큽니다 (${totalSizeMB.toFixed(1)}MB). 페이지 수가 적은 PDF를 사용하거나, 텍스트 기반 PDF를 사용해주세요.`,
    )
  }

  const { data, error } = await supabase.functions.invoke('extract-contract', {
    body: { images },
  })

  if (error) {
    throw new Error(`계약서 분석 실패: ${error.message}`)
  }

  // Check if the response itself contains an error field
  if (data?.error) {
    throw new Error(`계약서 분석 실패: ${data.error}${data.details ? ` — ${data.details.substring(0, 200)}` : ''}`)
  }

  return { ...EMPTY_RESULT, ...data }
}
