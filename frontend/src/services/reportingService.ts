import { apiFetch, apiRequest } from './apiClient'
import { leaveTypeLabels } from '../types/attendance.types'
import type { Session } from '../types/auth.types'
import type { AttendanceRecord, LeaveRequest, Shift } from '../types/attendance.types'
import type { Department, Employee } from '../types/biometrics.types'
import type { Camera, Seat, SeatOccupancyLog } from '../types/occupancy.types'
import type { OtRegistration, SecurityIncident } from '../types/security.types'
import type {
  CameraOccupancyBreakdown,
  DailyDepartmentSummary,
  DepartmentAttendance,
  EmployeeTimesheetRow,
  MonthlyDepartmentReport,
  OccupancyReportSummary,
  PeriodBounds,
  ReportFilters,
  ReportPeriodMode,
  SeatUtilizationRow,
  SecurityOtReportSummary,
  TimesheetDepartmentGroup,
  TimesheetRatingLabel,
  TimesheetRatingTone,
  WeeklyDepartmentReport,
  WorkStatusCategory,
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
    totalRevokedManDays: rows.reduce((sum, row) => sum + (row.revokedCount ?? 0), 0),
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
    totalRevokedManDays: rows.reduce((sum, row) => sum + (row.revokedCount ?? 0), 0),
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
      revoked: 0,
      prolongedAway: 0,
      securityAlerts: 0,
      total: 0,
    }
    group.onTime += onTimeCount(row)
    group.late += row.lateCount
    group.absent += row.absentCount
    group.revoked += row.revokedCount ?? 0
    group.prolongedAway += row.prolongedAwayEvents
    group.securityAlerts += row.securityAlertsCount
    group.total = group.onTime + group.late + group.absent + group.revoked
    const days = daysByDepartment.get(row.departmentId) ?? new Set<string>()
    days.add(row.summaryDate)
    daysByDepartment.set(row.departmentId, days)
    group.daysRecorded = days.size
    groups.set(row.departmentId, group)
  }
  return [...groups.values()].sort((left, right) => left.departmentCode.localeCompare(right.departmentCode, 'vi'))
}

function parseIsoDateParts(dateStr: string): [number, number, number] {
  const [y, m, d] = dateStr.split('-').map(Number)
  return [y || 2026, (m || 1), (d || 1)]
}

function formatYmd(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function formatDisplayDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-')
  return y && m && d ? `${d}/${m}/${y}` : dateStr
}

export function computePeriodBounds(
  mode: ReportPeriodMode,
  selectedDate: string,
  selectedWeekDate: string,
  selectedMonth: string,
  weeklyMeta?: WeeklyDepartmentReport,
  customFromDate?: string,
  customToDate?: string,
): PeriodBounds {
  if (mode === 'daily') {
    return {
      mode,
      fromDate: selectedDate,
      toDate: selectedDate,
      label: `Ngày ${formatDisplayDate(selectedDate)}`,
      fileTag: `Ngay_${selectedDate}`,
    }
  }

  if (mode === 'weekly') {
    if (weeklyMeta?.startDate && weeklyMeta?.endDate) {
      return {
        mode,
        fromDate: weeklyMeta.startDate,
        toDate: weeklyMeta.endDate,
        label: `Tuần ${weeklyMeta.weekNumber}/${weeklyMeta.year} (${formatDisplayDate(weeklyMeta.startDate)} – ${formatDisplayDate(weeklyMeta.endDate)})`,
        fileTag: `Tuan_${weeklyMeta.weekNumber}_${weeklyMeta.year}`,
      }
    }
    const [y, m, d] = parseIsoDateParts(selectedWeekDate)
    const target = new Date(y, m - 1, d)
    const dow = target.getDay()
    const daysFromMon = dow === 0 ? 6 : dow - 1
    const start = new Date(target)
    start.setDate(target.getDate() - daysFromMon)
    const end = new Date(start)
    end.setDate(start.getDate() + 6)
    const fromDate = formatYmd(start)
    const toDate = formatYmd(end)
    return {
      mode,
      fromDate,
      toDate,
      label: `Tuần (${formatDisplayDate(fromDate)} – ${formatDisplayDate(toDate)})`,
      fileTag: `Tuan_${fromDate}_${toDate}`,
    }
  }

  if (mode === 'custom') {
    const rawFrom = customFromDate || selectedDate
    const rawTo = customToDate || selectedDate
    const safeFrom = rawFrom <= rawTo ? rawFrom : rawTo
    const safeTo = rawFrom <= rawTo ? rawTo : rawFrom
    return {
      mode,
      fromDate: safeFrom,
      toDate: safeTo,
      label: `Tùy chỉnh ${formatShortDayMonth(safeFrom)} – ${formatShortDayMonth(safeTo)}/${safeTo.slice(0, 4)}`,
      fileTag: `Tu_${safeFrom}_den_${safeTo}`,
    }
  }

  const [year, month] = selectedMonth.split('-').map(Number)
  const safeYear = Number.isInteger(year) && year > 0 ? year : new Date().getFullYear()
  const safeMonth = Number.isInteger(month) && month >= 1 && month <= 12 ? month : new Date().getMonth() + 1
  const lastDay = new Date(safeYear, safeMonth, 0).getDate()
  const ym = `${String(safeYear).padStart(4, '0')}-${String(safeMonth).padStart(2, '0')}`
  return {
    mode,
    fromDate: `${ym}-01`,
    toDate: `${ym}-${String(lastDay).padStart(2, '0')}`,
    label: `Tháng ${String(safeMonth).padStart(2, '0')}/${safeYear}`,
    fileTag: `Thang_${safeYear}_${String(safeMonth).padStart(2, '0')}`,
  }
}

function parseTimeToMinutes(timeStr?: string | null): number | null {
  if (!timeStr) return null
  const [h, m] = timeStr.split(':').map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null
  return h * 60 + m
}

function minutesOfDayInOfficeZone(isoStr?: string | null): number | null {
  if (!isoStr) return null
  const date = new Date(isoStr)
  if (Number.isNaN(date.getTime())) return null
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: officeTimeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const hh = Number(parts.find(p => p.type === 'hour')?.value ?? 'NaN')
  const mm = Number(parts.find(p => p.type === 'minute')?.value ?? 'NaN')
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null
  return (hh % 24) * 60 + mm
}

