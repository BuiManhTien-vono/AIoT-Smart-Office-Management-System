import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { MainLayout } from './components/common/MainLayout'
import { RouteGuard } from './components/common/RouteGuard'
import { LoginPage } from './pages/auth/LoginPage'
import { DashboardPage } from './pages/reporting/DashboardPage'
import { ReportingHubPage } from './pages/reporting/ReportingHubPage'
import { UserManagementPage } from './pages/reporting/UserManagementPage'
import { EmployeeDirectoryPage } from './pages/biometrics/EmployeeDirectoryPage'
import { DailyAttendancePage } from './pages/attendance/DailyAttendancePage'
import { ZoneEditorPage } from './pages/occupancy/ZoneEditorPage'
import { LiveSeatMapPage } from './pages/occupancy/LiveSeatMapPage'
import { SecuritySocPage } from './pages/security/SecuritySocPage'
import { unauthorizedEvent } from './services/apiClient'
import { signalrService } from './services/signalrService'
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
  { path: '/reports/hub', label: 'Báo cáo tổng hợp', icon: 'reports' as const, allowed: ['ADMIN', 'HR', 'DEPT_LEAD'] as const, Page: ReportingHubPage },
  { path: '/security/soc', label: 'An ninh & Sự cố', icon: 'shieldCheck' as const, allowed: ['ADMIN', 'SECURITY', 'HR'] as const, Page: SecuritySocPage },
  { path: '/admin/users', label: 'Tài khoản', icon: 'users' as const, allowed: ['ADMIN'] as const, Page: UserManagementPage },
]

function subscribePath(listener: () => void) {
  window.addEventListener('hashchange', listener)
  return () => window.removeEventListener('hashchange', listener)
}

const readPath = () => {
  const hash = window.location.hash.slice(1) || '/dashboard'
  if (hash === '/reports/monthly') return '/reports/hub'
  return hash
}

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

  useEffect(() => {
    if (!session) {
      void signalrService.stop()
      return
    }

    let isMounted = true
    void signalrService.start(session.accessToken).then(() => {
      if (!isMounted) return
      void signalrService.joinOverviewGroup(session.user.role)
      if (session.user.departmentId) {
        void signalrService.joinDepartmentGroup(session.user.departmentId)
      }
    }).catch(err => {
      console.warn('[SignalR App] Failed to connect:', err)
    })

    return () => {
      isMounted = false
    }
  }, [session])

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
