import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { createNotificationsForUsers } from './useUserNotifications'
import type { LeaveType } from '@/lib/leave'

export type LeaveStatus = 'requested' | 'approved' | 'rejected'

export interface LeaveRequest {
  id: string
  requesterId: string
  requesterName?: string
  leaveType: LeaveType
  eventType?: string
  startDate: string
  endDate: string
  days: number
  paid: boolean
  reason?: string
  status: LeaveStatus
  approvedBy?: string
  approvedByName?: string
  approvedAt?: string
  createdAt: string
}

function mapRow(row: Record<string, unknown>): LeaveRequest {
  const requester = row.requester as Record<string, unknown> | null
  const approver = row.approver as Record<string, unknown> | null
  return {
    id: row.id as string,
    requesterId: row.requester_id as string,
    requesterName: requester?.name as string | undefined,
    leaveType: (row.leave_type as LeaveType) || 'annual',
    eventType: (row.event_type as string) || undefined,
    startDate: row.start_date as string,
    endDate: row.end_date as string,
    days: Number(row.days) || 0,
    paid: row.paid !== false,
    reason: (row.reason as string) || undefined,
    status: (row.status as LeaveStatus) || 'requested',
    approvedBy: (row.approved_by as string) || undefined,
    approvedByName: approver?.name as string | undefined,
    approvedAt: (row.approved_at as string) || undefined,
    createdAt: row.created_at as string,
  }
}

async function fetchLeaveApproverIds(): Promise<string[]> {
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .or('role.eq.admin,can_approve_leave.eq.true')
  return (data || []).map((r: Record<string, unknown>) => r.id as string)
}

export function useLeaveRequests() {
  return useQuery({
    queryKey: ['leave-requests'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leave_requests')
        .select('*, requester:requester_id(name), approver:approved_by(name)')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data || []).map(r => mapRow(r as Record<string, unknown>))
    },
  })
}

export function useCreateLeaveRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      requesterId: string
      requesterName: string
      leaveType: LeaveType
      eventType?: string
      startDate: string
      endDate: string
      days: number
      paid: boolean
      reason?: string
    }) => {
      const { error } = await supabase.from('leave_requests').insert({
        requester_id: input.requesterId,
        leave_type: input.leaveType,
        event_type: input.eventType || null,
        start_date: input.startDate,
        end_date: input.endDate,
        days: input.days,
        paid: input.paid,
        reason: input.reason || null,
      })
      if (error) throw error

      const approverIds = await fetchLeaveApproverIds()
      if (approverIds.length > 0) {
        await createNotificationsForUsers(approverIds, {
          type: 'leave_request',
          title: '휴가 승인 요청',
          message: `${input.requesterName}님이 ${input.startDate} ~ ${input.endDate} 휴가(${input.days}일)를 신청했습니다.`,
          link: '/hr/leave',
        })
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leave-requests'] }),
  })
}

export function useUpdateLeaveStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      id: string
      status: LeaveStatus
      actorId?: string
      requesterId?: string
      startDate?: string
      endDate?: string
    }) => {
      const update: Record<string, unknown> = { status: input.status, updated_at: new Date().toISOString() }
      if (input.status === 'approved') {
        update.approved_by = input.actorId || null
        update.approved_at = new Date().toISOString()
      }
      const { error } = await supabase.from('leave_requests').update(update).eq('id', input.id)
      if (error) throw error

      if ((input.status === 'approved' || input.status === 'rejected') && input.requesterId) {
        const approved = input.status === 'approved'
        await createNotificationsForUsers([input.requesterId], {
          type: 'leave_request',
          title: approved ? '휴가 승인됨' : '휴가 반려됨',
          message: `${input.startDate || ''} ~ ${input.endDate || ''} 휴가 신청이 ${approved ? '승인되었습니다.' : '반려되었습니다.'}`,
          link: '/hr/leave',
        })
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leave-requests'] }),
  })
}

export function useDeleteLeaveRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('leave_requests').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leave-requests'] }),
  })
}
