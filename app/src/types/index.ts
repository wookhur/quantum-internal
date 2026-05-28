// ============ USER & AUTH ============
export type UserRole = 'admin' | 'manager' | 'staff' | 'freelancer' | 'viewer'
export type Department = 'management' | 'sales' | 'marketing' | 'finance' | 'service'

export interface User {
  id: string
  email: string
  name: string
  role: UserRole
  department?: Department
  position?: string  // 대표이사, 부대표, 이사, 팀장, etc
  isExternal: boolean
  avatarUrl?: string
  createdAt: string
}

// ============ PIPELINE ============
export type PipelineStage =
  | 'new_lead'
  | 'contact_attempted'
  | 'consultation_scheduled'
  | 'first_consultation'
  | 'second_consultation'
  | 'third_consultation'
  | 'contract_review'
  | 'contracted'
  | 'on_hold'
  | 'no_response'
  | 'rejected'
  | 'lost'

// Stage config with label, color (for status pills), and column grouping
export const PIPELINE_STAGES: { key: PipelineStage; label: string; color: string; group: 'active' | 'won' | 'inactive' }[] = [
  { key: 'new_lead', label: '신규 리드', color: 'stage-new-lead', group: 'active' },
  { key: 'contact_attempted', label: '컨택 시도', color: 'stage-contact-attempted', group: 'active' },
  { key: 'consultation_scheduled', label: '상담 예약', color: 'stage-consultation-scheduled', group: 'active' },
  { key: 'first_consultation', label: '1차 상담', color: 'stage-first-consultation', group: 'active' },
  { key: 'second_consultation', label: '2차 상담', color: 'stage-second-consultation', group: 'active' },
  { key: 'third_consultation', label: '3차 상담', color: 'stage-third-consultation', group: 'active' },
  { key: 'contract_review', label: '계약 검토', color: 'stage-contract-review', group: 'active' },
  { key: 'contracted', label: '계약 완료', color: 'stage-contracted', group: 'won' },
  { key: 'on_hold', label: '보류', color: 'stage-on-hold', group: 'inactive' },
  { key: 'no_response', label: '응답없음', color: 'stage-no-response', group: 'inactive' },
  { key: 'rejected', label: '거절', color: 'stage-rejected', group: 'inactive' },
  { key: 'lost', label: '이탈', color: 'stage-lost', group: 'inactive' },
]

// Helper to get stage config
export function getStageConfig(stage: PipelineStage) {
  return PIPELINE_STAGES.find(s => s.key === stage) || PIPELINE_STAGES[0]
}

// ============ LEADS ============
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
  assignedTo?: string  // profile id
  assignedUser?: User  // joined
  contactChannel?: string  // 단톡방, 카카오 비즈, 전화
  googleMeetLink?: string
  createdAt: string
  updatedAt: string
  // Computed/joined
  lastActivityAt?: string
  activityCount?: number
}

// Source channels - based on actual data
export const SOURCE_CHANNELS = [
  'Instagram',
  '카카오톡',
  'GIA Seminar',
  '서울 세미나',
  '부산 세미나',
  '제주 세미나',
  '웨비나',
  '4월 서울 세미나',
  '4월 제주 세미나',
  '4월 부산 세미나',
  '4월 미국 온라인 웨비나',
  '소개/추천',
  '국민이주 소개',
  '웹사이트',
  '기타',
] as const

// Interest areas - based on actual data
export const INTEREST_AREAS = [
  '해외대학 입시 (College Admissions)',
  'EC 대외활동 (Extracurricular)',
  '리서치 프로그램 (Research)',
  '인턴십 (Internship)',
  '보딩스쿨 (Boarding School)',
  '해외대학 편입 (Transfer)',
  '캡스톤 프로젝트 (Capstone)',
  '국제/국내 대회 (Competition)',
  '학업 관리 (Academic)',
] as const

// Regions - based on actual data (global clients)
export const REGIONS = [
  '서울', '부산', '제주', '대구', '인천',
  '미국', '캐나다', '영국', '홍콩', '싱가폴',
  '중국', '두바이', '일본', '멕시코', '발리',
  '기타',
] as const

// Grade values
export const GRADES = [
  'G7', 'G8', 'G9', 'G10', 'G11', 'G12',
  'Y7', 'Y8', 'Y9', 'Y10', 'Y11', 'Y12', 'Y13',
  '중1', '중2', '중3', '고1', '고2', '고3',
  '대학생', '기타',
] as const

