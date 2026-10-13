// Supabase Edge Function: send-instructor-login
// 관리자가 파트너 강사에게 로그인 메일을 보낸다.
//  - 이미 계정이 있으면: 로그인(매직) 링크
//  - 아직 계정이 없으면: 초대 메일 → 링크 클릭 후 로그인 화면에서 비밀번호 설정
// 계정 생성은 관리자 확인 + partner_instructors 등록 확인을 모두 통과한 경우에만 서버에서 한다.
// 첫 로그인 때 apply_my_instructor_access(useApplyMyInstructorAccess)가 등록된 권한을 적용한다.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// 파트너 강사관리 화면(admin, account)과 다른 강사 관리 함수(reset-instructor-password)의 관리자 역할
const ALLOWED_ROLES = ['admin', 'c_level', 'account', 'service_manager', 'sales_manager']

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'No authorization header' }, 401)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    // 1) 호출자 인증 + 관리자 권한 확인
    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user: caller }, error: authError } = await anonClient.auth.getUser()
    if (authError || !caller) return json({ error: 'Unauthorized' }, 401)

    const { data: callerProfile } = await anonClient
      .from('profiles').select('role').eq('id', caller.id).single()
    if (!callerProfile || !ALLOWED_ROLES.includes(callerProfile.role)) {
      return json({ error: '관리자만 강사에게 로그인 메일을 보낼 수 있습니다.' }, 403)
    }

    // 2) 대상 이메일 — 파트너 강사관리에 등록된 이메일만 허용
    const { email } = await req.json()
    if (!email || typeof email !== 'string') return json({ error: '이메일이 필요합니다.' }, 400)
    const target = email.trim().toLowerCase()

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: instructor, error: insErr } = await adminClient
      .from('partner_instructors').select('name, email').ilike('email', target).maybeSingle()
    if (insErr) return json({ error: insErr.message }, 400)
    if (!instructor) return json({ error: '파트너 강사관리에 등록된 이메일이 아닙니다.' }, 404)

    // 3) 로그인 계정(auth user) 존재 여부 — reset-instructor-password 와 같은 방식
    let exists = false
    for (let page = 1; page <= 30 && !exists; page++) {
      const { data: list, error: listErr } = await adminClient.auth.admin.listUsers({ page, perPage: 200 })
      if (listErr) return json({ error: listErr.message }, 500)
      const users = list?.users || []
      exists = users.some((u) => (u.email || '').toLowerCase() === target)
      if (users.length < 200) break
    }

    const redirectTo = `${req.headers.get('origin') || 'https://internal.quantumadmissions.com'}/login`

    if (exists) {
      // 4a) 기존 계정: 로그인 링크 (계정은 새로 만들지 않음)
      const { error } = await anonClient.auth.signInWithOtp({
        email: target,
        options: { shouldCreateUser: false, emailRedirectTo: redirectTo },
      })
      if (error) return json({ error: error.message }, 400)
      return json({ success: true, mode: 'magic_link' })
    }

    // 4b) 계정 없음: 초대 메일 (링크 → 로그인 화면의 비밀번호 설정)
    const { error: inviteErr } = await adminClient.auth.admin.inviteUserByEmail(target, {
      redirectTo,
      data: { full_name: (instructor as { name?: string | null }).name || target.split('@')[0] },
    })
    if (inviteErr) return json({ error: inviteErr.message }, 400)
    return json({ success: true, mode: 'invited' })
  } catch (err) {
    return json({ error: (err as Error)?.message || 'Internal server error' }, 500)
  }
})
