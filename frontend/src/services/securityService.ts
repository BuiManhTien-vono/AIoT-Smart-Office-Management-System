import { apiRequest } from './apiClient'
import type {
  SecurityIncident,
  NightGuardStatus,
  ResolveIncidentRequest,
  OtRegistration,
  CreateOtRequest,
  UpdateOtApprovalRequest,
} from '../types/security.types'

/**
 * Lấy trạng thái giám sát trực đêm (Night Guard) thời gian thực
 */
export async function getNightGuardStatus(
  token: string,
  signal?: AbortSignal
): Promise<NightGuardStatus> {
  return apiRequest<NightGuardStatus>('/security/night-guard/status', {
    method: 'GET',
    token,
    signal,
  })
}

/**
 * Lấy danh sách các sự cố / cảnh báo an ninh ngoài giờ
 */
export async function listSecurityIncidents(
  token: string,
  filters?: {
    ticketStatus?: string
    alertLevel?: string
    limit?: number
  },
  signal?: AbortSignal
): Promise<SecurityIncident[]> {
  const params = new URLSearchParams()
  if (filters?.ticketStatus && filters.ticketStatus !== 'ALL') {
    params.set('ticketStatus', filters.ticketStatus)
  }
  if (filters?.alertLevel && filters.alertLevel !== 'ALL') {
    params.set('alertLevel', filters.alertLevel)
  }
  if (filters?.limit) {
    params.set('limit', filters.limit.toString())
  }

  const query = params.toString() ? `?${params.toString()}` : ''
  return apiRequest<SecurityIncident[]>(`/security/incidents${query}`, {
    method: 'GET',
    token,
    signal,
  })
}

/**
 * Đóng ticket sự cố: Xác nhận xử lý (ACKNOWLEDGED) hoặc Báo động giả (FALSE_ALARM)
 */
export async function resolveSecurityIncident(
  token: string,
  incidentId: string,
  body: ResolveIncidentRequest,
  signal?: AbortSignal
): Promise<SecurityIncident> {
  return apiRequest<SecurityIncident>(`/security/incidents/${incidentId}/resolve`, {
    method: 'PUT',
    token,
    body: JSON.stringify(body),
    signal,
  })
}

/**
 * Lấy danh sách đăng ký làm thêm giờ (OT)
 */
export async function listOtRegistrations(
  token: string,
  filters?: {
    date?: string
    employeeId?: string
  },
  signal?: AbortSignal
): Promise<OtRegistration[]> {
  const params = new URLSearchParams()
  if (filters?.date) {
    params.set('date', filters.date)
  }
  if (filters?.employeeId) {
    params.set('employeeId', filters.employeeId)
  }

  const query = params.toString() ? `?${params.toString()}` : ''
  return apiRequest<OtRegistration[]>(`/security/ot-registrations${query}`, {
    method: 'GET',
    token,
    signal,
  })
}

/**
 * Đăng ký ca làm thêm ngoài giờ (OT)
 */
export async function createOtRegistration(
  token: string,
  body: CreateOtRequest,
  signal?: AbortSignal
): Promise<OtRegistration> {
  return apiRequest<OtRegistration>('/security/ot-registrations', {
    method: 'POST',
    token,
    body: JSON.stringify(body),
    signal,
  })
}

/**
 * Cập nhật trạng thái duyệt ca OT (APPROVED / REJECTED)
 */
export async function updateOtApprovalStatus(
  token: string,
  id: string,
  body: UpdateOtApprovalRequest,
  signal?: AbortSignal
): Promise<OtRegistration> {
  return apiRequest<OtRegistration>(`/security/ot-registrations/${id}/status`, {
    method: 'PUT',
    token,
    body: JSON.stringify(body),
    signal,
  })
}

/**
 * Chuẩn hóa URL ảnh snapshot để trình duyệt hiển thị đúng (tránh hostname nội bộ container)
 */
export function formatMediaUrl(url?: string | null): string | undefined {
  if (!url) return undefined
  if (url.includes('http://minio:9000')) {
    return url.replace('http://minio:9000', 'http://localhost:9000')
  }
  return url
}