// ============ LEAD ACTIVITIES ============
export type ActivityType = 'note' | 'call' | 'sms' | 'katalk' | 'email' | 'meeting' | 'consultation' | 'stage_change' | 'assignment_change' | 'system'
export type ConsultationMethod = 'zoom' | 'in_person' | 'phone' | 'katalk'

export interface LeadActivity {
  id: string
  leadId: string
  activityType: ActivityType
  title: string
  content?: string
  consultationNumber?: number
  consultationMethod?: ConsultationMethod
  meetingDate?: string
  googleMeetLink?: string
  metadata?: Record<string, unknown>
  createdBy?: string
  createdByUser?: User  // joined
  createdAt: string
}

// ============ CONTRACTS ============
export type ContractStatus = 'active' | 'expiring_soon' | 'expired' | 'cancelled'

export interface Contract {
  id: string
  leadId?: string
  contractorName: string  // parent name with (모)/(부) suffix
  studentName: string
  schoolName: string
  gradeAtContract?: string
  address?: string
  phone?: string
  contractDate: string
  expiryDate: string
  totalAmount: number
  currency: 'KRW' | 'USD'
  paymentAccount: 'KR' | 'US'
  salesRep?: string  // profile id
  serviceRep?: string  // profile id
  salesRepUser?: User  // joined
  serviceRepUser?: User  // joined
  status: ContractStatus
  notes?: string
  createdAt: string
  updatedAt: string
  // Joined
  installments?: PaymentInstallment[]
  paidAmount?: number
  outstandingAmount?: number
  paymentProgress?: number
}

// ============ PAYMENT INSTALLMENTS ============
export type InstallmentStatus = 'pending' | 'paid' | 'overdue' | 'partial'
export type PaymentMethod = 'bank_transfer' | 'card' | 'us_wire'

export type InstallmentCategory = 'base' | 'extra'

export interface PaymentInstallment {
  id: string
  contractId: string
  installmentOrder: number
  label: string  // 계약금, 중도금, 잔금
  amount: number
  dueDate?: string
  paidDate?: string
  paidAmount: number
  status: InstallmentStatus
  currency: 'KRW' | 'USD'
  category: InstallmentCategory
  paymentMethod?: PaymentMethod
  notes?: string
  createdAt: string
  updatedAt: string
  // Joined
  contract?: Contract
  revenueShares?: RevenueShare[]
}

export interface RevenueShare {
  id: string
  installmentId: string
  recipientName: string
  recipientProfileId?: string
  amount: number
  percentage?: number
  role?: string
  notes?: string
  isPaid: boolean
  paidDate?: string
  createdAt: string
  updatedAt: string
}

// ============ PROJECTS (formerly TODOS) ============
export type TodoStatus = 'todo' | 'in_progress' | 'done'
export type TodoPriority = 'low' | 'medium' | 'high'
export type ProjectTeam = 'management' | 'sales' | 'marketing' | 'finance' | 'service'

export interface Todo {
  id: string
  title: string
  description?: string
  team?: ProjectTeam
  ownerId?: string         // 책임자 1명
  assignees?: string[]     // 담당자 여러명
  assignedTo: string       // legacy - 하위호환
  assignedUser?: User
  status: TodoStatus
  priority: TodoPriority
  dueDate?: string
  linkedEntityType?: 'lead' | 'contract' | 'event' | 'video'
  linkedEntityId?: string
  linkedTaskId?: string    // linked task board item
  createdBy: string
  createdAt: string
  updatedAt: string
}

// ============ SALES EVENTS (Funnel) ============
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

// ============ MARKETING ============
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

