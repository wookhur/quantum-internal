// User & Auth
export type UserRole = 'admin' | 'sales' | 'consultant' | 'viewer'

export interface User {
  id: string
  email: string
  name: string
  role: UserRole
  avatarUrl?: string
  createdAt: string
}

// Pipeline
export type PipelineStage =
  | 'new_lead'
  | 'katalk_sent'
  | 'first_consultation'
  | 'second_consultation'
  | 'contract_review'
  | 'contracted'
  | 'lost'

export const PIPELINE_STAGES: { key: PipelineStage; label: string; color: string }[] = [
  { key: 'new_lead', label: '신규 리드', color: 'bg-stage-new' },
  { key: 'katalk_sent', label: '카톡 발송', color: 'bg-stage-contacted' },
  { key: 'first_consultation', label: '1차 상담', color: 'bg-stage-consulting' },
  { key: 'second_consultation', label: '2차 상담', color: 'bg-stage-review' },
  { key: 'contract_review', label: '계약 검토', color: 'bg-stage-review' },
  { key: 'contracted', label: '계약 완료', color: 'bg-stage-contracted' },
  { key: 'lost', label: '이탈', color: 'bg-stage-lost' },
]

// Leads
export interface Lead {
  id: string
  leadDate: string
  parentName: string
  studentName: string
  email?: string
  phone: string
  currentSchool: string
  grade: string
  region: string
  interestArea: string
  sourceChannel: string
  memo: string
  requiredAction?: string
  pipelineStage: PipelineStage
  assignedTo?: string
  consultations: {
    first?: { status: 'pending' | 'completed'; date?: string; method?: string }
    second?: { status: 'pending' | 'completed'; date?: string; method?: string }
    third?: { status: 'pending' | 'completed'; date?: string; method?: string }
  }
  createdAt: string
  updatedAt: string
}

// Source Channels
export const SOURCE_CHANNELS = [
  'Instagram',
  'GIA Seminar',
  '4/11 서울 세미나',
  '카카오톡',
  '소개/추천',
  '웹사이트',
  '기타',
] as const

// Interest Areas
export const INTEREST_AREAS = [
  '해외대학 입시 (대입 - Overseas)',
  'EC (대외활동 - Extracurricular)',
  '리서치 프로그램 (Research)',
  '학업 성취도 및 내신 관리',
  '표준 시험 (SAT/ACT) 전략',
  '해외대학 편입 (Overseas Transfer)',
] as const

// Todo
export type TodoStatus = 'todo' | 'in_progress' | 'done'
export type TodoPriority = 'low' | 'medium' | 'high'

export interface Todo {
  id: string
  title: string
  description?: string
  assignedTo: string
  status: TodoStatus
  priority: TodoPriority
  dueDate?: string
  linkedEntityType?: 'lead' | 'contract' | 'event'
  linkedEntityId?: string
  createdBy: string
  createdAt: string
  updatedAt: string
}

// KPI
export interface MonthlyPerformance {
  id: string
  year: number
  month: number
  region: 'KR' | 'US'
  target: number
  actual: number
  achievementRate: number
  consultationCount?: number
  newContracts?: number
  conversionRate?: number
  currency: 'KRW' | 'USD'
}

// Meetings
export type ConsultationMethod = 'in_person' | 'zoom' | 'phone' | 'katalk'

export interface Meeting {
  id: string
  leadId?: string
  meetingDate: string
  meetingNumber: number
  parentName: string
  studentName?: string
  phone?: string
  currentSchool?: string
  grade?: string
  region?: string
  interestArea?: string
  sourceChannel?: string
  memo?: string
  noteDelivered: boolean
  nextMeetingDate?: string
  requiredAction?: string
  googleCalendarEventId?: string
  createdBy?: string
  createdAt: string
}

// Sales Events
export interface SalesEvent {
  id: string
  month: string
  eventName: string
  applicants: number
  attendees: number
  phoneConsultations: number
  zoomBookings: number
  inPersonBookings: number
  totalMeetings: number
  contracts: number
  contractRate: number
  createdAt: string
}

// Marketing Metrics
export interface MarketingMetric {
  id: string
  year: number
  month: number
  week?: number
  channel: string
  metric: string
  annualTarget?: number
  value: number
  createdAt: string
}

// Ad Campaigns
export type AdPlatform = 'meta' | 'kakao'

export interface AdCampaign {
  id: string
  platform: AdPlatform
  eventName: string
  impressions: number
  reach: number
  clicks: number
  cost: number
  ctr: number
  cpc: number
  comments?: number
  commentRate?: number
  costPerComment?: number
  friendsBefore?: number
  friendsAfter?: number
  note?: string
  createdAt: string
}

// Events
export interface Event {
  id: string
  month: string
  week?: number
  eventName: string
  eventDatetime?: string
  venue?: string
  speakers?: string[]
  speakerConfirmed: boolean
  venueConfirmed: boolean
  copyWritten: boolean
  designCompleted: boolean
  pptCompleted: boolean
  uploaded: boolean
  createdAt: string
}

// Contracts
export type ContractStatus = 'active' | 'expiring_soon' | 'expired'

export interface Contract {
  id: string
  leadId?: string
  contractorName: string
  studentName: string
  schoolName: string
  gradeAtContract?: string
  contractDate: string
  expiryDate: string
  status: ContractStatus
  createdAt: string
  updatedAt: string
}

// Payments
export type TransferStage = 'deposit' | 'interim1' | 'interim2' | 'balance' | 'other'
export type TransferMethod = 'bank_transfer' | 'card' | 'other'

export const TRANSFER_STAGE_LABELS: Record<TransferStage, string> = {
  deposit: '계약금',
  interim1: '중도금 1',
  interim2: '중도금 2',
  balance: '잔금',
  other: '기타',
}

export const TRANSFER_METHOD_LABELS: Record<TransferMethod, string> = {
  bank_transfer: '계좌이체',
  card: '카드',
  other: '기타',
}

export interface PaymentTransfer {
  id: string
  paymentId: string
  stage: TransferStage
  amount: number
  transferredAt: string
  confirmedAt: string
  senderName?: string
  transferMethod: TransferMethod
  memo?: string
  confirmedBy?: string
  createdAt: string
}

export interface Payment {
  id: string
  contractId: string
  // 예정 납기일 및 금액 (계약서 기준)
  depositAmount: number
  depositDate?: string      // 계약금 납기 예정일
  interim1Amount: number
  interim1Date?: string     // 중도금1 납기 예정일
  interim2Amount: number
  interim2Date?: string     // 중도금2 납기 예정일
  balanceAmount: number
  balanceDate?: string      // 잔금 납기 예정일
  // 수금 현황
  totalAmount: number
  paidAmount: number
  outstandingAmount: number
  paymentProgress: number
  currency: 'KRW' | 'USD'
  createdAt: string
  updatedAt: string
  contract?: Contract
  transfers?: PaymentTransfer[]
}

// Video Projects
export type VideoStatus = 'idea' | 'approved' | 'filming' | 'editing' | 'review' | 'uploaded'

export interface VideoProject {
  id: string
  title: string
  category?: string
  status: VideoStatus
  assignedTo?: string
  dueDate?: string
  platform?: 'youtube' | 'instagram_reels' | 'both'
  views?: number
  likes?: number
  comments?: number
  shares?: number
  publishedUrl?: string
  checklist?: Record<string, boolean>
  notes?: string
  createdAt: string
  updatedAt: string
}

// Navigation
export interface NavItem {
  title: string
  url: string
  icon: string
  roles: UserRole[]
  children?: NavItem[]
}
