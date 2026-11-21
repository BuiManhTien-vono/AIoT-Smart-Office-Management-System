export interface Shift {
  id: string
  shiftCode: string
  shiftName: string
  startTime: string
  endTime: string
  graceMinutes: number
  lunchStart?: string
  lunchEnd?: string
  isDefault: boolean
}

export interface CreateShiftInput {
  shiftCode: string
  shiftName: string
  startTime: string
  endTime: string
  graceMinutes?: number
  lunchStart?: string
  lunchEnd?: string
  isDefault?: boolean
}

export type AttendanceStatus = 'ON_TIME' | 'LATE' | 'EARLY_LEAVE' | 'ABSENT' | 'REVOKED'

export interface AttendanceRecord {
  id: string
  employeeId: string
  employeeCode: string
  employeeFullName: string
  shiftId: string
  workDate: string
  checkInTime?: string | null
  checkOutTime?: string | null
  status: AttendanceStatus | string
  lateMinutes: number
  earlyLeaveMinutes: number
  matchConfidence: number
  isDebounced: boolean
  message: string
  checkinSnapshotKey?: string | null
  checkinSnapshotPresignedUrl?: string | null
  isManuallyAdjusted?: boolean
  adjustmentReason?: string | null
  adjustedByUserId?: string | null
  adjustedByName?: string | null
  adjustedAt?: string | null
  departmentId?: string | null
}

export interface AdjustAttendanceInput {
  checkInTime: string | null
  checkOutTime: string | null
  shiftId?: string | null
  isStatusOverridden: boolean
  overrideStatus?: AttendanceStatus | null
  overrideLateMinutes?: number | null
  overrideEarlyLeaveMinutes?: number | null
  reason: string
  sourceScreen?: string
}

export interface ManualAttendanceInput {
  employeeId: string
  workDate: string
  checkInTime: string | null
  checkOutTime: string | null
  shiftId?: string | null
  isStatusOverridden: boolean
  overrideStatus?: AttendanceStatus | null
  overrideLateMinutes?: number | null
  overrideEarlyLeaveMinutes?: number | null
  reason: string
  sourceScreen?: string
}

export type CancelAttendanceMode = 'VOID_ERRONEOUS' | 'REVOKE_PENALTY'

export interface CancelAttendanceInput {
  cancelMode: CancelAttendanceMode
  reason: string
  sourceScreen?: string
}

export interface CancelAttendanceResponse {
  attendanceLogId: string
  employeeId: string
  employeeCode: string
  workDate: string
  cancelMode: CancelAttendanceMode | string
  previousStatus?: string | null
  newStatus?: string | null
  reason: string
  message: string
  updatedRecord?: AttendanceRecord | null
}

export interface AttendanceAdjustmentAudit {
  id: string
  attendanceLogId: string
  employeeId: string
  employeeCode: string
  employeeFullName: string
  departmentId: string
  workDate: string
  actionType: 'MANUAL_CREATE' | 'ADJUST' | 'REVOKE_PENALTY' | 'VOID_ERRONEOUS' | string
  previousStatus?: string | null
  newStatus?: string | null
  previousCheckInTime?: string | null
  newCheckInTime?: string | null
  previousCheckOutTime?: string | null
  newCheckOutTime?: string | null
  previousLateMinutes: number
  newLateMinutes: number
  previousEarlyLeaveMinutes: number
  newEarlyLeaveMinutes: number
  isStatusOverridden: boolean
  reason: string
  sourceScreen?: string | null
  adjustedByUserId: string
  adjustedByUsername: string
  adjustedByName: string
  adjustedByRole: string
  createdAt: string
}

export type LeaveType =
  | 'ANNUAL_LEAVE'
  | 'SICK_LEAVE'
  | 'PERSONAL_LEAVE'
  | 'UNPAID_LEAVE'
  | 'OFFICIAL_DUTY'
  | 'SUDDENLY_ALLOWED_LEAVE'

export interface LeaveRequest {
  id: string
  employeeId: string
  employeeCode?: string
  employeeName?: string
  startDate: string
  endDate: string
  startTime?: string
  endTime?: string
  leaveType: string
  isPaid: boolean
  reason?: string | null
  approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | string
  createdAt: string
}

export interface CreateLeaveInput {
  employeeId: string
  startDate: string
  endDate: string
  startTime?: string
  endTime?: string
  leaveType?: string
  isPaid?: boolean
  reason?: string
}

export interface DailyAbsentResponse {
  workDate: string
  totalActiveEmployees: number
  presentOrCheckedInCount: number
  onApprovedLeaveCount: number
  newlyMarkedAbsentCount: number
  absentEmployeeCodes: string[]
}

export const leaveTypeLabels: Record<string, string> = {
  ANNUAL_LEAVE: 'Nghỉ phép năm',
  SICK_LEAVE: 'Nghỉ ốm / Khám bệnh',
  PERSONAL_LEAVE: 'Việc riêng có lương',
  UNPAID_LEAVE: 'Nghỉ không lương',
  OFFICIAL_DUTY: 'Công vụ / Họp hợp lệ trong ca',
  SUDDENLY_ALLOWED_LEAVE: 'Nghỉ đột xuất trong ngày (Không lương)',
}

export const attendanceStatusLabels: Record<string, { label: string; class: string }> = {
  ON_TIME: { label: 'Đúng giờ', class: 'badge-success' },
  LATE: { label: 'Đi muộn', class: 'badge-warning' },
  EARLY_LEAVE: { label: 'Về sớm', class: 'badge-special' },
  ABSENT: { label: 'Vắng mặt', class: 'badge-danger' },
  REVOKED: { label: 'Hủy công (Trừ lương)', class: 'badge-danger' },
}

export const auditActionLabels: Record<string, { label: string; class: string }> = {
  MANUAL_CREATE: { label: 'Bổ sung công', class: 'badge-info' },
  ADJUST: { label: 'Điều chỉnh công', class: 'badge-warning' },
  REVOKE_PENALTY: { label: 'Phạt hủy công (Trừ lương)', class: 'badge-danger' },
  VOID_ERRONEOUS: { label: 'Gỡ bản ghi nhầm', class: 'badge-neutral' },
}