// ============ EVENTS ============
export interface Event {
  id: string
  month: string
  week?: number
  eventName: string
  eventDate?: string
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

// ============ MONTHLY PERFORMANCE ============
export interface MonthlyPerformance {
  id: string
  year: number
  month: number
  region: 'KR' | 'US'
  target: number
  actual: number
  achievementRate: number
  expenses?: number
  profit?: number
  consultationCount?: number
  newContracts?: number
  conversionRate?: number
  currency: 'KRW' | 'USD'
}

// ============ VIDEO PROJECTS ============
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

// ============ MEETINGS (legacy, may be merged into activities) ============
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

// ============ GOOGLE CALENDAR ============
export interface GoogleCalendarEvent {
  id: string
  googleEventId: string
  calendarId: string
  summary: string
  description?: string
  startTime: string
  endTime: string
  isAllDay: boolean
  location?: string
  creatorEmail?: string
  status: string
  conferenceUrl?: string
  syncedAt: string
}

// ============ NAVIGATION ============
export interface NavItem {
  title: string
  url: string
  icon: string
  roles: UserRole[]
  children?: NavItem[]
}

// ============ STUDENT 360 (SERVICE) ============
export type ServiceReportStatus = 'none' | 'pending' | 'submitted'

export interface ServiceStudent {
  id: string
  name: string                 // Student Name (English/roman)
  koreanName?: string
  email?: string
  parentEmail?: string
  nationality?: string
  parentName?: string
  contact?: string
  region?: string
  grade?: string
  school?: string
  assignedConsultant?: string
  essayEditor?: string
  partners?: string
  majors?: string
  contractType?: string
  communicationPlatform?: string
  preferredLanguage?: string
  startDate?: string
  endDate?: string
  status?: string
  notes?: string
  acceptedUni?: string
  address?: string
  regularMeetingSchedule?: string
  createdBy?: string
  createdAt: string
  updatedAt: string
}

export interface ServiceMeeting {
  id: string
  studentId: string
  meetingDate?: string
  meetingType?: string
  consultantId?: string
  consultantUser?: User
  summary?: string
  prepUrl?: string
  reportStatus: ServiceReportStatus
  reportUrl?: string
  reportDate?: string
  createdBy?: string
  createdAt: string
  updatedAt: string
}

export type ServiceReportCategory =
  | 'strength_result'
  | 'strength_report'
  | 'grade_report'
  | 'grade_analysis'
  | 'other'

export interface ServiceReport {
  id: string
  studentId: string
  category: ServiceReportCategory
  grade?: string
  label?: string
  url: string
  createdBy?: string
  createdAt: string
  updatedAt: string
}

export interface ServiceFollowup {
  id: string
  studentId: string
  diaryId?: string
  text: string
  done: boolean
  doneAt?: string
  dueDate?: string
  createdBy?: string
  createdAt: string
  updatedAt: string
}

export interface ServiceDiaryEntry {
  id: string
  studentId: string
  entryDate?: string
  prepUrl?: string
  summaryUrl?: string
  agendaItems?: string
  meetingSummary?: string
  extracurricularNotes?: string
  identityNarrativeNotes?: string
  questionsConcerns?: string
  nextMeetingAgenda?: string
  followUpCommitments?: string
  assignments?: string
  criticalDates?: string
  authorId?: string
  createdBy?: string
  createdAt: string
  updatedAt: string
}

// ============ SERVICE DASHBOARD ============
export type MilestoneType = 'strategy' | 'essay' | 'application' | 'competition' | 'decision' | 'ec_activity'
export type MilestoneStatus = 'on_track' | 'behind' | 'urgent' | 'completed' | 'upcoming'

export interface StudentMilestone {
  id: string
  studentId: string
  type: MilestoneType
  title: string
  date: string
  status: MilestoneStatus
  notes?: string
  createdBy?: string
  createdAt: string
  updatedAt: string
}

// ============ FORMATTING HELPERS ============
export function formatCurrency(amount: number, currency: 'KRW' | 'USD' = 'KRW'): string {
  if (currency === 'USD') {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
  }
  return new Intl.NumberFormat('ko-KR').format(amount) + '원'
}

export function formatPhone(phone: string): string {
  if (!phone) return ''
  // Korean mobile: 010-xxxx-xxxx
  const cleaned = phone.replace(/[^\d+]/g, '')
  if (cleaned.startsWith('010') && cleaned.length === 11) {
    return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 7)}-${cleaned.slice(7)}`
  }
  return phone // return as-is for international numbers
}

// ============ TASKS ============
export type TaskStatus = 'requested' | 'in_progress' | 'completed' | 'cancelled'
export type TaskPriority = 'urgent' | 'normal' | 'low'

export interface Task {
  id: string
  title: string
  description?: string
  status: TaskStatus
  priority: TaskPriority
  requesterId: string
  assigneeId?: string
  department?: string
  dueDate?: string
  completedAt?: string
  parentTaskId?: string
  isRecurring: boolean
  recurrenceRule?: string
  tags?: string[]
  createdAt: string
  updatedAt: string
  // Joined
  requester?: { id: string; name: string }
  assignee?: { id: string; name: string }
  subtasks?: Task[]
  commentCount?: number
  attachmentCount?: number
}

export interface TaskComment {
  id: string
  taskId: string
  authorId: string
  content: string
  createdAt: string
  // Joined
  author?: { id: string; name: string }
}

export interface TaskAttachment {
  id: string
  taskId: string
  fileName: string
  fileUrl: string
  fileSize?: number
  uploadedBy: string
  createdAt: string
  // Joined
  uploader?: { id: string; name: string }
}
