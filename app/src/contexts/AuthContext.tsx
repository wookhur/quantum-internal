import { createContext, useContext, useEffect, useState, useRef, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import type { Session } from '@supabase/supabase-js'
import type { User, UserRole } from '@/types'

interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
  signInWithGoogle: () => Promise<{ error: Error | null }>
  signInWithEmail: (email: string, password: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

function toUser(data: Record<string, unknown>, fallbackEmail: string): User {
  return {
    id: data.id as string,
    email: (data.email as string) || fallbackEmail,
    name: data.name as string,
    role: data.role as UserRole,
    department: (data.department as User['department']) || undefined,
    position: data.position as string | undefined,
    isExternal: (data.is_external as boolean) || false,
    isPartner: (data.is_partner as boolean) || false,
    canApproveOrders: (data.can_approve_orders as boolean) || false,
    canApproveLeave: (data.can_approve_leave as boolean) || false,
    avatarUrl: data.avatar_url as string | undefined,
    createdAt: data.created_at as string,
  }
}

function fallbackUser(s: Session): User {
  return {
    id: s.user.id,
    email: s.user.email || '',
    name: s.user.user_metadata?.full_name || s.user.user_metadata?.name || s.user.email?.split('@')[0] || 'User',
    role: 'external' as UserRole,
    isExternal: false,
    createdAt: s.user.created_at,
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  // KEY FIX: track whether we've successfully loaded the profile.
  // Once loaded, we NEVER re-fetch or allow fallback to overwrite it.
  const profileResolved = useRef(false)
  const fetchInFlight = useRef<Promise<User | null> | null>(null)

  useEffect(() => {
    let isMounted = true

    const safetyTimer = setTimeout(() => {
      if (isMounted) {
        console.warn('Auth loading safety timeout (12s)')
        setLoading(false)
      }
    }, 12000)

    async function fetchProfile(userId: string, email: string, fullName?: string): Promise<User | null> {
      // 1. Try to get existing profile
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()

      if (data && !error) {
        return toUser(data, email)
      }

      // 2. Profile not found — try to create
      const name = fullName || email.split('@')[0]
      const { data: newProfile, error: insertError } = await supabase
        .from('profiles')
        .insert({ id: userId, email, name, role: 'external' })
        .select()
        .single()

      if (newProfile && !insertError) {
        return toUser(newProfile, email)
      }

      // 3. INSERT race — retry SELECT
      const { data: retryData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()

      if (retryData) return toUser(retryData, email)

      console.error('Failed to fetch/create profile:', insertError)
      return null
    }

    /** Load profile exactly once. All concurrent callers share the same promise. */
    async function ensureProfile(s: Session) {
      // Already have a good profile — just update session
      if (profileResolved.current) {
        if (isMounted) setSession(s)
        return
      }

      // Deduplicate concurrent calls
      if (!fetchInFlight.current) {
        const fullName = s.user.user_metadata?.full_name || s.user.user_metadata?.name
        fetchInFlight.current = Promise.race([
          fetchProfile(s.user.id, s.user.email || '', fullName),
          new Promise<null>(resolve => setTimeout(() => {
            console.warn('Profile fetch timeout (8s)')
            resolve(null)
          }, 8000)),
        ])
      }

      try {
        const profile = await fetchInFlight.current
        if (isMounted) {
          if (profile) {
            profileResolved.current = true
            setUser(profile)
          } else {
            // Only use fallback if we've NEVER successfully loaded
            setUser(prev => prev && prev.role !== 'external' ? prev : fallbackUser(s))
          }
          setSession(s)
        }
      } catch (err) {
        console.error('Profile fetch error:', err)
        if (isMounted) {
          setUser(prev => prev && prev.role !== 'external' ? prev : fallbackUser(s))
          setSession(s)
        }
      } finally {
        fetchInFlight.current = null
        if (isMounted) {
          clearTimeout(safetyTimer)
          setLoading(false)
        }
      }
    }

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, s) => {
        if (event === 'SIGNED_OUT') {
          profileResolved.current = false
          if (isMounted) { setUser(null); setSession(null); setLoading(false) }
          return
        }
        if (s?.user) {
          await ensureProfile(s)
        }
      }
    )

    // Also check initial session
    supabase.auth.getSession().then(async ({ data: { session: s } }) => {
      if (s?.user) {
        await ensureProfile(s)
      } else if (isMounted) {
        clearTimeout(safetyTimer)
        setLoading(false)
      }
    })

    return () => {
      isMounted = false
      clearTimeout(safetyTimer)
      subscription.unsubscribe()
    }
  }, [])

  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/dashboard`,
        queryParams: { hd: 'quantumadmissions.com' },
        scopes: 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly',
      },
    })
    return { error }
  }

  const signInWithEmail = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error }
  }

  const signOut = async () => {
    profileResolved.current = false
    try {
      await supabase.auth.signOut()
    } catch (err) {
      console.error('Sign out error:', err)
    } finally {
      setUser(null)
      setSession(null)
      setLoading(false)
    }
  }

  return (
    <AuthContext.Provider value={{ user, session, loading, signInWithGoogle, signInWithEmail, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
