const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle,
  LevelFormat, convertInchesToTwip, PageBreak,
} = require('docx')
const fs = require('fs')

// 나눔고딕: 한글은 eastAsia, 영문·숫자는 ascii/hAnsi 로 각각 지정해야 Word 가 제대로 집는다.
const FONT = { ascii: 'NanumGothic', eastAsia: '나눔고딕', hAnsi: 'NanumGothic', cs: 'NanumGothic' }

const NAVY = '1F3864'
const GRAY = '595959'
const LIGHT = 'F2F4F8'
const ACCENT = '2E5FA3'

const PAGE_W = 12240, PAGE_H = 15840      // US Letter (DXA)
const MARGIN = convertInchesToTwip(0.9)
const BODY_W = PAGE_W - MARGIN * 2

const p = (text, o = {}) => new Paragraph({
  spacing: { before: o.before ?? 0, after: o.after ?? 120, line: 300 },
  alignment: o.align,
  indent: o.indent,
  border: o.border,
  children: [new TextRun({
    text, font: FONT, size: o.size ?? 20,
    bold: o.bold, color: o.color ?? '000000', italics: o.italics,
  })],
})

/** 여러 조각을 한 줄에 (굵게 섞어 쓸 때) */
const rich = (parts, o = {}) => new Paragraph({
  spacing: { before: o.before ?? 0, after: o.after ?? 120, line: 300 },
  indent: o.indent,
  children: parts.map(x => new TextRun({
    text: typeof x === 'string' ? x : x.t,
    bold: typeof x === 'string' ? false : x.b,
    color: (typeof x === 'string' ? null : x.c) || o.color || '000000',
    font: FONT, size: o.size ?? 20,
  })),
})

const h1 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_1,
  spacing: { before: 360, after: 160 },
  border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: ACCENT, space: 6 } },
  children: [new TextRun({ text, font: FONT, size: 28, bold: true, color: NAVY })],
})

const h2 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_2,
  spacing: { before: 240, after: 100 },
  children: [new TextRun({ text, font: FONT, size: 23, bold: true, color: ACCENT })],
})

const bullet = (text, level = 0) => new Paragraph({
  numbering: { reference: 'dot', level },
  spacing: { after: 80, line: 300 },
  children: [new TextRun({ text, font: FONT, size: 20 })],
})

/** 회색 상자 (주의·참고) */
const callout = (title, lines) => new Table({
  width: { size: BODY_W, type: WidthType.DXA },
  columnWidths: [BODY_W],
  borders: {
    top: { style: BorderStyle.SINGLE, size: 4, color: 'D0D7E2' },
    bottom: { style: BorderStyle.SINGLE, size: 4, color: 'D0D7E2' },
    left: { style: BorderStyle.SINGLE, size: 18, color: ACCENT },
    right: { style: BorderStyle.SINGLE, size: 4, color: 'D0D7E2' },
    insideHorizontal: { style: BorderStyle.NONE },
    insideVertical: { style: BorderStyle.NONE },
  },
  rows: [new TableRow({
    children: [new TableCell({
      width: { size: BODY_W, type: WidthType.DXA },
      shading: { type: ShadingType.CLEAR, fill: LIGHT },
      margins: { top: 140, bottom: 140, left: 180, right: 180 },
      children: [
        p(title, { bold: true, color: NAVY, after: 60, size: 20 }),
        ...lines.map(l => p(l, { after: 40, size: 19, color: GRAY })),
      ],
    })],
  })],
})

/** 표: 머리글 + 행들. widths 는 비율(합 1) */
const table = (headers, rows, ratios) => {
  const widths = ratios.map(r => Math.round(BODY_W * r))
  widths[widths.length - 1] = BODY_W - widths.slice(0, -1).reduce((a, b) => a + b, 0)
  const cell = (text, i, opts = {}) => new TableCell({
    width: { size: widths[i], type: WidthType.DXA },
    shading: { type: ShadingType.CLEAR, fill: opts.head ? NAVY : (opts.alt ? 'F7F9FC' : 'FFFFFF') },
    margins: { top: 90, bottom: 90, left: 120, right: 120 },
    children: [p(text, {
      size: 19, after: 0,
      bold: opts.head || opts.strong,
      color: opts.head ? 'FFFFFF' : '000000',
    })],
  })
  return new Table({
    width: { size: BODY_W, type: WidthType.DXA },
    columnWidths: widths,
    borders: {
      top: { style: BorderStyle.SINGLE, size: 2, color: 'C8D2E0' },
      bottom: { style: BorderStyle.SINGLE, size: 2, color: 'C8D2E0' },
      left: { style: BorderStyle.SINGLE, size: 2, color: 'C8D2E0' },
      right: { style: BorderStyle.SINGLE, size: 2, color: 'C8D2E0' },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: 'DCE3EC' },
      insideVertical: { style: BorderStyle.SINGLE, size: 2, color: 'DCE3EC' },
    },
    rows: [
      new TableRow({
        tableHeader: true,
        children: headers.map((hd, i) => cell(hd, i, { head: true })),
      }),
      ...rows.map((r, ri) => new TableRow({
        children: r.map((c, i) => cell(c, i, { alt: ri % 2 === 1, strong: i === 0 })),
      })),
    ],
  })
}

