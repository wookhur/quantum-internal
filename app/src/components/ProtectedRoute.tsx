import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import type { UserRole } from '@/types'

export const KIOSK_EMAIL = 'kiosk@quantumadmissions.com'

interface Props {
  allowedRoles?: UserRole[]
}

export function ProtectedRoute({ allowedRoles }: Props) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  const isKioskUser = user.email === KIOSK_EMAIL
  const isKioskRoute = location.pathname === '/kiosk'

  // Kiosk user can ONLY access /kiosk
  if (isKioskUser && !isKioskRoute) {
    return <Navigate to="/kiosk" replace />
  }

  // Non-kiosk users CANNOT access /kiosk
  if (!isKioskUser && isKioskRoute) {
    return <Navigate to="/dashboard" replace />
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />
  }

  return <Outlet />
}
