import { roles } from '../types/auth.types'
import type { Session } from '../types/auth.types'

const sessionKey = 'smart-office.session.v1'

export function readSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(sessionKey)
    if (!raw) return null
    const value = JSON.parse(raw) as Session
    if (typeof value.accessToken === 'string' && value.accessToken && value.user?.isActive
      && roles.includes(value.user.role) && typeof value.user.id === 'string'
      && typeof value.user.username === 'string' && typeof value.user.fullName === 'string'
      && Number.isFinite(value.expiresAt) && value.expiresAt > Date.now()) {
      return value
    }
    sessionStorage.removeItem(sessionKey)
  } catch { /* Storage may be unavailable. The current session can stay in memory. */ }
  return null
}

export function saveSession(session: Session | null) {
  try {
    if (session) sessionStorage.setItem(sessionKey, JSON.stringify(session))
    else sessionStorage.removeItem(sessionKey)
  } catch { /* An unavailable storage must not block login or logout. */ }
}
