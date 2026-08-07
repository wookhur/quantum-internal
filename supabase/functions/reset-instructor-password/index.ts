import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// 비밀번호 초기화를 실행할 수 있는 관리자 역할
const ALLOWED_ROLES = ['admin', 'c_level', 'service_manager', 'sales_manager']
// Supabase 기본 최소 비밀번호 길이(6). '0000'(4자)은 거부되므로 6자리 기본값 사용.
const DEFAULT_PASSWORD = '000000'

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
      return json({ error: '관리자만 비밀번호를 초기화할 수 있습니다.' }, 403)
    }

    // 2) 대상 이메일
    const { email } = await req.json()
    if (!email || typeof email !== 'string') return json({ error: '이메일이 필요합니다.' }, 400)
    const target = email.trim().toLowerCase()

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // 3) 대상 계정(auth user) 찾기 — auth 이메일로 직접 매칭(권위 있는 소스). profiles.id가
    //    auth uid와 어긋난 경우에도 정확히 실제 로그인 계정을 찾도록 함.
    let userId: string | undefined
    for (let page = 1; page <= 30 && !userId; page++) {
      const { data: list } = await adminClient.auth.admin.listUsers({ page, perPage: 200 })
      const users = list?.users || []
      userId = users.find((u) => (u.email || '').toLowerCase() === target)?.id
      if (users.length < 200) break
    }
    if (!userId) {
      // fallback: profiles(id=auth uid) 기준
      const { data: prof } = await adminClient
        .from('profiles').select('id').ilike('email', target).maybeSingle()
      userId = (prof as { id?: string } | null)?.id
    }
    if (!userId) return json({ error: '해당 이메일로 가입된 계정을 찾을 수 없습니다.' }, 404)

    // 4) 비밀번호 초기화 + 이메일 인증 확정(미인증이면 로그인 막히므로 함께 처리)
    const { error: updErr } = await adminClient.auth.admin.updateUserById(userId, {
      password: DEFAULT_PASSWORD,
      email_confirm: true,
    })
    if (updErr) return json({ error: updErr.message }, 400)

    return json({ success: true, password: DEFAULT_PASSWORD })
  } catch (err) {
    return json({ error: (err as Error)?.message || 'Internal server error' }, 500)
  }
})
