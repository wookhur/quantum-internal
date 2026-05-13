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
      'PDF에서 충분한 텍스트를 추출할 수 없습니다. 스캔된 이미지 PDF일 수 있습니다.',
    )
  }

  const { data, error } = await supabase.functions.invoke('extract-contract', {
    body: { text: pdfText },
  })

  if (error) {
    throw new Error(`계약서 분석 실패: ${error.message}`)
  }

  // Merge with empty result to ensure all fields exist
  return { ...EMPTY_RESULT, ...data }
}
