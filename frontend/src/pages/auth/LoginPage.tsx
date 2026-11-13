import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import officeBackground from '../../assets/background.png'
import { authenticate, demoAccounts } from '../../services/authService'
import type { Session } from '../../types/auth.types'
import './auth.css'

export function LoginPage({ onLogin }: { onLogin: (session: Session) => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [showDemoModal, setShowDemoModal] = useState(false)
  const controller = useRef<AbortController | null>(null)
  const sending = useRef(false)
  const errorBox = useRef<HTMLDivElement>(null)

  useEffect(() => () => controller.current?.abort(), [])

  async function signIn(loginName: string, loginPassword: string) {
    if (sending.current) return
    sending.current = true
    const request = new AbortController()
    controller.current = request
    setBusy(true)
    setError('')

    try {
      const session = await authenticate(loginName.trim(), loginPassword, request.signal)
      if (!request.signal.aborted) {
        if (rememberMe) {
          localStorage.setItem('smart_office_remember_user', loginName.trim())
        } else {
          localStorage.removeItem('smart_office_remember_user')
        }
        onLogin(session)
      }
    } catch (cause) {
      if (!request.signal.aborted) {
        setError(cause instanceof Error ? cause.message : 'Tài khoản hoặc mật khẩu không chính xác.')
        requestAnimationFrame(() => errorBox.current?.focus())
      }
    } finally {
      if (!request.signal.aborted) {
        sending.current = false
        setBusy(false)
      }
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!username.trim() || !password.trim()) {
      setError('Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu.')
      requestAnimationFrame(() => errorBox.current?.focus())
      return
    }
    void signIn(username, password)
  }

  function fillDemoAccount(user: string, pass: string) {
    setUsername(user)
    setPassword(pass)
    setShowDemoModal(false)
    setError('')
  }

  return (
    <main className="auth-screen">
      {/* CỘT TRÁI: GIỚI THIỆU HỆ THỐNG VÀ CÔNG NGHỆ */}
      <section
        className="auth-story"
        aria-label="Giới thiệu Smart Office AIoT"
        style={{
          backgroundImage: `linear-gradient(145deg, rgba(15, 23, 42, 0.88), rgba(18, 40, 68, 0.94)), url(${officeBackground})`,
        }}
      >
        <div className="auth-brand">
          <span className="auth-brand-symbol" aria-hidden="true">S</span>
          <div>
            <span className="auth-brand-title">Smart Office</span>
            <span className="auth-brand-subtitle">AIoT · Quản trị văn phòng thông minh</span>
          </div>
        </div>

        <div className="auth-story-copy">
          <div className="auth-kicker-pill">
            <span className="auth-kicker-dot" />
            NỀN TẢNG VẬN HÀNH THỜI GIAN THỰC
          </div>
          <h2>Một góc nhìn.<br />Toàn bộ văn phòng.</h2>
          <p className="auth-story-desc">
            Kết nối con người, không gian làm việc và dữ liệu cảm biến để vận hành văn phòng thông minh, tự động và bảo mật.
          </p>

          <div className="auth-feature-cards">
            <div className="auth-feature-card">
              <div className="auth-feature-icon biometrics">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2a5 5 0 0 0-5 5v3a5 5 0 0 0 10 0V7a5 5 0 0 0-5-5z" />
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                </svg>
              </div>
              <div className="auth-feature-text">
                <strong>Chấm công sinh trắc học</strong>
                <p>Nhận diện khuôn mặt thời gian thực, chống giả mạo Anti-spoofing.</p>
              </div>
            </div>

            <div className="auth-feature-card">
              <div className="auth-feature-icon occupancy">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M3 9h18M9 21V9" />
                </svg>
              </div>
              <div className="auth-feature-text">
                <strong>Sơ đồ chỗ ngồi thông minh</strong>
                <p>Định vị hiện diện và giám sát rời bàn với AI RT-DETR &amp; 4-State FSM.</p>
              </div>
            </div>

            <div className="auth-feature-card">
              <div className="auth-feature-icon security">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </div>
              <div className="auth-feature-text">
                <strong>An ninh &amp; Trực đêm</strong>
                <p>Cảnh báo đột nhập và phát hiện bất thường ngoài giờ làm việc.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="auth-story-footer">
          <span>TIÊU CHUẨN XÁC THỰC BẢO MẬT · MA TRẬN RBAC 5 CẤP ĐỘ</span>
        </div>
      </section>

      {/* CỘT PHẢI: FORM ĐĂNG NHẬP CHUYÊN NGHIỆP */}
      <section className="auth-form-panel" aria-labelledby="login-title">
        <div className="auth-card">
          <div className="auth-form-heading">
            <div className="auth-security-badge">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <span>CỔNG ĐĂNG NHẬP AN TOÀN</span>
            </div>
            <h1 id="login-title">Đăng nhập hệ thống</h1>
            <p className="auth-form-subtitle">
              Vui lòng nhập tên tài khoản và mật khẩu được cấp để truy cập vào không gian làm việc.
            </p>
          </div>

          <form className="auth-form" onSubmit={submit} aria-busy={busy}>
            {/* Tên đăng nhập */}
            <div className="auth-field">
              <label htmlFor="login-username">Tên đăng nhập</label>
              <div className="auth-input-wrapper">
                <span className="auth-input-icon" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </span>
                <input
                  id="login-username"
                  name="username"
                  type="text"
                  autoComplete="username"
                  placeholder="Nhập tên tài khoản..."
                  required
                  value={username}
                  disabled={busy}
                  onChange={event => setUsername(event.target.value)}
                />
              </div>
            </div>

            {/* Mật khẩu */}
            <div className="auth-field">
              <div className="auth-field-header">
                <label htmlFor="login-password">Mật khẩu</label>
                <button
                  type="button"
                  className="auth-link-btn"
                  onClick={() => alert('Vui lòng liên hệ Bộ phận Kỹ thuật / Quản trị viên để đặt lại mật khẩu của bạn.')}
                >
                  Quên mật khẩu?
                </button>
              </div>
              <div className="auth-input-wrapper">
                <span className="auth-input-icon" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </span>
                <input
                  id="login-password"
                  name="password"
                  type={visible ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Nhập mật khẩu..."
                  required
                  value={password}
                  disabled={busy}
                  onChange={event => setPassword(event.target.value)}
                />
                <button
                  className="auth-toggle-password"
                  type="button"
                  aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  onClick={() => setVisible(v => !v)}
                  tabIndex={-1}
                >
                  {visible ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Tùy chọn nhớ phiên */}
            <div className="auth-options">
              <label className="auth-checkbox-label">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  disabled={busy}
                  onChange={e => setRememberMe(e.target.checked)}
                />
                <span>Ghi nhớ phiên đăng nhập trên thiết bị này</span>
              </label>
            </div>

            {/* Thông báo lỗi */}
            {error && (
              <div className="auth-error-alert" role="alert" tabIndex={-1} ref={errorBox}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            {/* Nút bấm đăng nhập */}
            <button className="auth-submit-btn" type="submit" disabled={busy}>
              {busy ? (
                <>
                  <span className="auth-spinner" aria-hidden="true" />
                  <span>Đang xác thực bảo mật...</span>
                </>
              ) : (
                <>
                  <span>Đăng nhập hệ thống</span>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                </>
              )}
            </button>
          </form>

          {/* CHÂN FORM: THÔNG TIN HỖ TRỢ VÀ TÀI KHOẢN THỬ NGHIỆM */}
          <div className="auth-card-footer">
            <p className="auth-footer-note">
              © 2026 Smart Office AIoT. Truy cập được bảo vệ và mã hóa theo tiêu chuẩn an ninh thông tin.
            </p>
            <button
              type="button"
              className="auth-demo-hint-btn"
              onClick={() => setShowDemoModal(true)}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <span>Xem tài khoản mẫu kiểm thử</span>
            </button>
          </div>
        </div>
      </section>

      {/* POPUP HỖ TRỢ ĐIỀN TÀI KHOẢN MẪU (CHỈ ĐIỀN FORM, KHÔNG ĐĂNG NHẬP TỰ ĐỘNG) */}
      {showDemoModal && (
        <div className="auth-modal-overlay" onClick={() => setShowDemoModal(false)}>
          <div className="auth-modal" onClick={e => e.stopPropagation()}>
            <div className="auth-modal-header">
              <div>
                <h3>Danh sách tài khoản mẫu</h3>
                <p>Chọn tài khoản để tự động điền vào form đăng nhập.</p>
              </div>
              <button
                type="button"
                className="auth-modal-close"
                onClick={() => setShowDemoModal(false)}
                aria-label="Đóng"
              >
                ✕
              </button>
            </div>
            <div className="auth-modal-list">
              {demoAccounts.map(acc => (
                <div key={acc.role} className="auth-modal-item">
                  <div className="auth-modal-item-info">
                    <strong>{acc.label} <small>({acc.roleTitle})</small></strong>
                    <code>{acc.username}</code>
                    <p>{acc.description}</p>
                  </div>
                  <button
                    type="button"
                    className="auth-modal-fill-btn"
                    onClick={() => fillDemoAccount(acc.username, acc.defaultPassword)}
                  >
                    Điền tài khoản này
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
