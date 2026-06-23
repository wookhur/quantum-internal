import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ALLOWED_ROLES = ['admin', 'c_level', 'sales_manager', 'service_manager']

function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let pw = ''
  for (let i = 0; i < 12; i++) {
    pw += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return pw + '!'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Verify the caller is authenticated
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    // Verify caller is admin/manager using anon client
    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user: caller }, error: authError } = await anonClient.auth.getUser()
    if (authError || !caller) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Check caller's role
    const { data: callerProfile } = await anonClient
      .from('profiles')
      .select('role')
      .eq('id', caller.id)
      .single()

    if (!callerProfile || !ALLOWED_ROLES.includes(callerProfile.role)) {
      return new Response(JSON.stringify({ error: 'Only admins and managers can invite users' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Parse request body
    const { email, name, role } = await req.json()
    if (!email || typeof email !== 'string') {
      return new Response(JSON.stringify({ error: 'Email is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Use service role client for admin operations
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const isCompanyEmail = email.trim().toLowerCase().endsWith('@quantumadmissions.com')
    let userId: string | undefined
    let tempPassword: string | undefined

    if (isCompanyEmail) {
      // Company email: send invite link (they can also use Google OAuth)
      const redirectTo = `${req.headers.get('origin') || 'https://quantum-internal.vercel.app'}/login`
      const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
        email,
        {
          redirectTo,
          data: { full_name: name || email.split('@')[0] },
        },
      )
      if (inviteError) {
        return new Response(JSON.stringify({ error: inviteError.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      userId = inviteData.user?.id
    } else {
      // External email: create auth user directly with temp password
      tempPassword = generateTempPassword()
      const { data: createData, error: createError } = await adminClient.auth.admin.createUser({
        email: email.trim(),
        password: tempPassword,
        email_confirm: true,
        user_metadata: { full_name: name || email.split('@')[0] },
      })
      if (createError) {
        return new Response(JSON.stringify({ error: createError.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      userId = createData.user?.id
    }

    // Pre-create profile for the user
    if (userId) {
      const isExternal = !isCompanyEmail
      await adminClient.from('profiles').upsert({
        id: userId,
        email: email.trim(),
        name: name || email.split('@')[0],
        role: role || (isExternal ? 'external' : 'consultant'),
        is_external: isExternal,
      }, { onConflict: 'id' })
    }

    const result: Record<string, unknown> = { success: true, userId }
    if (tempPassword) {
      result.tempPassword = tempPassword
    }

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
