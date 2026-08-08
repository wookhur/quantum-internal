// Supabase Edge Function: intake-lead
// 홈페이지(그누보드) 상담신청 폼 → 리드 자동 생성.
//   · 전화/이메일 중복 시 병합(재문의 메모 추가), 없으면 신규 insert
//   · source_channel='홈페이지 상담신청', pipeline_stage='new_lead', 담당자 미지정
//   · 세일즈매니저(곽지수)에게 알림
//   · body.secret 로 무단 호출 방지 (LEAD_INTAKE_SECRET 환경변수)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// 알림 받을 담당자 이름(세일즈매니저). 없으면 role=sales_manager 전원으로 폴백.
const NOTIFY_NAME = '곽지수'
const SOURCE_CHANNEL = '홈페이지 상담신청'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  try {
    if (req.method !== 'POST') return json({ ok: false, error: 'POST only' }, 405)

    const body = await req.json().catch(() => ({}))
    // 무단 호출 방지
    const secret = Deno.env.get('LEAD_INTAKE_SECRET')
    if (secret && body.secret !== secret) return json({ ok: false, error: 'unauthorized' }, 401)

    const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
    const parentName = s(body.parentName)
    const studentName = s(body.studentName)
    const phone = s(body.phone)
    const email = s(body.email)
    const currentSchool = s(body.currentSchool)
    const grade = s(body.grade)
    const region = s(body.region)
    const interestArea = s(body.interestArea)
    const message = s(body.message)

    if (!parentName && !studentName && !phone && !email) {
      return json({ ok: false, error: '필수 정보(이름/연락처)가 없습니다.' }, 400)
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    const today = new Date().toISOString().slice(0, 10)
    const phoneDigits = phone.replace(/\D/g, '')
    const last8 = phoneDigits.slice(-8)

    // ── 중복 조회: 이메일 정확 일치 → 전화 뒤 8자리 일치 ──
    let existingId: string | null = null
    if (email) {
      const { data } = await admin.from('leads').select('id').ilike('email', email).limit(1)
      existingId = data?.[0]?.id ?? null
    }
    if (!existingId && last8.length >= 8) {
      const { data } = await admin.from('leads').select('id, phone').ilike('phone', `%${last8}%`).limit(10)
      existingId = (data || []).find((l: { phone?: string }) => (l.phone || '').replace(/\D/g, '').endsWith(last8))?.id ?? null
    }

    let leadId = existingId
    let deduped = false
    if (existingId) {
      // 재문의: 기존 리드에 홈페이지 재문의 메모 추가(덮어쓰지 않음)
      deduped = true
      const { data: cur } = await admin.from('leads').select('memo').eq('id', existingId).single()
      const appended = [(cur?.memo || '').trim(), `[홈페이지 재문의 ${today}] ${message}`.trim()].filter(Boolean).join('\n')
      await admin.from('leads').update({ memo: appended }).eq('id', existingId)
    } else {
      const { data: inserted, error: insErr } = await admin.from('leads').insert({
        lead_date: today,
        parent_name: parentName || studentName || '(미입력)',
        student_name: studentName || null,
        phone: phone || null,
        email: email || null,
        current_school: currentSchool || null,
        grade: grade || null,
        region: region || null,
        interest_area: interestArea || null,
        source_channel: SOURCE_CHANNEL,
        memo: message || null,
        pipeline_stage: 'new_lead',
        assigned_to: null,
      }).select('id').single()
      if (insErr) return json({ ok: false, error: insErr.message }, 400)
      leadId = (inserted as { id: string }).id
    }

    // ── 알림: 곽지수(세일즈매니저), 없으면 role=sales_manager 전원 ──
    let recipientIds: string[] = []
    const { data: byName } = await admin.from('profiles').select('id').eq('name', NOTIFY_NAME)
    recipientIds = (byName || []).map((p: { id: string }) => p.id)
    if (recipientIds.length === 0) {
      const { data: byRole } = await admin.from('profiles').select('id').eq('role', 'sales_manager')
      recipientIds = (byRole || []).map((p: { id: string }) => p.id)
    }
    if (recipientIds.length > 0) {
      const who = [studentName, parentName].filter(Boolean).join(' / ') || '신규'
      await admin.from('user_notifications').insert(recipientIds.map(uid => ({
        user_id: uid,
        type: 'new_lead',
        title: deduped ? '홈페이지 재문의' : '새 상담신청 (홈페이지)',
        message: `${who} 님이 홈페이지에서 상담을 신청했습니다.${message ? ' — ' + message.slice(0, 60) : ''}`,
        link: leadId ? `/sales/leads/${leadId}` : '/sales/leads',
        metadata: { source: 'homepage', leadId, deduped },
        is_read: false,
      })))
    }

    return json({ ok: true, leadId, deduped })
  } catch (e) {
    return json({ ok: false, error: (e as Error)?.message || 'error' }, 500)
  }
})
