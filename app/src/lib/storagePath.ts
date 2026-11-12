/**
 * Supabase Storage 의 객체 키(경로)에 쓸 수 있는 파일명.
 *
 * 저장소는 키에 ASCII 밖 글자가 들어가면 'Invalid key' 로 거부한다. 종전 정리
 * 규칙(`[^\w.\-가-힣]`)은 한글을 일부러 남겨 두었고, 그래서 이름에 한글이 있는
 * 파일은 전부 업로드가 막혔다 — '쇼파테이블영수증.jpg' 가 그 예다. 오류 메시지도
 * 'Invalid key' 뿐이라 무엇이 문제인지 알기 어려웠다.
 *
 * 경로에는 ASCII 만 남긴다. 사람이 보는 이름은 원본 그대로 DB 의 name 칸에 따로
 * 저장하므로, 경로를 바꿔도 화면에 보이는 파일명은 달라지지 않는다.
 */
export function storageSafeName(name: string): string {
  const raw = (name || '').trim()
  const dot = raw.lastIndexOf('.')
  // 확장자는 살린다 — 브라우저가 열 때 형식을 짐작하는 단서가 된다
  const ext = (dot > 0 ? raw.slice(dot + 1) : '').replace(/[^A-Za-z0-9]/g, '').slice(0, 12).toLowerCase()
  const stem = (dot > 0 ? raw.slice(0, dot) : raw).replace(/[^A-Za-z0-9._-]/g, '').slice(0, 40)
  // 이름이 통째로 한글이면 남는 게 없다 — 시각(Date.now)이 앞에 붙으므로 겹치지 않는다
  const base = stem || 'file'
  return ext ? `${base}.${ext}` : base
}
