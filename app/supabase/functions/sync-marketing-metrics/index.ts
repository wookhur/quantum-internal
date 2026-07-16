// Supabase Edge Function: sync-marketing-metrics
// Fetches follower/subscriber counts from YouTube, Instagram, Kakao APIs
// and upserts into marketing_metrics table.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ─── API Fetchers ───

interface ChannelResult {
  channel: string
  metric: string
  value: number
  error?: string
}

async function fetchYouTube(apiKey: string, channelId: string): Promise<ChannelResult> {
  try {
    const url = `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${channelId}&key=${apiKey}`
    const res = await fetch(url)
    if (!res.ok) {
      const body = await res.text()
      return { channel: 'youtube', metric: '팔로워 수', value: 0, error: `YouTube API ${res.status}: ${body}` }
    }
    const data = await res.json()
    const stats = data.items?.[0]?.statistics
    if (!stats) {
      return { channel: 'youtube', metric: '팔로워 수', value: 0, error: 'YouTube channel not found' }
    }
    return { channel: 'youtube', metric: '팔로워 수', value: Number(stats.subscriberCount) || 0 }
  } catch (err) {
    return { channel: 'youtube', metric: '팔로워 수', value: 0, error: `YouTube fetch error: ${err}` }
  }
}

async function fetchInstagram(accessToken: string, igUserId: string): Promise<ChannelResult> {
  try {
    const url = `https://graph.facebook.com/v21.0/${igUserId}?fields=followers_count&access_token=${accessToken}`
    const res = await fetch(url)
    if (!res.ok) {
      const body = await res.text()
      return { channel: 'instagram', metric: '팔로워 수', value: 0, error: `Instagram API ${res.status}: ${body}` }
    }
    const data = await res.json()
    return { channel: 'instagram', metric: '팔로워 수', value: Number(data.followers_count) || 0 }
  } catch (err) {
    return { channel: 'instagram', metric: '팔로워 수', value: 0, error: `Instagram fetch error: ${err}` }
  }
}

// Kakao does not provide a public API to retrieve total channel friend count.
// Channel friend count must be entered manually from the Kakao Business Partner Center dashboard.

// ─── Main Handler ───

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Auth check
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Init Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get API keys from secrets
    const ytApiKey = Deno.env.get('YOUTUBE_API_KEY') || ''
    const ytChannelId = Deno.env.get('YOUTUBE_CHANNEL_ID') || ''
    const igAccessToken = Deno.env.get('INSTAGRAM_ACCESS_TOKEN') || ''
    const igUserId = Deno.env.get('INSTAGRAM_USER_ID') || ''
    // Kakao: no public API for channel friend count — enter manually via UI

    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth() + 1

    const results: ChannelResult[] = []
    const errors: string[] = []

    // Fetch from each configured channel in parallel
    const promises: Promise<ChannelResult>[] = []

    if (ytApiKey && ytChannelId) {
      promises.push(fetchYouTube(ytApiKey, ytChannelId))
    } else {
      errors.push('YouTube: API key or channel ID not configured')
    }

    if (igAccessToken && igUserId) {
      promises.push(fetchInstagram(igAccessToken, igUserId))
    } else {
      errors.push('Instagram: access token or user ID not configured')
    }

    // Kakao: skipped (no public API for friend count)

    const fetched = await Promise.all(promises)

    for (const result of fetched) {
      if (result.error) {
        errors.push(result.error)
      }
      if (result.value > 0) {
        results.push(result)
      }
    }

    // Upsert results into marketing_metrics
    let upserted = 0
    for (const r of results) {
      // Check if row already exists for this year/month/channel
      const { data: existing } = await supabase
        .from('marketing_metrics')
        .select('id, annual_target')
        .eq('year', year)
        .eq('month', month)
        .eq('channel', r.channel)
        .is('week', null)
        .limit(1)
        .single()

      if (existing) {
        // Update existing row
        const { error: updateErr } = await supabase
          .from('marketing_metrics')
          .update({ value: r.value })
          .eq('id', existing.id)
        if (!updateErr) upserted++
        else errors.push(`Update ${r.channel}: ${updateErr.message}`)
      } else {
        // Get annual_target from the most recent row for this channel
        const { data: prev } = await supabase
          .from('marketing_metrics')
          .select('annual_target')
          .eq('year', year)
          .eq('channel', r.channel)
          .order('month', { ascending: false })
          .limit(1)
          .single()

        const { error: insertErr } = await supabase
          .from('marketing_metrics')
          .insert({
            year,
            month,
            channel: r.channel,
            metric: r.metric,
            annual_target: prev?.annual_target || 0,
            value: r.value,
          })
        if (!insertErr) upserted++
        else errors.push(`Insert ${r.channel}: ${insertErr.message}`)
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        synced: upserted,
        results: results.map(r => ({ channel: r.channel, value: r.value })),
        errors: errors.length > 0 ? errors : undefined,
        timestamp: now.toISOString(),
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: `Server error: ${err}` }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
