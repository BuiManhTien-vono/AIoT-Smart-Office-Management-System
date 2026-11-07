import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { MainLayout } from './components/common/MainLayout'
import { RouteGuard } from './components/common/RouteGuard'
import { LoginPage } from './pages/auth/LoginPage'
import { DashboardPage } from './pages/reporting/DashboardPage'
import { MonthlyReportPage } from './pages/reporting/MonthlyReportPage'
import { UserManagementPage } from './pages/reporting/UserManagementPage'
import { unauthorizedEvent } from './services/apiClient'
import { readSession, saveSession } from './services/sessionStore'
import { roles } from './types/auth.types'
import type { Role, Session } from './types/auth.types'
import './App.css'

const routes = [
  { path: '/dashboard', label: 'Tổng quan', icon: 'overview' as const, allowed: roles, Page: DashboardPage },
  { path: '/reports/monthly', label: 'Báo cáo tháng', icon: 'reports' as const, allowed: ['ADMIN', 'HR', 'DEPT_LEAD'] as const, Page: MonthlyReportPage },
  { path: '/admin/users', label: 'Tài khoản', icon: 'users' as const, allowed: ['ADMIN'] as const, Page: UserManagementPage },
]

function subscribePath(listener: () => void) {
  window.addEventListener('hashchange', listener)
  return () => window.removeEventListener('hashchange', listener)
}

const readPath = () => window.location.hash.slice(1) || '/dashboard'

export default function App() {
  const [session, setSession] = useState(readSession)
  const path = useSyncExternalStore(subscribePath, readPath)
  const logout = useCallback(() => {
    saveSession(null)
    setSession(null)
    window.location.hash = '/dashboard'
  }, [])

  useEffect(() => {
    if (!session) return
    const timer = window.setTimeout(logout, Math.max(0, session.expiresAt - Date.now()))
    const checkExpiry = () => { if (session.expiresAt <= Date.now()) logout() }
    const handleUnauthorized = (event: Event) => {
      if ((event as CustomEvent<{ token: string }>).detail?.token === session.accessToken) logout()
    }
    window.addEventListener(unauthorizedEvent, handleUnauthorized)
    window.addEventListener('focus', checkExpiry)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener(unauthorizedEvent, handleUnauthorized)
      window.removeEventListener('focus', checkExpiry)
    }
  }, [session, logout])

  function login(next: Session) {
    saveSession(next)
    setSession(next)
  }

  if (!session) return <LoginPage onLogin={login} />
  const route = routes.find(item => item.path === path)
  const links = routes.filter(item => (item.allowed as readonly Role[]).includes(session.user.role))

  return <MainLayout session={session} links={links} path={path} onLogout={logout}>
    {route
      ? <RouteGuard session={session} allowedRoles={route.allowed}>
          <route.Page key={`${session.user.id}:${route.path}`} session={session} />
        </RouteGuard>
      : <section className="panel access-message">
          <p className="eyebrow">ĐIỀU HƯỚNG</p>
          <h1>Không tìm thấy trang</h1>
          <p className="muted">Đường dẫn hiện tại chưa có trong ứng dụng.</p>
          <a className="button button-primary" href="#/dashboard">Về tổng quan</a>
        </section>}
  </MainLayout>
}
