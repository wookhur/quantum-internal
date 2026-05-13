import * as pdfjsLib from 'pdfjs-dist'

// Configure worker — Vite handles the URL resolution
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url,
).toString()

/**
 * Extract all text content from a PDF file.
 * Returns concatenated text from all pages.
 */
export async function extractTextFromPdf(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()

  const pdf = await pdfjsLib.getDocument({
    data: arrayBuffer,
    // CJK (Korean/Chinese/Japanese) character map support
    cMapUrl: 'https://unpkg.com/pdfjs-dist@5.7.284/cmaps/',
    cMapPacked: true,
  }).promise

  const pages: string[] = []

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const pageText = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
    pages.push(pageText)
  }

  return pages.join('\n\n')
}

/**
 * Render PDF pages as base64-encoded JPEG images.
 * Used as fallback for scanned/image PDFs where text extraction fails.
 * Returns array of base64 strings (without data:image prefix).
 */
export async function renderPdfPagesToImages(
  file: File,
  maxPages = 3,
  scale = 1.5,
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
    const dataUrl = canvas.toDataURL('image/jpeg', 0.75)
    const base64 = dataUrl.replace(/^data:image\/jpeg;base64,/, '')
    images.push(base64)

    // Clean up
    canvas.width = 0
    canvas.height = 0
  }

  return images
}
