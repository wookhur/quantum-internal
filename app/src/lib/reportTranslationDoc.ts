/**
 * 영어로 옮긴 미팅리포트를 파일로 내려받기
 *
 * 번역문은 해외 멘토·에디터에게 그대로 건네는 물건이라, 화면에서 긁어 가는 것보다
 * 파일 하나로 받는 편이 낫다. 여기서는 파일 이름과 본문 다듬기처럼
 * 혼자서도 검사할 수 있는 부분만 다루고, PDF 로 그리는 일은 downloadReportPdf 가 한다.
 */

/**
 * 파일 이름으로 쓸 수 없는 글자를 걸러낸다.
 * 윈도우가 막는 \ / : * ? " < > | 와 제어문자, 그리고 끝의 점·공백까지 함께 정리한다
 * (끝에 점이 붙은 이름은 윈도우에서 저장이 안 된다).
 */
export function safeFileSegment(s: string): string {
  return (s || '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '')
}

/** 예) "김다나 Meeting Report (EN) 2026-09-15.pdf" */
export function reportFileName(studentName: string | undefined, date: string | undefined, ext = 'pdf'): string {
  const who = safeFileSegment(studentName || '') || 'Student'
  const when = safeFileSegment(date || '')
  return [who, 'Meeting Report (EN)', when].filter(Boolean).join(' ') + `.${ext}`
}

/**
 * 모델이 돌려준 글을 문서에 앉히기 좋게 다듬는다.
 * 내용은 건드리지 않는다 — 줄 끝 공백, 윈도우 줄바꿈, 세 줄 이상 연속된 빈 줄만 정리한다.
 */
export function normalizeReportText(text: string): string {
  return (text || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(line => line.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** 제목 줄인가 — PDF 에서 굵게 찍을 줄을 고른다. */
export function isHeadingLine(line: string): boolean {
  const s = line.trim()
  if (!s) return false
  if (/^#{1,6}\s+/.test(s)) return true               // # 제목
  if (/^\*\*.+\*\*$/.test(s)) return true             // **제목**
  if (s.length <= 60 && /^[^a-z]*$/.test(s) && /[A-Z]/.test(s)) return true  // ALL CAPS 한 줄
  return false
}

/** 굵게 찍기 전에 마크다운 기호를 떼어낸다. */
export function stripHeadingMarks(line: string): string {
  return line.trim().replace(/^#{1,6}\s+/, '').replace(/^\*\*(.+)\*\*$/, '$1')
}

// ── PDF 로 그리기 ──────────────────────────────────────────────
// 번역문은 영어라 jsPDF 기본 글꼴(Helvetica)로 충분하다.
// (한글은 기본 글꼴에 없어 깨지므로, 여기에 한국어 원문을 넣으면 안 된다.)

export interface ReportPdfMeta {
  studentName?: string
  /** 미팅 날짜 */
  meetingDate?: string
  /** 원문 링크 — 어디서 온 번역인지 남겨 둔다 */
  sourceUrl?: string
}

const PAGE = { width: 210, height: 297, margin: 18 }   // A4, mm
const BODY_WIDTH = PAGE.width - PAGE.margin * 2
const LINE_HEIGHT = 5.2
const BOTTOM = PAGE.height - PAGE.margin

export async function downloadReportPdf(text: string, meta: ReportPdfMeta): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })

  let y = PAGE.margin

  const newPageIfNeeded = (needed: number) => {
    if (y + needed > BOTTOM) {
      doc.addPage()
      y = PAGE.margin
    }
  }

  // 머리글 — 누구의, 언제 미팅인지
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text('Meeting Report', PAGE.margin, y)
  y += 7

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(110)
  const subtitle = [meta.studentName, meta.meetingDate].filter(Boolean).join('  ·  ')
  if (subtitle) {
    // 학생 이름이 한글이면 기본 글꼴에서 깨지므로 넣지 않는다.
    doc.text(hasNonLatin(subtitle) ? (meta.meetingDate || '') : subtitle, PAGE.margin, y)
    y += 5
  }
  doc.text('Translated from the Korean original.', PAGE.margin, y)
  y += 6
  doc.setDrawColor(210)
  doc.line(PAGE.margin, y, PAGE.width - PAGE.margin, y)
  y += 6
  doc.setTextColor(0)

  // 본문
  for (const rawLine of normalizeReportText(text).split('\n')) {
    if (!rawLine.trim()) { y += LINE_HEIGHT * 0.6; continue }

    const heading = isHeadingLine(rawLine)
    doc.setFont('helvetica', heading ? 'bold' : 'normal')
    doc.setFontSize(heading ? 11 : 10)

    const content = heading ? stripHeadingMarks(rawLine) : rawLine
    // 들여쓰기(불릿 등)를 살린다.
    const indent = (rawLine.match(/^[ \t]*/)?.[0].length || 0) > 0 ? 4 : 0
    const wrapped: string[] = doc.splitTextToSize(content.trim(), BODY_WIDTH - indent)

    if (heading) { newPageIfNeeded(LINE_HEIGHT * 2); y += 2 }
    for (const line of wrapped) {
      newPageIfNeeded(LINE_HEIGHT)
      doc.text(line, PAGE.margin + indent, y)
      y += LINE_HEIGHT
    }
    if (heading) y += 1
  }

  // 꼬리말 — 쪽 번호
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(150)
    doc.text(`${i} / ${pages}`, PAGE.width - PAGE.margin, PAGE.height - 10, { align: 'right' })
  }

  doc.save(reportFileName(meta.studentName, meta.meetingDate))
}

/**
 * 기본 글꼴(Helvetica)로 찍을 수 없는 글자가 섞여 있나 — 한글·한자 등.
 * 정규식 대신 코드포인트로 본다. 범위를 이스케이프로 적으면 소스에 보이지 않는
 * 공백 문자가 섞여 들어가기 쉽다.
 */
export function hasNonLatin(s: string): boolean {
  for (const ch of s || '') {
    const c = ch.codePointAt(0) || 0
    if (c <= 0x24f) continue                  // ASCII + 라틴 확장
    if (c >= 0x2000 && c <= 0x206f) continue  // 일반 구두점 (· — " 등)
    if (c >= 0x20a0 && c <= 0x20bf) continue  // 통화 기호 (₩ € 등)
    return true
  }
  return false
}
