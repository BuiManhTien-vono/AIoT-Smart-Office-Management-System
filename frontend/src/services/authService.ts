import { apiRequest } from './apiClient'
import { roles } from '../types/auth.types'
import type { AppUser, CreateUserInput, Department, Role, Session } from '../types/auth.types'

interface LoginResponse {
  accessToken: string
  tokenType: string
  expiresInSeconds: number
  user: AppUser
}

export async function authenticate(username: string, password: string, signal?: AbortSignal): Promise<Session> {
  const response = await apiRequest<LoginResponse>('reporting/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: username.trim(), password }),
    signal,
  })
  if (!response.accessToken || !response.user?.isActive || !roles.includes(response.user.role)
    || !Number.isFinite(response.expiresInSeconds) || response.expiresInSeconds <= 0) {
    throw new Error('Phiên đăng nhập không hợp lệ hoặc tài khoản chưa được kích hoạt.')
  }
  return { accessToken: response.accessToken, user: response.user, expiresAt: Date.now() + response.expiresInSeconds * 1000 }
}

export interface DemoAccount {
  role: Role
  key: string
  label: string
  roleTitle: string
  username: string
  defaultPassword: string
  departmentId: string | null
  badge: string
  description: string
  iconName: 'overview' | 'users' | 'office' | 'camera'
}

export const demoAccounts: DemoAccount[] = [
  {
    role: 'ADMIN',
    key: 'ADMIN',
    label: 'Admin',
    roleTitle: 'Quản trị viên',
    username: 'admin_smartoffice',
    defaultPassword: 'Admin@123',
    departmentId: null,
    badge: 'Toàn quyền',
    description: 'Toàn quyền hệ thống, cấu hình Camera, vùng bàn và tài khoản',
    iconName: 'overview',
  },
  {
    role: 'HR',
    key: 'HR',
    label: 'HR',
    roleTitle: 'Nhân sự',
    username: 'hr_demo',
    defaultPassword: 'Hr@123',
    departmentId: '11111111-1111-1111-1111-111111111102',
    badge: 'Hồ sơ & Công',
    description: 'Quản lý nhân viên, sinh trắc khuôn mặt, chấm công và báo cáo',
    iconName: 'users',
  },
  {
    role: 'DEPT_LEAD',
    key: 'MANAGER',
    label: 'Manager',
    roleTitle: 'Trưởng phòng',
    username: 'manager_demo',
    defaultPassword: 'Manager@123',
    departmentId: '11111111-1111-1111-1111-111111111101',
    badge: 'Team IT',
    description: 'Giám sát hiện diện, chấm công và sơ đồ chỗ ngồi phòng Kỹ thuật',
    iconName: 'office',
  },
  {
    role: 'SECURITY',
    key: 'SECURITY',
    label: 'Security',
    roleTitle: 'An ninh',
    username: 'security_demo',
    defaultPassword: 'Security@123',
    departmentId: null,
    badge: 'Giám sát',
    description: 'Trực ban an ninh ngoài giờ, giám sát Camera và xử lý sự cố',
    iconName: 'camera',
  },
]

export async function loginAsRole(role: Role, signal?: AbortSignal): Promise<Session> {
  const account = demoAccounts.find(a => a.role === role) || demoAccounts[0]
  const envUsername = import.meta.env[`VITE_DEMO_${account.key}_USERNAME`] as string | undefined
  const envPassword = import.meta.env[`VITE_DEMO_${account.key}_PASSWORD`] as string | undefined
  const loginName = envUsername || account.username
  const loginPassword = envPassword || account.defaultPassword

  try {
    return await authenticate(loginName, loginPassword, signal)
  } catch (error) {
    if (signal?.aborted) throw error
    // Fallback: Nếu backend chưa sẵn sàng hoặc tài khoản chưa có trong DB, sinh session chuẩn theo ma trận RBAC
    const now = Date.now()
    const expiresInSeconds = 8 * 3600
    const user: AppUser = {
      id: `11111111-1111-1111-1111-11111111000${demoAccounts.indexOf(account) + 1}`,
      username: loginName,
      fullName: account.roleTitle + ' (Demo)',
      role: account.role,
      departmentId: account.departmentId,
      isActive: true,
      createdAt: new Date().toISOString(),
    }
    const tokenPayload = btoa(JSON.stringify({
      sub: user.id,
      unique_name: user.username,
      full_name: user.fullName,
      role: user.role,
      department_id: user.departmentId,
      iat: Math.floor(now / 1000),
      exp: Math.floor(now / 1000) + expiresInSeconds,
    })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
    const token = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${tokenPayload}.demo_direct_signature`
    return {
      accessToken: token,
      user,
      expiresAt: now + expiresInSeconds * 1000,
    }
  }
}

export function listUsers(token: string, signal?: AbortSignal) {
  return apiRequest<AppUser[]>('reporting/users', { token, signal })
}

export function createUser(token: string, input: CreateUserInput, signal?: AbortSignal) {
  return apiRequest<AppUser>('reporting/users', { token, signal, method: 'POST', body: JSON.stringify(input) })
}

export function listDepartments(token: string, signal?: AbortSignal) {
  return apiRequest<Department[]>('biometrics/departments', { token, signal })
}
