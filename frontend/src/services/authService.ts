import { apiRequest } from './apiClient'
import { roles } from '../types/auth.types'
import type { AppUser, CreateUserInput, Department, Session } from '../types/auth.types'

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

export function listUsers(token: string, signal?: AbortSignal) {
  return apiRequest<AppUser[]>('reporting/users', { token, signal })
}

export function createUser(token: string, input: CreateUserInput, signal?: AbortSignal) {
  return apiRequest<AppUser>('reporting/users', { token, signal, method: 'POST', body: JSON.stringify(input) })
}

export function listDepartments(token: string, signal?: AbortSignal) {
  return apiRequest<Department[]>('biometrics/departments', { token, signal })
}
