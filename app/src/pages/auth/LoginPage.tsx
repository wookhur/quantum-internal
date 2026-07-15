import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useT } from '@/i18n/LanguageContext'
import { supabase } from '@/lib/supabase'

export function LoginPage() {
  const t = useT()
  const { user, loading, signInWithGoogle, signInWithEmail } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showSetPassword, setShowSetPassword] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [settingPassword, setSettingPassword] = useState(false)
  const [passwordSet, setPasswordSet] = useState(false)
  // 외부 파트너 강사 셀프 가입
  const [signupMode, setSignupMode] = useState(false)
  const [signupConfirm, setSignupConfirm] = useState('')
  const [signupInfo, setSignupInfo] = useState('')

  // Detect invite/recovery flow from URL hash
  useEffect(() => {
    const hash = window.location.hash
    if (hash && (hash.includes('type=invite') || hash.includes('type=recovery'))) {
      setShowSetPassword(true)
    }
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  // If user is logged in and NOT in set-password mode, redirect
  if (user && !showSetPassword) {
    return <Navigate to="/dashboard" replace />
  }

  // If password was just set, redirect
  if (passwordSet) {
    return <Navigate to="/dashboard" replace />
  }

  const handleGoogle = async () => {
    setError('')
    const { error: err } = await signInWithGoogle()
    if (err) setError(err.message)
  }

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    const { error: err } = await signInWithEmail(email, password)
    if (err) setError(err.message)
    setSubmitting(false)
  }

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(''); setSignupInfo('')
    if (password.length < 6) { setError(t('login.passwordMinLength')); return }
    if (password !== signupConfirm) { setError(t('login.passwordMismatch')); return }
    setSubmitting(true)
    try {
      // 등록된 파트너 강사 이메일만 가입 허용
      const { data: allowed, error: rpcErr } = await supabase.rpc('instructor_email_exists', { p_email: email.trim() })
      if (rpcErr) { setError(rpcErr.message); setSubmitting(false); return }
      if (!allowed) {
        setError('파트너 강사관리에 등록된 이메일이 아닙니다. 관리자에게 등록을 요청하세요.')
        setSubmitting(false); return
      }
      const { data, error: signErr } = await supabase.auth.signUp({ email: email.trim(), password })
      if (signErr) { setError(signErr.message); setSubmitting(false); return }
      if (data.session) {
        // 이메일 확인이 꺼져 있으면 바로 로그인됨 → 리다이렉트
        setSignupInfo('')
      } else {
        setSignupInfo('계정이 생성되었습니다. 확인 이메일이 발송된 경우 확인 후 이메일/비밀번호로 로그인하세요.')
        setSignupMode(false)
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (newPassword.length < 6) {
      setError(t('login.passwordMinLength'))
      return
    }
    if (newPassword !== confirmPassword) {
      setError(t('login.passwordMismatch'))
      return
    }
    setSettingPassword(true)
    const { error: err } = await supabase.auth.updateUser({ password: newPassword })
    if (err) {
      setError(err.message)
    } else {
      setPasswordSet(true)
    }
    setSettingPassword(false)
  }

  // ─── Set Password Screen (for invited users) ───
  if (showSetPassword && user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-[400px]">
          <div className="text-center mb-8">
            <img src="/logo-navy.png" alt="Quantum Admissions" className="h-12 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground mt-1">Internal Management System</p>
          </div>

          <Card>
            <CardHeader className="text-center pb-4">
              <CardTitle className="text-lg">{t('login.setPasswordTitle')}</CardTitle>
              <CardDescription>{t('login.setPasswordDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {error && (
                <div className="text-sm text-destructive bg-destructive/10 rounded-md p-3">
                  {error}
                </div>
              )}

              <form onSubmit={handleSetPassword} className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-sm">{t('login.newPassword')}</Label>
                  <Input
                    type="password"
                    placeholder="••••••••"
                    className="h-10"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">{t('login.confirmPassword')}</Label>
                  <Input
                    type="password"
                    placeholder="••••••••"
                    className="h-10"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                </div>
                <Button className="w-full h-10" type="submit" disabled={settingPassword}>
                  {settingPassword ? t('common.saving') : t('login.setPasswordBtn')}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-[400px]">
        {/* Logo */}
        <div className="text-center mb-8">
          <img src="/logo-navy.png" alt="Quantum Admissions" className="h-12 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground mt-1">Internal Management System</p>
        </div>

        <Card>
          <CardHeader className="text-center pb-4">
            <CardTitle className="text-lg">{t('login.title')}</CardTitle>
            <CardDescription>{t('login.subtitle')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <div className="text-sm text-destructive bg-destructive/10 rounded-md p-3">
                {error}
              </div>
            )}
            {signupInfo && (
              <div className="text-sm text-emerald-700 bg-emerald-50 rounded-md p-3">
                {signupInfo}
              </div>
            )}

            {/* Google OAuth */}
            <Button
              variant="outline"
              className="w-full gap-3 h-11"
              onClick={handleGoogle}
            >
              <svg className="size-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              {t('login.googleLogin')}
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <Separator className="w-full" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">{t('login.or')}</span>
              </div>
            </div>

            {/* Email/Password (login or 외부 강사 가입) */}
            <form onSubmit={signupMode ? handleSignup : handleEmail} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-sm">{t('login.email')}</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  className="h-10"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-sm">{signupMode ? '비밀번호 설정' : t('login.password')}</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  className="h-10"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  minLength={signupMode ? 6 : undefined}
                />
              </div>
              {signupMode && (
                <div className="space-y-1.5">
                  <Label htmlFor="signupConfirm" className="text-sm">비밀번호 확인</Label>
                  <Input
                    id="signupConfirm"
                    type="password"
                    placeholder="••••••••"
                    className="h-10"
                    value={signupConfirm}
                    onChange={e => setSignupConfirm(e.target.value)}
                    required
                    minLength={6}
                  />
                </div>
              )}
              <Button className="w-full h-10" type="submit" disabled={submitting}>
                {submitting ? t('login.submitting') : (signupMode ? '외부 강사 계정 만들기' : t('login.submit'))}
              </Button>
            </form>

            <div className="text-center">
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                onClick={() => { setSignupMode(m => !m); setError(''); setSignupInfo(''); setSignupConfirm('') }}
              >
                {signupMode ? '← 로그인으로 돌아가기' : '외부 파트너 강사이신가요? 계정 만들기'}
              </button>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-6">
          internal.quantumadmissions.com
        </p>
      </div>
    </div>
  )
}
