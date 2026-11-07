import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import officeBackground from '../../assets/background.png'
import { authenticate } from '../../services/authService'
import { roleLabels } from '../../types/auth.types'
import type { Role, Session } from '../../types/auth.types'
import './auth.css'

const demoAccounts: { role: Role; key: string; fallback: string }[] = [
  { role: 'ADMIN', key: 'ADMIN', fallback: 'admin_smartoffice' },
  { role: 'HR', key: 'HR', fallback: 'hr_demo' },
  { role: 'DEPT_LEAD', key: 'MANAGER', fallback: 'manager_demo' },
  { role: 'SECURITY', key: 'SECURITY', fallback: 'security_demo' },
]

export function LoginPage({ onLogin }: { onLogin: (session: Session) => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const controller = useRef<AbortController | null>(null)
  const sending = useRef(false)
  const passwordInput = useRef<HTMLInputElement>(null)
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
      if (!request.signal.aborted) onLogin(session)
    } catch (cause) {
      if (!request.signal.aborted) {
        setError(cause instanceof Error ? cause.message : 'Không thể đăng nhập. Vui lòng thử lại.')
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
      setError('Vui lòng nhập tên đăng nhập và mật khẩu.')
      requestAnimationFrame(() => errorBox.current?.focus())
      return
    }
    void signIn(username, password)
  }

  function selectDemo(account: typeof demoAccounts[number]) {
    const loginName = import.meta.env[`VITE_DEMO_${account.key}_USERNAME`] || account.fallback
    const loginPassword = import.meta.env[`VITE_DEMO_${account.key}_PASSWORD`] || ''
    setUsername(loginName)
    setPassword(loginPassword)
    setError('')
    if (loginPassword && import.meta.env.DEV) void signIn(loginName, loginPassword)
    else passwordInput.current?.focus()
  }

  return <main className="auth-screen">
    <section className="auth-story" aria-label="Giới thiệu Smart Office" style={{ backgroundImage: `linear-gradient(180deg, rgba(18, 40, 68, .79), rgba(18, 40, 68, .96)), url(${officeBackground})` }}>
      <a className="auth-brand" href="#/dashboard" aria-label="Smart Office AIoT">
        <span className="auth-brand-symbol" aria-hidden="true">S</span>
        <span>Smart Office <small>AIoT · Văn phòng thông minh</small></span>
      </a>
      <div className="auth-story-copy">
        <p className="auth-kicker">KHÔNG GIAN LÀM VIỆC, KẾT NỐI THÔNG MINH</p>
        <h2>Một góc nhìn.<br /> Toàn bộ văn phòng.</h2>
        <p>Kết nối con người, không gian và dữ liệu để vận hành văn phòng chủ động mỗi ngày.</p>
        <ul className="auth-capabilities">
          <li><span aria-hidden="true" />Chấm công và chuyên cần</li>
          <li><span aria-hidden="true" />Hiện diện tại nơi làm việc</li>
          <li><span aria-hidden="true" />An ninh văn phòng</li>
        </ul>
      </div>
      <p className="auth-story-footer">SMART OFFICE MANAGEMENT SYSTEM</p>
    </section>

    <section className="auth-form-panel" aria-labelledby="login-title">
      <div className="auth-form-wrap">
        <div className="auth-form-heading">
          <p className="eyebrow">CHÀO MỪNG TRỞ LẠI</p>
          <h1 id="login-title">Đăng nhập hệ thống</h1>
          <p className="muted">Truy cập không gian quản lý và vận hành của bạn.</p>
        </div>
        <form className="auth-form" onSubmit={submit} aria-busy={busy}>
          <label className="field" htmlFor="login-username">Tên đăng nhập
            <input id="login-username" name="username" autoComplete="username" required value={username} disabled={busy} onChange={event => setUsername(event.target.value)} />
          </label>
          <div className="field">
            <label htmlFor="login-password">Mật khẩu</label>
            <div className="auth-password">
              <input id="login-password" name="password" ref={passwordInput} type={visible ? 'text' : 'password'} autoComplete="current-password" required value={password} disabled={busy} onChange={event => setPassword(event.target.value)} />
              <button className="auth-visibility" type="button" aria-controls="login-password" aria-pressed={visible} onClick={() => setVisible(value => !value)}>{visible ? 'Ẩn' : 'Hiện'}</button>
            </div>
          </div>
          {error && <div className="alert alert-error auth-error" role="alert" tabIndex={-1} ref={errorBox}>{error}</div>}
          <button className="button button-primary auth-submit" type="submit" disabled={busy}>{busy ? 'Đang đăng nhập…' : 'Đăng nhập'}</button>
        </form>
        {import.meta.env.DEV && <section className="auth-demo" aria-labelledby="demo-title">
          <h2 id="demo-title">Tài khoản trình diễn</h2>
          <div className="auth-demo-grid">{demoAccounts.map(account => <button className="button button-secondary" key={account.role} type="button" disabled={busy} onClick={() => selectDemo(account)}>{roleLabels[account.role]}</button>)}</div>
          <p className="muted">Chọn vai trò để điền tài khoản. Nhập mật khẩu của tài khoản đã tạo; chỉ đăng nhập nhanh khi mật khẩu demo được cấu hình trong môi trường phát triển.</p>
        </section>}
        <p className="auth-form-footer">Quyền truy cập được thiết lập theo vai trò của tài khoản.</p>
      </div>
    </section>
  </main>
}
