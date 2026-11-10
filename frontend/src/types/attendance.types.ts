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

export type AttendanceStatus = 'ON_TIME' | 'LATE' | 'EARLY_LEAVE' | 'ABSENT'

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
}

export type LeaveType = 'ANNUAL_LEAVE' | 'SICK_LEAVE' | 'PERSONAL_LEAVE' | 'UNPAID_LEAVE'

export interface LeaveRequest {
  id: string
  employeeId: string
  employeeCode?: string
  employeeName?: string
  startDate: string
  endDate: string
  leaveType: string
  reason?: string | null
  approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | string
  createdAt: string
}

export interface CreateLeaveInput {
  employeeId: string
  startDate: string
  endDate: string
  leaveType?: string
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
}

export const attendanceStatusLabels: Record<string, { label: string; class: string }> = {
  ON_TIME: { label: 'Đúng giờ', class: 'badge-success' },
  LATE: { label: 'Đi muộn', class: 'badge-warning' },
  EARLY_LEAVE: { label: 'Về sớm', class: 'badge-special' },
  ABSENT: { label: 'Vắng mặt', class: 'badge-danger' },
}
