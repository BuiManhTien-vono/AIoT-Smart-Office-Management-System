import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { aiHealthUrl, backendHealthUrl } from '../../services/apiClient'
import { roleLabels } from '../../types/auth.types'
import type { Session } from '../../types/auth.types'
import { Icon } from './Icon'
import './MainLayout.css'

export type NavigationLink = {
  path: string
  label: string
  icon: 'overview' | 'reports' | 'users'
  description?: string
}

type Health = {
  status: 'checking' | 'online' | 'offline'
  checkedAt: Date | null
}

const officeZone = 'Asia/Ho_Chi_Minh'
const timeFormat = new Intl.DateTimeFormat('vi-VN', {
  hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: officeZone,
})
const dateFormat = new Intl.DateTimeFormat('vi-VN', {
  weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', timeZone: officeZone,
})

async function getHealth(url: string, signal: AbortSignal): Promise<Health> {
  const controller = new AbortController()
  const abort = () => controller.abort()
  signal.addEventListener('abort', abort, { once: true })
  if (signal.aborted) controller.abort()
  const timeout = window.setTimeout(abort, 6000)
  try {
    const response = await fetch(url, { signal: controller.signal, cache: 'no-store' })
    if (!response.ok) return { status: 'offline', checkedAt: new Date() }
    const body = await response.json() as { status?: string }
    const failed = ['unhealthy', 'error', 'offline', 'degraded'].includes((body.status ?? '').toLowerCase())
    return { status: failed ? 'offline' : 'online', checkedAt: new Date() }
  } catch {
    return { status: 'offline', checkedAt: new Date() }
  } finally {
    window.clearTimeout(timeout)
    signal.removeEventListener('abort', abort)
  }
}

function HealthPill({ label, health }: { label: string; health: Health }) {
  const text = health.status === 'checking' ? 'Đang kiểm tra' : health.status === 'online' ? 'Kết nối' : 'Chưa kết nối'
  return <div className={`health-pill health-${health.status}`} title={health.checkedAt ? `${label} · Kiểm tra lúc ${timeFormat.format(health.checkedAt)} (UTC+7)` : `${label} · Chưa kiểm tra`}>
    <span className="health-dot" aria-hidden="true" />
    <span><strong>{label}</strong><span>{text}</span></span>
  </div>
}

function Notifications() {
  const [open, setOpen] = useState(false)
  const container = useRef<HTMLDivElement>(null)
  const bell = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const closeOnOutside = (event: MouseEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        bell.current?.focus()
      }
    }
    document.addEventListener('mousedown', closeOnOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOnOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  return <div className="shell-notifications" ref={container}>
    <button ref={bell} className="notification-button" onClick={() => setOpen(value => !value)} aria-label="Thông báo, chưa có nguồn cảnh báo được kết nối" aria-expanded={open} aria-controls="notifications-panel"><Icon name="bell" size={22} /><span className="notification-count" aria-hidden="true">0</span></button>
    {open && <section id="notifications-panel" className="notifications-panel" aria-label="Thông báo">
      <div className="notifications-heading"><h2>Thông báo</h2><span>0 chưa đọc</span></div>
      <div className="notifications-empty"><Icon name="bell" size={28} /><strong>Chưa kết nối nguồn cảnh báo</strong><p>Thông báo nghiệp vụ sẽ xuất hiện khi dịch vụ cảnh báo được tích hợp.</p></div>
      <p className="notifications-footnote">Trạng thái Backend và AI được hiển thị riêng trên thanh công cụ.</p>
    </section>}
  </div>
}

