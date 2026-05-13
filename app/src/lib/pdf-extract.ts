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
