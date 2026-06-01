import * as XLSX from 'xlsx'
import { saveAs } from 'file-saver'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatCurrency } from '@/types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ExportFormat = 'excel' | 'pdf'
export type ExportScope = 'by-contract' | 'by-person'

export interface ExportParams {
  format: ExportFormat
  scope: ExportScope
  startMonth: string // 'YYYY-MM'
  endMonth: string   // 'YYYY-MM'
  /** t() function for i18n */
  t: (key: string) => string
}

export interface ExportContractRow {
  paidDate: string
  contractorName: string
  studentName: string
  installmentLabel: string
  paidAmount: number
  currency: 'KRW' | 'USD'
  recipients: string
  types: string
  totalPct: number
  incentiveAmount: number
  isPaid: boolean
}

export interface ExportPersonRow {
  displayName: string
  paymentCount: number
  amountByType: Record<string, number>
  totalIncentiveAmount: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function monthLabel(ym: string): string {
  const [y, m] = ym.split('-')
  return `${y}년 ${parseInt(m)}월`
}

function fileTimestamp(): string {
  const d = new Date()
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}

function rangeLabel(start: string, end: string): string {
  if (start === end) return monthLabel(start)
  return `${monthLabel(start)} ~ ${monthLabel(end)}`
}

// ---------------------------------------------------------------------------
// Excel Export
// ---------------------------------------------------------------------------

export function exportContractExcel(rows: ExportContractRow[], params: ExportParams) {
  const { t, startMonth, endMonth } = params
  const wsData: (string | number)[][] = []

  // Header
  wsData.push([
    t('incentive.paidDateShort'),
    t('incentive.contractorStudent'),
    t('incentive.installmentLabel'),
    t('incentive.paidAmount'),
    t('incentive.recipients'),
    t('incentive.types'),
    t('incentive.totalPct'),
    t('incentive.incentiveAmount'),
    t('common.status'),
  ])

  // Data rows
  for (const row of rows) {
    wsData.push([
      row.paidDate || row.paidDate,
      `${row.contractorName} / ${row.studentName}`,
      row.installmentLabel,
      row.paidAmount,
      row.recipients,
      row.types,
      row.totalPct,
      row.incentiveAmount,
      row.isPaid ? (t('cashflow.paid') || '납입완료') : (t('incentive.expected') || '예정'),
    ])
  }

  // Summary row
  const totalIncentive = rows.filter(r => r.isPaid).reduce((s, r) => s + r.incentiveAmount, 0)
  wsData.push([])
  wsData.push([t('common.total'), '', '', '', '', '', '', totalIncentive, ''])

  const ws = XLSX.utils.aoa_to_sheet(wsData)
  // Column widths
  ws['!cols'] = [
    { wch: 12 }, { wch: 24 }, { wch: 10 }, { wch: 14 },
    { wch: 20 }, { wch: 24 }, { wch: 8 }, { wch: 14 }, { wch: 8 },
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, t('incentive.byContract'))

  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  saveAs(blob, `인센티브_계약별_${rangeLabel(startMonth, endMonth).replace(/\s/g, '')}_${fileTimestamp()}.xlsx`)
}

export function exportPersonExcel(
  rows: ExportPersonRow[],
  activeTypes: { key: string; label: string }[],
  params: ExportParams,
) {
  const { t, startMonth, endMonth } = params
  const wsData: (string | number)[][] = []

  // Header
  const header = [
    t('incentive.personName'),
    t('incentive.paymentCount'),
    ...activeTypes.map(at => at.label),
    t('incentive.totalIncentiveAmount'),
  ]
  wsData.push(header)

  // Data rows
  for (const row of rows) {
    wsData.push([
      row.displayName,
      row.paymentCount,
      ...activeTypes.map(at => row.amountByType[at.key] || 0),
      row.totalIncentiveAmount,
    ])
  }

  // Summary row
  const totalIncentive = rows.reduce((s, r) => s + r.totalIncentiveAmount, 0)
  wsData.push([])
  wsData.push([
    t('common.total'),
    '',
    ...activeTypes.map(at => rows.reduce((s, r) => s + (r.amountByType[at.key] || 0), 0)),
    totalIncentive,
  ])

  const ws = XLSX.utils.aoa_to_sheet(wsData)
  ws['!cols'] = [
    { wch: 16 }, { wch: 10 },
    ...activeTypes.map(() => ({ wch: 14 })),
    { wch: 14 },
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, t('incentive.byPerson'))

  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  saveAs(blob, `인센티브_인별_${rangeLabel(startMonth, endMonth).replace(/\s/g, '')}_${fileTimestamp()}.xlsx`)
}

// ---------------------------------------------------------------------------
// PDF Export
// ---------------------------------------------------------------------------

export function exportContractPdf(rows: ExportContractRow[], params: ExportParams) {
  const { t, startMonth, endMonth } = params
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

  // Korean font not available in jsPDF by default, use the built-in Helvetica
  // We'll add a title and table
  doc.setFontSize(14)
  doc.text(`${t('incentive.byContract')} - ${rangeLabel(startMonth, endMonth)}`, 14, 15)

  const tableData = rows.map(row => [
    row.paidDate,
    `${row.contractorName} / ${row.studentName}`,
    row.installmentLabel,
    formatCurrency(row.paidAmount, row.currency),
    row.recipients,
    row.types,
    `${row.totalPct}%`,
    formatCurrency(row.incentiveAmount),
    row.isPaid ? 'Paid' : 'Expected',
  ])

  // Summary
  const totalIncentive = rows.filter(r => r.isPaid).reduce((s, r) => s + r.incentiveAmount, 0)
  tableData.push(['', '', '', '', '', '', t('common.total'), formatCurrency(totalIncentive), ''])

  autoTable(doc, {
    startY: 22,
    head: [[
      t('incentive.paidDateShort'),
      t('incentive.contractorStudent'),
      t('incentive.installmentLabel'),
      t('incentive.paidAmount'),
      t('incentive.recipients'),
      t('incentive.types'),
      t('incentive.totalPct'),
      t('incentive.incentiveAmount'),
      t('common.status'),
    ]],
    body: tableData,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [59, 130, 246] },
  })

