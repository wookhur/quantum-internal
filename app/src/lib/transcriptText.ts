import { extractTextFromPdf } from '@/lib/pdf-extract'

/**
 * 전사본 파일에서 본문을 뽑는다.
 *
 * 운영자가 쓰는 전사 도구가 저마다 다른 형식을 내놓는다.
 *   줌·구글미트·팀즈 자동 전사 → .vtt
 *   유튜브·자막 편집기        → .srt
 *   클로바노트·녹음앱         → .txt
 *   계약서처럼 PDF 로 받은 것  → .pdf
 * vtt·srt 는 시각과 화자가 들어 있어 오히려 요약이 정확해진다 — 화자 이름은 남기고
 * 번호·타임스탬프만 걷어낸다.
 */

export const TRANSCRIPT_ACCEPT = '.txt,.md,.csv,.vtt,.srt,.pdf'

/** 전사본으로 받을 수 있는 파일인지 */
export function isTranscriptFile(name: string): boolean {
  return /\.(txt|md|csv|vtt|srt|pdf)$/i.test(name.trim())
}

export async function readTranscript(file: File): Promise<string> {
  if (/\.pdf$/i.test(file.name)) {
    return tidy(await extractTextFromPdf(file))
  }
  const raw = await file.text()
  if (/\.(vtt|srt)$/i.test(file.name)) return tidy(fromCues(raw))
  return tidy(raw)
}

/**
 * 자막 형식에서 대화만 남긴다.
 *
 * WEBVTT
 *
 * 1
 * 00:00:01.000 --> 00:00:04.000
 * <v 곽지수>안녕하세요 어머니
 *
 * → '곽지수: 안녕하세요 어머니'
 */
function fromCues(raw: string): string {
  const out: string[] = []
  for (const line of raw.split(/\r?\n/)) {
    const s = line.trim()
    if (!s) continue
    if (/^(WEBVTT|NOTE\b|STYLE\b|REGION\b)/i.test(s)) continue
    if (s.includes('-->')) continue          // 타임스탬프 줄
    if (/^\d+$/.test(s)) continue            // 자막 번호
    // <v 이름>내용  또는  <00:00:01.000><c>…</c> 같은 꾸밈 태그
    const voice = s.match(/^<v[^>]*?\s+([^>]+)>(.*)$/i)
    const text = (voice ? `${voice[1].trim()}: ${voice[2]}` : s)
      .replace(/<[^>]*>/g, '')
      .trim()
    if (!text) continue
    // 줌 자막은 같은 줄을 글자가 늘어날 때마다 다시 내보낸다. 바로 앞 줄을
    // 품고 있으면 늘어난 쪽만 남긴다.
    const prev = out[out.length - 1]
    if (prev && (text.startsWith(prev) || prev.startsWith(text))) {
      out[out.length - 1] = text.length >= prev.length ? text : prev
      continue
    }
    out.push(text)
  }
  return out.join('\n')
}

function tidy(s: string): string {
  return s.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

/** 요약에 보낼 글자 수 상한. 통화 두 시간 분량이 넉넉히 들어간다. */
export const TRANSCRIPT_MAX_CHARS = 120_000

/** Point / Concerns / Solutions / Follow-up — 요약이 돌아오는 꼴 */
export interface ConsultSummary {
  point: string
  concerns: string
  solutions: string
  followUp: string
}

/**
 * 요약을 상담 내용 칸에 넣을 한 덩어리로. follow-up 은 제 칸이 있으므로 빼 둔다.
 * 사람이 그대로 고칠 수 있는 평범한 글이어야 한다 — 화면에서 바로 수정한다.
 */
export function summaryToContent(s: ConsultSummary): string {
  const block = (title: string, body: string) =>
    body.trim() ? `[${title}]\n${body.trim()}` : ''
  return [
    block('Point', s.point),
    block('Concerns', s.concerns),
    block('Solutions', s.solutions),
  ].filter(Boolean).join('\n\n')
}
