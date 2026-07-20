import { useMemo } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useFeatureAccess, getEffectiveEditRoutes } from '@/hooks/useProfiles'

/**
 * 특정 게시판(라우트)에 대해 현재 로그인 사용자가 '편집(수정)' 권한을 갖는지 여부.
 * 뷰어(열람 전용)면 false. 게시판의 생성/수정/삭제/저장/업로드 컨트롤을 이 값으로 잠근다.
 *
 * 사용법: const canEdit = useCanEdit('/hr/leave')
 * 하위 경로(/finance/receipts/123)도 상위 라우트 권한으로 판정된다.
 */
export function useCanEdit(routePath: string): boolean {
  const { user } = useAuth()
  const { data: featureAccess = [] } = useFeatureAccess()
  return useMemo(() => {
    if (!user) return false
    const editRoutes = getEffectiveEditRoutes(user, featureAccess)
    return editRoutes.some(r => routePath === r || routePath.startsWith(r + '/'))
  }, [user, featureAccess, routePath])
}
