import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { MainLayout } from './components/common/MainLayout'
import { RouteGuard } from './components/common/RouteGuard'
import { LoginPage } from './pages/auth/LoginPage'
import { DashboardPage } from './pages/reporting/DashboardPage'
import { MonthlyReportPage } from './pages/reporting/MonthlyReportPage'
import { UserManagementPage } from './pages/reporting/UserManagementPage'
import { EmployeeDirectoryPage } from './pages/biometrics/EmployeeDirectoryPage'
import { DailyAttendancePage } from './pages/attendance/DailyAttendancePage'
import { ZoneEditorPage } from './pages/occupancy/ZoneEditorPage'
import { LiveSeatMapPage } from './pages/occupancy/LiveSeatMapPage'
import { unauthorizedEvent } from './services/apiClient'
import { readSession, saveSession } from './services/sessionStore'
import { roles } from './types/auth.types'
import type { Role, Session } from './types/auth.types'
import './App.css'

const routes = [
  { path: '/dashboard', label: 'Tổng quan', icon: 'overview' as const, allowed: roles, Page: DashboardPage },
  { path: '/biometrics/employees', label: 'Sinh trắc & Nhân sự', icon: 'identification' as const, allowed: ['ADMIN', 'HR', 'DEPT_LEAD'] as const, Page: EmployeeDirectoryPage },
  { path: '/attendance/daily', label: 'Chấm công & Ca làm', icon: 'calendar' as const, allowed: roles, Page: DailyAttendancePage },
  { path: '/occupancy/seat-map', label: 'Sơ đồ chỗ ngồi', icon: 'seatMap' as const, allowed: roles, Page: LiveSeatMapPage },
  { path: '/occupancy/zones', label: 'Camera và giám sát', icon: 'camera' as const, allowed: ['ADMIN'] as const, Page: ZoneEditorPage },
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
  const [visitedPaths, setVisitedPaths] = useState<string[]>(() => [readPath()])

  const logout = useCallback(() => {
    saveSession(null)
    setSession(null)
    window.location.hash = '/dashboard'
  }, [])

  useEffect(() => {
    setVisitedPaths(prev => (prev.includes(path) ? prev : [...prev, path]))
  }, [path])

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
    {route ? (
      routes.map(r => {
        const isCurrent = r.path === path
        if (!visitedPaths.includes(r.path) && !isCurrent) return null

        return (
          <div
            key={`${session.user.id}:${r.path}`}
            style={{ display: isCurrent ? 'contents' : 'none' }}
            aria-hidden={!isCurrent}
          >
            <RouteGuard session={session} allowedRoles={r.allowed}>
              <r.Page session={session} />
            </RouteGuard>
          </div>
        )
      })
    ) : (
      <section className="panel access-message">
        <p className="eyebrow">ĐIỀU HƯỚNG</p>
        <h1>Không tìm thấy trang</h1>
        <p className="muted">Đường dẫn hiện tại chưa có trong ứng dụng.</p>
        <a className="button button-primary" href="#/dashboard">Về tổng quan</a>
      </section>
    )}
  </MainLayout>
}