/** 흐름도 한 칸 */
const flowBox = (step, title, lines) => new Table({
  width: { size: BODY_W, type: WidthType.DXA },
  columnWidths: [Math.round(BODY_W * 0.1), BODY_W - Math.round(BODY_W * 0.1)],
  borders: {
    top: { style: BorderStyle.SINGLE, size: 2, color: 'C8D2E0' },
    bottom: { style: BorderStyle.SINGLE, size: 2, color: 'C8D2E0' },
    left: { style: BorderStyle.SINGLE, size: 2, color: 'C8D2E0' },
    right: { style: BorderStyle.SINGLE, size: 2, color: 'C8D2E0' },
    insideVertical: { style: BorderStyle.SINGLE, size: 2, color: 'DCE3EC' },
    insideHorizontal: { style: BorderStyle.NONE },
  },
  rows: [new TableRow({
    children: [
      new TableCell({
        width: { size: Math.round(BODY_W * 0.1), type: WidthType.DXA },
        shading: { type: ShadingType.CLEAR, fill: NAVY },
        verticalAlign: 'center',
        margins: { top: 120, bottom: 120, left: 80, right: 80 },
        children: [p(step, { bold: true, color: 'FFFFFF', size: 26, align: AlignmentType.CENTER, after: 0 })],
      }),
      new TableCell({
        width: { size: BODY_W - Math.round(BODY_W * 0.1), type: WidthType.DXA },
        margins: { top: 120, bottom: 120, left: 160, right: 140 },
        children: [
          p(title, { bold: true, size: 21, color: NAVY, after: 60 }),
          ...lines.map(l => p(l, { size: 19, after: 40, color: GRAY })),
        ],
      }),
    ],
  })],
})

const arrow = () => p('▼', { align: AlignmentType.CENTER, color: ACCENT, size: 18, after: 60, before: 60 })

