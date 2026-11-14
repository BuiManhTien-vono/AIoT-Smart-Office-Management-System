export type TicketStatus = 'OPEN' | 'ACKNOWLEDGED' | 'FALSE_ALARM'

export type AlertLevel =
  | 'LEVEL_1_APPROVED_OT'
  | 'LEVEL_2_UNAUTHORIZED_PRESENCE'
  | 'LEVEL_3_SECURITY_BREACH'
  | 'SPOOFING_ATTEMPT'

export interface SecurityIncident {
  id: string
  cameraId: string
  detectedEmployeeId?: string | null
  detectedEmployeeCode?: string | null
  detectedEmployeeName?: string | null
  alertLevel: AlertLevel | string
  snapshotObjectKey: string
  snapshotPresignedUrl?: string | null
  videoClipObjectKey?: string | null
  videoClipPresignedUrl?: string | null
  telegramSent: boolean
  ticketStatus: TicketStatus | string
  resolutionNote?: string | null
  resolvedByUserId?: string | null
  detectedAt: string
  resolvedAt?: string | null
  actionSummary: string
}

export interface NightGuardStatus {
  checkedAtUtc: string
  isNightGuardActive: boolean
  reason: string
}

export interface ResolveIncidentRequest {
  ticketStatus: 'ACKNOWLEDGED' | 'FALSE_ALARM'
  resolutionNote: string
  resolvedByUserId?: string
}

export type OtApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

export interface OtRegistration {
  id: string
  employeeId: string
  employeeCode: string
  employeeFullName: string
  otDate: string
  startTime: string
  endTime: string
  isOvernight: boolean
  reason?: string | null
  approvalStatus: OtApprovalStatus | string
  approvedByUserId?: string | null
  createdAt: string
}

export interface CreateOtRequest {
  employeeId: string
  otDate: string
  startTime: string
  endTime: string
  reason?: string
  approvalStatus?: string
  approvedByUserId?: string
}

export interface UpdateOtApprovalRequest {
  approvalStatus: string
  approvedByUserId?: string
  reason?: string
}