function formatMinutesAsClock(totalMinutes: number | null): string {
  if (totalMinutes === null || !Number.isFinite(totalMinutes)) return '—'
  const rounded = Math.max(0, Math.round(totalMinutes))
  const hh = Math.floor(rounded / 60) % 24
  const mm = rounded % 60
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

function computeRecordWorkHours(record: AttendanceRecord, shift?: Shift): number {
  if (record.status === 'ABSENT' || record.status === 'REVOKED') return 0

  const shiftStart = parseTimeToMinutes(shift?.startTime) ?? 8 * 60
  const shiftEnd = parseTimeToMinutes(shift?.endTime) ?? 17 * 60 + 30
  const lunchStart = parseTimeToMinutes(shift?.lunchStart) ?? 12 * 60
  const lunchEnd = parseTimeToMinutes(shift?.lunchEnd) ?? 13 * 60 + 30
  const lunchDuration = Math.max(0, lunchEnd - lunchStart)
  const expectedShiftMinutes = Math.max(60, shiftEnd - shiftStart - lunchDuration)

  if (record.checkInTime && record.checkOutTime) {
    const startMs = new Date(record.checkInTime).getTime()
    const endMs = new Date(record.checkOutTime).getTime()
    if (endMs > startMs) {
      let workedMinutes = (endMs - startMs) / 60_000
      const inMin = minutesOfDayInOfficeZone(record.checkInTime)
      const outMin = minutesOfDayInOfficeZone(record.checkOutTime)
      if (inMin !== null && outMin !== null && lunchDuration > 0) {
        const overlapStart = Math.max(inMin, lunchStart)
        const overlapEnd = Math.min(outMin, lunchEnd)
        if (overlapEnd > overlapStart) {
          workedMinutes -= (overlapEnd - overlapStart)
        }
      }
      return Math.max(0, Math.round((workedMinutes / 60) * 100) / 100)
    }
  }

  if (record.checkInTime) {
    const estMinutes = Math.max(0, expectedShiftMinutes - (record.lateMinutes || 0))
    return Math.round((estMinutes / 60) * 100) / 100
  }

  return 0
}

export function calculateOtDurationHours(startTime: string, endTime: string, isOvernight: boolean): number {
  const startMin = parseTimeToMinutes(startTime)
  const endMin = parseTimeToMinutes(endTime)
  if (startMin === null || endMin === null) return 0
  let diff = endMin - startMin
  if (isOvernight || diff <= 0) {
    diff += 24 * 60
  }
  return Math.max(0, Math.round((diff / 60) * 100) / 100)
}

function countOverlapDays(startA: string, endA: string, startB: string, endB: string): number {
  const start = startA > startB ? startA : startB
  const end = endA < endB ? endA : endB
  if (end < start) return 0
  const [sy, sm, sd] = parseIsoDateParts(start)
  const [ey, em, ed] = parseIsoDateParts(end)
  const sUtc = Date.UTC(sy, sm - 1, sd)
  const eUtc = Date.UTC(ey, em - 1, ed)
  return Math.floor((eUtc - sUtc) / 86_400_000) + 1
}

const seatStateTextMap: Record<string, string> = {
  PRESENT: 'Đang làm việc',
  TEMP_AWAY: 'Rời tạm thời',
  PROLONGED_AWAY: 'Rời quá hạn',
  WRONG_SEAT: 'Ngồi sai chỗ',
  EMPTY: 'Trống',
}

function formatShortDayMonth(dateStr: string): string {
  const [, m, d] = dateStr.split('-')
  return m && d ? `${d}/${m}` : dateStr
}

export function buildEmployeeTimesheet(params: {
  employees: Employee[]
  departments: Department[]
  attendanceLogs: AttendanceRecord[]
  leaveRequests: LeaveRequest[]
  otRegistrations: OtRegistration[]
  shifts: Shift[]
  seats?: Seat[]
  fromDate: string
  toDate: string
}): EmployeeTimesheetRow[] {
  const { employees, departments, attendanceLogs, leaveRequests, otRegistrations, shifts, seats = [], fromDate, toDate } = params

  const deptById = new Map(departments.map(d => [d.id, d]))
  const shiftById = new Map(shifts.map(s => [s.id, s]))
  const defaultShift = shifts.find(s => s.isDefault) ?? shifts[0]

  const seatsByEmp = new Map<string, Seat[]>()
  for (const seat of seats) {
    if (!seat.assignedEmployeeId) continue
    const list = seatsByEmp.get(seat.assignedEmployeeId) ?? []
    list.push(seat)
    seatsByEmp.set(seat.assignedEmployeeId, list)
  }

  const logsByEmp = new Map<string, AttendanceRecord[]>()
  for (const log of attendanceLogs) {
    if (log.workDate < fromDate || log.workDate > toDate) continue
    const list = logsByEmp.get(log.employeeId) ?? []
    list.push(log)
    logsByEmp.set(log.employeeId, list)
  }

  const leavesByEmp = new Map<string, LeaveRequest[]>()
  for (const leave of leaveRequests) {
    if (leave.approvalStatus !== 'APPROVED') continue
    if (leave.endDate < fromDate || leave.startDate > toDate) continue
    const list = leavesByEmp.get(leave.employeeId) ?? []
    list.push(leave)
    leavesByEmp.set(leave.employeeId, list)
  }

  const otByEmp = new Map<string, OtRegistration[]>()
  for (const ot of otRegistrations) {
    if (ot.approvalStatus !== 'APPROVED') continue
    if (ot.otDate < fromDate || ot.otDate > toDate) continue
    const list = otByEmp.get(ot.employeeId) ?? []
    list.push(ot)
    otByEmp.set(ot.employeeId, list)
  }

  const rows: EmployeeTimesheetRow[] = employees.map(emp => {
    const dept = deptById.get(emp.departmentId)
    const empLogs = logsByEmp.get(emp.id) ?? []
    const empLeaves = leavesByEmp.get(emp.id) ?? []
    const empOts = otByEmp.get(emp.id) ?? []
    const empSeats = seatsByEmp.get(emp.id) ?? []

    let presentDays = 0
    let onTimeDays = 0
    let lateDays = 0
    let totalLateMinutes = 0
    let earlyLeaveDays = 0
    let totalEarlyLeaveMinutes = 0
    let absentDays = 0
    let revokedDays = 0
    let totalWorkHours = 0

    const workingDatesSet = new Set<string>()
    const absentDatesSet = new Set<string>()
    const revokedDatesSet = new Set<string>()
    const inMinutesList: number[] = []
    const outMinutesList: number[] = []
    const confidenceList: number[] = []

    for (const log of empLogs) {
      if (log.status === 'ABSENT') {
        absentDays += 1
        absentDatesSet.add(formatShortDayMonth(log.workDate))
        continue
      }

      if (log.status === 'REVOKED') {
        revokedDays += 1
        revokedDatesSet.add(formatShortDayMonth(log.workDate))
        continue
      }

      presentDays += 1
      workingDatesSet.add(formatShortDayMonth(log.workDate))
      if (log.status === 'ON_TIME') {
        onTimeDays += 1
      } else if (log.status === 'LATE') {
        lateDays += 1
      } else if (log.status === 'EARLY_LEAVE') {
        if ((log.lateMinutes || 0) > 0) {
          lateDays += 1
        } else {
          onTimeDays += 1
        }
      }

      if ((log.lateMinutes || 0) > 0) {
        totalLateMinutes += log.lateMinutes
      }
      if ((log.earlyLeaveMinutes || 0) > 0 || log.status === 'EARLY_LEAVE') {
        earlyLeaveDays += 1
        totalEarlyLeaveMinutes += log.earlyLeaveMinutes || 0
      }

      const shift = shiftById.get(log.shiftId) ?? defaultShift
      totalWorkHours += computeRecordWorkHours(log, shift)

      const inMin = minutesOfDayInOfficeZone(log.checkInTime)
      if (inMin !== null) inMinutesList.push(inMin)

      const outMin = minutesOfDayInOfficeZone(log.checkOutTime)
      if (outMin !== null) outMinutesList.push(outMin)

      if (log.matchConfidence > 0) {
        confidenceList.push(log.matchConfidence <= 1 ? log.matchConfidence * 100 : log.matchConfidence)
      }
    }

    const approvedLeaveDays = empLeaves.reduce(
      (sum, leave) => sum + countOverlapDays(leave.startDate, leave.endDate, fromDate, toDate),
      0,
    )

    const leaveDetailsText = empLeaves.length > 0
      ? empLeaves
          .map(leave => {
            const label = leaveTypeLabels[leave.leaveType] ?? leave.leaveType
            const rangeStr = leave.startDate === leave.endDate
              ? formatShortDayMonth(leave.startDate)
              : `${formatShortDayMonth(leave.startDate)}–${formatShortDayMonth(leave.endDate)}`
            return leave.reason ? `${label} (${rangeStr}): ${leave.reason}` : `${label} (${rangeStr})`
          })
          .join('; ')
      : '—'

    const assignedSeatText = empSeats.length > 0
      ? empSeats.map(s => `${s.seatCode} (${seatStateTextMap[s.currentState] ?? s.currentState})`).join(', ')
      : 'Chưa gán bàn'

    let approvedOtHours = 0
    for (const ot of empOts) {
      approvedOtHours += calculateOtDurationHours(ot.startTime, ot.endTime, ot.isOvernight)
    }

    const avgIn = inMinutesList.length > 0
      ? inMinutesList.reduce((a, b) => a + b, 0) / inMinutesList.length
      : null
    const avgOut = outMinutesList.length > 0
      ? outMinutesList.reduce((a, b) => a + b, 0) / outMinutesList.length
      : null
    const avgConf = confidenceList.length > 0
      ? Math.round((confidenceList.reduce((a, b) => a + b, 0) / confidenceList.length) * 10) / 10
      : 0

    const totalConsideredDays = presentDays + absentDays + revokedDays
    const attendanceRatePercent = totalConsideredDays > 0
      ? Math.round((presentDays / totalConsideredDays) * 1000) / 10
      : (approvedLeaveDays > 0 ? 100 : 0)

    let ratingLabel: TimesheetRatingLabel = 'Đạt chuẩn'
    let ratingTone: TimesheetRatingTone = 'info'

    if (absentDays > 0 || revokedDays > 0) {
      ratingLabel = 'Vi phạm'
      ratingTone = 'danger'
    } else if (lateDays > 0 || earlyLeaveDays > 0) {
      ratingLabel = 'Cần lưu ý'
      ratingTone = 'warning'
    } else if (presentDays > 0 && onTimeDays === presentDays) {
      ratingLabel = 'Xuất sắc'
      ratingTone = 'success'
    } else if (approvedLeaveDays > 0 && presentDays === 0) {
      ratingLabel = 'Đạt chuẩn'
      ratingTone = 'info'
    }

    let workStatusCategory: WorkStatusCategory = 'NO_RECORD'
    let workStatusLabel = 'Nghỉ / Chưa điểm danh'
    let workStatusTone: TimesheetRatingTone = 'danger'

    if (presentDays > 0) {
      workStatusCategory = 'WORKING'
      if (revokedDays > 0) {
        workStatusLabel = 'Đi làm & Có hủy công'
        workStatusTone = 'danger'
      } else if (absentDays > 0) {
        workStatusLabel = 'Đi làm & Có ngày vắng'
        workStatusTone = 'warning'
      } else if (lateDays > 0 || earlyLeaveDays > 0) {
        workStatusLabel = 'Đi làm (Có muộn/sớm)'
        workStatusTone = 'warning'
      } else {
        workStatusLabel = 'Đi làm (Đúng giờ)'
        workStatusTone = 'success'
      }
    } else if (revokedDays > 0) {
      workStatusCategory = 'ABSENT_UNEXCUSED'
      workStatusLabel = 'Hủy công (Trừ lương)'
      workStatusTone = 'danger'
    } else if (approvedLeaveDays > 0) {
      workStatusCategory = 'ON_LEAVE'
      workStatusLabel = 'Nghỉ có phép'
      workStatusTone = 'info'
    } else if (absentDays > 0) {
      workStatusCategory = 'ABSENT_UNEXCUSED'
      workStatusLabel = 'Vắng không phép'
      workStatusTone = 'danger'
    }

    return {
      employeeId: emp.id,
      employeeCode: emp.employeeCode,
      fullName: emp.fullName,
      departmentId: emp.departmentId,
      departmentCode: emp.departmentCode,
      departmentName: dept?.departmentName ?? emp.departmentCode,
      isActive: emp.isActive,
      registeredVectorCount: emp.registeredVectorCount,
      presentDays,
      onTimeDays,
      lateDays,
      totalLateMinutes,
      earlyLeaveDays,
      totalEarlyLeaveMinutes,
      approvedLeaveDays,
      absentDays,
      revokedDays,
      totalWorkHours: Math.round(totalWorkHours * 10) / 10,
      approvedOtHours: Math.round(approvedOtHours * 10) / 10,
      approvedOtSessions: empOts.length,
      firstCheckInText: formatMinutesAsClock(avgIn),
      lastCheckOutText: formatMinutesAsClock(avgOut),
      avgMatchConfidence: avgConf,
      attendanceRatePercent,
      ratingLabel,
      ratingTone,
      workStatusCategory,
      workStatusLabel,
      workStatusTone,
      workingDatesList: [...workingDatesSet],
      absentDatesList: [...absentDatesSet],
      revokedDatesList: [...revokedDatesSet],
      leaveDetailsText,
      assignedSeatText,
    }
  })

  return rows.sort((a, b) => {
    const deptCmp = a.departmentCode.localeCompare(b.departmentCode, 'vi')
    if (deptCmp !== 0) return deptCmp
    if (b.presentDays !== a.presentDays) return b.presentDays - a.presentDays
    if (b.approvedLeaveDays !== a.approvedLeaveDays) return b.approvedLeaveDays - a.approvedLeaveDays
    if (b.absentDays !== a.absentDays) return b.absentDays - a.absentDays
    return a.employeeCode.localeCompare(b.employeeCode, 'vi')
  })
}

export function groupTimesheetRowsByDepartment(rows: EmployeeTimesheetRow[]): TimesheetDepartmentGroup[] {
  const map = new Map<
    string,
    {
      group: TimesheetDepartmentGroup
      rateSum: number
    }
  >()

  for (const row of rows) {
    const deptKey = row.departmentId || row.departmentCode || 'UNASSIGNED'
    let entry = map.get(deptKey)
    if (!entry) {
      entry = {
        group: {
          departmentId: deptKey,
          departmentCode: row.departmentCode || 'CHƯA PHÂN PHÒNG',
          departmentName: row.departmentName || row.departmentCode || 'Chưa phân phòng ban',
          rows: [],
          workingCount: 0,
          onTimePeopleCount: 0,
          latePeopleCount: 0,
          onLeaveCount: 0,
          absentCount: 0,
          totalPresentDays: 0,
          totalOnTimeDays: 0,
          totalLateDays: 0,
          totalLateMinutes: 0,
          totalEarlyLeaveDays: 0,
          totalEarlyLeaveMinutes: 0,
          totalLeaveDays: 0,
          totalAbsentDays: 0,
          totalRevokedDays: 0,
          totalWorkHours: 0,
          totalOtHours: 0,
          avgAttendanceRatePercent: 0,
        },
        rateSum: 0,
      }
      map.set(deptKey, entry)
    }

    const { group } = entry
    group.rows.push(row)
    if (row.presentDays > 0) {
      group.workingCount += 1
      if (row.lateDays === 0 && row.earlyLeaveDays === 0 && row.revokedDays === 0) {
        group.onTimePeopleCount += 1
      } else {
        group.latePeopleCount += 1
      }
    }
    if (row.approvedLeaveDays > 0) group.onLeaveCount += 1
    if (row.absentDays > 0 || row.revokedDays > 0 || (row.presentDays === 0 && row.approvedLeaveDays === 0)) {
      group.absentCount += 1
    }

    group.totalPresentDays += row.presentDays
    group.totalOnTimeDays += row.onTimeDays
    group.totalLateDays += row.lateDays
    group.totalLateMinutes += row.totalLateMinutes
    group.totalEarlyLeaveDays += row.earlyLeaveDays
    group.totalEarlyLeaveMinutes += row.totalEarlyLeaveMinutes
    group.totalLeaveDays += row.approvedLeaveDays
    group.totalAbsentDays += row.absentDays
    group.totalRevokedDays += row.revokedDays
    group.totalWorkHours += row.totalWorkHours
    group.totalOtHours += row.approvedOtHours
    entry.rateSum += row.attendanceRatePercent
  }

  const groups = [...map.values()].map(({ group, rateSum }) => ({
    ...group,
    totalWorkHours: Math.round(group.totalWorkHours * 10) / 10,
    totalOtHours: Math.round(group.totalOtHours * 10) / 10,
    avgAttendanceRatePercent: group.rows.length > 0 ? Math.round((rateSum / grpDivisor(group.rows.length)) * 10) / 10 : 0,
  }))

  return groups.sort((a, b) => a.departmentCode.localeCompare(b.departmentCode, 'vi'))
}

function grpDivisor(n: number): number {
  return n > 0 ? n : 1
}

export function buildOccupancyReportSummary(params: {
  seats: Seat[]
  cameras: Camera[]
  departments: Department[]
  occupancyLogs: SeatOccupancyLog[]
  periodProlongedAwayEvents: number
}): OccupancyReportSummary {
  const { seats, cameras, departments, occupancyLogs, periodProlongedAwayEvents } = params
  const cameraById = new Map(cameras.map(c => [c.id, c]))
  const deptById = new Map(departments.map(d => [d.id, d]))

  const workDesks = seats.filter(s => s.zoneType !== 'RESTRICTED_ZONE')
  const restrictedZones = seats.length - workDesks.length
  const totalDesks = workDesks.length

  const presentCount = workDesks.filter(s => s.currentState === 'PRESENT').length
  const tempAwayCount = workDesks.filter(s => s.currentState === 'TEMP_AWAY').length
  const prolongedAwayCount = workDesks.filter(s => s.currentState === 'PROLONGED_AWAY').length
  const wrongSeatCount = workDesks.filter(s => s.currentState === 'WRONG_SEAT').length
  const emptyCount = workDesks.filter(s => s.currentState === 'EMPTY').length
  const assignedDesks = workDesks.filter(s => Boolean(s.assignedEmployeeId)).length

  const spaceUtilizationPercent = totalDesks > 0
    ? Math.round(((presentCount + wrongSeatCount) / totalDesks) * 1000) / 10
    : 0
  const assignedDeskRatePercent = totalDesks > 0
    ? Math.round((assignedDesks / totalDesks) * 1000) / 10
    : 0

  const totalActiveSeconds = seats.reduce((sum, s) => sum + (s.activeSecondsToday || 0), 0)
  const totalActiveHoursToday = Math.round((totalActiveSeconds / 3600) * 10) / 10
  const avgActiveMinutesPerDesk = totalDesks > 0
    ? Math.round(totalActiveSeconds / 60 / totalDesks)
    : 0

  // Chuẩn 8 tiếng làm việc = 28800 giây làm tham chiếu tính tỷ lệ thời gian sử dụng bàn
  const standardDaySeconds = 8 * 3600

  const seatRows: SeatUtilizationRow[] = seats
    .map(s => {
      const cam = cameraById.get(s.cameraId)
      const dept = deptById.get(s.departmentId)
      const utilPct = Math.min(100, Math.round(((s.activeSecondsToday || 0) / standardDaySeconds) * 1000) / 10)
      return {
        seatId: s.id,
        seatCode: s.seatCode,
        seatName: s.seatName,
        zoneType: s.zoneType,
        cameraId: s.cameraId,
        cameraCode: cam?.cameraCode ?? '—',
        cameraName: cam?.cameraName ?? 'Camera chưa gán',
        departmentId: s.departmentId,
        departmentCode: dept?.departmentCode ?? '—',
        assignedEmployeeId: s.assignedEmployeeId ?? null,
        assignedEmployeeCode: s.assignedEmployeeCode ?? null,
        assignedEmployeeName: s.assignedEmployeeName ?? null,
        currentState: s.currentState,
        activeSecondsToday: s.activeSecondsToday || 0,
        utilizationPercent: utilPct,
        stateUpdatedAt: s.stateUpdatedAt,
      }
    })
    .sort((a, b) => a.seatCode.localeCompare(b.seatCode, 'vi'))

  const camMap = new Map<string, CameraOccupancyBreakdown>()
  for (const row of seatRows) {
    if (row.zoneType === 'RESTRICTED_ZONE') continue
    const item = camMap.get(row.cameraId) ?? {
      cameraId: row.cameraId,
      cameraCode: row.cameraCode,
      cameraName: row.cameraName,
      totalDesks: 0,
      presentCount: 0,
      tempAwayCount: 0,
      prolongedAwayCount: 0,
      wrongSeatCount: 0,
      emptyCount: 0,
      utilizationPercent: 0,
      totalActiveHoursToday: 0,
    }
    item.totalDesks += 1
    if (row.currentState === 'PRESENT') item.presentCount += 1
    else if (row.currentState === 'TEMP_AWAY') item.tempAwayCount += 1
    else if (row.currentState === 'PROLONGED_AWAY') item.prolongedAwayCount += 1
    else if (row.currentState === 'WRONG_SEAT') item.wrongSeatCount += 1
    else item.emptyCount += 1

    item.totalActiveHoursToday += row.activeSecondsToday / 3600
    camMap.set(row.cameraId, item)
  }

  const cameraBreakdown = [...camMap.values()]
    .map(c => ({
      ...c,
      totalActiveHoursToday: Math.round(c.totalActiveHoursToday * 10) / 10,
      utilizationPercent: c.totalDesks > 0
        ? Math.round(((c.presentCount + c.wrongSeatCount) / c.totalDesks) * 1000) / 10
        : 0,
    }))
    .sort((a, b) => a.cameraCode.localeCompare(b.cameraCode, 'vi'))

  return {
    totalZones: seats.length,
    totalDesks,
    restrictedZones,
    assignedDesks,
    assignedDeskRatePercent,
    presentCount,
    tempAwayCount,
    prolongedAwayCount,
    wrongSeatCount,
    emptyCount,
    spaceUtilizationPercent,
    totalActiveHoursToday,
    avgActiveMinutesPerDesk,
    totalStateTransitions: occupancyLogs.length,
    periodProlongedAwayEvents,
    seatRows,
    cameraBreakdown,
  }
}

export function buildSecurityOtReportSummary(params: {
  incidents: SecurityIncident[]
  otRegistrations: OtRegistration[]
  fromDate: string
  toDate: string
}): SecurityOtReportSummary {
  const { incidents, otRegistrations, fromDate, toDate } = params

  const periodIncidents = incidents.filter(inc => {
    const day = officeDate(new Date(inc.detectedAt))
    return day >= fromDate && day <= toDate
  })

  const periodOt = otRegistrations.filter(ot => ot.otDate >= fromDate && ot.otDate <= toDate)

  const level1ApprovedOt = periodIncidents.filter(i => i.alertLevel === 'LEVEL_1_APPROVED_OT').length
  const level2Unauthorized = periodIncidents.filter(i => i.alertLevel === 'LEVEL_2_UNAUTHORIZED_PRESENCE').length
  const level3Breach = periodIncidents.filter(i => i.alertLevel === 'LEVEL_3_SECURITY_BREACH').length
  const spoofingAttempts = periodIncidents.filter(i => i.alertLevel === 'SPOOFING_ATTEMPT').length

  const openCount = periodIncidents.filter(i => i.ticketStatus === 'OPEN').length
  const acknowledgedCount = periodIncidents.filter(i => i.ticketStatus === 'ACKNOWLEDGED').length
  const falseAlarmCount = periodIncidents.filter(i => i.ticketStatus === 'FALSE_ALARM').length
  const resolvedCount = acknowledgedCount + falseAlarmCount
  const resolutionRatePercent = periodIncidents.length > 0
    ? Math.round((resolvedCount / periodIncidents.length) * 1000) / 10
    : 100
  const telegramAlertCount = periodIncidents.filter(i => i.telegramSent).length

  const approvedOtList = periodOt.filter(o => o.approvalStatus === 'APPROVED')
  const pendingOtCount = periodOt.filter(o => o.approvalStatus === 'PENDING').length
  const rejectedOtCount = periodOt.filter(o => o.approvalStatus === 'REJECTED').length
  const overnightOtCount = periodOt.filter(o => o.isOvernight).length
  const totalApprovedOtHours = Math.round(
    approvedOtList.reduce((sum, o) => sum + calculateOtDurationHours(o.startTime, o.endTime, o.isOvernight), 0) * 10,
  ) / 10

  return {
    totalIncidents: periodIncidents.length,
    level1ApprovedOt,
    level2Unauthorized,
    level3Breach,
    spoofingAttempts,
    openCount,
    acknowledgedCount,
    falseAlarmCount,
    resolutionRatePercent,
    telegramAlertCount,
    totalOtRegistrations: periodOt.length,
    approvedOtCount: approvedOtList.length,
    pendingOtCount,
    rejectedOtCount,
    overnightOtCount,
    totalApprovedOtHours,
  }
}

function escapeCsvCell(value: string | number | boolean | null | undefined): string {
  const str = value === null || value === undefined ? '' : String(value)
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export function exportCustomCsv(
  filename: string,
  headers: string[],
  rows: (string | number | boolean | null | undefined)[][],
): string {
  const lines = [
    headers.map(escapeCsvCell).join(','),
    ...rows.map(row => row.map(escapeCsvCell).join(',')),
  ]
  const csvContent = lines.join('\r\n')
  const bom = new Uint8Array([0xef, 0xbb, 0xbf])
  const blob = new Blob([bom, csvContent], { type: 'text/csv;charset=utf-8' })
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

export interface MultiSheetExcelReportPayload {
  fileTag: string
  periodLabel: string
  fromDate: string
  toDate: string
  scopeLabel: string
  generatedBy: string
  generatedAt: string
  printOrientation: 'portrait' | 'landscape'
  printSections: {
    kpi: boolean
    dept: boolean
    roster: boolean
    occSec: boolean
  }
  kpis: {
    totalEmployees: number
    workingCount: number
    onLeaveCount: number
    absentRosterCount: number
    attendanceRate: number
    onTimeRate: number
    totalPresentDays: number
    totalOnTimeDays: number
    totalLateDays: number
    totalLateMinutes: number
    totalAbsentDays: number
    totalLeaveDays: number
    totalWorkHours: number
    totalOtHours: number
    spaceUtilizationPercent: number
    totalDesks: number
    presentDesks: number
    totalIncidents: number
    resolutionRatePercent: number
  }
  departmentGroups: DepartmentAttendance[]
  deptWorkHoursMap: Map<string, { empCount: number; workHours: number; otHours: number }>
  printTimesheetRows: EmployeeTimesheetRow[]
  timesheetRows: EmployeeTimesheetRow[]
  workingByDeptText: string
  onLeavePreviewList: string[]
  absentPreviewList: string[]
  occupancySummary: OccupancyReportSummary
  seatRows: SeatUtilizationRow[]
  otList: OtRegistration[]
  incidents: SecurityIncident[]
  securityOtSummary: SecurityOtReportSummary
}

type ExcelCellSpec = {
  value: string | number
  type?: 'String' | 'Number'
  style?: string
  mergeAcross?: number
}

function escapeXmlValue(raw: string | number | null | undefined): string {
  const cleaned = Array.from(String(raw ?? ''))
    .filter(ch => {
      const code = ch.charCodeAt(0)
      return code === 9 || code === 10 || code === 13 || code >= 32
    })
    .join('')
  return cleaned
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function formatViDay(isoDate: string): string {
  const [y, m, d] = isoDate.split('-')
  return y && m && d ? `${d}/${m}/${y}` : isoDate
}

function renderExcelRow(cells: ExcelCellSpec[], height?: number): string {
  const heightAttr = height ? ` ss:Height="${height}"` : ''
  const xmlCells = cells
    .map(c => {
      const styleAttr = c.style ? ` ss:StyleID="${c.style}"` : ''
      const mergeAttr = c.mergeAcross && c.mergeAcross > 0 ? ` ss:MergeAcross="${c.mergeAcross}"` : ''
      const isNum = c.type === 'Number'
      const safeVal = isNum
        ? Number.isFinite(Number(c.value))
          ? String(Number(c.value))
          : '0'
        : escapeXmlValue(c.value)
      return `<Cell${styleAttr}${mergeAttr}><Data ss:Type="${isNum ? 'Number' : 'String'}">${safeVal}</Data></Cell>`
    })
    .join('')
  return `<Row${heightAttr}>${xmlCells}</Row>`
}

function renderWorksheet(
  name: string,
  colWidths: number[],
  rowsXml: string[],
  orientation: 'Portrait' | 'Landscape' = 'Landscape',
): string {
  const safeName = name.replace(/[\\/?*[\]:]/g, '_').slice(0, 31)
  const colsXml = colWidths.map(w => `<Column ss:AutoFitWidth="0" ss:Width="${w}"/>`).join('')
  return `<Worksheet ss:Name="${escapeXmlValue(safeName)}">
  <Table>
    ${colsXml}
    ${rowsXml.join('\n    ')}
  </Table>
  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
    <PageSetup>
      <Layout x:Orientation="${orientation}"/>
      <PageMargins x:Bottom="0.45" x:Left="0.35" x:Right="0.35" x:Top="0.45"/>
    </PageSetup>
    <Print>
      <ValidPrinterInfo/>
      <PaperSizeIndex>9</PaperSizeIndex>
      <FitWidth>1</FitWidth>
      <FitHeight>0</FitHeight>
    </Print>
  </WorksheetOptions>
</Worksheet>`
}

const EXCEL_SEAT_LABELS: Record<string, string> = {
  PRESENT: 'Đang làm việc',
  TEMP_AWAY: 'Rời bàn tạm thời',
  PROLONGED_AWAY: 'Rời bàn quá hạn (>15p)',
  WRONG_SEAT: 'Ngồi sai vị trí',
  EMPTY: 'Chỗ trống',
}

const EXCEL_ALERT_LABELS: Record<string, string> = {
  LEVEL_1_APPROVED_OT: 'Mức 1 · OT hợp lệ',
  LEVEL_2_UNAUTHORIZED_PRESENCE: 'Mức 2 · Ngoài giờ chưa OT',
  LEVEL_3_SECURITY_BREACH: 'Mức 3 · Xâm nhập người lạ',
  SPOOFING_ATTEMPT: 'Giả mạo sinh trắc (Spoofing)',
}

const EXCEL_TICKET_LABELS: Record<string, string> = {
  OPEN: 'Chờ xử lý',
  ACKNOWLEDGED: 'Đã xác minh',
  FALSE_ALARM: 'Báo động giả',
}

const EXCEL_OT_LABELS: Record<string, string> = {
  APPROVED: 'Đã duyệt',
  PENDING: 'Chờ duyệt',
  REJECTED: 'Từ chối',
}

/**
 * Xuất báo cáo tổng hợp Smart Office dưới dạng Sổ tay Excel đa Sheet chuẩn SpreadsheetML XML (.xls).
 * Sheet 1 (1_Phieu_Bao_Cao_A4) đồng bộ 1:1 bố cục Phiếu Báo cáo A4 Preview;
 * Sheet 2-4 là phụ lục dữ liệu đầy đủ phục vụ lọc/tính lương/kiểm toán.
 */
export function exportMultiSheetExcelWorkbook(payload: MultiSheetExcelReportPayload): string {
  const {
    fileTag,
    periodLabel,
    fromDate,
    toDate,
    scopeLabel,
    generatedBy,
    generatedAt,
    printOrientation,
    printSections,
    kpis,
    departmentGroups,
    deptWorkHoursMap,
    printTimesheetRows,
    timesheetRows,
    workingByDeptText,
    onLeavePreviewList,
    absentPreviewList,
    occupancySummary,
    seatRows,
    otList,
    incidents,
    securityOtSummary,
  } = payload

  const dateRangeLabel = `${formatViDay(fromDate)} – ${formatViDay(toDate)}`
  const buildProgressBarText = (pct: number) => {
    const clamped = Math.min(100, Math.max(0, Math.round(pct)))
    const filled = Math.round(clamped / 10)
    return `${'█'.repeat(filled)}${'░'.repeat(10 - filled)}`
  }

  // --- SHEET 1: 1_Phieu_Bao_Cao_A4 (WYSIWYG KHỚP BẢN PREVIEW PHIẾU IN A4) ---
  const sheet1Rows: string[] = [
    // Quốc hiệu & Tiêu ngữ 2 bên
    renderExcelRow([
      { value: 'HỆ THỐNG QUẢN TRỊ VĂN PHÒNG THÔNG MINH AIoT', style: 'PrintOrgLeftBold', mergeAcross: 4 },
      { value: 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', style: 'PrintOrgRightBold', mergeAcross: 4 },
    ], 19),
    renderExcelRow([
      { value: 'SMART OFFICE COMPUTER VISION & AIOT SYSTEM', style: 'PrintOrgLeft', mergeAcross: 4 },
      { value: 'Độc lập - Tự do - Hạnh phúc', style: 'PrintOrgRightUnderline', mergeAcross: 4 },
    ], 18),
    renderExcelRow([
      { value: 'Phân hệ Báo cáo Tổng hợp Điều hành · Chứng từ nội bộ', style: 'PrintOrgLeftEnd', mergeAcross: 4 },
      { value: `Mã phiếu: BC-SO/${fileTag}`, style: 'PrintOrgRightEnd', mergeAcross: 4 },
    ], 18),
    renderExcelRow([], 10),
    renderExcelRow([
      { value: 'BÁO CÁO TỔNG HỢP CHẤM CÔNG, HIỆU SUẤT KHÔNG GIAN & AN NINH', style: 'PrintDocTitle', mergeAcross: 9 },
    ], 28),
    renderExcelRow([], 8),
    // Dải Metadata 4 ô ngang
    renderExcelRow([
      { value: 'KỲ BÁO CÁO', style: 'PrintMetaLabel', mergeAcross: 1 },
      { value: 'PHẠM VI ÁP DỤNG', style: 'PrintMetaLabel', mergeAcross: 2 },
      { value: 'NGƯỜI LẬP BIỂU', style: 'PrintMetaLabel', mergeAcross: 1 },
      { value: 'THỜI ĐIỂM KẾT XUẤT', style: 'PrintMetaLabel', mergeAcross: 2 },
    ], 16),
    renderExcelRow([
      { value: periodLabel, style: 'PrintMetaVal', mergeAcross: 1 },
      { value: scopeLabel, style: 'PrintMetaVal', mergeAcross: 2 },
      { value: generatedBy, style: 'PrintMetaVal', mergeAcross: 1 },
      { value: generatedAt, style: 'PrintMetaVal', mergeAcross: 2 },
    ], 20),
    renderExcelRow([
      { value: dateRangeLabel, style: 'PrintMetaSub', mergeAcross: 1 },
      { value: `${departmentGroups.length} phòng ban · ${kpis.totalEmployees} nhân sự`, style: 'PrintMetaSub', mergeAcross: 2 },
      { value: 'Phòng Quản trị / Nhân sự', style: 'PrintMetaSub', mergeAcross: 1 },
      { value: 'Múi giờ UTC+7 (Việt Nam)', style: 'PrintMetaSub', mergeAcross: 2 },
    ], 16),
    renderExcelRow([], 10),
  ]

  // Mục I: Lưới 6 Thẻ KPI (2 hàng × 3 thẻ ngang)
  if (printSections.kpi) {
    const workingPct = kpis.totalEmployees > 0 ? Math.round((kpis.workingCount / kpis.totalEmployees) * 1000) / 10 : 0
    const workHoursPct = Math.min(100, kpis.totalEmployees > 0 ? Math.round((kpis.totalWorkHours / (kpis.totalEmployees * 8)) * 100) : 0)
    const kpiCards = [
      {
        label: 'Quân số đi làm thực tế',
        value: `${kpis.workingCount.toLocaleString('vi-VN')} / ${kpis.totalEmployees.toLocaleString('vi-VN')} người`,
        sub: `${buildProgressBarText(workingPct)}  ${workingPct}% · ${kpis.onLeaveCount} nghỉ phép · ${kpis.absentRosterCount} vắng`,
        tone: workingPct >= 85 ? 'Success' : 'Warning',
      },
      {
        label: 'Tỷ lệ chuyên cần kỳ',
        value: `${kpis.attendanceRate}%`,
        sub: `${buildProgressBarText(kpis.attendanceRate)}  ${kpis.totalPresentDays} ngày công · ${kpis.totalAbsentDays} vắng KP`,
        tone: kpis.attendanceRate >= 90 ? 'Success' : kpis.attendanceRate >= 75 ? 'Warning' : 'Danger',
      },
      {
        label: 'Tỷ lệ đi làm đúng giờ',
        value: `${kpis.onTimeRate}%`,
        sub: `${buildProgressBarText(kpis.onTimeRate)}  ${kpis.totalOnTimeDays} đúng giờ · ${kpis.totalLateDays} muộn (${kpis.totalLateMinutes}p)`,
        tone: kpis.onTimeRate >= 85 ? 'Success' : 'Warning',
      },
      {
        label: 'Quỹ giờ công & OT duyệt',
        value: `${kpis.totalWorkHours.toLocaleString('vi-VN')} giờ`,
        sub: `${buildProgressBarText(workHoursPct)}  +${kpis.totalOtHours.toFixed(1)} giờ OT (${securityOtSummary.approvedOtCount} ca)`,
        tone: 'Info',
      },
      {
        label: 'Hiệu suất sử dụng bàn AI',
        value: `${kpis.spaceUtilizationPercent}%`,
        sub: `${buildProgressBarText(kpis.spaceUtilizationPercent)}  ${kpis.presentDesks}/${kpis.totalDesks} bàn đang ngồi · ${occupancySummary.periodProlongedAwayEvents} rời >15p`,
        tone: 'Info',
      },
      {
        label: 'An ninh ngoài giờ & SLA',
        value: `${kpis.totalIncidents} sự cố · SLA ${kpis.resolutionRatePercent}%`,
        sub: `${buildProgressBarText(kpis.resolutionRatePercent)}  Mức 3: ${securityOtSummary.level3Breach} · Spoof: ${securityOtSummary.spoofingAttempts}`,
        tone: securityOtSummary.openCount > 0 || securityOtSummary.level3Breach > 0 ? 'Danger' : 'Success',
      },
    ]

    sheet1Rows.push(
      renderExcelRow([
        { value: '  I. CHỈ SỐ TỔNG HỢP ĐIỀU HÀNH TOÀN HỆ THỐNG', style: 'PrintSectionTitle', mergeAcross: 9 },
      ], 22),
    )

    for (let rowIdx = 0; rowIdx < 2; rowIdx++) {
      const c1 = kpiCards[rowIdx * 3]!
      const c2 = kpiCards[rowIdx * 3 + 1]!
      const c3 = kpiCards[rowIdx * 3 + 2]!
      sheet1Rows.push(
        renderExcelRow([
          { value: c1.label, style: `PrintKpiTop${c1.tone}`, mergeAcross: 2 },
          { value: c2.label, style: `PrintKpiTop${c2.tone}`, mergeAcross: 2 },
          { value: c3.label, style: `PrintKpiTop${c3.tone}`, mergeAcross: 3 },
        ], 17),
        renderExcelRow([
          { value: c1.value, style: 'PrintKpiVal', mergeAcross: 2 },
          { value: c2.value, style: 'PrintKpiVal', mergeAcross: 2 },
          { value: c3.value, style: 'PrintKpiVal', mergeAcross: 3 },
        ], 21),
        renderExcelRow([
          { value: c1.sub, style: 'PrintKpiSub', mergeAcross: 2 },
          { value: c2.sub, style: 'PrintKpiSub', mergeAcross: 2 },
          { value: c3.sub, style: 'PrintKpiSub', mergeAcross: 3 },
        ], 18),
      )
      if (rowIdx === 0) sheet1Rows.push(renderExcelRow([], 6))
    }
    sheet1Rows.push(renderExcelRow([], 10))
  }

  // Mục II: Bảng Tổng hợp Phòng ban 10 cột (khớp y hệt Preview)
  let sumOnTimeDept = 0
  let sumLateDept = 0
  let sumAbsentDept = 0
  let sumProlongedDept = 0
  let sumSecDept = 0
  let sumWorkDept = 0
  let sumOtDept = 0
  let sumConsideredDept = 0

  if (printSections.dept) {
    sheet1Rows.push(
      renderExcelRow([
        { value: '  II. TỔNG HỢP CHUYÊN CẦN, GIỜ CÔNG & AN NINH THEO PHÒNG BAN', style: 'PrintSectionTitle', mergeAcross: 9 },
      ], 22),
      renderExcelRow([
        { value: 'STT', style: 'PrintTableHeaderCenter' },
        { value: 'Phòng ban', style: 'PrintTableHeader' },
        { value: 'Đúng giờ', style: 'PrintTableHeaderNum' },
        { value: 'Đi muộn', style: 'PrintTableHeaderNum' },
        { value: 'Vắng mặt', style: 'PrintTableHeaderNum' },
        { value: 'Giờ công (h)', style: 'PrintTableHeaderNum' },
        { value: 'Giờ OT (h)', style: 'PrintTableHeaderNum' },
        { value: 'Rời bàn >15p', style: 'PrintTableHeaderNum' },
        { value: 'Cảnh báo AN', style: 'PrintTableHeaderNum' },
        { value: 'Tỷ lệ CC', style: 'PrintTableHeaderNum' },
      ], 24),
    )

    if (departmentGroups.length === 0) {
      sheet1Rows.push(
        renderExcelRow([
          { value: 'Chưa có dữ liệu phòng ban trong kỳ.', style: 'PrintCellCenter', mergeAcross: 9 },
        ], 20),
      )
    } else {
      departmentGroups.forEach((grp, idx) => {
        const present = grp.onTime + grp.late
        const rate = grp.total > 0 ? Math.round((present / grp.total) * 1000) / 10 : 0
        const extra = deptWorkHoursMap.get(grp.departmentId)
        const wH = extra ? Math.round(extra.workHours * 10) / 10 : 0
        const otH = extra ? Math.round(extra.otHours * 10) / 10 : 0
        sumOnTimeDept += grp.onTime
        sumLateDept += grp.late
        sumAbsentDept += grp.absent
        sumProlongedDept += grp.prolongedAway
        sumSecDept += grp.securityAlerts
        sumWorkDept += wH
        sumOtDept += otH
        sumConsideredDept += grp.total
        const rowPrefix = idx % 2 === 1 ? 'PrintAlt' : 'PrintRow'
        sheet1Rows.push(
          renderExcelRow([
            { value: idx + 1, type: 'Number', style: `${rowPrefix}Center` },
            { value: grp.departmentCode, style: `${rowPrefix}Bold` },
            { value: grp.onTime, type: 'Number', style: `${rowPrefix}Int` },
            { value: grp.late, type: 'Number', style: `${rowPrefix}Int` },
            { value: grp.absent, type: 'Number', style: `${rowPrefix}Int` },
            { value: wH, type: 'Number', style: `${rowPrefix}Dec` },
            { value: otH, type: 'Number', style: `${rowPrefix}Dec` },
            { value: grp.prolongedAway, type: 'Number', style: `${rowPrefix}Int` },
            { value: grp.securityAlerts, type: 'Number', style: `${rowPrefix}Int` },
            { value: `${rate.toFixed(1)}%`, style: `${rowPrefix}BoldRight` },
          ], 20),
        )
      })
      const overallRateDept = sumConsideredDept > 0 ? (((sumOnTimeDept + sumLateDept) / sumConsideredDept) * 100).toFixed(1) : '0.0'
      sheet1Rows.push(
        renderExcelRow([
          { value: `TỔNG CỘNG TOÀN ĐƠN VỊ (${departmentGroups.length} phòng)`, style: 'TotalRowStyle', mergeAcross: 1 },
          { value: sumOnTimeDept, type: 'Number', style: 'TotalRowIntStyle' },
          { value: sumLateDept, type: 'Number', style: 'TotalRowIntStyle' },
          { value: sumAbsentDept, type: 'Number', style: 'TotalRowIntStyle' },
          { value: Math.round(sumWorkDept * 10) / 10, type: 'Number', style: 'TotalRowDecStyle' },
          { value: Math.round(sumOtDept * 10) / 10, type: 'Number', style: 'TotalRowDecStyle' },
          { value: sumProlongedDept, type: 'Number', style: 'TotalRowIntStyle' },
          { value: sumSecDept, type: 'Number', style: 'TotalRowIntStyle' },
          { value: `${overallRateDept}%`, style: 'TotalRowRightBoldStyle' },
        ], 22),
      )
    }
    sheet1Rows.push(renderExcelRow([], 10))
  }

  // Mục III: Phân loại Quân số 3 Thẻ + Bảng Chấm công 8 cột trên Preview
  if (printSections.roster) {
    const scopeSummaryText =
      printTimesheetRows.length < timesheetRows.length
        ? `Hiển thị ${printTimesheetRows.length}/${timesheetRows.length} nhân sự`
        : `${timesheetRows.length} nhân sự`

    sheet1Rows.push(
      renderExcelRow([
        { value: `  III. PHÂN LOẠI QUÂN SỐ & BẢNG CHẤM CÔNG ĐỐI SOÁT (${scopeSummaryText})`, style: 'PrintSectionTitle', mergeAcross: 9 },
      ], 22),
    )

    const leaveBodyText = onLeavePreviewList.length > 0 ? onLeavePreviewList.join('\n') : 'Không có nhân sự nghỉ phép trong kỳ.'
    const absentBodyText = absentPreviewList.length > 0 ? absentPreviewList.join('\n') : 'Đầy đủ quân số, không có trường hợp vắng không phép.'
    const workOnTimePeople = timesheetRows.filter(r => r.presentDays > 0 && r.lateDays === 0 && r.earlyLeaveDays === 0).length
    const workLatePeople = Math.max(0, kpis.workingCount - workOnTimePeople)
    const maxRosterLines = Math.max(2, onLeavePreviewList.length, absentPreviewList.length)

    sheet1Rows.push(
      renderExcelRow([
        { value: `1. Đi làm / Có mặt — ${kpis.workingCount} người`, style: 'PrintRosterTopSuccess', mergeAcross: 2 },
        { value: `2. Nghỉ có phép — ${kpis.onLeaveCount} người`, style: 'PrintRosterTopInfo', mergeAcross: 2 },
        { value: `3. Vắng KP / Chưa điểm danh — ${kpis.absentRosterCount} người`, style: 'PrintRosterTopDanger', mergeAcross: 3 },
      ], 20),
      renderExcelRow([
        { value: `Đúng giờ cả kỳ: ${workOnTimePeople} · Có muộn/sớm: ${workLatePeople}`, style: 'PrintRosterMidSuccess', mergeAcross: 2 },
        { value: `Tổng quỹ ngày phép đã duyệt: ${kpis.totalLeaveDays} ngày`, style: 'PrintRosterMidInfo', mergeAcross: 2 },
        { value: `Ngày vắng chốt ABSENT: ${kpis.totalAbsentDays} ngày`, style: 'PrintRosterMidDanger', mergeAcross: 3 },
      ], 17),
      renderExcelRow([
        { value: workingByDeptText || 'Chưa ghi nhận nhân sự có mặt.', style: 'PrintRosterBotSuccess', mergeAcross: 2 },
        { value: leaveBodyText, style: 'PrintRosterBotInfo', mergeAcross: 2 },
        { value: absentBodyText, style: 'PrintRosterBotDanger', mergeAcross: 3 },
      ], Math.min(145, Math.max(32, maxRosterLines * 14 + 8))),
      renderExcelRow([], 8),
      renderExcelRow([
        { value: 'STT', style: 'PrintTableHeaderCenter' },
        { value: 'Nhân sự (Mã & Họ tên)', style: 'PrintTableHeader', mergeAcross: 1 },
        { value: 'Phòng', style: 'PrintTableHeader' },
        { value: 'Trạng thái', style: 'PrintTableHeaderCenter' },
        { value: 'Công / Phép / Vắng', style: 'PrintTableHeaderNum' },
        { value: 'Đi muộn', style: 'PrintTableHeaderNum' },
        { value: 'Giờ làm / OT', style: 'PrintTableHeaderNum' },
        { value: 'Chi tiết Ngày làm · Nghỉ phép · Bàn AI', style: 'PrintTableHeader', mergeAcross: 1 },
      ], 24),
    )

    if (printTimesheetRows.length === 0) {
      sheet1Rows.push(
        renderExcelRow([
          {
            value: timesheetRows.length > 0
              ? `Toàn bộ ${timesheetRows.length} nhân sự đều đi làm đúng giờ, không có trường hợp nghỉ phép, đi muộn hay vắng mặt.`
              : 'Chưa có bản ghi chấm công nhân sự.',
            style: 'PrintCellCenter',
            mergeAcross: 9,
          },
        ], 24),
      )
    } else {
      const printDeptGroups = groupTimesheetRowsByDepartment(printTimesheetRows)
      let pSum = 0
      let lSum = 0
      let aSum = 0
      let lateDSum = 0
      let lateMSum = 0
      let hSum = 0
      let otSum = 0

      printDeptGroups.forEach(deptGrp => {
        sheet1Rows.push(
          renderExcelRow([
            {
              value: `PHÒNG ${deptGrp.departmentName.toUpperCase()} (${deptGrp.departmentCode}) — ${deptGrp.rows.length} nhân sự · Đi làm: ${deptGrp.workingCount} · Nghỉ phép: ${deptGrp.onLeaveCount} · Vắng: ${deptGrp.absentCount} · Chuyên cần: ${deptGrp.avgAttendanceRatePercent.toFixed(1)}%`,
              style: 'SectionHeaderStyle',
              mergeAcross: 9,
            },
          ], 21),
        )

        deptGrp.rows.forEach((r, idx) => {
          pSum += r.presentDays
          lSum += r.approvedLeaveDays
          aSum += r.absentDays
          lateDSum += r.lateDays
          lateMSum += r.totalLateMinutes
          hSum += r.totalWorkHours
          otSum += r.approvedOtHours

          const rowPrefix = idx % 2 === 1 ? 'PrintAlt' : 'PrintRow'
          const statusStyle =
            r.workStatusTone === 'success'
              ? 'PrintPillSuccess'
              : r.workStatusTone === 'warning'
                ? 'PrintPillWarning'
                : r.workStatusTone === 'info'
                  ? 'PrintPillInfo'
                  : 'PrintPillDanger'

          const detailsText = [
            r.workingDatesList.length > 0 ? `Làm: ${r.workingDatesList.join(', ')}` : '',
            r.leaveDetailsText !== '—' ? `Phép: ${r.leaveDetailsText}` : '',
            r.absentDatesList.length > 0 ? `Vắng KP: ${r.absentDatesList.join(', ')}` : '',
            r.revokedDatesList.length > 0 ? `Hủy công: ${r.revokedDatesList.join(', ')}` : '',
            r.assignedSeatText !== 'Chưa gán bàn' ? `Bàn: ${r.assignedSeatText}` : '',
          ]
            .filter(Boolean)
            .join(' · ') || 'Chưa phát sinh dữ liệu'

          const rowHeight = detailsText.length > 75 ? 30 : 24
          sheet1Rows.push(
            renderExcelRow([
              { value: idx + 1, type: 'Number', style: `${rowPrefix}Center` },
              { value: `${r.employeeCode}\n${r.fullName}`, style: `${rowPrefix}Bold`, mergeAcross: 1 },
              { value: r.departmentCode, style: `${rowPrefix}Center` },
              { value: r.workStatusLabel, style: statusStyle },
              { value: `${r.presentDays} / ${r.approvedLeaveDays} / ${r.absentDays}`, style: `${rowPrefix}BoldRight` },
              { value: r.lateDays > 0 ? `${r.lateDays} (${r.totalLateMinutes}p)` : '—', style: `${rowPrefix}NumText` },
              { value: `${r.totalWorkHours.toFixed(1)}h${r.approvedOtHours > 0 ? ` (+${r.approvedOtHours.toFixed(1)}h)` : ''}`, style: `${rowPrefix}BoldRight` },
              { value: detailsText, style: rowPrefix, mergeAcross: 1 },
            ], rowHeight),
          )
        })

        sheet1Rows.push(
          renderExcelRow([
            { value: `Cộng phòng ${deptGrp.departmentCode} (${deptGrp.rows.length} người)`, style: 'PrintDeptSubStyle', mergeAcross: 4 },
            { value: `${deptGrp.totalPresentDays} / ${deptGrp.totalLeaveDays} / ${deptGrp.totalAbsentDays}`, style: 'PrintDeptSubRightStyle' },
            { value: deptGrp.totalLateDays > 0 ? `${deptGrp.totalLateDays} (${deptGrp.totalLateMinutes}p)` : '—', style: 'PrintDeptSubRightStyle' },
            { value: `${deptGrp.totalWorkHours.toFixed(1)}h${deptGrp.totalOtHours > 0 ? ` (+${deptGrp.totalOtHours.toFixed(1)}h)` : ''}`, style: 'PrintDeptSubRightStyle' },
            { value: `Chuyên cần TB phòng: ${deptGrp.avgAttendanceRatePercent.toFixed(1)}%`, style: 'PrintDeptSubStyle', mergeAcross: 1 },
          ], 20),
        )
      })

      if (printTimesheetRows.length < timesheetRows.length) {
        sheet1Rows.push(
          renderExcelRow([
            {
              value: `* Đang hiển thị ${printTimesheetRows.length}/${timesheetRows.length} nhân sự theo chế độ lọc bản in (xem đầy đủ toàn bộ nhân sự theo từng phòng ban tại Sheet 2_PhuLuc_BangCong_Full).`,
              style: 'PrintNoteRow',
              mergeAcross: 9,
            },
          ], 20),
        )
      }

      sheet1Rows.push(
        renderExcelRow([
          { value: `TỔNG CỘNG TOÀN ĐƠN VỊ (${printTimesheetRows.length} người / ${printDeptGroups.length} phòng ban)`, style: 'TotalRowStyle', mergeAcross: 4 },
          { value: `${pSum} / ${lSum} / ${aSum}`, style: 'TotalRowRightBoldStyle' },
          { value: `${lateDSum} (${lateMSum}p)`, style: 'TotalRowRightBoldStyle' },
          { value: `${hSum.toFixed(1)}h${otSum > 0 ? ` (+${otSum.toFixed(1)}h)` : ''}`, style: 'TotalRowRightBoldStyle' },
          { value: 'Đã đối soát dữ liệu Face ArcFace & Đơn nghỉ phép', style: 'TotalRowStyle', mergeAcross: 1 },
        ], 22),
      )
    }
    sheet1Rows.push(renderExcelRow([], 10))
  }

  // Mục IV: 2 Bảng Đối xứng Không gian AI & An ninh SOC/OT
  if (printSections.occSec) {
    sheet1Rows.push(
      renderExcelRow([
        { value: '  IV. ĐỐI SOÁT KHÔNG GIAN CHỖ NGỒI AI & AN NINH NGOÀI GIỜ (SOC)', style: 'PrintSectionTitle', mergeAcross: 9 },
      ], 22),
      renderExcelRow([
        { value: 'A. Hiệu suất Chỗ ngồi AI (FSM)', style: 'PrintTableHeader', mergeAcross: 4 },
        { value: 'B. Kiểm soát An ninh Ngoài giờ & OT', style: 'PrintTableHeader', mergeAcross: 4 },
      ], 20),
    )

    const dualRows: Array<[string, string, string, string]> = [
      [
        'Tổng số bàn làm việc / Vùng hạn chế',
        `${occupancySummary.totalDesks} bàn / ${occupancySummary.restrictedZones} vùng`,
        'Ca đăng ký OT / Đã phê duyệt',
        `${securityOtSummary.totalOtRegistrations} ca (${securityOtSummary.approvedOtCount} duyệt)`,
      ],
      [
        'Đang làm việc tại bàn (PRESENT)',
        `${occupancySummary.presentCount} bàn`,
        'Tổng giờ OT duyệt / Ca qua đêm',
        `${securityOtSummary.totalApprovedOtHours}h (${securityOtSummary.overnightOtCount} qua đêm)`,
      ],
      [
        'Rời tạm thời / Rời quá hạn >15 phút',
        `${occupancySummary.tempAwayCount} tạm · ${occupancySummary.prolongedAwayCount} quá hạn`,
        'Cảnh báo Mức 1 (OT) / Mức 2 (Chưa OT)',
        `M1: ${securityOtSummary.level1ApprovedOt} · M2: ${securityOtSummary.level2Unauthorized}`,
      ],
      [
        'Ngồi sai vị trí / Bàn đang trống',
        `${occupancySummary.wrongSeatCount} sai chỗ · ${occupancySummary.emptyCount} trống`,
        'Xâm nhập Mức 3 / Giả mạo sinh trắc',
        `M3: ${securityOtSummary.level3Breach} · Spoof: ${securityOtSummary.spoofingAttempts}`,
      ],
      [
        'Tổng giờ hiện diện tích lũy & Lấp đầy',
        `${occupancySummary.totalActiveHoursToday}h (${occupancySummary.spaceUtilizationPercent}%)`,
        'Tổng sự cố / Tỷ lệ xử lý SLA',
        `${securityOtSummary.totalIncidents} sự cố (${securityOtSummary.resolutionRatePercent}%)`,
      ],
    ]

    dualRows.forEach(([lLabel, lVal, rLabel, rVal], idx) => {
      const p = idx % 2 === 1 ? 'PrintAlt' : 'PrintRow'
      sheet1Rows.push(
        renderExcelRow([
          { value: lLabel, style: p, mergeAcross: 2 },
          { value: lVal, style: `${p}BoldRight`, mergeAcross: 1 },
          { value: rLabel, style: p, mergeAcross: 2 },
          { value: rVal, style: `${p}BoldRight`, mergeAcross: 1 },
        ], 20),
      )
    })
    sheet1Rows.push(renderExcelRow([], 12))
  }

  // Khối Chữ ký 3 cột & Chân trang Kiểm toán
  sheet1Rows.push(
    renderExcelRow([
      { value: 'NGƯỜI LẬP BIỂU', style: 'PrintSigTitle', mergeAcross: 2 },
      { value: 'PHÒNG HÀNH CHÍNH NHÂN SỰ', style: 'PrintSigTitle', mergeAcross: 2 },
      { value: 'BAN GIÁM ĐỐC PHÊ DUYỆT', style: 'PrintSigTitle', mergeAcross: 3 },
    ], 18),
    renderExcelRow([
      { value: '(Ký, ghi rõ họ tên)', style: 'PrintSigSub', mergeAcross: 2 },
      { value: '(Xác nhận bảng công & OT)', style: 'PrintSigSub', mergeAcross: 2 },
      { value: '(Ký tên, đóng dấu)', style: 'PrintSigSub', mergeAcross: 3 },
    ], 16),
    renderExcelRow([
      { value: '', style: 'PrintSigBlank', mergeAcross: 2 },
      { value: '', style: 'PrintSigBlank', mergeAcross: 2 },
      { value: '', style: 'PrintSigBlank', mergeAcross: 3 },
    ], 42),
    renderExcelRow([
      { value: generatedBy, style: 'PrintSigName', mergeAcross: 2 },
      { value: '........................................', style: 'PrintSigName', mergeAcross: 2 },
      { value: '........................................', style: 'PrintSigName', mergeAcross: 3 },
    ], 18),
    renderExcelRow([], 8),
    renderExcelRow([
      { value: `Chứng từ trích xuất tự động từ Smart Office AIoT · Số hiệu: BC-SO/${fileTag}`, style: 'PrintAuditLeft', mergeAcross: 5 },
      { value: `Khổ in: ${printOrientation === 'landscape' ? 'A4 Ngang' : 'A4 Dọc'} · Xuất lúc ${generatedAt}`, style: 'PrintAuditRight', mergeAcross: 3 },
    ], 18),
  )

  // --- SHEET 2: 2_BangCong_NhanSu (TÁCH RIÊNG THEO TỪNG PHÒNG BAN) ---
  const fullDeptGroups = groupTimesheetRowsByDepartment(timesheetRows)
  const sheet2Rows: string[] = [
    renderExcelRow([
      { value: 'BẢNG CHẤM CÔNG CHI TIẾT NHÂN SỰ THEO TỪNG PHÒNG BAN — PHÂN LOẠI ĐI LÀM / NGHỈ PHÉP / VẮNG MẶT', style: 'TitleStyle', mergeAcross: 19 },
    ], 26),
    renderExcelRow([
      {
        value: `Kỳ báo cáo: ${periodLabel} (${dateRangeLabel}) | Tổng: ${timesheetRows.length} nhân sự / ${fullDeptGroups.length} phòng ban | Phạm vi: ${scopeLabel}`,
        style: 'MetaStyle',
        mergeAcross: 19,
      },
    ], 20),
    renderExcelRow([], 8),
  ]

  let tsPresentSum = 0
  let tsOnTimeSum = 0
  let tsLateSum = 0
  let tsLateMinSum = 0
  let tsEarlySum = 0
  let tsLeaveSum = 0
  let tsAbsentSum = 0
  let tsWorkHoursSum = 0
  let tsOtHoursSum = 0
  let tsRateSum = 0

  if (fullDeptGroups.length === 0) {
    sheet2Rows.push(
      renderExcelRow([
        { value: 'Chưa có dữ liệu bảng chấm công nhân sự trong kỳ báo cáo.', style: 'PrintCellCenter', mergeAcross: 19 },
      ], 24),
    )
  } else {
    fullDeptGroups.forEach((deptGrp, deptIdx) => {
      sheet2Rows.push(
        renderExcelRow([
          {
            value: `PHÒNG BAN ${deptIdx + 1}/${fullDeptGroups.length}: [${deptGrp.departmentCode}] ${deptGrp.departmentName.toUpperCase()} — ${deptGrp.rows.length} NHÂN SỰ | Đi làm: ${deptGrp.workingCount} (${deptGrp.onTimePeopleCount} đúng giờ, ${deptGrp.latePeopleCount} muộn/sớm) | Nghỉ phép: ${deptGrp.onLeaveCount} | Vắng/Chưa ĐD: ${deptGrp.absentCount} | Giờ làm: ${deptGrp.totalWorkHours.toFixed(1)}h (+${deptGrp.totalOtHours.toFixed(1)}h OT) | Chuyên cần TB: ${deptGrp.avgAttendanceRatePercent.toFixed(1)}%`,
            style: 'SectionHeaderStyle',
            mergeAcross: 19,
          },
        ], 24),
        renderExcelRow([
          { value: 'STT', style: 'TableHeaderStyle' },
          { value: 'Mã NV', style: 'TableHeaderStyle' },
          { value: 'Họ và tên', style: 'TableHeaderStyle' },
          { value: 'Phòng ban', style: 'TableHeaderStyle' },
          { value: 'Trạng thái Làm / Nghỉ', style: 'TableHeaderStyle' },
          { value: 'Ngày có mặt', style: 'TableHeaderStyle' },
          { value: 'Đúng giờ', style: 'TableHeaderStyle' },
          { value: 'Đi muộn', style: 'TableHeaderStyle' },
          { value: 'Phút muộn', style: 'TableHeaderStyle' },
          { value: 'Về sớm', style: 'TableHeaderStyle' },
          { value: 'Nghỉ phép', style: 'TableHeaderStyle' },
          { value: 'Vắng KP', style: 'TableHeaderStyle' },
          { value: 'Giờ vào TB', style: 'TableHeaderStyle' },
          { value: 'Giờ ra TB', style: 'TableHeaderStyle' },
          { value: 'Tổng giờ làm (h)', style: 'TableHeaderStyle' },
          { value: 'Giờ OT (h)', style: 'TableHeaderStyle' },
          { value: 'Tỷ lệ CC (%)', style: 'TableHeaderStyle' },
          { value: 'Xếp loại', style: 'TableHeaderStyle' },
          { value: 'Các ngày đi làm / Chi tiết nghỉ phép', style: 'TableHeaderStyle' },
          { value: 'Bàn làm việc AI', style: 'TableHeaderStyle' },
        ], 26),
      )

      deptGrp.rows.forEach((r, idx) => {
        tsPresentSum += r.presentDays
        tsOnTimeSum += r.onTimeDays
        tsLateSum += r.lateDays
        tsLateMinSum += r.totalLateMinutes
        tsEarlySum += r.earlyLeaveDays
        tsLeaveSum += r.approvedLeaveDays
        tsAbsentSum += r.absentDays
        tsWorkHoursSum += r.totalWorkHours
        tsOtHoursSum += r.approvedOtHours
        tsRateSum += r.attendanceRatePercent

        const tone =
          r.workStatusTone === 'success'
            ? 'RowSuccess'
            : r.workStatusTone === 'warning'
              ? 'RowWarning'
              : r.workStatusTone === 'info'
                ? 'RowInfo'
                : 'RowDanger'

        const detailNotes = [
          r.workingDatesList.length > 0 ? `Làm: ${r.workingDatesList.join(', ')}` : '',
          r.leaveDetailsText !== '—' ? `Phép: ${r.leaveDetailsText}` : '',
          r.absentDatesList.length > 0 ? `Vắng KP: ${r.absentDatesList.join(', ')}` : '',
          r.revokedDatesList.length > 0 ? `Hủy công (Trừ lương): ${r.revokedDatesList.join(', ')}` : '',
        ]
          .filter(Boolean)
          .join(' | ') || 'Chưa ghi nhận phát sinh'

        sheet2Rows.push(
          renderExcelRow([
            { value: idx + 1, type: 'Number', style: `${tone}Center` },
            { value: r.employeeCode, style: `${tone}Bold` },
            { value: r.fullName, style: tone },
            { value: r.departmentCode, style: `${tone}Center` },
            { value: r.workStatusLabel, style: `${tone}Bold` },
            { value: r.presentDays, type: 'Number', style: `${tone}Int` },
            { value: r.onTimeDays, type: 'Number', style: `${tone}Int` },
            { value: r.lateDays, type: 'Number', style: `${tone}Int` },
            { value: r.totalLateMinutes, type: 'Number', style: `${tone}Int` },
            { value: r.earlyLeaveDays, type: 'Number', style: `${tone}Int` },
            { value: r.approvedLeaveDays, type: 'Number', style: `${tone}Int` },
            { value: r.absentDays, type: 'Number', style: `${tone}Int` },
            { value: r.firstCheckInText, style: `${tone}Center` },
            { value: r.lastCheckOutText, style: `${tone}Center` },
            { value: Math.round(r.totalWorkHours * 10) / 10, type: 'Number', style: `${tone}Dec` },
            { value: Math.round(r.approvedOtHours * 10) / 10, type: 'Number', style: `${tone}Dec` },
            { value: Math.round(r.attendanceRatePercent * 10) / 10, type: 'Number', style: `${tone}Dec` },
            { value: r.ratingLabel, style: `${tone}Center` },
            { value: detailNotes, style: tone },
            { value: r.assignedSeatText, style: tone },
          ], 20),
        )
      })

      sheet2Rows.push(
        renderExcelRow([
          { value: `CỘNG PHÒNG ${deptGrp.departmentCode} (${deptGrp.rows.length} NHÂN SỰ)`, style: 'TotalRowStyle', mergeAcross: 4 },
          { value: deptGrp.totalPresentDays, type: 'Number', style: 'TotalRowIntStyle' },
          { value: deptGrp.totalOnTimeDays, type: 'Number', style: 'TotalRowIntStyle' },
          { value: deptGrp.totalLateDays, type: 'Number', style: 'TotalRowIntStyle' },
          { value: deptGrp.totalLateMinutes, type: 'Number', style: 'TotalRowIntStyle' },
          { value: deptGrp.totalEarlyLeaveDays, type: 'Number', style: 'TotalRowIntStyle' },
          { value: deptGrp.totalLeaveDays, type: 'Number', style: 'TotalRowIntStyle' },
          { value: deptGrp.totalAbsentDays, type: 'Number', style: 'TotalRowIntStyle' },
          { value: '—', style: 'TotalRowStyle' },
          { value: '—', style: 'TotalRowStyle' },
          { value: deptGrp.totalWorkHours, type: 'Number', style: 'TotalRowDecStyle' },
          { value: deptGrp.totalOtHours, type: 'Number', style: 'TotalRowDecStyle' },
          { value: deptGrp.avgAttendanceRatePercent, type: 'Number', style: 'TotalRowDecStyle' },
          { value: `TB phòng ${deptGrp.departmentCode}`, style: 'TotalRowStyle' },
          { value: `Đi làm: ${deptGrp.workingCount} · Nghỉ phép: ${deptGrp.onLeaveCount} · Vắng/Chưa ĐD: ${deptGrp.absentCount}`, style: 'TotalRowStyle', mergeAcross: 1 },
        ], 22),
        renderExcelRow([], 10),
      )
    })

    const avgTsRate = timesheetRows.length > 0 ? Math.round((tsRateSum / timesheetRows.length) * 10) / 10 : 0
    sheet2Rows.push(
      renderExcelRow([
        { value: `TỔNG KẾT TOÀN ĐƠN VỊ (${timesheetRows.length} NHÂN SỰ / ${fullDeptGroups.length} PHÒNG BAN)`, style: 'TotalRowStyle', mergeAcross: 4 },
        { value: tsPresentSum, type: 'Number', style: 'TotalRowIntStyle' },
        { value: tsOnTimeSum, type: 'Number', style: 'TotalRowIntStyle' },
        { value: tsLateSum, type: 'Number', style: 'TotalRowIntStyle' },
        { value: tsLateMinSum, type: 'Number', style: 'TotalRowIntStyle' },
        { value: tsEarlySum, type: 'Number', style: 'TotalRowIntStyle' },
        { value: tsLeaveSum, type: 'Number', style: 'TotalRowIntStyle' },
        { value: tsAbsentSum, type: 'Number', style: 'TotalRowIntStyle' },
        { value: '—', style: 'TotalRowStyle' },
        { value: '—', style: 'TotalRowStyle' },
        { value: Math.round(tsWorkHoursSum * 10) / 10, type: 'Number', style: 'TotalRowDecStyle' },
        { value: Math.round(tsOtHoursSum * 10) / 10, type: 'Number', style: 'TotalRowDecStyle' },
        { value: avgTsRate, type: 'Number', style: 'TotalRowDecStyle' },
        { value: 'TB toàn DS', style: 'TotalRowStyle' },
        { value: '', style: 'TotalRowStyle', mergeAcross: 1 },
      ], 22),
    )
  }

  // --- SHEET 3: 3_ChoNgoi_AI_FSM ---
  const sheet3Rows: string[] = [
    renderExcelRow([
      { value: 'HIỆU SUẤT SỬ DỤNG CHỖ NGỒI & KHÔNG GIAN LÀM VIỆC AI (FSM)', style: 'TitleStyle', mergeAcross: 8 },
    ], 26),
    renderExcelRow([
      {
        value: `Tổng bàn: ${occupancySummary.totalDesks} · Đang ngồi: ${occupancySummary.presentCount} · Rời tạm: ${occupancySummary.tempAwayCount} · Quá hạn >15p: ${occupancySummary.prolongedAwayCount} · Trống: ${occupancySummary.emptyCount} · Tỷ lệ lấp đầy: ${occupancySummary.spaceUtilizationPercent}%`,
        style: 'MetaStyle',
        mergeAcross: 8,
      },
    ], 20),
    renderExcelRow([], 8),
    renderExcelRow([
      { value: 'A. TỔNG HỢP HIỆU SUẤT THEO CAMERA GIÁM SÁT', style: 'SectionHeaderStyle', mergeAcross: 8 },
    ], 22),
    renderExcelRow([
      { value: 'Mã Camera', style: 'TableHeaderStyle' },
      { value: 'Tên Camera', style: 'TableHeaderStyle', mergeAcross: 1 },
      { value: 'Tổng số bàn', style: 'TableHeaderStyle' },
      { value: 'Đang ngồi', style: 'TableHeaderStyle' },
      { value: 'Rời tạm', style: 'TableHeaderStyle' },
      { value: 'Quá hạn >15p', style: 'TableHeaderStyle' },
      { value: 'Ngồi sai / Trống', style: 'TableHeaderStyle' },
      { value: 'Tỷ lệ lấp đầy (%)', style: 'TableHeaderStyle' },
    ], 24),
  ]

  occupancySummary.cameraBreakdown.forEach((cam, idx) => {
    const tone = idx % 2 === 1 ? 'RowAlt' : 'RowNeutral'
    sheet3Rows.push(
      renderExcelRow([
        { value: cam.cameraCode, style: `${tone}Bold` },
        { value: cam.cameraName, style: tone, mergeAcross: 1 },
        { value: cam.totalDesks, type: 'Number', style: `${tone}Int` },
        { value: cam.presentCount, type: 'Number', style: `${tone}Int` },
        { value: cam.tempAwayCount, type: 'Number', style: `${tone}Int` },
        { value: cam.prolongedAwayCount, type: 'Number', style: `${tone}Int` },
        { value: `${cam.wrongSeatCount} / ${cam.emptyCount}`, style: `${tone}Center` },
        { value: cam.utilizationPercent, type: 'Number', style: `${tone}Dec` },
      ], 20),
    )
  })

  sheet3Rows.push(renderExcelRow([], 10))
  sheet3Rows.push(
    renderExcelRow([
      { value: 'B. CHI TIẾT TỪNG VỊ TRÍ CHỖ NGỒI & TRẠNG THÁI FSM', style: 'SectionHeaderStyle', mergeAcross: 8 },
    ], 22),
  )
  sheet3Rows.push(
    renderExcelRow([
      { value: 'Mã bàn', style: 'TableHeaderStyle' },
      { value: 'Tên vị trí', style: 'TableHeaderStyle' },
      { value: 'Loại vùng', style: 'TableHeaderStyle' },
      { value: 'Camera', style: 'TableHeaderStyle' },
      { value: 'Phòng ban', style: 'TableHeaderStyle' },
      { value: 'Nhân viên phụ trách', style: 'TableHeaderStyle' },
      { value: 'Trạng thái FSM', style: 'TableHeaderStyle' },
      { value: 'Thời gian hiện diện (phút)', style: 'TableHeaderStyle' },
      { value: 'Hiệu suất (chuẩn 8h %)', style: 'TableHeaderStyle' },
    ], 24),
  )

  let sumSeatMinutes = 0
  let sumSeatUtil = 0
  seatRows.forEach(s => {
    const mins = Math.round(s.activeSecondsToday / 60)
    sumSeatMinutes += mins
    sumSeatUtil += s.utilizationPercent
    const tone =
      s.currentState === 'PRESENT'
        ? 'RowSuccess'
        : s.currentState === 'TEMP_AWAY'
          ? 'RowWarning'
          : s.currentState === 'PROLONGED_AWAY' || s.currentState === 'WRONG_SEAT'
            ? 'RowDanger'
            : 'RowNeutral'

    sheet3Rows.push(
      renderExcelRow([
        { value: s.seatCode, style: `${tone}Bold` },
        { value: s.seatName, style: tone },
        { value: s.zoneType === 'RESTRICTED_ZONE' ? 'Vùng hạn chế' : 'Bàn làm việc', style: `${tone}Center` },
        { value: s.cameraCode, style: `${tone}Center` },
        { value: s.departmentCode, style: `${tone}Center` },
        { value: s.assignedEmployeeName ? `${s.assignedEmployeeCode} - ${s.assignedEmployeeName}` : 'Chưa gán', style: tone },
        { value: EXCEL_SEAT_LABELS[s.currentState] ?? s.currentState, style: `${tone}Bold` },
        { value: mins, type: 'Number', style: `${tone}Int` },
        { value: Math.round(s.utilizationPercent * 10) / 10, type: 'Number', style: `${tone}Dec` },
      ], 20),
    )
  })

  const avgSeatUtil = seatRows.length > 0 ? Math.round((sumSeatUtil / seatRows.length) * 10) / 10 : 0
  sheet3Rows.push(
    renderExcelRow([
      { value: `TỔNG KẾT (${seatRows.length} VỊ TRÍ)`, style: 'TotalRowStyle', mergeAcross: 6 },
      { value: sumSeatMinutes, type: 'Number', style: 'TotalRowIntStyle' },
      { value: avgSeatUtil, type: 'Number', style: 'TotalRowDecStyle' },
    ], 22),
  )

  // --- SHEET 4: 4_AnNinh_SOC_OT ---
  const sheet4Rows: string[] = [
    renderExcelRow([
      { value: 'BÁO CÁO KIỂM SOÁT AN NINH NGOÀI GIỜ (SOC) & ĐĂNG KÝ LÀM THÊM GIỜ (OT)', style: 'TitleStyle', mergeAcross: 6 },
    ], 26),
    renderExcelRow([
      {
        value: `Kỳ báo cáo: ${periodLabel} (${dateRangeLabel}) | OT đã duyệt: ${securityOtSummary.approvedOtCount}/${securityOtSummary.totalOtRegistrations} ca (${securityOtSummary.totalApprovedOtHours}h) | Sự cố an ninh: ${securityOtSummary.totalIncidents} (SLA ${securityOtSummary.resolutionRatePercent}%)`,
        style: 'MetaStyle',
        mergeAcross: 6,
      },
    ], 20),
    renderExcelRow([], 8),
    renderExcelRow([
      { value: 'BẢNG A. DANH SÁCH ĐĂNG KÝ LÀM THÊM NGOÀI GIỜ (OT)', style: 'SectionHeaderStyle', mergeAcross: 6 },
    ], 22),
    renderExcelRow([
      { value: 'Ngày OT', style: 'TableHeaderStyle' },
      { value: 'Mã NV', style: 'TableHeaderStyle' },
      { value: 'Họ và tên', style: 'TableHeaderStyle' },
      { value: 'Khung giờ', style: 'TableHeaderStyle' },
      { value: 'Thời lượng (h)', style: 'TableHeaderStyle' },
      { value: 'Trạng thái duyệt', style: 'TableHeaderStyle' },
      { value: 'Lý do công việc', style: 'TableHeaderStyle' },
    ], 24),
  ]

  let sumOtDuration = 0
  otList.forEach(ot => {
    const hrs = Math.round(calculateOtDurationHours(ot.startTime, ot.endTime, ot.isOvernight) * 10) / 10
    sumOtDuration += hrs
    const tone =
      ot.approvalStatus === 'APPROVED'
        ? 'RowSuccess'
        : ot.approvalStatus === 'PENDING'
          ? 'RowWarning'
          : 'RowDanger'
    sheet4Rows.push(
      renderExcelRow([
        { value: formatViDay(ot.otDate), style: `${tone}Center` },
        { value: ot.employeeCode, style: `${tone}Bold` },
        { value: ot.employeeFullName, style: tone },
        { value: `${ot.startTime.slice(0, 5)} – ${ot.endTime.slice(0, 5)}${ot.isOvernight ? ' (Qua đêm)' : ''}`, style: `${tone}Center` },
        { value: hrs, type: 'Number', style: `${tone}Dec` },
        { value: EXCEL_OT_LABELS[ot.approvalStatus] ?? ot.approvalStatus, style: `${tone}Bold` },
        { value: ot.reason || '—', style: tone },
      ], 20),
    )
  })

  sheet4Rows.push(
    renderExcelRow([
      { value: `TỔNG CỘNG OT (${otList.length} CA ĐĂNG KÝ)`, style: 'TotalRowStyle', mergeAcross: 3 },
      { value: Math.round(sumOtDuration * 10) / 10, type: 'Number', style: 'TotalRowDecStyle' },
      { value: `Đã duyệt: ${securityOtSummary.totalApprovedOtHours}h`, style: 'TotalRowStyle', mergeAcross: 1 },
    ], 22),
  )

  sheet4Rows.push(renderExcelRow([], 12))
  sheet4Rows.push(
    renderExcelRow([
      { value: 'BẢNG B. NHẬT KÝ SỰ CỐ AN NINH NGOÀI GIỜ (SOC)', style: 'SectionHeaderStyle', mergeAcross: 6 },
    ], 22),
  )
  sheet4Rows.push(
    renderExcelRow([
      { value: 'STT', style: 'TableHeaderStyle' },
      { value: 'Thời điểm phát hiện', style: 'TableHeaderStyle' },
      { value: 'Đối tượng nhận diện', style: 'TableHeaderStyle' },
      { value: 'Mức cảnh báo', style: 'TableHeaderStyle' },
      { value: 'Email', style: 'TableHeaderStyle' },
      { value: 'Trạng thái ticket', style: 'TableHeaderStyle' },
      { value: 'Biên bản xử lý / Tóm tắt sự cố', style: 'TableHeaderStyle' },
    ], 24),
  )

  incidents.forEach((inc, idx) => {
    const isCritical = inc.alertLevel === 'LEVEL_3_SECURITY_BREACH' || inc.alertLevel === 'SPOOFING_ATTEMPT' || inc.ticketStatus === 'OPEN'
    const tone = isCritical
      ? 'RowDanger'
      : inc.alertLevel === 'LEVEL_2_UNAUTHORIZED_PRESENCE'
        ? 'RowWarning'
        : 'RowInfo'
    sheet4Rows.push(
      renderExcelRow([
        { value: idx + 1, type: 'Number', style: `${tone}Center` },
        { value: formatDateTime(inc.detectedAt), style: `${tone}Center` },
        { value: inc.detectedEmployeeName ? `${inc.detectedEmployeeCode} - ${inc.detectedEmployeeName}` : 'Người lạ chưa định danh', style: `${tone}Bold` },
        { value: EXCEL_ALERT_LABELS[inc.alertLevel] ?? inc.alertLevel, style: tone },
        { value: inc.telegramSent ? 'Đã gửi' : 'Không', style: `${tone}Center` },
        { value: EXCEL_TICKET_LABELS[inc.ticketStatus] ?? inc.ticketStatus, style: `${tone}Bold` },
        { value: inc.resolutionNote || inc.actionSummary || '—', style: tone },
      ], 20),
    )
  })

  if (incidents.length === 0) {
    sheet4Rows.push(
      renderExcelRow([
        { value: 'Không phát sinh sự cố an ninh ngoài giờ trong kỳ báo cáo.', style: 'RowNeutralCenter', mergeAcross: 6 },
      ], 22),
    )
  }

  const makeRowVariantStyles = (idPrefix: string, bgColor: string, textColor = '#0F172A'): string => {
    const border = `<Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/></Borders>`
    const fill = `<Interior ss:Color="${bgColor}" ss:Pattern="Solid"/>`
    return `
  <Style ss:ID="${idPrefix}">
    <Alignment ss:Vertical="Center" ss:WrapText="1"/>
    <Font ss:FontName="Arial" ss:Size="9.5" ss:Color="${textColor}"/>
    ${border}${fill}
  </Style>
  <Style ss:ID="${idPrefix}Bold">
    <Alignment ss:Vertical="Center" ss:WrapText="1"/>
    <Font ss:FontName="Arial" ss:Size="9.5" ss:Bold="1" ss:Color="${textColor}"/>
    ${border}${fill}
  </Style>
  <Style ss:ID="${idPrefix}Center">
    <Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/>
    <Font ss:FontName="Arial" ss:Size="9.5" ss:Color="${textColor}"/>
    ${border}${fill}
  </Style>
  <Style ss:ID="${idPrefix}BoldRight">
    <Alignment ss:Horizontal="Right" ss:Vertical="Center" ss:WrapText="1"/>
    <Font ss:FontName="Arial" ss:Size="9.5" ss:Bold="1" ss:Color="${textColor}"/>
    ${border}${fill}
  </Style>
  <Style ss:ID="${idPrefix}NumText">
    <Alignment ss:Horizontal="Right" ss:Vertical="Center" ss:WrapText="1"/>
    <Font ss:FontName="Arial" ss:Size="9.5" ss:Color="${textColor}"/>
    ${border}${fill}
  </Style>
  <Style ss:ID="${idPrefix}Int">
    <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
    <Font ss:FontName="Arial" ss:Size="9.5" ss:Color="${textColor}"/>
    <NumberFormat ss:Format="#,##0"/>
    ${border}${fill}
  </Style>
  <Style ss:ID="${idPrefix}Dec">
    <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
    <Font ss:FontName="Arial" ss:Size="9.5" ss:Color="${textColor}"/>
    <NumberFormat ss:Format="#,##0.0"/>
    ${border}${fill}
  </Style>`
  }

  const makeKpiTopStyle = (id: string, topColor: string) => `
  <Style ss:ID="${id}">
    <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
    <Font ss:FontName="Arial" ss:Size="9" ss:Bold="1" ss:Color="#475569"/>
    <Interior ss:Color="#FFFFFF" ss:Pattern="Solid"/>
    <Borders>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="${topColor}"/>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    </Borders>
  </Style>`

  const makeRosterCardStyles = (suffix: string, bg: string, topColor: string) => `
  <Style ss:ID="PrintRosterTop${suffix}">
    <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
    <Font ss:FontName="Arial" ss:Size="10" ss:Bold="1" ss:Color="#0F172A"/>
    <Interior ss:Color="${bg}" ss:Pattern="Solid"/>
    <Borders>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="${topColor}"/>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    </Borders>
  </Style>
  <Style ss:ID="PrintRosterMid${suffix}">
    <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
    <Font ss:FontName="Arial" ss:Size="9" ss:Bold="1" ss:Color="#334155"/>
    <Interior ss:Color="${bg}" ss:Pattern="Solid"/>
    <Borders>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    </Borders>
  </Style>
  <Style ss:ID="PrintRosterBot${suffix}">
    <Alignment ss:Horizontal="Left" ss:Vertical="Top" ss:WrapText="1"/>
    <Font ss:FontName="Arial" ss:Size="9" ss:Color="#1E293B"/>
    <Interior ss:Color="${bg}" ss:Pattern="Solid"/>
    <Borders>
      <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    </Borders>
  </Style>`

  const makePillStyle = (id: string, bg: string, fg: string, borderColor: string) => `
  <Style ss:ID="${id}">
    <Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/>
    <Font ss:FontName="Arial" ss:Size="9" ss:Bold="1" ss:Color="${fg}"/>
    <Interior ss:Color="${bg}" ss:Pattern="Solid"/>
    <Borders>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="${borderColor}"/>
      <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="${borderColor}"/>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="${borderColor}"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="${borderColor}"/>
    </Borders>
  </Style>`

  const workbookXml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <DocumentProperties xmlns="urn:schemas-microsoft-com:office:office">
  <Author>${escapeXmlValue(generatedBy)}</Author>
  <Company>AIoT Smart Office Management System</Company>
 </DocumentProperties>
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal">
   <Alignment ss:Vertical="Center"/>
   <Font ss:FontName="Arial" ss:Size="10" ss:Color="#0F172A"/>
  </Style>
  <Style ss:ID="PrintOrgLeftBold">
   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
   <Font ss:FontName="Arial" ss:Size="10" ss:Bold="1" ss:Color="#0F172A"/>
  </Style>
  <Style ss:ID="PrintOrgLeft">
   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
   <Font ss:FontName="Arial" ss:Size="9.5" ss:Color="#334155"/>
  </Style>
  <Style ss:ID="PrintOrgLeftEnd">
   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
   <Font ss:FontName="Arial" ss:Size="8.5" ss:Color="#475569"/>
   <Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#0F172A"/></Borders>
  </Style>
  <Style ss:ID="PrintOrgRightBold">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Font ss:FontName="Arial" ss:Size="10" ss:Bold="1" ss:Color="#0F172A"/>
  </Style>
  <Style ss:ID="PrintOrgRightUnderline">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Font ss:FontName="Arial" ss:Size="9.5" ss:Bold="1" ss:Underline="Single" ss:Color="#0F172A"/>
  </Style>
  <Style ss:ID="PrintOrgRightEnd">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Font ss:FontName="Arial" ss:Size="8.5" ss:Color="#475569"/>
   <Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#0F172A"/></Borders>
  </Style>
  <Style ss:ID="PrintDocTitle">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Font ss:FontName="Arial" ss:Size="13.5" ss:Bold="1" ss:Color="#0F172A"/>
  </Style>
  <Style ss:ID="PrintMetaLabel">
   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
   <Font ss:FontName="Arial" ss:Size="8" ss:Bold="1" ss:Color="#64748B"/>
   <Interior ss:Color="#F8FAFC" ss:Pattern="Solid"/>
   <Borders>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
   </Borders>
  </Style>
  <Style ss:ID="PrintMetaVal">
   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
   <Font ss:FontName="Arial" ss:Size="10" ss:Bold="1" ss:Color="#0F172A"/>
   <Interior ss:Color="#F8FAFC" ss:Pattern="Solid"/>
   <Borders>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
   </Borders>
  </Style>
  <Style ss:ID="PrintMetaSub">
   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
   <Font ss:FontName="Arial" ss:Size="8.5" ss:Color="#475569"/>
   <Interior ss:Color="#F8FAFC" ss:Pattern="Solid"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
   </Borders>
  </Style>
  <Style ss:ID="PrintSectionTitle">
   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
   <Font ss:FontName="Arial" ss:Size="10.5" ss:Bold="1" ss:Color="#0F172A"/>
   <Interior ss:Color="#FFFFFF" ss:Pattern="Solid"/>
   <Borders><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="3" ss:Color="#2563EB"/></Borders>
  </Style>
  ${makeKpiTopStyle('PrintKpiTopSuccess', '#16A34A')}
  ${makeKpiTopStyle('PrintKpiTopInfo', '#2563EB')}
  ${makeKpiTopStyle('PrintKpiTopWarning', '#D97706')}
  ${makeKpiTopStyle('PrintKpiTopDanger', '#DC2626')}
  <Style ss:ID="PrintKpiVal">
   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
   <Font ss:FontName="Arial" ss:Size="11.5" ss:Bold="1" ss:Color="#0F172A"/>
   <Interior ss:Color="#FFFFFF" ss:Pattern="Solid"/>
   <Borders>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
   </Borders>
  </Style>
  <Style ss:ID="PrintKpiSub">
   <Alignment ss:Horizontal="Left" ss:Vertical="Center" ss:WrapText="1"/>
   <Font ss:FontName="Arial" ss:Size="8.5" ss:Color="#64748B"/>
   <Interior ss:Color="#FFFFFF" ss:Pattern="Solid"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
   </Borders>
  </Style>
  <Style ss:ID="PrintTableHeader">
   <Alignment ss:Horizontal="Left" ss:Vertical="Center" ss:WrapText="1"/>
   <Font ss:FontName="Arial" ss:Size="9.5" ss:Bold="1" ss:Color="#0F172A"/>
   <Interior ss:Color="#EFF6FF" ss:Pattern="Solid"/>
   <Borders>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
   </Borders>
  </Style>
  <Style ss:ID="PrintTableHeaderCenter">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/>
   <Font ss:FontName="Arial" ss:Size="9.5" ss:Bold="1" ss:Color="#0F172A"/>
   <Interior ss:Color="#EFF6FF" ss:Pattern="Solid"/>
   <Borders>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
   </Borders>
  </Style>
  <Style ss:ID="PrintTableHeaderNum">
   <Alignment ss:Horizontal="Right" ss:Vertical="Center" ss:WrapText="1"/>
   <Font ss:FontName="Arial" ss:Size="9.5" ss:Bold="1" ss:Color="#0F172A"/>
   <Interior ss:Color="#EFF6FF" ss:Pattern="Solid"/>
   <Borders>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
   </Borders>
  </Style>
  <Style ss:ID="PrintCellCenter">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/>
   <Font ss:FontName="Arial" ss:Size="9.5" ss:Color="#334155"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
   </Borders>
  </Style>
  <Style ss:ID="PrintNoteRow">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/>
   <Font ss:FontName="Arial" ss:Size="9" ss:Italic="1" ss:Color="#475569"/>
   <Interior ss:Color="#F8FAFC" ss:Pattern="Solid"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
   </Borders>
  </Style>
  <Style ss:ID="PrintDeptSubStyle">
   <Alignment ss:Horizontal="Left" ss:Vertical="Center" ss:WrapText="1"/>
   <Font ss:FontName="Arial" ss:Size="9" ss:Bold="1" ss:Color="#334155"/>
   <Interior ss:Color="#F1F5F9" ss:Pattern="Solid"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
   </Borders>
  </Style>
  <Style ss:ID="PrintDeptSubRightStyle">
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <Font ss:FontName="Arial" ss:Size="9" ss:Bold="1" ss:Color="#334155"/>
   <Interior ss:Color="#F1F5F9" ss:Pattern="Solid"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
   </Borders>
  </Style>
  ${makeRosterCardStyles('Success', '#F0FDF4', '#16A34A')}
  ${makeRosterCardStyles('Info', '#EFF6FF', '#2563EB')}
  ${makeRosterCardStyles('Danger', '#FEF2F2', '#DC2626')}
  ${makePillStyle('PrintPillSuccess', '#DCFCE7', '#166534', '#BBF7D0')}
  ${makePillStyle('PrintPillInfo', '#DBEAFE', '#1E40AF', '#BFDBFE')}
  ${makePillStyle('PrintPillWarning', '#FEF3C7', '#92400E', '#FDE68A')}
  ${makePillStyle('PrintPillDanger', '#FEE2E2', '#991B1B', '#FECACA')}
  <Style ss:ID="PrintSigTitle">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Font ss:FontName="Arial" ss:Size="10" ss:Bold="1" ss:Color="#0F172A"/>
  </Style>
  <Style ss:ID="PrintSigSub">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Font ss:FontName="Arial" ss:Size="9" ss:Italic="1" ss:Color="#475569"/>
  </Style>
  <Style ss:ID="PrintSigBlank">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
  </Style>
  <Style ss:ID="PrintSigName">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Font ss:FontName="Arial" ss:Size="10" ss:Bold="1" ss:Color="#0F172A"/>
  </Style>
  <Style ss:ID="PrintAuditLeft">
   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
   <Font ss:FontName="Arial" ss:Size="8.5" ss:Color="#64748B"/>
   <Borders><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/></Borders>
  </Style>
  <Style ss:ID="PrintAuditRight">
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <Font ss:FontName="Arial" ss:Size="8.5" ss:Color="#64748B"/>
   <Borders><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/></Borders>
  </Style>
  <Style ss:ID="TitleStyle">
   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
   <Font ss:FontName="Arial" ss:Size="13" ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#0F294A" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="MetaStyle">
   <Alignment ss:Horizontal="Left" ss:Vertical="Center" ss:WrapText="1"/>
   <Font ss:FontName="Arial" ss:Size="9" ss:Italic="1" ss:Color="#334155"/>
   <Interior ss:Color="#EFF6FF" ss:Pattern="Solid"/>
   <Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#93C5FD"/></Borders>
  </Style>
  <Style ss:ID="SectionHeaderStyle">
   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
   <Font ss:FontName="Arial" ss:Size="10" ss:Bold="1" ss:Color="#1E3A8A"/>
   <Interior ss:Color="#DBEAFE" ss:Pattern="Solid"/>
   <Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#60A5FA"/></Borders>
  </Style>
  <Style ss:ID="TableHeaderStyle">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/>
   <Font ss:FontName="Arial" ss:Size="10" ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#1E3A8A" ss:Pattern="Solid"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#0F172A"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#3B82F6"/>
   </Borders>
  </Style>
  <Style ss:ID="TotalRowStyle">
   <Alignment ss:Horizontal="Left" ss:Vertical="Center" ss:WrapText="1"/>
   <Font ss:FontName="Arial" ss:Size="9.5" ss:Bold="1" ss:Color="#0F172A"/>
   <Interior ss:Color="#E2E8F0" ss:Pattern="Solid"/>
   <Borders>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#64748B"/>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
   </Borders>
  </Style>
  <Style ss:ID="TotalRowRightBoldStyle">
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <Font ss:FontName="Arial" ss:Size="9.5" ss:Bold="1" ss:Color="#0F172A"/>
   <Interior ss:Color="#E2E8F0" ss:Pattern="Solid"/>
   <Borders>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#64748B"/>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
   </Borders>
  </Style>
  <Style ss:ID="TotalRowIntStyle">
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <Font ss:FontName="Arial" ss:Size="9.5" ss:Bold="1" ss:Color="#0F172A"/>
   <NumberFormat ss:Format="#,##0"/>
   <Interior ss:Color="#E2E8F0" ss:Pattern="Solid"/>
   <Borders>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#64748B"/>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
   </Borders>
  </Style>
  <Style ss:ID="TotalRowDecStyle">
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <Font ss:FontName="Arial" ss:Size="9.5" ss:Bold="1" ss:Color="#0F172A"/>
   <NumberFormat ss:Format="#,##0.0"/>
   <Interior ss:Color="#E2E8F0" ss:Pattern="Solid"/>
   <Borders>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#64748B"/>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
   </Borders>
  </Style>
  ${makeRowVariantStyles('PrintRow', '#FFFFFF', '#0F172A')}
  ${makeRowVariantStyles('PrintAlt', '#F8FAFC', '#0F172A')}
  ${makeRowVariantStyles('RowNeutral', '#FFFFFF', '#0F172A')}
  ${makeRowVariantStyles('RowAlt', '#F8FAFC', '#0F172A')}
  ${makeRowVariantStyles('RowSuccess', '#ECFDF5', '#14532D')}
  ${makeRowVariantStyles('RowWarning', '#FFFBEB', '#78350F')}
  ${makeRowVariantStyles('RowInfo', '#EFF6FF', '#1E3A8A')}
  ${makeRowVariantStyles('RowDanger', '#FEF2F2', '#991B1B')}
 </Styles>
 ${renderWorksheet('1_Phieu_Bao_Cao_A4', [38, 118, 72, 92, 82, 82, 82, 82, 90, 118], sheet1Rows, printOrientation === 'landscape' ? 'Landscape' : 'Portrait')}
 ${renderWorksheet('2_PhuLuc_BangCong_Full', [42, 82, 155, 78, 138, 72, 68, 68, 72, 68, 72, 68, 78, 78, 86, 74, 80, 88, 220, 150], sheet2Rows, 'Landscape')}
 ${renderWorksheet('3_PhuLuc_ChoNgoi_AI', [85, 130, 100, 85, 80, 155, 135, 105, 105], sheet3Rows, 'Landscape')}
 ${renderWorksheet('4_PhuLuc_AnNinh_OT', [120, 120, 165, 145, 88, 120, 240], sheet4Rows, 'Landscape')}
</Workbook>`

  const filename = `SmartOffice_BaoCaoTongHop_${fileTag}.xls`
  const bom = new Uint8Array([0xef, 0xbb, 0xbf])
  const blob = new Blob([bom, workbookXml], { type: 'application/vnd.ms-excel;charset=utf-8' })
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
