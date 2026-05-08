import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  document.getElementById('root')!.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;background:#F8FAFC;">
      <div style="text-align:center;padding:2rem;max-width:480px;">
        <h2 style="color:#DC2626;margin-bottom:0.5rem;">서버 설정 오류</h2>
        <p style="color:#64748B;font-size:0.9rem;">
          환경변수가 설정되지 않았습니다.<br/>
          <code style="background:#F1F5F9;padding:2px 6px;border-radius:4px;">VITE_SUPABASE_URL</code> 및
          <code style="background:#F1F5F9;padding:2px 6px;border-radius:4px;">VITE_SUPABASE_ANON_KEY</code>를 확인하세요.
        </p>
      </div>
    </div>
  `
  throw new Error('Missing Supabase environment variables: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    lock: async (_name, _acquireTimeout, fn) => fn(),
  },
})
