import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import officeBackground from '../../assets/background.png'
import { Icon } from '../../components/common/Icon'
import { authenticate, demoAccounts, loginAsRole } from '../../services/authService'
import type { Role, Session } from '../../types/auth.types'
import './auth.css'

export function LoginPage({ onLogin }: { onLogin: (session: Session) => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)
  const [activeRole, setActiveRole] = useState<Role | null>(null)
  const [error, setError] = useState('')
  const controller = useRef<AbortController | null>(null)
  const sending = useRef(false)
  const errorBox = useRef<HTMLDivElement>(null)

  useEffect(() => () => controller.current?.abort(), [])

  async function handleDirectRoleLogin(role: Role) {
    if (sending.current) return
    sending.current = true
    const request = new AbortController()
    controller.current = request
    setBusy(true)
    setActiveRole(role)
    setError('')

    try {
      const session = await loginAsRole(role, request.signal)
      if (!request.signal.aborted) {
        onLogin(session)
      }
    } catch (cause) {
      if (!request.signal.aborted) {
        setError(cause instanceof Error ? cause.message : 'Không thể đăng nhập vai trò. Vui lòng thử lại.')
        requestAnimationFrame(() => errorBox.current?.focus())
      }
    } finally {
      if (!request.signal.aborted) {
        sending.current = false
        setBusy(false)
        setActiveRole(null)
      }
    }
  }

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

  return (
    <main className="auth-screen">
      <section
        className="auth-story"
        aria-label="Giới thiệu Smart Office"
        style={{
          backgroundImage: `linear-gradient(180deg, rgba(18, 40, 68, .79), rgba(18, 40, 68, .96)), url(${officeBackground})`,
        }}
      >
        <a className="auth-brand" href="#/dashboard" aria-label="Smart Office AIoT">
          <span className="auth-brand-symbol" aria-hidden="true">S</span>
          <span>
            Smart Office <small>AIoT · Văn phòng thông minh</small>
          </span>
        </a>
        <div className="auth-story-copy">
          <p className="auth-kicker">KHÔNG GIAN LÀM VIỆC, KẾT NỐI THÔNG MINH</p>
          <h2>Một góc nhìn.<br /> Toàn bộ văn phòng.</h2>
          <p>Kết nối con người, không gian và dữ liệu để vận hành văn phòng chủ động mỗi ngày.</p>
          <ul className="auth-capabilities">
            <li><span aria-hidden="true" />Chấm công và chuyên cần (Face Biometrics)</li>
            <li><span aria-hidden="true" />Hiện diện tại nơi làm việc (RT-DETR 4-State FSM)</li>
            <li><span aria-hidden="true" />An ninh văn phòng &amp; Trực đêm (Night Guard)</li>
          </ul>
        </div>
        <p className="auth-story-footer">SMART OFFICE MANAGEMENT SYSTEM · RBAC MATRIX</p>
      </section>

      <section className="auth-form-panel" aria-labelledby="login-title">
        <div className="auth-form-wrap">
          <div className="auth-form-heading">
            <p className="eyebrow">CHÀO MỪNG TRỞ LẠI</p>
            <h1 id="login-title">Đăng nhập hệ thống</h1>
            <p className="muted">Chọn nhanh 1 trong 4 vai trò để truy cập trực tiếp không cần mật khẩu.</p>
          </div>

          {/* KHU VỰC 1: ĐĂNG NHẬP NHANH THEO 4 VAI TRÒ */}
          <section className="auth-roles-section" aria-label="Đăng nhập trực tiếp theo vai trò">
            <div className="auth-roles-header">
              <span className="auth-roles-kicker">CHỌN VAI TRÒ TRUY CẬP TRỰC TIẾP</span>
            </div>
            <div className="auth-roles-grid" role="group" aria-label="4 vai trò đăng nhập trực tiếp">
              {demoAccounts.map(account => {
                const isThisActive = activeRole === account.role
                return (
                  <button
                    key={account.role}
                    type="button"
                    className={`auth-role-btn role-${account.role.toLowerCase()} ${isThisActive ? 'is-loading' : ''}`}
                    disabled={busy}
                    onClick={() => void handleDirectRoleLogin(account.role)}
                    aria-label={`Đăng nhập vai trò ${account.label} - ${account.roleTitle}`}
                  >
                    <div className="auth-role-top">
                      <div className="auth-role-icon-box" aria-hidden="true">
                        <Icon name={account.iconName} size={20} />
                      </div>
                      <span className="auth-role-badge">{account.badge}</span>
                    </div>
                    <div className="auth-role-info">
                      <strong className="auth-role-name">
                        {account.label} <small>({account.roleTitle})</small>
                      </strong>
                      <p className="auth-role-desc">{account.description}</p>
                    </div>
                    <div className="auth-role-action">
                      <span>{isThisActive ? 'Đang truy cập…' : 'Đăng nhập ngay →'}</span>
                    </div>
                  </button>
                )
              })}
            </div>
          </section>

          {/* DÒNG PHÂN CÁCH */}
          <div className="auth-divider" role="separator" aria-label="Hoặc đăng nhập bằng tài khoản và mật khẩu">
            <span>HOẶC ĐĂNG NHẬP THỦ CÔNG</span>
          </div>

          {/* KHU VỰC 2: FORM ĐĂNG NHẬP THỦ CÔNG VỚI TÀI KHOẢN & MẬT KHẨU */}
          <form className="auth-form" onSubmit={submit} aria-busy={busy}>
            <label className="field" htmlFor="login-username">
              Tên đăng nhập
              <input
                id="login-username"
                name="username"
                autoComplete="username"
                placeholder="VD: admin_smartoffice, hr_demo..."
                required
                value={username}
                disabled={busy}
                onChange={event => setUsername(event.target.value)}
              />
            </label>
            <div className="field">
              <label htmlFor="login-password">Mật khẩu</label>
              <div className="auth-password">
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
                  className="auth-visibility"
                  type="button"
                  aria-controls="login-password"
                  aria-pressed={visible}
                  onClick={() => setVisible(value => !value)}
                >
                  {visible ? 'Ẩn' : 'Hiện'}
                </button>
              </div>
            </div>

            {error && (
              <div className="alert alert-error auth-error" role="alert" tabIndex={-1} ref={errorBox}>
                {error}
              </div>
            )}

            <button className="button button-primary auth-submit" type="submit" disabled={busy}>
              {busy && !activeRole ? 'Đang xác thực…' : 'Đăng nhập thủ công'}
            </button>
          </form>

          <p className="auth-form-footer">
            Quyền hạn và dữ liệu được tự động phân định nghiêm ngặt theo Ma trận phân quyền (RBAC Matrix).
          </p>
        </div>
      </section>
    </main>
  )
}
