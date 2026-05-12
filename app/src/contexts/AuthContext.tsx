import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from 'react'
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
    avatarUrl: data.avatar_url as string | undefined,
    createdAt: data.created_at as string,
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const profileFetchInProgress = useRef<Promise<User | null> | null>(null)

  const fetchProfile = useCallback(async (userId: string, email: string, fullName?: string): Promise<User | null> => {
    // Prevent concurrent fetchProfile calls from racing
    if (profileFetchInProgress.current) {
      return profileFetchInProgress.current
    }

    const doFetch = async (): Promise<User | null> => {
      // 1. Try to get existing profile
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()

      if (data && !error) {
        return toUser(data, email)
      }

      // 2. Profile not found — try to create it
      const name = fullName || email.split('@')[0]
      const { data: newProfile, error: insertError } = await supabase
        .from('profiles')
        .insert({ id: userId, email, name, role: 'viewer' })
        .select()
        .single()

      if (newProfile && !insertError) {
        return toUser(newProfile, email)
      }

      // 3. INSERT failed (e.g., duplicate from concurrent call) — try SELECT again
      const { data: retryData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()

      if (retryData) {
        return toUser(retryData, email)
      }

      console.error('Failed to create or fetch profile:', insertError)
      return null
    }

    // Add timeout to prevent hanging
    const timeoutPromise = new Promise<User | null>((_, reject) =>
      setTimeout(() => reject(new Error('Profile fetch timeout (4s)')), 4000)
    )

    profileFetchInProgress.current = doFetch()
    try {
      return await Promise.race([profileFetchInProgress.current, timeoutPromise])
    } finally {
      profileFetchInProgress.current = null
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    // Safety timeout — if auth takes longer than 5s, stop loading
    const safetyTimer = setTimeout(() => {
      if (isMounted) {
        console.warn('Auth loading safety timeout reached (5s)')
        setLoading(false)
      }
    }, 5000)

    // Use onAuthStateChange as the single source of truth
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, s) => {
        try {
          if (s?.user) {
            const fullName = s.user.user_metadata?.full_name || s.user.user_metadata?.name
            const profile = await fetchProfile(s.user.id, s.user.email || '', fullName)
            if (isMounted) {
              setUser(profile)
              setSession(s)
            }
          } else if (isMounted) {
            setUser(null)
            setSession(null)
          }
        } catch (err) {
          console.error('Auth state change error:', err)
          if (isMounted) {
            setUser(null)
            setSession(null)
          }
        } finally {
          if (isMounted) {
            clearTimeout(safetyTimer)
            setLoading(false)
          }
        }
      }
    )

    // Also check initial session (in case onAuthStateChange doesn't fire)
    supabase.auth.getSession().then(async ({ data: { session: s } }) => {
      try {
        if (s?.user) {
          const fullName = s.user.user_metadata?.full_name || s.user.user_metadata?.name
          const profile = await fetchProfile(s.user.id, s.user.email || '', fullName)
          if (isMounted) {
            setUser(profile)
            setSession(s)
          }
        }
      } catch (err) {
        console.error('Get session error:', err)
      } finally {
        if (isMounted) {
          clearTimeout(safetyTimer)
          setLoading(false)
        }
      }
    })

    return () => {
      isMounted = false
      clearTimeout(safetyTimer)
      subscription.unsubscribe()
    }
  }, [fetchProfile])

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
    try {
      await supabase.auth.signOut()
    } catch (err) {
      console.error('Sign out error (clearing local state anyway):', err)
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
