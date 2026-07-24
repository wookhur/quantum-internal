// 알림 표시 텍스트를 선택 언어로 지역화한다.
// - 제목: 타입(및 서브타입)별로 고정 문구라 항상 번역 가능(기존 알림 포함).
// - 내용: 동적 값이 필요 → metadata에 값이 있으면 번역, 없으면 저장된 원문(구 알림)으로 폴백.

type TFn = (key: string, params?: Record<string, string | number>) => string

function str(v: unknown): string {
  return v === undefined || v === null ? '' : String(v)
}

/**
 * @param type 알림 타입
 * @param metadata 생성 시 저장된 파라미터
 * @param fallback 저장된 원문(title/message) — 번역 불가 시 사용
 */
export function localizeNotification(
  type: string | undefined,
  metadata: Record<string, unknown> | undefined,
  t: TFn,
  fallback: { title?: string; message?: string },
): { title: string; message: string } {
  const m = metadata || {}
  const has = (...keys: string[]) => keys.every((k) => m[k] !== undefined && m[k] !== null && String(m[k]) !== '')
  const fbTitle = fallback.title || ''
  const fbMsg = fallback.message || ''

  let title: string | undefined
  let message: string | undefined

  switch (type) {
    case 'new_contract':
      title = t('notif.n.new_contract.title')
      if (has('studentName')) message = t('notif.n.new_contract.body', { student: str(m.studentName), contractor: str(m.contractorName) })
      break
    case 'consultant_assigned':
      title = t('notif.n.consultant_assigned.title')
      if (has('studentName')) message = t('notif.n.consultant_assigned.body', { student: str(m.studentName) })
      break
    case 'issue_report':
      title = t('notif.n.issue_report.title')
      if (has('studentName')) message = t('notif.n.issue_report.body', { student: str(m.studentName) })
      break
    case 'leave_request': {
      // 서브타입: 승인/반려 — metadata.approved 없으면 원문 제목으로 추정
      const approved = m.approved !== undefined ? !!m.approved : !/반려|reject/i.test(fbTitle)
      title = t(approved ? 'notif.n.leave_request.title.approved' : 'notif.n.leave_request.title.rejected')
      if (has('startDate', 'endDate')) {
        message = t(approved ? 'notif.n.leave_request.body.approved' : 'notif.n.leave_request.body.rejected', { start: str(m.startDate), end: str(m.endDate) })
      }
      break
    }
    case 'coupang_order': {
      // 서브타입: request | approved | rejected | completed | shipped
      const variant = str(m.variant) || (/(승인|approv)/i.test(fbTitle) ? 'approved' : /(반려|reject)/i.test(fbTitle) ? 'rejected' : /(주문\s*완료|order\s*complet)/i.test(fbTitle) ? 'completed' : /(배송|deliver|ship)/i.test(fbTitle) ? 'shipped' : 'request')
      title = t(`notif.n.coupang_order.title.${variant}`)
      if (variant === 'request') {
        if (has('requesterName', 'productName')) {
          const neededBy = str(m.neededBy)
          message = t('notif.n.coupang_order.body.request', { requester: str(m.requesterName), product: str(m.productName) })
            + (neededBy ? t('notif.n.coupang_order.neededBy', { date: neededBy }) : '')
        }
      } else if (has('productName')) {
        message = t(`notif.n.coupang_order.body.${variant}`, { product: str(m.productName) })
      }
      break
    }
    case 'task_assigned': {
      const requested = str(m.kind) === 'request'
      title = t(requested ? 'notif.n.task_assigned.title.request' : 'notif.n.task_assigned.title.assign') || fbTitle
      if (has('actor', 'task')) {
        message = t(requested ? 'notif.n.task_assigned.body.request' : 'notif.n.task_assigned.body.assign', { actor: str(m.actor), task: str(m.task) })
      }
      break
    }
    case 'task_status_changed':
      title = t('notif.n.task_status_changed.title')
      if (has('actor', 'task', 'status')) {
        message = t('notif.n.task_status_changed.body', { actor: str(m.actor), task: str(m.task), status: t(`notif.taskStatus.${str(m.status)}`) })
      }
      break
    case 'task_comment':
      title = t('notif.n.task_comment.title')
      if (has('actor', 'task')) message = t('notif.n.task_comment.body', { actor: str(m.actor), task: str(m.task) })
      break
    case 'partner_comment':
      title = t('notif.n.partner_comment.title')
      if (has('from', 'student')) message = t('notif.n.partner_comment.body', { from: str(m.from), student: str(m.student) })
      break
    case 'collection_reminder':
      title = t('notif.n.collection_reminder.title')
      if (has('studentName', 'amount')) message = t('notif.n.collection_reminder.body', { student: str(m.studentName), label: str(m.label), amount: str(m.amount) })
      break
    case 'employee_info':
      title = t('notif.n.employee_info.title')
      message = t('notif.n.employee_info.body')
      break
    default:
      break
  }

  return { title: title || fbTitle, message: message || fbMsg }
}