export function MainLayout({ session, links, path, onLogout, children }: {
  session: Session
  links: readonly NavigationLink[]
  path: string
  onLogout: () => void
  children: ReactNode
}) {
  const [compact, setCompact] = useState(false)
  const [dismissedTooltip, setDismissedTooltip] = useState<string | null>(null)
  const [now, setNow] = useState(() => new Date())
  const [backend, setBackend] = useState<Health>({ status: 'checking', checkedAt: null })
  const [ai, setAi] = useState<Health>({ status: 'checking', checkedAt: null })
  const [checking, setChecking] = useState(true)
  const healthController = useRef<AbortController | null>(null)
  const drawer = useRef<HTMLDialogElement>(null)
  const current = links.find(link => link.path === path)

  const checkServices = useCallback(async () => {
    healthController.current?.abort()
    const controller = new AbortController()
    healthController.current = controller
    setChecking(true)
    setBackend(previous => ({ ...previous, status: 'checking' }))
    setAi(previous => ({ ...previous, status: 'checking' }))
    await Promise.allSettled([
      getHealth(backendHealthUrl, controller.signal).then(result => {
        if (!controller.signal.aborted) setBackend(result)
      }),
      getHealth(aiHealthUrl, controller.signal).then(result => {
        if (!controller.signal.aborted) setAi(result)
      }),
    ])
    if (!controller.signal.aborted) setChecking(false)
  }, [])

  useEffect(() => {
    const lifetime = new AbortController()
    queueMicrotask(() => {
      if (!lifetime.signal.aborted) void checkServices()
    })
    return () => {
      lifetime.abort()
      healthController.current?.abort()
    }
  }, [checkServices])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    drawer.current?.close()
  }, [path])

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1024px)')
    const closeOnDesktop = () => {
      if (desktop.matches) drawer.current?.close()
    }
    desktop.addEventListener('change', closeOnDesktop)
    return () => desktop.removeEventListener('change', closeOnDesktop)
  }, [])

  const sidebarContent = (mobile = false) => <>
    <div className="shell-brand-row">
      <a href="#/dashboard" className="shell-brand" aria-label="Smart Office · Tổng quan" title="Smart Office · Tổng quan" onClick={() => drawer.current?.close()}>
        <span className="shell-brand-mark"><Icon name="office" size={22} /></span>
        <span className="shell-brand-copy">Smart Office<small>AIoT WORKSPACE</small></span>
      </a>
      {mobile ? <button className="sidebar-toggle" onClick={() => drawer.current?.close()} aria-label="Đóng điều hướng"><Icon name="close" /></button>
        : <button className="sidebar-toggle" onClick={() => setCompact(value => !value)} aria-label={compact ? 'Mở rộng điều hướng' : 'Thu gọn điều hướng'} title={compact ? 'Mở rộng điều hướng' : 'Thu gọn điều hướng'} aria-expanded={!compact} aria-controls="desktop-navigation"><Icon name={compact ? 'expand' : 'collapse'} size={18} /></button>}
    </div>
    <p className="shell-nav-caption">KHÔNG GIAN LÀM VIỆC</p>
    <nav id={mobile ? 'mobile-navigation' : 'desktop-navigation'} className="shell-navigation" aria-label={mobile ? 'Điều hướng trên điện thoại' : 'Điều hướng chính'}>
      {links.map(link => <a
        key={link.path}
        href={`#${link.path}`}
        aria-label={link.label}
        aria-current={path === link.path ? 'page' : undefined}
        data-tooltip-dismissed={dismissedTooltip === link.path}
        onClick={() => drawer.current?.close()}
        onFocus={() => setDismissedTooltip(null)}
        onMouseEnter={() => setDismissedTooltip(null)}
        onKeyDown={event => { if (event.key === 'Escape') setDismissedTooltip(link.path) }}
      >
        <Icon name={link.icon} size={20} />
        <span className="shell-nav-label">{link.label}</span>
        <span className="shell-nav-tooltip" aria-hidden="true">{link.label}</span>
      </a>)}
    </nav>
    <div className="sidebar-note"><Icon name="office" size={20} /><p>Văn phòng thông minh<small>Quản lý tập trung. Kết nối hiệu quả.</small></p></div>
    <div className="shell-account">
      <div className="shell-avatar" aria-hidden="true" title={`${session.user.fullName} · ${roleLabels[session.user.role]}`}>{session.user.fullName.trim().slice(0, 1).toUpperCase() || 'S'}</div>
      <div className="shell-account-copy"><strong>{session.user.fullName}</strong><small>{roleLabels[session.user.role]}</small></div>
      <button onClick={onLogout} className="sidebar-toggle" aria-label="Đăng xuất" title="Đăng xuất"><Icon name="logout" /></button>
    </div>
  </>

  return <div className={`workspace-shell${compact ? ' workspace-compact' : ''}`}>
    <a className="skip-link" href="#main-content" onClick={event => {
      event.preventDefault()
      const main = document.getElementById('main-content')
      main?.focus()
      main?.scrollIntoView({ block: 'start' })
    }}>Chuyển đến nội dung chính</a>
    <aside className="workspace-sidebar">{sidebarContent()}</aside>
    <dialog ref={drawer} className="navigation-drawer" aria-label="Điều hướng ứng dụng"><div>{sidebarContent(true)}</div></dialog>
    <div className="workspace-main">
      <header className="workspace-topbar">
        <div className="topbar-leading">
          <button className="button button-secondary mobile-menu-button" onClick={() => drawer.current?.showModal()} aria-label="Mở điều hướng"><Icon name="menu" /></button>
          <div className={`shell-breadcrumb${path === '/dashboard' || path === '/reports/monthly' || path === '/admin/users' ? ' dashboard-page-label' : ''}`}><span>{path === '/admin/users' ? 'Thiết lập' : 'Không gian làm việc'}</span><span aria-hidden="true">/</span><strong>{path === '/reports/monthly' ? 'Báo cáo' : path === '/admin/users' ? 'Tài khoản' : current?.label ?? 'Trang ứng dụng'}</strong></div>
        </div>
        <div className="topbar-utilities">
          <div className="service-health" aria-label="Trạng thái kết nối dịch vụ" aria-live="polite">
            <div className="health-pill-group"><HealthPill label="Backend" health={backend} /><HealthPill label="AI Service" health={ai} />
              <button className="health-refresh" onClick={() => void checkServices()} disabled={checking} aria-label="Kiểm tra lại kết nối dịch vụ" title="Kiểm tra lại kết nối"><Icon name="refresh" size={18} /></button>
            </div>
            <small title="Thời điểm kiểm tra kết nối gần nhất · Giờ Việt Nam (UTC+7)">{checking ? 'Đang kiểm tra…' : `Kiểm tra ${backend.checkedAt ? timeFormat.format(backend.checkedAt) : '—'}`}</small>
          </div>
          <div className="office-clock" aria-label="Đồng hồ văn phòng, giờ Việt Nam"><Icon name="clock" size={16} /><time dateTime={now.toISOString()}>{timeFormat.format(now)}</time><small>UTC+7</small></div>
          <Notifications key={path} />
        </div>
      </header>
      <main className="workspace-content" id="main-content" tabIndex={-1}>{children}</main>
      <footer className="workspace-footer"><span>Smart Office AIoT <span aria-hidden="true">·</span> Văn phòng kết nối</span><span>{dateFormat.format(now)}</span></footer>
    </div>
  </div>
}
