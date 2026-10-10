import * as pdfjsLib from 'pdfjs-dist'

// Configure worker — Vite handles the URL resolution
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url,
).toString()

/**
 * Extract all text content from a PDF file.
 * Returns concatenated text from all pages.
 *
 * pageMarkers: 쪽 경계를 '--- 3페이지 ---' 로 남긴다. 계약서처럼 긴 문서에서
 * 뒷쪽(별지·특약)에 적힌 값을 모델이 찾을 때, 어디쯤인지가 같이 있으면 도움이 되고
 * 무엇이 안 읽혔는지 사람이 확인하기도 쉽다.
 */
export async function extractTextFromPdf(
  file: File,
  opts?: { pageMarkers?: boolean },
): Promise<string> {
  return (await extractPdfText(file, opts)).text
}

export interface PdfTextResult {
  /** 쪽 표시를 포함한 전체 텍스트 */
  text: string
  pageCount: number
  /** 쪽 표시와 공백을 뺀 본문 글자 수 — 스캔본인지 판단하는 근거 */
  contentChars: number
}

/** 텍스트와 함께 쪽수·본문 분량을 돌려준다. */
export async function extractPdfText(
  file: File,
  opts?: { pageMarkers?: boolean },
): Promise<PdfTextResult> {
  const arrayBuffer = await file.arrayBuffer()

  const pdf = await pdfjsLib.getDocument({
    data: arrayBuffer,
    // CJK (Korean/Chinese/Japanese) character map support
    cMapUrl: 'https://unpkg.com/pdfjs-dist@5.7.284/cmaps/',
    cMapPacked: true,
  }).promise

  const pages: string[] = []
  let contentChars = 0

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const pageText = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
    contentChars += pageText.replace(/\s+/g, '').length
    pages.push(opts?.pageMarkers ? `--- ${i}페이지 ---\n${pageText}` : pageText)
  }

  return { text: pages.join('\n\n'), pageCount: pdf.numPages, contentChars }
}

/**
 * 글자 레이어가 사실상 없는 PDF(스캔본)인가.
 *
 * 전에는 '30자만 넘으면 텍스트 PDF' 로 봤다. 그래서 11쪽짜리 스캔 계약서에서
 * 머리말 88자만 긁히고도 텍스트로 취급돼, 그 88자만 모델에 보내고 끝났다.
 * 본문이라 할 만한 분량이 나와야 텍스트로 본다.
 */
export function looksLikeScannedPdf(r: { contentChars: number; pageCount: number }): boolean {
  if (r.contentChars < MIN_CONTENT_CHARS) return true
  return r.contentChars / Math.max(r.pageCount, 1) < MIN_CHARS_PER_PAGE
}

/** 문서 전체에 이보다 적으면 본문이 아니다 */
export const MIN_CONTENT_CHARS = 300
/** 쪽당 평균이 이보다 적으면 스캔본으로 본다 (머리말·쪽번호만 긁힌 경우) */
export const MIN_CHARS_PER_PAGE = 80

/**
 * Render PDF pages as base64-encoded JPEG images.
 * Used as fallback for scanned/image PDFs where text extraction fails.
 * Returns array of base64 strings (without data:image prefix).
 */
export async function renderPdfPagesToImages(
  file: File,
  maxPages = 3,
  scale = 1.5,
  quality = 0.75,
): Promise<string[]> {
  const arrayBuffer = await file.arrayBuffer()

  const pdf = await pdfjsLib.getDocument({
    data: arrayBuffer,
    cMapUrl: 'https://unpkg.com/pdfjs-dist@5.7.284/cmaps/',
    cMapPacked: true,
  }).promise

  const pageCount = Math.min(pdf.numPages, maxPages)
  const images: string[] = []

  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i)
    const viewport = page.getViewport({ scale })

    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    const ctx = canvas.getContext('2d')!

    await page.render({ canvasContext: ctx, viewport, canvas } as never).promise

    // Convert to JPEG base64 (lower quality to keep payload small for Edge Function)
    const dataUrl = canvas.toDataURL('image/jpeg', quality)
    const base64 = dataUrl.replace(/^data:image\/jpeg;base64,/, '')
    images.push(base64)

    // Clean up
    canvas.width = 0
    canvas.height = 0
  }

  return images
}

/**
 * 쪽 수가 많은 문서를 전송 한도 안에서 그린다.
 *
 * 계약서는 10쪽을 넘고 정작 필요한 값은 뒤쪽에 있다. 쪽을 줄이면 그 값을 놓치고,
 * 해상도를 그대로 두면 전송 한도에 걸린다. 그래서 한 번 그려 보고 넘치면
 * 넘친 비율만큼 해상도를 낮춰 한 번 더 그린다 (최대 두 번).
 */
export async function renderPdfPagesWithinBudget(
  file: File,
  opts?: { maxPages?: number; budgetBytes?: number; scale?: number; quality?: number },
): Promise<{ images: string[]; bytes: number; scale: number }> {
  const maxPages = opts?.maxPages ?? 15
  const budget = opts?.budgetBytes ?? 4_500_000   // base64 기준
  // 1.5배로는 작은 한글(이메일 도메인 등)이 뭉개져 모델이 '흐리다'며 놓쳤다.
  let scale = opts?.scale ?? 2.2
  const quality = opts?.quality ?? 0.7

  let images = await renderPdfPagesToImages(file, maxPages, scale, quality)
  let bytes = images.reduce((n, img) => n + img.length, 0)

  if (bytes > budget) {
    // 용량은 대략 해상도의 제곱에 비례한다 — 넘친 비율의 제곱근만큼 낮춘다.
    const next = Math.max(1.2, scale * Math.sqrt(budget / bytes))
    if (next < scale) {
      scale = Number(next.toFixed(2))
      images = await renderPdfPagesToImages(file, maxPages, scale, Math.min(quality, 0.65))
      bytes = images.reduce((n, img) => n + img.length, 0)
    }
  }

  return { images, bytes, scale }
}
