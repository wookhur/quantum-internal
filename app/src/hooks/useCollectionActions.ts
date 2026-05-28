import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type CollectionActionType = 'call' | 'sms' | 'katalk' | 'email' | 'visit' | 'note'

export interface CollectionAction {
  id: string
  installmentId: string
  actionType: CollectionActionType
  content: string | null
  actedBy: string | null
  actedByName?: string
  createdAt: string
}

function mapAction(row: Record<string, unknown>): CollectionAction {
  const profile = row.profiles as Record<string, unknown> | null
  return {
    id: row.id as string,
    installmentId: row.installment_id as string,
    actionType: row.action_type as CollectionActionType,
    content: row.content as string | null,
    actedBy: row.acted_by as string | null,
    actedByName: profile?.name as string | undefined,
    createdAt: row.created_at as string,
  }
}

/** Fetch all collection actions (for the month view) */
export function useCollectionActions(installmentIds: string[]) {
  return useQuery({
    queryKey: ['collection-actions', installmentIds],
    queryFn: async () => {
      if (installmentIds.length === 0) return []
      const { data, error } = await supabase
        .from('collection_actions')
        .select('*, profiles(name)')
        .in('installment_id', installmentIds)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data || []).map((r) => mapAction(r as Record<string, unknown>))
    },
    enabled: installmentIds.length > 0,
  })
}

/** Create a new collection action */
export function useCreateCollectionAction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      installmentId: string
      actionType: CollectionActionType
      content?: string
      actedBy?: string
    }) => {
      const { data, error } = await supabase
        .from('collection_actions')
        .insert({
          installment_id: params.installmentId,
          action_type: params.actionType,
          content: params.content || null,
          acted_by: params.actedBy || null,
        })
        .select('*, profiles(name)')
        .single()
      if (error) throw error
      return mapAction(data as Record<string, unknown>)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['collection-actions'] })
    },
  })
}
