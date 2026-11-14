import { apiFetch, apiRequest } from './apiClient'
import type { Session } from '../types/auth.types'
import type {
  DailyDepartmentSummary,
  DepartmentAttendance,
  MonthlyDepartmentReport,
  WeeklyDepartmentReport,
  ReportFilters,
} from '../types/reporting.types'

export const officeTimeZone = 'Asia/Ho_Chi_Minh'

export function officeDate(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: officeTimeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const getPart = (type: string) => parts.find(part => part.type === type)?.value ?? ''
  return `${getPart('year')}-${getPart('month')}-${getPart('day')}`
}

export function formatDateTime(value: Date | string): string {
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: officeTimeZone,
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(typeof value === 'string' ? new Date(value) : value)
}

export function departmentScope(session: Session): string | undefined {
  if (session.user.role !== 'DEPT_LEAD') return undefined
  if (!session.user.departmentId) {
    throw new Error('Tài khoản Trưởng phòng chưa được gán phòng ban. Liên hệ quản trị viên để tiếp tục.')
  }
  return session.user.departmentId
}

export async function dailySummaries(
  session: Session,
  date: string,
  signal?: AbortSignal,
): Promise<DailyDepartmentSummary[]> {
  const departmentId = departmentScope(session)
  const params = new URLSearchParams({ date })
  if (departmentId) params.set('departmentId', departmentId)
  const rows = await apiRequest<DailyDepartmentSummary[]>(`reporting/daily-summaries?${params}`, {
    token: session.accessToken,
    signal,
  })
  return rows.filter(row => row.summaryDate === date && (!departmentId || row.departmentId === departmentId))
}

function reportParams(session: Session, filters: ReportFilters): URLSearchParams {
  const { year, month } = filters
  if (!Number.isInteger(year) || year < 1 || year > 9998 || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error('Chọn tháng và năm hợp lệ để xem báo cáo.')
  }
  const departmentId = departmentScope(session) ?? filters.departmentId
  const params = new URLSearchParams({ year: String(year), month: String(month) })
  if (departmentId) params.set('departmentId', departmentId)
  return params
}

export async function monthlyReport(
  session: Session,
  filters: ReportFilters,
  signal?: AbortSignal,
): Promise<MonthlyDepartmentReport> {
  const params = reportParams(session, filters)
  const report = await apiRequest<MonthlyDepartmentReport>(`reporting/monthly-report?${params}`, {
    token: session.accessToken,
    signal,
  })
  const departmentId = params.get('departmentId')
  const period = `${String(filters.year).padStart(4, '0')}-${String(filters.month).padStart(2, '0')}-`
  const rows = report.dailyBreakdown.filter(row => row.summaryDate.startsWith(period)
    && (!departmentId || row.departmentId === departmentId))
  return {
    ...report,
    dailyBreakdown: rows,
    totalDaysRecorded: new Set(rows.map(row => row.summaryDate)).size,
    totalPresentManDays: rows.reduce((sum, row) => sum + row.presentCount, 0),
    totalLateEvents: rows.reduce((sum, row) => sum + row.lateCount, 0),
    totalAbsentManDays: rows.reduce((sum, row) => sum + row.absentCount, 0),
    totalProlongedAwayEvents: rows.reduce((sum, row) => sum + row.prolongedAwayEvents, 0),
    totalSecurityAlerts: rows.reduce((sum, row) => sum + row.securityAlertsCount, 0),
  }
}

export async function weeklyReport(
  session: Session,
  date?: string,
  departmentId?: string,
  signal?: AbortSignal,
): Promise<WeeklyDepartmentReport> {
  const params = new URLSearchParams()
  if (date) params.set('date', date)
  const scopedDept = departmentScope(session) ?? departmentId
  if (scopedDept) params.set('departmentId', scopedDept)
  const report = await apiRequest<WeeklyDepartmentReport>(`reporting/weekly-report?${params}`, {
    token: session.accessToken,
    signal,
  })
  const filterDept = scopedDept
  const rows = report.dailyBreakdown.filter(row => !filterDept || row.departmentId === filterDept)
  return {
    ...report,
    dailyBreakdown: rows,
    totalDaysRecorded: new Set(rows.map(row => row.summaryDate)).size,
    totalPresentManDays: rows.reduce((sum, row) => sum + row.presentCount, 0),
    totalLateEvents: rows.reduce((sum, row) => sum + row.lateCount, 0),
    totalAbsentManDays: rows.reduce((sum, row) => sum + row.absentCount, 0),
    totalProlongedAwayEvents: rows.reduce((sum, row) => sum + row.prolongedAwayEvents, 0),
    totalSecurityAlerts: rows.reduce((sum, row) => sum + row.securityAlertsCount, 0),
  }
}

export async function downloadReportCsv(
  session: Session,
  filters: ReportFilters,
  signal?: AbortSignal,
): Promise<string> {
  const response = await apiFetch(`reporting/export-csv?${reportParams(session, filters)}`, {
    token: session.accessToken,
    signal,
  })
  const buffer = new Uint8Array(await response.arrayBuffer())
  signal?.throwIfAborted()
  const hasBom = buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf
  const parts: BlobPart[] = hasBom ? [buffer] : [new Uint8Array([0xef, 0xbb, 0xbf]), buffer]
  const blob = new Blob(parts, { type: 'text/csv;charset=utf-8' })
  const filename = `SmartOffice_BangCong_${String(filters.year).padStart(4, '0')}_${String(filters.month).padStart(2, '0')}.csv`
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
  return filename
}

export function onTimeCount(row: DailyDepartmentSummary): number {
  return Math.max(0, row.presentCount - row.lateCount)
}

export function summarizeDepartments(rows: DailyDepartmentSummary[]): DepartmentAttendance[] {
  const groups = new Map<string, DepartmentAttendance>()
  const daysByDepartment = new Map<string, Set<string>>()
  for (const row of rows) {
    const group = groups.get(row.departmentId) ?? {
      departmentId: row.departmentId,
      departmentCode: row.departmentCode,
      daysRecorded: 0,
      onTime: 0,
      late: 0,
      absent: 0,
      prolongedAway: 0,
      securityAlerts: 0,
      total: 0,
    }
    group.onTime += onTimeCount(row)
    group.late += row.lateCount
    group.absent += row.absentCount
    group.prolongedAway += row.prolongedAwayEvents
    group.securityAlerts += row.securityAlertsCount
    group.total = group.onTime + group.late + group.absent
    const days = daysByDepartment.get(row.departmentId) ?? new Set<string>()
    days.add(row.summaryDate)
    daysByDepartment.set(row.departmentId, days)
    group.daysRecorded = days.size
    groups.set(row.departmentId, group)
  }
  return [...groups.values()].sort((left, right) => left.departmentCode.localeCompare(right.departmentCode, 'vi'))
}
