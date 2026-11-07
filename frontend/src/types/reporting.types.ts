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
