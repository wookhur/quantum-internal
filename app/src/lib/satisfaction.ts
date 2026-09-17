/** 서비스 만족도 설문 관련 순수 함수. */

/**
 * 구글 시트 링크에서 스프레드시트 ID만 뽑는다.
 * 사용자가 주소창 링크를 통째로 붙여넣어도 되도록 한다.
 * ID만 붙여넣은 경우에는 그대로 돌려준다.
 */
export function extractSpreadsheetId(input: string): string {
  const s = (input || '').trim()
  const m = s.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  if (m) return m[1]
  return s
}
