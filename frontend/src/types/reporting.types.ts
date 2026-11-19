export interface DailyDepartmentSummary {
  id: string
  summaryDate: string
  departmentId: string
  departmentCode: string
  totalEmployees: number
  presentCount: number
  lateCount: number
  absentCount: number
  prolongedAwayEvents: number
  securityAlertsCount: number
  attendanceRatePercent: number
  updatedAt: string
}

export interface MonthlyDepartmentReport {
  year: number
  month: number
  departmentId: string | null
  totalDaysRecorded: number
  totalPresentManDays: number
  totalLateEvents: number
  totalAbsentManDays: number
  totalProlongedAwayEvents: number
  totalSecurityAlerts: number
  dailyBreakdown: DailyDepartmentSummary[]
}

export interface WeeklyDepartmentReport {
  startDate: string
  endDate: string
  weekNumber: number
  year: number
  departmentId: string | null
  totalDaysRecorded: number
  totalPresentManDays: number
  totalLateEvents: number
  totalAbsentManDays: number
  totalProlongedAwayEvents: number
  totalSecurityAlerts: number
  dailyBreakdown: DailyDepartmentSummary[]
}

export interface ReportFilters {
  year: number
  month: number
  departmentId?: string
}

export interface DepartmentAttendance {
  departmentId: string
  departmentCode: string
  daysRecorded: number
  onTime: number
  late: number
  absent: number
  prolongedAway: number
  securityAlerts: number
  total: number
}

export type ReportPeriodMode = 'daily' | 'weekly' | 'monthly' | 'custom'

export interface PeriodBounds {
  mode: ReportPeriodMode
  fromDate: string
  toDate: string
  label: string
  fileTag: string
}

export type TimesheetRatingTone = 'success' | 'info' | 'warning' | 'danger'
export type TimesheetRatingLabel = 'Xuất sắc' | 'Đạt chuẩn' | 'Cần lưu ý' | 'Vi phạm'
export type TimesheetFilterStatus =
  | 'ALL'
  | 'WORKING'
  | 'ON_TIME_ONLY'
  | 'ON_LEAVE'
  | 'ABSENT_UNEXCUSED'
  | 'LATE_WARNING'
export type TimesheetRatingFilter = 'ALL' | TimesheetRatingLabel
export type TimesheetSpecialFilter =
  | 'ALL'
  | 'HAS_OT'
  | 'HAS_SEAT'
  | 'NO_SEAT'
  | 'FACE_REGISTERED'
  | 'NO_FACE'
export type TimesheetSortBy =
  | 'DEFAULT'
  | 'CODE_ASC'
  | 'NAME_ASC'
  | 'RATE_DESC'
  | 'RATE_ASC'
  | 'LATE_MINS_DESC'
  | 'WORK_HOURS_DESC'
  | 'OT_HOURS_DESC'
export type WorkStatusCategory = 'WORKING' | 'ON_LEAVE' | 'ABSENT_UNEXCUSED' | 'NO_RECORD'

export interface EmployeeTimesheetRow {
  employeeId: string
  employeeCode: string
  fullName: string
  departmentId: string
  departmentCode: string
  departmentName: string
  isActive: boolean
  registeredVectorCount: number
  presentDays: number
  onTimeDays: number
  lateDays: number
  totalLateMinutes: number
  earlyLeaveDays: number
  totalEarlyLeaveMinutes: number
  approvedLeaveDays: number
  absentDays: number
  totalWorkHours: number
  approvedOtHours: number
  approvedOtSessions: number
  firstCheckInText: string
  lastCheckOutText: string
  avgMatchConfidence: number
  attendanceRatePercent: number
  ratingLabel: TimesheetRatingLabel
  ratingTone: TimesheetRatingTone
  workStatusCategory: WorkStatusCategory
  workStatusLabel: string
  workStatusTone: TimesheetRatingTone
  workingDatesList: string[]
  absentDatesList: string[]
  leaveDetailsText: string
  assignedSeatText: string
}

export interface TimesheetDepartmentGroup {
  departmentId: string
  departmentCode: string
  departmentName: string
  rows: EmployeeTimesheetRow[]
  workingCount: number
  onTimePeopleCount: number
  latePeopleCount: number
  onLeaveCount: number
  absentCount: number
  totalPresentDays: number
  totalOnTimeDays: number
  totalLateDays: number
  totalLateMinutes: number
  totalEarlyLeaveDays: number
  totalEarlyLeaveMinutes: number
  totalLeaveDays: number
  totalAbsentDays: number
  totalWorkHours: number
  totalOtHours: number
  avgAttendanceRatePercent: number
}

export interface SeatUtilizationRow {
  seatId: string
  seatCode: string
  seatName: string
  zoneType: 'WORK_DESK' | 'RESTRICTED_ZONE' | string
  cameraId: string
  cameraCode: string
  cameraName: string
  departmentId: string
  departmentCode: string
  assignedEmployeeId?: string | null
  assignedEmployeeCode: string | null
  assignedEmployeeName: string | null
  currentState: 'EMPTY' | 'PRESENT' | 'TEMP_AWAY' | 'PROLONGED_AWAY' | 'WRONG_SEAT' | string
  activeSecondsToday: number
  utilizationPercent: number
  stateUpdatedAt: string
}

export interface CameraOccupancyBreakdown {
  cameraId: string
  cameraCode: string
  cameraName: string
  totalDesks: number
  presentCount: number
  tempAwayCount: number
  prolongedAwayCount: number
  wrongSeatCount: number
  emptyCount: number
  utilizationPercent: number
  totalActiveHoursToday: number
}

export interface OccupancyReportSummary {
  totalZones: number
  totalDesks: number
  restrictedZones: number
  assignedDesks: number
  assignedDeskRatePercent: number
  presentCount: number
  tempAwayCount: number
  prolongedAwayCount: number
  wrongSeatCount: number
  emptyCount: number
  spaceUtilizationPercent: number
  totalActiveHoursToday: number
  avgActiveMinutesPerDesk: number
  totalStateTransitions: number
  periodProlongedAwayEvents: number
  seatRows: SeatUtilizationRow[]
  cameraBreakdown: CameraOccupancyBreakdown[]
}

export interface SecurityOtReportSummary {
  totalIncidents: number
  level1ApprovedOt: number
  level2Unauthorized: number
  level3Breach: number
  spoofingAttempts: number
  openCount: number
  acknowledgedCount: number
  falseAlarmCount: number
  resolutionRatePercent: number
  telegramAlertCount: number
  totalOtRegistrations: number
  approvedOtCount: number
  pendingOtCount: number
  rejectedOtCount: number
  overnightOtCount: number
  totalApprovedOtHours: number
}
