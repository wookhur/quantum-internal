// Supabase Edge Function: send-document
// Sends invoice or receipt as HTML email to customer via Resend API

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface DocumentPayload {
  documentId: string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { documentId } = (await req.json()) as DocumentPayload

    if (!documentId) {
      return new Response(JSON.stringify({ error: 'documentId required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Fetch the document
    const { data: doc, error: docError } = await supabase
      .from('invoices_receipts')
      .select('*')
      .eq('id', documentId)
      .single()

    if (docError || !doc) {
      return new Response(JSON.stringify({ error: 'Document not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!doc.recipient_email) {
      return new Response(JSON.stringify({ error: 'No recipient email set' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!RESEND_API_KEY) {
      // If no Resend API key, just mark as sent (for dev/testing)
      await supabase
        .from('invoices_receipts')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', documentId)

      return new Response(JSON.stringify({ success: true, message: 'Marked as sent (no email provider configured)' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const isInvoice = doc.type === 'invoice'
    const docTypeLabel = isInvoice ? '인보이스' : '영수증'
    const subject = `[퀀텀어드미션즈] ${docTypeLabel} - ${doc.doc_number}`

    const html = generateEmailHtml(doc, isInvoice)

    // Send via Resend
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Quantum Admissions <billing@quantumadmissions.com>',
        to: [doc.recipient_email],
        subject,
        html,
      }),
    })

    if (!emailRes.ok) {
      const errBody = await emailRes.text()
      console.error('Resend error:', errBody)
      return new Response(JSON.stringify({ error: 'Email send failed', detail: errBody }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Update status
    await supabase
      .from('invoices_receipts')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('id', documentId)

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('send-document error:', err)
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

function generateEmailHtml(doc: Record<string, unknown>, isInvoice: boolean): string {
  const type = isInvoice ? 'INVOICE' : 'RECEIPT'
  const typeKo = isInvoice ? '인보이스' : '영수증'
  const amount = Number(doc.amount) || 0
  const currency = (doc.currency as string) || 'KRW'
  const formattedAmount = currency === 'KRW'
    ? `${amount.toLocaleString('ko-KR')}원`
    : `$${amount.toLocaleString('en-US')}`

  const items = (doc.items as Array<{ label: string; amount: number }>) || []
  const paymentMethodLabel: Record<string, string> = {
    bank_transfer: '계좌이체',
    card: '카드결제',
    us_wire: '해외송금(Wire)',
  }

  const itemsHtml = items.length > 0
    ? items.map(item => `
      <tr>
        <td style="padding: 8px 12px; border-bottom: 1px solid #eee;">${item.label}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #eee; text-align: right;">
          ${currency === 'KRW' ? `${(item.amount || 0).toLocaleString('ko-KR')}원` : `$${(item.amount || 0).toLocaleString('en-US')}`}
        </td>
      </tr>
    `).join('')
    : `<tr><td style="padding: 8px 12px;" colspan="2">${doc.description || '-'}</td></tr>`

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0; padding:0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5;">
  <div style="max-width: 600px; margin: 40px auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,0.08);">
    <!-- Header -->
    <div style="background: ${isInvoice ? '#2563eb' : '#059669'}; padding: 32px; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 24px;">Quantum Admissions</h1>
      <p style="color: rgba(255,255,255,0.8); margin: 8px 0 0; font-size: 14px;">${typeKo} / ${type}</p>
    </div>

    <!-- Body -->
    <div style="padding: 32px;">
      <div style="display: flex; justify-content: space-between; margin-bottom: 24px;">
        <div>
          <p style="margin: 0; color: #666; font-size: 12px;">문서번호</p>
          <p style="margin: 4px 0 0; font-weight: 600;">${doc.doc_number}</p>
        </div>
        <div style="text-align: right;">
          <p style="margin: 0; color: #666; font-size: 12px;">발행일</p>
          <p style="margin: 4px 0 0; font-weight: 600;">${doc.issued_date}</p>
        </div>
      </div>

      <div style="background: #f9fafb; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
        <p style="margin: 0 0 8px; color: #666; font-size: 12px;">수신</p>
        <p style="margin: 0; font-weight: 600;">${doc.contractor_name}</p>
        <p style="margin: 4px 0 0; color: #666; font-size: 13px;">학생: ${doc.student_name}</p>
      </div>

      <!-- Items Table -->
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
        <thead>
          <tr style="background: #f3f4f6;">
            <th style="padding: 10px 12px; text-align: left; font-size: 12px; color: #666;">항목</th>
            <th style="padding: 10px 12px; text-align: right; font-size: 12px; color: #666;">금액</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
        <tfoot>
          <tr style="background: #f9fafb;">
            <td style="padding: 12px; font-weight: 700;">합계</td>
            <td style="padding: 12px; font-weight: 700; text-align: right; color: ${isInvoice ? '#2563eb' : '#059669'};">${formattedAmount}</td>
          </tr>
        </tfoot>
      </table>

      ${!isInvoice && doc.paid_date ? `
      <div style="background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 8px; padding: 12px 16px; margin-bottom: 24px;">
        <p style="margin: 0; color: #065f46; font-size: 13px;">
          <strong>결제 완료</strong> | ${doc.paid_date} | ${paymentMethodLabel[(doc.payment_method as string) || ''] || doc.payment_method || '-'}
        </p>
      </div>` : ''}

      ${isInvoice ? `
      <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 12px 16px; margin-bottom: 24px;">
        <p style="margin: 0; color: #1e40af; font-size: 13px;">
          <strong>납부 안내</strong><br/>
          위 금액을 납입 예정일까지 입금 부탁드립니다.
        </p>
      </div>` : ''}
    </div>

    <!-- Footer -->
    <div style="background: #f9fafb; padding: 20px 32px; border-top: 1px solid #e5e7eb;">
      <p style="margin: 0; color: #9ca3af; font-size: 11px; text-align: center;">
        Quantum Admissions | quantumadmissions.com<br/>
        본 메일은 자동 발송되었습니다.
      </p>
    </div>
  </div>
</body>
</html>`
}