const doc = new Document({
  styles: {
    default: {
      document: { run: { font: FONT, size: 20 }, paragraph: { spacing: { line: 300 } } },
    },
  },
  numbering: {
    config: [{
      reference: 'dot',
      levels: [
        { level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 360, hanging: 200 } } } },
        { level: 1, format: LevelFormat.BULLET, text: '–', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 200 } } } },
      ],
    }],
  },
  sections: [{
    properties: {
      page: { size: { width: PAGE_W, height: PAGE_H }, margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } },
    },
    children: [
      // ───── 표지
      p('퀀텀어드미션즈 인터널', { size: 19, color: ACCENT, bold: true, after: 60 }),
      new Paragraph({
        spacing: { after: 80 },
        children: [new TextRun({ text: '세일즈 워크플로우', font: FONT, size: 44, bold: true, color: NAVY })],
      }),
      p('리드 유입부터 계약 완료까지', { size: 24, color: GRAY, after: 100 }),
      p('2026년 10월 12일 기준', { size: 18, color: GRAY, after: 240 }),

      callout('이 문서는', [
        '세일즈 파트가 리드를 받아 계약까지 가는 동안 어느 화면에서 무엇을 하는지 정리한 것입니다.',
        '화면이 여러 개로 보이지만, 실제로 손이 가는 곳은 콜드콜 한 곳입니다.',
      ]),

      // ───── 1. 한눈에
      h1('1. 한눈에 보기'),
      flowBox('1', '리드가 들어온다', [
        '세미나·웨비나 신청, 홈페이지 상담신청 → 자동으로 리드 생성',
        '구글 시트 → 동기화로 리드 생성',
      ]),
      arrow(),
      flowBox('2', '콜드콜에서 관리한다', [
        '전화·문자·카톡·메일 기록 → 단계가 자동으로 바뀜',
        '상담 일정 잡기 · 세미나 참석완료 표시',
        '상담 예약 / 계약 완료로 단계 넘기기',
      ]),
      arrow(),
      flowBox('3', '계약서를 쓴다 (계약관리)', [
        '금액·날짜·이름은 사람이 직접 입력 — AI 자동입력을 쓰지 않습니다',
        '저장하면 "이 리드가 맞나요?" 확인 → 리드를 계약 완료로',
      ]),
      arrow(),
      flowBox('4', '학생정보를 채운다 (Student 360)', [
        '계약서에서 채우기 → 학교·학년·이름·연락처·이메일·주소',
        '계약관리에 없는 항목은 계약서 PDF를 읽어 보탬',
      ]),

      // ───── 2. 리드 유입
      h1('2. 리드는 어떻게 들어오나'),
      table(
        ['유입 경로', '리드 생성', '유입채널에 찍히는 값'],
        [
          ['세미나·웨비나 신청', '자동', '세미나 제목 그대로'],
          ['홈페이지 상담신청', '자동', '홈페이지 상담신청'],
          ['구글 시트', '동기화 실행 시', 'SNS - 시트 탭 이름'],
          ['직접 추가', '수동', '입력한 값'],
        ],
        [0.3, 0.2, 0.5],
      ),
      p('', { after: 120 }),
      p('리드가 만들어지는 순간부터 콜드콜 목록에 들어갑니다. 전화를 걸어야 나타나는 것이 아닙니다.', { color: GRAY, size: 19 }),

      // ───── 3. 콜드콜
      h1('3. 콜드콜 — 세일즈의 작업대'),

      h2('리드관리와 콜드콜의 차이'),
      p('둘은 같은 리드 목록입니다. 단계가 다른 것이 아니라 화면이 다릅니다.', { after: 120 }),
      table(
        ['화면', '쓰는 때'],
        [
          ['리드관리', '전체 목록을 보고, 고치고, 중복을 합치고, 유입 경로별로 셀 때'],
          ['콜드콜', '한 명씩 열어 전화 걸고 결과를 남길 때 (세미나·학년·회차 필터, 현지 시각 표시)'],
        ],
        [0.22, 0.78],
      ),

      h2('접촉 기록 — 수단과 결과'),
      table(
        ['수단', '고를 수 있는 결과'],
        [
          ['전화', '통화연결 · 부재중 · 콜백요청'],
          ['문자', '발송 · 응답 · 무응답'],
          ['카카오톡', '발송 · 읽음 · 응답 · 무응답'],
          ['이메일', '발송 · 응답 · 무응답'],
        ],
        [0.22, 0.78],
      ),

      h2('결과를 남기면 단계가 저절로 바뀝니다'),
      table(
        ['남긴 결과', '바뀌는 단계'],
        [
          ['1:1 상담유도 성공', '상담 예약'],
          ['통화연결 · 응답 · 읽음', '컨택 완료'],
          ['부재중 · 무응답', '부재중  (신규 리드·컨택 완료 상태일 때만)'],
          ['콜백요청', '보류(콜백요청)'],
        ],
        [0.35, 0.65],
      ),
      p('', { after: 100 }),
      p('이미 상담 예약 이후로 간 리드는 뒤로 돌아가지 않습니다. 전화 한 번 안 받았다고 단계가 내려가지 않습니다.', { color: GRAY, size: 19 }),

      h2('상담 일정'),
      bullet('리드 카드의 "상담 일정" 칸에서 [상담 잡기]로 날짜와 메모를 남깁니다.'),
      bullet('몇 차 상담인지는 이미 잡힌 수로 자동으로 셉니다.'),
      bullet('세일즈 > 미팅에도 같은 기록으로 올라갑니다. 두 번 적지 않아도 됩니다.'),

      h2('세미나 참석 표시'),
      bullet('세미나에 참석한 리드는 콜드콜의 리드 카드에서 참석완료를 누릅니다.'),
      bullet('누르면 리드에 세미나 이름이 뱃지로 붙고, 세미나 성과에 반영됩니다.'),
      bullet('세미나와 리드는 연락처 → 이메일 → 이름 순으로 자동으로 연결됩니다.'),

      h2('단계 버튼'),
      table(
        ['버튼', '하는 일'],
        [
          ['상담 예약', '상담을 잡았을 때. 파이프라인·세미나 성과에 전환으로 잡힙니다'],
          ['계약 완료', '계약까지 갔을 때. 계약서는 계약관리에서 따로 씁니다'],
        ],
        [0.22, 0.78],
      ),

      // ───── 4. 단계표
      h1('4. 리드 단계 전체'),
      table(
        ['단계', '뜻', '콜드콜 목록'],
        [
          ['신규 리드', '아직 아무도 연락하지 않음', '보임'],
          ['컨택 완료', '통화·응답이 한 번이라도 있었음', '보임'],
          ['부재중', '걸었으나 받지 않음', '보임'],
          ['보류(콜백요청)', '나중에 다시 걸어 달라고 함', '보임'],
          ['상담 예약', '상담을 잡음', '보임'],
          ['1차~3차 상담', '상담을 진행함', '보임'],
          ['계약 검토', '계약 이야기 중', '보임'],
          ['계약 완료', '계약함', '보임'],
          ['거절', '안 하겠다고 함', '빠짐'],
          ['이탈', '연락이 끊김', '빠짐'],
          ['보류(연락불가)', '번호 오류 등으로 연락 자체가 안 됨', '빠짐'],
          ['서비스 취소', '계약 후 취소', '빠짐'],
        ],
        [0.26, 0.56, 0.18],
      ),
      p('', { after: 120 }),
      callout('콜드콜에서 빠지는 건 네 가지뿐입니다', [
        '거절 · 이탈 · 보류(연락불가) · 서비스 취소.',
        '나머지는 계약 완료까지 전부 목록에 남습니다. 그래서 콜드콜만 훑어도 놓친 리드를 가릴 수 있습니다.',
        '계약 완료 리드도 목록에 그대로 있고, 상단 단계 드롭다운에서 "계약 완료"만 모아 볼 수 있습니다.',
      ]),

      // ───── 5. 계약
      h1('5. 계약 — 계약관리'),
      h2('계약서는 사람이 직접 씁니다'),
      p('금액·날짜·이름을 AI가 잘못 읽으면 안 되므로, 계약 입력과 PDF 첨부는 수동으로 합니다.', { after: 120 }),

      h2('저장하면 리드를 물어봅니다'),
      p('계약을 저장하면 같은 사람으로 보이는 리드를 찾아 확인 창이 뜹니다. "네"를 누르면 그 리드가 계약 완료로 바뀝니다. 자동으로 바꾸지 않습니다.', { after: 120 }),
      table(
        ['찾는 순서', '안 묻는 경우'],
        [
          ['① 연락처  ② 이메일  ③ 학생명+학부모명  ④ 학생명',
           '같은 근거로 후보가 둘 이상일 때 (동명이인·형제) / 계약자 이름만 같을 때 / 리드에서 넘어와 이미 연결됐을 때'],
        ],
        [0.38, 0.62],
      ),

      h2('그다음 Student 360'),
      bullet('학생 화면의 [계약서에서 채우기] → 비어 있는 칸만 채웁니다. 이미 적힌 값은 덮어쓰지 않습니다.'),
      bullet('채우는 항목: 학교 · 학년 · 한글이름 · 영문이름 · 학생 이메일 · 학생 연락처 · 학부모 연락처·이름 · 학부모 이메일 · 주소'),
      bullet('계약관리에 적지 않는 항목(이메일·연락처 등)은 [계약서 PDF 골라서 읽기]로 계약서에서 찾아 보탭니다.'),
      bullet('계약서에서 읽은 값에는 보라색 "계약서" 표시가 붙습니다. 보고 체크하신 것만 저장됩니다.'),

      // ───── 6. 주의 (표가 쪽을 넘어 쪼개지지 않게 새 쪽에서 시작)
      new Paragraph({ children: [new PageBreak()] }),
      h1('6. 자주 어긋나는 곳'),
      table(
        ['상황', '어떻게 하나'],
        [
          ['계약서를 먼저 쓰고 리드를 안 옮겼다',
           '리드가 세일즈 목록에 상담 중으로 남습니다. 저장할 때 뜨는 확인 창에서 "네"를 누르거나, 콜드콜에서 [계약 완료]를 누르세요'],
          ['세미나 참석을 세미나 관리에서 찾는다',
           '참석완료는 콜드콜의 리드 카드에서 누릅니다'],
          ['계약관리 PDF 업로드로 계약을 또 만들었다',
           '목록 상단의 PDF 업로드는 새 계약을 만듭니다. 기존 계약에 파일만 붙일 때는 계약 상세의 실물 계약서(PDF)를 쓰세요'],
          ['리드가 안 보인다',
           '거절·이탈·보류(연락불가)·서비스 취소만 기본 목록에서 빠집니다. 상단 단계 드롭다운에서 보류(연락불가)·계약 검토·계약 완료를 따로 모아 볼 수 있습니다'],
        ],
        [0.32, 0.68],
      ),

      p('문의: 인터널 담당자', { size: 18, color: GRAY, align: AlignmentType.CENTER, before: 200 }),
    ],
  }],
})

Packer.toBuffer(doc).then(b => {
  fs.writeFileSync(process.argv[2], b)
  console.log('wrote', process.argv[2], b.length, 'bytes')
})
