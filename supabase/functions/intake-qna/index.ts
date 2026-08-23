// Supabase Edge Function: intake-qna
// 홈페이지 Q&A 게시판(Ask Quantum) 질문 접수.
//   · qna_questions 에 저장 (status='pending' — 답변을 달면서 공개로 바꾼다)
//   · 리드도 함께 생성/병합 (intake-lead 와 같은 중복 기준: 이메일 → 전화 뒤 8자리)
//   · 담당자에게 종 알림
//   · body.secret 로 무단 호출 방지 (LEAD_INTAKE_SECRET 재사용)
//
// 수집 항목은 사내 상담 신청 폼(/consult)과 같다. 해외 거주자가 많이 쓸 창구라
// 거주 구분·국가·지역이 있어야 콜드콜에서 시차와 연락 가능한 시간을 알 수 있다.
//
// 회원가입 없이 누구나 쓰는 창구라 스팸 방지를 서버에서 한다.
//   · 허니팟(사람 눈에 안 보이는 칸)이 채워져 있으면 봇
//   · 같은 연락처로 1시간에 3건까지
//   · 링크가 여러 개 들어간 글은 자동 보류(hidden) — 광고 대응
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const NOTIFY_NAME = '곽지수'                    // 없으면 role=sales_manager 전원
const SOURCE_CHANNEL = '홈페이지 질문'
const RATE_LIMIT = 3                            // 같은 연락처 · 1시간
const CATEGORIES = ['원서·지원', '에세이', '활동·EC', '시험·성적', '유학 준비', '기타']

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  try {
    if (req.method !== 'POST') return json({ ok: false, error: 'POST only' }, 405)

    const body = await req.json().catch(() => ({}))
    const secret = Deno.env.get('LEAD_INTAKE_SECRET')
    if (secret && body.secret !== secret) return json({ ok: false, error: 'unauthorized' }, 401)

    const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

    // 허니팟 — 사람에게는 숨겨진 칸이라 채워져 있으면 봇이다.
    // 봇이 재시도하지 않도록 성공한 것처럼 응답한다.
    if (s(body.website) || s(body.hp)) return json({ ok: true, skipped: true })

    const parentName = s(body.parentName) || s(body.name)
    const studentName = s(body.studentName)
    const phone = s(body.phone)
    const email = s(body.email)
    const grade = s(body.grade)
    const school = s(body.school)
    const residence = s(body.residence) === 'overseas' ? 'overseas' : 'domestic'
    const country = s(body.country)
    const region = s(body.region)
    const interestArea = s(body.interestArea)
    const sourcePath = s(body.sourcePath)
    const title = s(body.title)
    const question = s(body.question)
    const isLocked = body.isLocked === true || body.isLocked === 'true'
    const lockPin = s(body.lockPin)
    const category = CATEGORIES.includes(s(body.category)) ? s(body.category) : '기타'

    if (!parentName) return json({ ok: false, error: '이름을 입력해 주세요.' }, 400)
    if (!phone && !email) return json({ ok: false, error: '연락처나 이메일 중 하나는 남겨 주세요.' }, 400)
    if (!title) return json({ ok: false, error: '질문 제목을 입력해 주세요.' }, 400)
    if (question.length < 10) return json({ ok: false, error: '질문을 조금 더 자세히 적어 주세요. (10자 이상)' }, 400)
    if (title.length > 120) return json({ ok: false, error: '제목이 너무 깁니다. (120자 이내)' }, 400)
    if (question.length > 3000) return json({ ok: false, error: '질문이 너무 깁니다. (3000자 이내)' }, 400)
    // 잠근 질문은 나중에 본인이 열어봐야 하므로 비밀번호가 반드시 있어야 한다
    if (isLocked && !/^[0-9]{4}$/.test(lockPin)) {
      return json({ ok: false, error: '잠금 비밀번호를 숫자 4자리로 입력해 주세요.' }, 400)
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    // ── 같은 연락처로 몰아치는 것 차단 ──
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    {
      let q = admin.from('qna_questions').select('id', { count: 'exact', head: true }).gte('created_at', since)
      q = phone ? q.eq('asker_phone', phone) : q.eq('asker_email', email)
      const { count } = await q
      if ((count ?? 0) >= RATE_LIMIT) {
        return json({ ok: false, error: '잠시 후 다시 시도해 주세요. 질문이 접수되었을 수 있습니다.' }, 429)
      }
    }

    // 링크가 여러 개면 광고일 가능성이 높다 → 접수는 하되 보류 상태로 둔다
    const linkCount = (question.match(/https?:\/\//gi) || []).length
    const status = linkCount >= 2 ? 'hidden' : 'pending'

    const { data: inserted, error: insErr } = await admin.from('qna_questions').insert({
      asker_name: parentName,
      student_name: studentName || null,
      asker_phone: phone || null,
      asker_email: email || null,
      grade: grade || null,
      school: school || null,
      residence,
      country: country || null,
      region: region || null,
      interest_area: interestArea || null,
      source_path: sourcePath || null,
      category,
      title,
      body: question,
      is_locked: isLocked,
      status,
      source_ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
      user_agent: (req.headers.get('user-agent') || '').slice(0, 300) || null,
    }).select('id, slug').single()
    if (insErr) return json({ ok: false, error: insErr.message }, 400)

    const questionId = (inserted as { id: string }).id

    // 비밀번호는 원문을 저장하지 않는다 — DB 함수가 해시로 바꿔 넣는다
    if (isLocked && lockPin) {
      const { error: pinErr } = await admin.rpc('qna_set_lock_pin', { p_id: questionId, p_pin: lockPin })
      if (pinErr) {
        await admin.from('qna_questions').delete().eq('id', questionId)
        return json({ ok: false, error: '잠금 비밀번호를 저장하지 못했습니다. 다시 시도해 주세요.' }, 400)
      }
    }

    // ── 리드 생성/병합 (intake-lead 와 같은 기준) ──
    const today = new Date().toISOString().slice(0, 10)
    const last8 = phone.replace(/\D/g, '').slice(-8)

    let leadId: string | null = null
    if (email) {
      const { data } = await admin.from('leads').select('id').ilike('email', email).limit(1)
      leadId = data?.[0]?.id ?? null
    }
    if (!leadId && last8.length >= 8) {
      const { data } = await admin.from('leads').select('id, phone').ilike('phone', `%${last8}%`).limit(10)
      leadId = (data || []).find((l: { phone?: string }) => (l.phone || '').replace(/\D/g, '').endsWith(last8))?.id ?? null
    }

    // 콜드콜에 필요한 맥락은 메모로 남긴다 (leads 에 없는 항목들)
    const extra: string[] = []
    if (residence === 'overseas') extra.push(`해외거주${country ? ` · ${country}` : ''}`)
    if (sourcePath) extra.push(`알게된 경로: ${sourcePath}`)
    const memoLine = [`[홈페이지 질문 ${today}] ${title}`, ...extra].join('\n')

    const deduped = !!leadId
    if (leadId) {
      const { data: cur } = await admin.from('leads').select('memo').eq('id', leadId).single()
      const appended = [(cur?.memo || '').trim(), memoLine].filter(Boolean).join('\n')
      await admin.from('leads').update({ memo: appended }).eq('id', leadId)
    } else {
      const { data: newLead } = await admin.from('leads').insert({
        lead_date: today,
        parent_name: parentName,
        student_name: studentName || null,
        phone: phone || null,
        email: email || null,
        current_school: school || null,
        grade: grade || null,
        region: region || null,
        interest_area: interestArea || null,
        source_channel: SOURCE_CHANNEL,
        memo: memoLine,
        pipeline_stage: 'new_lead',
        assigned_to: null,
      }).select('id').single()
      leadId = (newLead as { id: string } | null)?.id ?? null
    }
    if (leadId) await admin.from('qna_questions').update({ lead_id: leadId }).eq('id', questionId)

    // ── 알림 ──
    if (status !== 'hidden') {
      let recipientIds: string[] = []
      const { data: byName } = await admin.from('profiles').select('id').eq('name', NOTIFY_NAME)
      recipientIds = (byName || []).map((p: { id: string }) => p.id)
      if (recipientIds.length === 0) {
        const { data: byRole } = await admin.from('profiles').select('id').eq('role', 'sales_manager')
        recipientIds = (byRole || []).map((p: { id: string }) => p.id)
      }
      if (recipientIds.length > 0) {
        const where = residence === 'overseas' ? `해외${country ? `·${country}` : ''}` : '국내'
        await admin.from('user_notifications').insert(recipientIds.map(uid => ({
          user_id: uid,
          type: 'new_qna',
          title: '홈페이지 새 질문',
          message: `${parentName} 님(${where}) — ${title.slice(0, 60)}`,
          link: '/marketing/qna',
          metadata: { source: 'homepage', questionId, leadId, deduped, isLocked, residence },
          is_read: false,
        })))
      }
    }

    return json({ ok: true, questionId, leadId, deduped })
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500)
  }
})
