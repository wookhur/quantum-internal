import { StrictMode, Component, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'sans-serif', background: '#F8FAFC' }}>
          <div style={{ textAlign: 'center', padding: '2rem', maxWidth: '480px' }}>
            <h2 style={{ color: '#DC2626', marginBottom: '0.5rem' }}>앱 로딩 오류</h2>
            <p style={{ color: '#64748B', fontSize: '0.9rem' }}>
              페이지를 불러오는 중 오류가 발생했습니다.<br />
              페이지를 새로고침 하거나 관리자에게 문의하세요.
            </p>
            <pre style={{ fontSize: '0.75rem', color: '#94A3B8', marginTop: '1rem', textAlign: 'left', background: '#F1F5F9', padding: '0.75rem', borderRadius: '6px', overflow: 'auto' }}>
              {this.state.error.message}
            </pre>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