  doc.save(`인센티브_계약별_${rangeLabel(startMonth, endMonth).replace(/\s/g, '')}_${fileTimestamp()}.pdf`)
}

export function exportPersonPdf(
  rows: ExportPersonRow[],
  activeTypes: { key: string; label: string }[],
  params: ExportParams,
) {
  const { t, startMonth, endMonth } = params
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

  doc.setFontSize(14)
  doc.text(`${t('incentive.byPerson')} - ${rangeLabel(startMonth, endMonth)}`, 14, 15)

  const head = [
    t('incentive.personName'),
    t('incentive.paymentCount'),
    ...activeTypes.map(at => at.label),
    t('incentive.totalIncentiveAmount'),
  ]

  const tableData = rows.map(row => [
    row.displayName,
    String(row.paymentCount),
    ...activeTypes.map(at => formatCurrency(row.amountByType[at.key] || 0)),
    formatCurrency(row.totalIncentiveAmount),
  ])

  // Summary
  const totalIncentive = rows.reduce((s, r) => s + r.totalIncentiveAmount, 0)
  tableData.push([
    t('common.total'),
    '',
    ...activeTypes.map(at => formatCurrency(rows.reduce((s, r) => s + (r.amountByType[at.key] || 0), 0))),
    formatCurrency(totalIncentive),
  ])

  autoTable(doc, {
    startY: 22,
    head: [head],
    body: tableData,
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [59, 130, 246] },
  })

  doc.save(`인센티브_인별_${rangeLabel(startMonth, endMonth).replace(/\s/g, '')}_${fileTimestamp()}.pdf`)
}
