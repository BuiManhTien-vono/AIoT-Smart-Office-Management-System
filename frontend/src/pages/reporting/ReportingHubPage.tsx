import {
  Armchair,
  ArrowClockwise,
  Buildings,
  CalendarBlank,
  CalendarCheck,
  CaretLeft,
  CaretRight,
  ChartBar,
  ChartPieSlice,
  CheckCircle,
  Clock,
  DownloadSimple,
  FileText,
  Funnel,
  MagnifyingGlass,
  Printer,
  ShieldWarning,
  Table,
  User,
  UsersThree,
  WarningCircle,
  X,
} from '@phosphor-icons/react'
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { KpiStatCards } from '../../components/common/KpiStatCards'
import type { KpiStat } from '../../components/common/KpiStatCards'
import { useQuery } from '../../components/common/useQuery'
import { AttendanceCharts } from '../../components/reporting/AttendanceCharts'
import { WeeklyTrendChart } from '../../components/reporting/WeeklyTrendChart'
import {
  listAttendanceLogs,
  listLeaves,
  listShifts,
} from '../../services/attendanceService'
import { listDepartments } from '../../services/authService'
import { listEmployees } from '../../services/biometricsService'
import {
  listCameras,
  listOccupancyLogs,
  listSeats,
} from '../../services/occupancyService'
import {
  buildEmployeeTimesheet,
  buildOccupancyReportSummary,
  buildSecurityOtReportSummary,
  calculateOtDurationHours,
  computePeriodBounds,
  dailySummaries,
  departmentScope,
  exportCustomCsv,
  exportMultiSheetExcelWorkbook,
  formatDateTime,
  groupTimesheetRowsByDepartment,
  monthlyReport,
  officeDate,
  onTimeCount,
  summarizeDepartments,
  weeklyReport,
} from '../../services/reportingService'
import {
  listOtRegistrations,
  listSecurityIncidents,
} from '../../services/securityService'
import { signalrService } from '../../services/signalrService'
import { attendanceStatusLabels } from '../../types/attendance.types'
import type { AttendanceRecord, LeaveRequest, Shift } from '../../types/attendance.types'
import type { Session } from '../../types/auth.types'
import type { Employee } from '../../types/biometrics.types'
import type { Camera, Seat, SeatOccupancyLog } from '../../types/occupancy.types'
import type {
  DailyDepartmentSummary,
  EmployeeTimesheetRow,
  ReportPeriodMode,
  TimesheetFilterStatus,
  TimesheetRatingFilter,
  TimesheetSortBy,
  TimesheetSpecialFilter,
} from '../../types/reporting.types'
import type { OtRegistration, SecurityIncident } from '../../types/security.types'
import './reporting.css'

export type ReportTab = 'overview' | 'timesheet' | 'occupancy' | 'security_ot' | 'print_sheet'

const TAB_ORDER: ReportTab[] = ['overview', 'timesheet', 'occupancy', 'security_ot', 'print_sheet']
const PERIOD_ORDER: ReportPeriodMode[] = ['daily', 'weekly', 'monthly', 'custom']

const seatStateMeta: Record<string, { label: string; badge: string; color: string }> = {
  PRESENT: { label: 'Đang làm việc', badge: 'badge-success', color: '#16a34a' },
  TEMP_AWAY: { label: 'Rời bàn tạm thời', badge: 'badge-warning', color: '#f59e0b' },
  PROLONGED_AWAY: { label: 'Rời bàn quá hạn', badge: 'badge-danger', color: '#ef4444' },
  WRONG_SEAT: { label: 'Ngồi sai vị trí', badge: 'badge-special', color: '#8b5cf6' },
  EMPTY: { label: 'Chỗ trống', badge: 'badge-neutral', color: '#94a3b8' },
}

const alertLevelMeta: Record<string, { label: string; badge: string; color: string }> = {
  LEVEL_1_APPROVED_OT: { label: 'Mức 1 · OT hợp lệ', badge: 'badge-info', color: '#2563eb' },
  LEVEL_2_UNAUTHORIZED_PRESENCE: { label: 'Mức 2 · Ngoài giờ chưa đăng ký', badge: 'badge-warning', color: '#f59e0b' },
  LEVEL_3_SECURITY_BREACH: { label: 'Mức 3 · Xâm nhập người lạ', badge: 'badge-danger', color: '#dc2626' },
  SPOOFING_ATTEMPT: { label: 'Giả mạo sinh trắc (Spoofing)', badge: 'badge-danger', color: '#991b1b' },
}

const ticketStatusMeta: Record<string, { label: string; badge: string }> = {
  OPEN: { label: 'Chờ xử lý', badge: 'badge-danger' },
  ACKNOWLEDGED: { label: 'Đã xác minh', badge: 'badge-success' },
  FALSE_ALARM: { label: 'Báo động giả', badge: 'badge-neutral' },
}

const otApprovalMeta: Record<string, { label: string; badge: string }> = {
  APPROVED: { label: 'Đã duyệt', badge: 'badge-success' },
  PENDING: { label: 'Chờ duyệt', badge: 'badge-warning' },
  REJECTED: { label: 'Từ chối', badge: 'badge-danger' },
}

function formatDurationLabel(seconds: number): string {
  if (!seconds || seconds <= 0) return '0 phút'
  const hours = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  if (hours > 0) return `${hours}g ${mins}p`
  return `${mins} phút`
}

function formatTimeClock(isoStr?: string | null): string {
  if (!isoStr) return '—'
  const date = new Date(isoStr)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date)
}

function formatViDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-')
  return y && m && d ? `${d}/${m}/${y}` : dateStr
}

function paginateSlice<T>(items: T[], page: number, pageSize: number): {
  safePage: number
  totalPages: number
  sliced: T[]
} {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))
  const safePage = Math.min(Math.max(1, page), totalPages)
  const start = (safePage - 1) * pageSize
  return {
    safePage,
    totalPages,
    sliced: items.slice(start, start + pageSize),
  }
}

function getPageTokens(safePage: number, totalPages: number): Array<number | 'left-dots' | 'right-dots'> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1)
  }
  const tokens: Array<number | 'left-dots' | 'right-dots'> = [1]
  const start = Math.max(2, safePage - 1)
  const end = Math.min(totalPages - 1, safePage + 1)
  if (start > 2) tokens.push('left-dots')
  for (let p = start; p <= end; p++) tokens.push(p)
  if (end < totalPages - 1) tokens.push('right-dots')
  tokens.push(totalPages)
  return tokens
}

function TablePagination({
  totalItems,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  itemLabel = 'bản ghi',
}: {
  totalItems: number
  page: number
  pageSize: number
  onPageChange: (nextPage: number) => void
  onPageSizeChange?: (nextSize: number) => void
  itemLabel?: string
}) {
  if (totalItems === 0) return null
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  const safePage = Math.min(Math.max(1, page), totalPages)
  const startIdx = (safePage - 1) * pageSize + 1
  const endIdx = Math.min(totalItems, safePage * pageSize)
  const tokens = getPageTokens(safePage, totalPages)

  return (
    <div className="table-pagination-bar" role="navigation" aria-label={`Phân trang ${itemLabel}`}>
      <div className="pagination-info">
        <span>
          Hiển thị <strong>{startIdx.toLocaleString('vi-VN')}–{endIdx.toLocaleString('vi-VN')}</strong> / <strong>{totalItems.toLocaleString('vi-VN')}</strong> {itemLabel}
        </span>
        {onPageSizeChange && (
          <label className="pagination-size-wrap">
            <span>Số dòng:</span>
            <select
              className="pagination-size-select"
              value={pageSize}
              onChange={e => {
                onPageSizeChange(Number(e.target.value))
                onPageChange(1)
              }}
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </label>
        )}
      </div>

      {totalPages > 1 && (
        <div className="pagination-controls">
          <button
            type="button"
            className="page-num-btn"
            disabled={safePage <= 1}
            onClick={() => onPageChange(safePage - 1)}
            aria-label="Trang trước"
          >
            <CaretLeft size={14} />
          </button>
          {tokens.map(tok =>
            typeof tok === 'number' ? (
              <button
                key={tok}
                type="button"
                className={`page-num-btn ${tok === safePage ? 'active' : ''}`}
                onClick={() => onPageChange(tok)}
                aria-current={tok === safePage ? 'page' : undefined}
              >
                {tok}
              </button>
            ) : (
              <span key={tok} className="page-ellipsis" aria-hidden="true">…</span>
            ),
          )}
          <button
            type="button"
            className="page-num-btn"
            disabled={safePage >= totalPages}
            onClick={() => onPageChange(safePage + 1)}
            aria-label="Trang sau"
          >
            <CaretRight size={14} />
          </button>
        </div>
      )}
    </div>
  )
}

const INITIAL_ROSTER_LIMIT = 6
const ROSTER_STEP = 20

function RosterColumnFooter({
  shownCount,
  totalCount,
  onShowMore,
  onCollapse,
  onOpenFullTable,
}: {
  shownCount: number
  totalCount: number
  onShowMore: () => void
  onCollapse: () => void
  onOpenFullTable: () => void
}) {
  if (totalCount <= INITIAL_ROSTER_LIMIT) return null
  const remaining = totalCount - shownCount
  return (
    <div className="roster-more-bar">
      {remaining > 0 ? (
        <button type="button" className="button button-ghost roster-more-btn" onClick={onShowMore}>
          Xem thêm +{Math.min(ROSTER_STEP, remaining)} (còn {remaining.toLocaleString('vi-VN')})
        </button>
      ) : (
        <button type="button" className="button button-ghost roster-more-btn" onClick={onCollapse}>
          Thu gọn danh sách
        </button>
      )}
      <button type="button" className="button button-secondary roster-more-btn" onClick={onOpenFullTable}>
        Xem tất cả
      </button>
    </div>
  )
}

function RosterBreakdownSection({
  periodLabel,
  allRows,
  workingRows,
  onLeaveRows,
  absentRows,
  onFilterTimesheet,
}: {
  periodLabel: string
  allRows: EmployeeTimesheetRow[]
  workingRows: EmployeeTimesheetRow[]
  onLeaveRows: EmployeeTimesheetRow[]
  absentRows: EmployeeTimesheetRow[]
  onFilterTimesheet: (filter: TimesheetFilterStatus) => void
}) {
  const [viewMode, setViewMode] = useState<'by_person' | 'by_dept'>('by_dept')
  const [workLimit, setWorkLimit] = useState(INITIAL_ROSTER_LIMIT)
  const [leaveLimit, setLeaveLimit] = useState(INITIAL_ROSTER_LIMIT)
  const [absentLimit, setAbsentLimit] = useState(INITIAL_ROSTER_LIMIT)
  const [expandedDepts, setExpandedDepts] = useState<Record<string, boolean>>({})

  // Ưu tiên người đi muộn/có vắng lên trước trong cột Đi làm để quản lý thấy nhanh ngoại lệ
  const prioritizedWorking = useMemo(
    () =>
      [...workingRows].sort((a, b) => {
        if (b.lateDays !== a.lateDays) return b.lateDays - a.lateDays
        if (b.absentDays !== a.absentDays) return b.absentDays - a.absentDays
        return a.employeeCode.localeCompare(b.employeeCode, 'vi')
      }),
    [workingRows],
  )

  const deptGroups = useMemo(() => {
    const map = new Map<
      string,
      {
        departmentId: string
        departmentCode: string
        departmentName: string
        working: EmployeeTimesheetRow[]
        onLeave: EmployeeTimesheetRow[]
        absent: EmployeeTimesheetRow[]
        total: number
      }
    >()
    for (const row of allRows) {
      const grp = map.get(row.departmentId) ?? {
        departmentId: row.departmentId,
        departmentCode: row.departmentCode,
        departmentName: row.departmentName,
        working: [],
        onLeave: [],
        absent: [],
        total: 0,
      }
      grp.total += 1
      if (row.presentDays > 0) grp.working.push(row)
      if (row.approvedLeaveDays > 0) grp.onLeave.push(row)
      if (row.absentDays > 0 || (row.presentDays === 0 && row.approvedLeaveDays === 0)) grp.absent.push(row)
      map.set(row.departmentId, grp)
    }
    return [...map.values()].sort((a, b) => a.departmentCode.localeCompare(b.departmentCode, 'vi'))
  }, [allRows])

  const visibleWorking = prioritizedWorking.slice(0, workLimit)
  const visibleLeave = onLeaveRows.slice(0, leaveLimit)
  const visibleAbsent = absentRows.slice(0, absentLimit)

  const firstDeptId = deptGroups[0]?.departmentId
  const toggleDept = (deptId: string) => {
    setExpandedDepts(prev => ({
      ...prev,
      [deptId]: !(prev[deptId] !== undefined ? prev[deptId] : deptId === firstDeptId),
    }))
  }

  return (
    <section className="panel roster-breakdown-panel" aria-labelledby="roster-breakdown-title">
      <div className="report-panel-heading report-panel-heading-row">
        <div>
          <p className="eyebrow">PHÂN TÍCH QUÂN SỐ CHI TIẾT · {periodLabel.toUpperCase()}</p>
          <h2 id="roster-breakdown-title">Tình hình Nhân sự: Ai Đi làm – Ai Nghỉ phép – Ai Vắng mặt</h2>
        </div>
        <div className="roster-header-right">
          <div className="roster-summary-pills">
            <span className="badge badge-success">Đi làm: {workingRows.length.toLocaleString('vi-VN')}</span>
            <span className="badge badge-info">Nghỉ phép: {onLeaveRows.length.toLocaleString('vi-VN')}</span>
            <span className="badge badge-danger">Vắng / Chưa điểm danh: {absentRows.length.toLocaleString('vi-VN')}</span>
          </div>
          <div className="roster-mode-toggle" role="group" aria-label="Chế độ xem quân số">
            <button
              type="button"
              className={`period-seg-btn ${viewMode === 'by_person' ? 'active' : ''}`}
              onClick={() => setViewMode('by_person')}
            >
              <UsersThree size={14} /> Cá nhân
            </button>
            <button
              type="button"
              className={`period-seg-btn ${viewMode === 'by_dept' ? 'active' : ''}`}
              onClick={() => setViewMode('by_dept')}
            >
              <Buildings size={14} /> Theo Phòng ban ({deptGroups.length})
            </button>
          </div>
        </div>
      </div>

      {viewMode === 'by_dept' ? (
        <div className="roster-dept-accordion">
          {deptGroups.length === 0 ? (
            <p className="roster-empty-note muted">Chưa có dữ liệu nhân sự theo phòng ban.</p>
          ) : (
            deptGroups.map(grp => {
              const isOpen = expandedDepts[grp.departmentId] !== undefined
                ? expandedDepts[grp.departmentId]
                : grp.departmentId === firstDeptId
              const attPct = grp.total > 0 ? Math.round((grp.working.length / grp.total) * 100) : 0
              return (
                <div key={grp.departmentId} className="roster-dept-row">
                  <button
                    type="button"
                    className="roster-dept-trigger"
                    aria-expanded={isOpen}
                    onClick={() => toggleDept(grp.departmentId)}
                  >
                    <div className="roster-dept-name">
                      <strong>{grp.departmentCode}</strong>
                      <span className="muted"> · {grp.departmentName} ({grp.total.toLocaleString('vi-VN')} nhân sự)</span>
                    </div>
                    <div className="roster-dept-badges">
                      <span className="roster-dept-stat-line">
                        Đi làm: <strong>{grp.working.length}</strong> · Nghỉ phép: <strong>{grp.onLeave.length}</strong> · Vắng: <strong>{grp.absent.length}</strong>
                      </span>
                      <span className="badge badge-neutral">{attPct}% có mặt</span>
                    </div>
                  </button>
                  {isOpen && (
                    <div className="roster-dept-body">
                      <div className="roster-dept-col">
                        <strong className="text-success">Đi làm ({grp.working.length})</strong>
                        {grp.working.length === 0 ? (
                          <p className="muted">Không có.</p>
                        ) : (
                          <ul>
                            {grp.working.slice(0, 15).map(r => (
                              <li key={r.employeeId}>
                                <strong>{r.employeeCode}</strong> – {r.fullName}{' '}
                                <span className="muted">({r.firstCheckInText}–{r.lastCheckOutText}{r.lateDays > 0 ? `, muộn ${r.totalLateMinutes}p` : ''})</span>
                              </li>
                            ))}
                            {grp.working.length > 15 && (
                              <li className="muted">… và {grp.working.length - 15} nhân viên khác (xem tại Bảng công phân trang).</li>
                            )}
                          </ul>
                        )}
                      </div>
                      <div className="roster-dept-col">
                        <strong className="text-primary">Nghỉ có phép ({grp.onLeave.length})</strong>
                        {grp.onLeave.length === 0 ? (
                          <p className="muted">Không có.</p>
                        ) : (
                          <ul>
                            {grp.onLeave.slice(0, 15).map(r => (
                              <li key={r.employeeId}>
                                <strong>{r.employeeCode}</strong> – {r.fullName}{' '}
                                <span className="muted">({r.leaveDetailsText})</span>
                              </li>
                            ))}
                            {grp.onLeave.length > 15 && (
                              <li className="muted">… và {grp.onLeave.length - 15} nhân viên khác.</li>
                            )}
                          </ul>
                        )}
                      </div>
                      <div className="roster-dept-col">
                        <strong className="text-danger">Vắng / Chưa điểm danh ({grp.absent.length})</strong>
                        {grp.absent.length === 0 ? (
                          <p className="muted">Không có.</p>
                        ) : (
                          <ul>
                            {grp.absent.slice(0, 15).map(r => (
                              <li key={r.employeeId}>
                                <strong>{r.employeeCode}</strong> – {r.fullName}{' '}
                                <span className="muted">
                                  ({r.absentDays > 0 ? `Vắng KP ${r.absentDays} ngày: ${r.absentDatesList.join(', ')}` : 'Chưa điểm danh'})
                                </span>
                              </li>
                            ))}
                            {grp.absent.length > 15 && (
                              <li className="muted">… và {grp.absent.length - 15} nhân viên khác.</li>
                            )}
                          </ul>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      ) : (
        <div className="roster-split-grid">
          {/* CỘT 1: NHÂN SỰ ĐI LÀM */}
          <div className="roster-column-card roster-col-working">
            <div className="roster-col-header">
              <div className="roster-col-title">
                <CheckCircle size={20} weight="fill" color="#16a34a" />
                <div>
                  <strong>Đi làm / Có mặt ({workingRows.length.toLocaleString('vi-VN')})</strong>
                  <small className="muted">
                    {workingRows.length > visibleWorking.length
                      ? `Đang hiện ${visibleWorking.length}/${workingRows.length} · Ưu tiên đi muộn`
                      : 'Đã ghi nhận chấm công khuôn mặt'}
                  </small>
                </div>
              </div>
              <button type="button" className="button button-ghost roster-view-btn" onClick={() => onFilterTimesheet('WORKING')}>
                Lọc
              </button>
            </div>

            <div className="roster-person-list">
              {visibleWorking.length === 0 ? (
                <p className="roster-empty-note muted">Chưa có nhân viên nào chấm công đi làm trong kỳ.</p>
              ) : (
                visibleWorking.map(r => (
                  <div key={r.employeeId} className="roster-person-item">
                    <div className="roster-person-top">
                      <div>
                        <strong>{r.employeeCode} · {r.fullName}</strong>
                        <small className="muted"> · {r.departmentCode}</small>
                      </div>
                      <span className={`badge ${r.lateDays > 0 ? 'badge-warning' : 'badge-success'}`}>
                        {r.lateDays > 0 ? `Muộn ${r.lateDays}l (${r.totalLateMinutes}p)` : 'Đúng giờ'}
                      </span>
                    </div>
                    <div className="roster-person-meta">
                      <span>Giờ: <strong>{r.firstCheckInText} – {r.lastCheckOutText}</strong></span>
                      <span>Công: <strong>{r.presentDays} ngày</strong> ({r.totalWorkHours.toFixed(1)}h)</span>
                    </div>
                    <div className="roster-person-sub muted">
                      Bàn: {r.assignedSeatText}
                      {r.workingDatesList.length > 0 && ` · Ngày làm: ${r.workingDatesList.join(', ')}`}
                    </div>
                  </div>
                ))
              )}
            </div>
            <RosterColumnFooter
              shownCount={visibleWorking.length}
              totalCount={workingRows.length}
              onShowMore={() => setWorkLimit(v => v + ROSTER_STEP)}
              onCollapse={() => setWorkLimit(INITIAL_ROSTER_LIMIT)}
              onOpenFullTable={() => onFilterTimesheet('WORKING')}
            />
          </div>

          {/* CỘT 2: NHÂN SỰ NGHỈ CÓ PHÉP */}
          <div className="roster-column-card roster-col-leave">
            <div className="roster-col-header">
              <div className="roster-col-title">
                <CalendarBlank size={20} weight="fill" color="#2563eb" />
                <div>
                  <strong>Nghỉ có phép ({onLeaveRows.length.toLocaleString('vi-VN')})</strong>
                  <small className="muted">
                    {onLeaveRows.length > visibleLeave.length
                      ? `Đang hiện ${visibleLeave.length}/${onLeaveRows.length}`
                      : 'Có đơn nghỉ phép đã được phê duyệt'}
                  </small>
                </div>
              </div>
              <button type="button" className="button button-ghost roster-view-btn" onClick={() => onFilterTimesheet('ON_LEAVE')}>
                Lọc
              </button>
            </div>

            <div className="roster-person-list">
              {visibleLeave.length === 0 ? (
                <p className="roster-empty-note muted">Không có nhân viên nào nghỉ phép trong kỳ này.</p>
              ) : (
                visibleLeave.map(r => (
                  <div key={r.employeeId} className="roster-person-item">
                    <div className="roster-person-top">
                      <div>
                        <strong>{r.employeeCode} · {r.fullName}</strong>
                        <small className="muted"> · {r.departmentCode}</small>
                      </div>
                      <span className="badge badge-info">Nghỉ {r.approvedLeaveDays} ngày</span>
                    </div>
                    <div className="roster-person-meta">
                      <span>{r.leaveDetailsText}</span>
                    </div>
                    {r.presentDays > 0 && (
                      <div className="roster-person-sub muted">
                        Có đi làm xen kẽ {r.presentDays} ngày ({r.workingDatesList.join(', ')})
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
            <RosterColumnFooter
              shownCount={visibleLeave.length}
              totalCount={onLeaveRows.length}
              onShowMore={() => setLeaveLimit(v => v + ROSTER_STEP)}
              onCollapse={() => setLeaveLimit(INITIAL_ROSTER_LIMIT)}
              onOpenFullTable={() => onFilterTimesheet('ON_LEAVE')}
            />
          </div>

          {/* CỘT 3: NHÂN SỰ VẮNG KHÔNG PHÉP / CHƯA ĐIỂM DANH */}
          <div className="roster-column-card roster-col-absent">
            <div className="roster-col-header">
              <div className="roster-col-title">
                <WarningCircle size={20} weight="fill" color="#dc2626" />
                <div>
                  <strong>Vắng / Chưa đi làm ({absentRows.length.toLocaleString('vi-VN')})</strong>
                  <small className="muted">
                    {absentRows.length > visibleAbsent.length
                      ? `Đang hiện ${visibleAbsent.length}/${absentRows.length}`
                      : 'Chốt ABSENT hoặc chưa điểm danh'}
                  </small>
                </div>
              </div>
              <button type="button" className="button button-ghost roster-view-btn" onClick={() => onFilterTimesheet('ABSENT_UNEXCUSED')}>
                Lọc
              </button>
            </div>

            <div className="roster-person-list">
              {visibleAbsent.length === 0 ? (
                <p className="roster-empty-note muted">Đầy đủ quân số — không có nhân viên nào vắng không phép.</p>
              ) : (
                visibleAbsent.map(r => (
                  <div key={r.employeeId} className="roster-person-item">
                    <div className="roster-person-top">
                      <div>
                        <strong>{r.employeeCode} · {r.fullName}</strong>
                        <small className="muted"> · {r.departmentCode}</small>
                      </div>
                      <span className="badge badge-danger">
                        {r.absentDays > 0 ? `Vắng KP ${r.absentDays} ngày` : 'Chưa điểm danh'}
                      </span>
                    </div>
                    <div className="roster-person-meta">
                      <span>
                        {r.absentDatesList.length > 0
                          ? `Ngày vắng: ${r.absentDatesList.join(', ')}`
                          : 'Chưa ghi nhận quét mặt và không có đơn xin phép'}
                      </span>
                    </div>
                    <div className="roster-person-sub muted">
                      Bàn phụ trách: {r.assignedSeatText}
                    </div>
                  </div>
                ))
              )}
            </div>
            <RosterColumnFooter
              shownCount={visibleAbsent.length}
              totalCount={absentRows.length}
              onShowMore={() => setAbsentLimit(v => v + ROSTER_STEP)}
              onCollapse={() => setAbsentLimit(INITIAL_ROSTER_LIMIT)}
              onOpenFullTable={() => onFilterTimesheet('ABSENT_UNEXCUSED')}
            />
          </div>
        </div>
      )}
    </section>
  )
}

export function ReportingHubPage({ session }: { session: Session }) {
  const [activeTab, setActiveTab] = useState<ReportTab>('overview')
  const [periodMode, setPeriodMode] = useState<ReportPeriodMode>('monthly')
  const [slideDir, setSlideDir] = useState<'slide-right' | 'slide-left'>('slide-right')

  const handleSelectTab = (nextTab: ReportTab) => {
    if (nextTab === activeTab) return
    const prevIdx = TAB_ORDER.indexOf(activeTab)
    const nextIdx = TAB_ORDER.indexOf(nextTab)
    setSlideDir(nextIdx >= prevIdx ? 'slide-right' : 'slide-left')
    setActiveTab(nextTab)
  }

  const handleSelectPeriod = (nextMode: ReportPeriodMode) => {
    if (nextMode === periodMode) return
    const prevIdx = PERIOD_ORDER.indexOf(periodMode)
    const nextIdx = PERIOD_ORDER.indexOf(nextMode)
    setSlideDir(nextIdx >= prevIdx ? 'slide-right' : 'slide-left')
    setPeriodMode(nextMode)
  }

  const todayStr = officeDate()
  const [selectedDate, setSelectedDate] = useState(todayStr)
  const [selectedWeekDate, setSelectedWeekDate] = useState(todayStr)
  const [selectedMonth, setSelectedMonth] = useState(() => todayStr.slice(0, 7))
  const [customFromDate, setCustomFromDate] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 6)
    return officeDate(d)
  })
  const [customToDate, setCustomToDate] = useState(todayStr)
  const [selectedDepartment, setSelectedDepartment] = useState('')
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [timesheetFilter, setTimesheetFilter] = useState<TimesheetFilterStatus>('ALL')
  const [ratingFilter, setRatingFilter] = useState<TimesheetRatingFilter>('ALL')
  const [specialFilter, setSpecialFilter] = useState<TimesheetSpecialFilter>('ALL')
  const [sortBy, setSortBy] = useState<TimesheetSortBy>('DEFAULT')
  const [overviewChartMode, setOverviewChartMode] = useState<'department' | 'weekly_trend'>('department')
  const [timesheetSubView, setTimesheetSubView] = useState<'table' | 'roster_cards' | 'gate_logs'>('table')
  const [expandedEmpId, setExpandedEmpId] = useState<string | null>(null)
  const [occupancySubView, setOccupancySubView] = useState<'seats' | 'transitions'>('seats')
  const [securitySubView, setSecuritySubView] = useState<'ot_list' | 'incidents'>('ot_list')
  const [printMode, setPrintMode] = useState<'exceptions_only' | 'top_50' | 'all'>('exceptions_only')
  const [printOrientation, setPrintOrientation] = useState<'portrait' | 'landscape'>('portrait')
  const [printSections, setPrintSections] = useState({
    kpi: true,
    dept: true,
    roster: true,
    occSec: true,
  })
  const [openCsvMenu, setOpenCsvMenu] = useState<'header' | 'toolbar' | null>(null)
  const [tsPageSize, setTsPageSize] = useState(20)
  const [deptPages, setDeptPages] = useState<Record<string, number>>({})
  const [activeDeptTabId, setActiveDeptTabId] = useState<string>('')
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false)
  const [attLogPage, setAttLogPage] = useState(1)
  const [attLogPageSize, setAttLogPageSize] = useState(15)
  const [seatPage, setSeatPage] = useState(1)
  const [seatPageSize, setSeatPageSize] = useState(15)
  const [occLogPage, setOccLogPage] = useState(1)
  const [occLogPageSize, setOccLogPageSize] = useState(15)
  const [otPage, setOtPage] = useState(1)
  const [otPageSize, setOtPageSize] = useState(15)
  const [incPage, setIncPage] = useState(1)
  const [incPageSize, setIncPageSize] = useState(15)
  const [exportNotice, setExportNotice] = useState<string | null>(null)
  const [realtimeNotice, setRealtimeNotice] = useState<string | null>(null)
  const [printedAt, setPrintedAt] = useState(() => formatDateTime(new Date()))

  const noticeTimerRef = useRef<number | null>(null)
  const exportTimerRef = useRef<number | null>(null)
  const headerCsvMenuRef = useRef<HTMLDivElement>(null)
  const toolbarCsvMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!openCsvMenu) return
    const handleOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        !headerCsvMenuRef.current?.contains(target) &&
        !toolbarCsvMenuRef.current?.contains(target)
      ) {
        setOpenCsvMenu(null)
      }
    }
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenCsvMenu(null)
    }
    document.addEventListener('mousedown', handleOutside)
    document.addEventListener('keydown', handleEsc)
    return () => {
      document.removeEventListener('mousedown', handleOutside)
      document.removeEventListener('keydown', handleEsc)
    }
  }, [openCsvMenu])

  const lead = session.user.role === 'DEPT_LEAD'
  const scopedDepartment = lead ? session.user.departmentId : null
  const departmentId = scopedDepartment ?? (selectedDepartment || undefined)

  // 1. Danh sách phòng ban
  const loadDepartments = useCallback(
    (signal: AbortSignal) => (lead ? Promise.resolve([]) : listDepartments(session.accessToken, signal)),
    [lead, session.accessToken],
  )
  const departmentsQuery = useQuery(loadDepartments)

  // 2. Báo cáo tổng hợp Ngày / Tuần / Tháng (Read-model Reporting Module)
  const loadDaily = useCallback(async (signal: AbortSignal) => {
    departmentScope(session)
    const rows = await dailySummaries(session, selectedDate, signal)
    const filtered = departmentId ? rows.filter(r => r.departmentId === departmentId) : rows
    return { date: selectedDate, rows: filtered }
  }, [session, selectedDate, departmentId])
  const queryDaily = useQuery(loadDaily)

  const loadWeekly = useCallback(async (signal: AbortSignal) => {
    departmentScope(session)
    const report = await weeklyReport(session, selectedWeekDate, departmentId, signal)
    return { date: selectedWeekDate, report }
  }, [session, selectedWeekDate, departmentId])
  const queryWeekly = useQuery(loadWeekly)

  const [year, month] = selectedMonth.split('-').map(Number)
  const validPeriod = /^\d{4}-\d{2}$/.test(selectedMonth) && year >= 1 && year <= 9998 && month >= 1 && month <= 12
  const monthFilterKey = `${selectedMonth}/${departmentId ?? 'all'}`

  const loadMonthly = useCallback(async (signal: AbortSignal) => {
    departmentScope(session)
    if (!validPeriod) return null
    const report = await monthlyReport(session, { year, month, departmentId }, signal)
    return { key: monthFilterKey, report }
  }, [session, validPeriod, year, month, departmentId, monthFilterKey])
  const queryMonthly = useQuery(loadMonthly)

  const loadCustomRange = useCallback(async (signal: AbortSignal) => {
    departmentScope(session)
    if (periodMode !== 'custom') return null
    const rawFrom = customFromDate || selectedDate
    const rawTo = customToDate || selectedDate
    const safeFrom = rawFrom <= rawTo ? rawFrom : rawTo
    const safeTo = rawFrom <= rawTo ? rawTo : rawFrom
    const [fy, fm] = safeFrom.split('-').map(Number)
    const [ty, tm] = safeTo.split('-').map(Number)
    const months: Array<{ year: number; month: number }> = []
    let curY = fy
    let curM = fm
    while ((curY < ty || (curY === ty && curM <= tm)) && months.length < 6) {
      months.push({ year: curY, month: curM })
      curM += 1
      if (curM > 12) {
        curM = 1
        curY += 1
      }
    }
    const reports = await Promise.all(
      months.map(item => monthlyReport(session, { year: item.year, month: item.month, departmentId }, signal)),
    )
    const merged = reports
      .flatMap(rep => rep.dailyBreakdown)
      .filter(r => r.summaryDate >= safeFrom && r.summaryDate <= safeTo)
    return { key: `${safeFrom}_${safeTo}_${departmentId ?? 'all'}`, rows: merged }
  }, [session, periodMode, customFromDate, customToDate, selectedDate, departmentId])
  const queryCustomRange = useQuery(loadCustomRange)

  const dailyRows = useMemo(
    () => (queryDaily.data?.date === selectedDate ? queryDaily.data.rows : []),
    [queryDaily.data, selectedDate],
  )
  const weeklyData = queryWeekly.data?.date === selectedWeekDate ? queryWeekly.data.report : undefined
  const monthlyData = queryMonthly.data?.key === monthFilterKey ? queryMonthly.data.report : undefined

  // Khung ngày [fromDate, toDate] theo kỳ đang chọn
  const periodBounds = useMemo(
    () => computePeriodBounds(periodMode, selectedDate, selectedWeekDate, selectedMonth, weeklyData, customFromDate, customToDate),
    [periodMode, selectedDate, selectedWeekDate, selectedMonth, weeklyData, customFromDate, customToDate],
  )

  const customRangeRows = useMemo(() => {
    const key = `${periodBounds.fromDate}_${periodBounds.toDate}_${departmentId ?? 'all'}`
    return queryCustomRange.data?.key === key ? queryCustomRange.data.rows : []
  }, [queryCustomRange.data, periodBounds.fromDate, periodBounds.toDate, departmentId])

  // 3. Dữ liệu chi tiết từ các phân hệ Biometrics, Attendance, Occupancy, Security
  const loadOperationalData = useCallback(async (signal: AbortSignal) => {
    departmentScope(session)
    const [employees, attendanceLogs, leaveRequests, shifts, cameras, seats, occupancyLogs, incidents, otRegistrations] =
      await Promise.all([
        listEmployees(session.accessToken, departmentId, signal).catch(() => [] as Employee[]),
        listAttendanceLogs(session.accessToken, undefined, signal, {
          fromDate: periodBounds.fromDate,
          toDate: periodBounds.toDate,
        }).catch(() => [] as AttendanceRecord[]),
        listLeaves(session.accessToken, undefined, signal).catch(() => [] as LeaveRequest[]),
        listShifts(session.accessToken, signal).catch(() => [] as Shift[]),
        listCameras(session.accessToken, departmentId, signal).catch(() => [] as Camera[]),
        listSeats(session.accessToken, departmentId ? { departmentId } : undefined, signal).catch(() => [] as Seat[]),
        listOccupancyLogs(session.accessToken, 150, undefined, signal).catch(() => [] as SeatOccupancyLog[]),
        listSecurityIncidents(session.accessToken, { limit: 200 }, signal).catch(() => [] as SecurityIncident[]),
        listOtRegistrations(session.accessToken, undefined, signal).catch(() => [] as OtRegistration[]),
      ])

    return {
      key: `${periodBounds.fromDate}_${periodBounds.toDate}_${departmentId ?? 'all'}`,
      employees,
      attendanceLogs,
      leaveRequests,
      shifts,
      cameras,
      seats,
      occupancyLogs,
      incidents,
      otRegistrations,
    }
  }, [session, departmentId, periodBounds.fromDate, periodBounds.toDate])

  const queryOperational = useQuery(loadOperationalData)
  const opData = queryOperational.data

  // Tách hàm refresh ổn định cho SignalR & nút Làm mới
  const refreshDaily = queryDaily.refresh
  const refreshWeekly = queryWeekly.refresh
  const refreshMonthly = queryMonthly.refresh
  const refreshCustomRange = queryCustomRange.refresh
  const refreshOperational = queryOperational.refresh

  const handleRefresh = useCallback(() => {
    refreshDaily()
    refreshWeekly()
    refreshMonthly()
    refreshCustomRange()
    refreshOperational()
  }, [refreshDaily, refreshWeekly, refreshMonthly, refreshCustomRange, refreshOperational])

  const pushRealtimeToast = useCallback((msg: string) => {
    setRealtimeNotice(msg)
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current)
    noticeTimerRef.current = window.setTimeout(() => setRealtimeNotice(null), 6000)
  }, [])

  useEffect(() => {
    const unsubAtt = signalrService.onAttendanceRecorded(evt => {
      handleRefresh()
      const timeStr = new Date().toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
      const label = evt.status === 'ABSENT'
        ? `Đã chốt vắng mặt (${evt.employeeCode})`
        : `Vừa ghi nhận chấm công (${evt.employeeCode} · ${evt.status})`
      pushRealtimeToast(`⚡ ${label} lúc ${timeStr}. Số liệu báo cáo vừa tự động cập nhật!`)
    })

    const unsubSeat = signalrService.onSeatStateChanged(evt => {
      refreshOperational()
      const timeStr = new Date().toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
      pushRealtimeToast(`🪑 Trạm chỗ ngồi ${evt.seatCode} chuyển trạng thái ${evt.previousState} → ${evt.newState} lúc ${timeStr}.`)
    })

    const unsubSec = signalrService.onSecurityAlert(evt => {
      handleRefresh()
      pushRealtimeToast(`🚨 Phát hiện cảnh báo an ninh (${evt.alertLevel}) lúc ${formatTimeClock(evt.occurredOnUtc)}.`)
    })

    return () => {
      unsubAtt()
      unsubSeat()
      unsubSec()
      if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current)
      if (exportTimerRef.current) window.clearTimeout(exportTimerRef.current)
    }
  }, [handleRefresh, refreshOperational, pushRealtimeToast])

  // Lọc dữ liệu theo phòng ban đang chọn & kỳ phân tích
  const departmentsList = useMemo(() => departmentsQuery.data ?? [], [departmentsQuery.data])
  const employeesList = useMemo(() => {
    const raw = opData?.employees ?? []
    return departmentId ? raw.filter(e => e.departmentId === departmentId) : raw
  }, [opData?.employees, departmentId])

  const scopedEmpIds = useMemo(() => new Set(employeesList.map(e => e.id)), [employeesList])
  const scopedCameraIds = useMemo(() => new Set((opData?.cameras ?? []).map(c => c.id)), [opData?.cameras])
  const scopedSeatIds = useMemo(() => new Set((opData?.seats ?? []).map(s => s.id)), [opData?.seats])

  const periodAttendanceLogs = useMemo(() => {
    const logs = opData?.attendanceLogs ?? []
    return logs.filter(l => {
      if (l.workDate < periodBounds.fromDate || l.workDate > periodBounds.toDate) return false
      if (departmentId && !scopedEmpIds.has(l.employeeId)) return false
      return true
    })
  }, [opData?.attendanceLogs, periodBounds.fromDate, periodBounds.toDate, departmentId, scopedEmpIds])

  const scopedLeaves = useMemo(() => {
    const leaves = opData?.leaveRequests ?? []
    return leaves.filter(l => {
      if (departmentId && !scopedEmpIds.has(l.employeeId)) return false
      return l.endDate >= periodBounds.fromDate && l.startDate <= periodBounds.toDate
    })
  }, [opData?.leaveRequests, departmentId, scopedEmpIds, periodBounds.fromDate, periodBounds.toDate])

  const periodOtList = useMemo(() => {
    const ots = opData?.otRegistrations ?? []
    return ots
      .filter(ot => {
        if (ot.otDate < periodBounds.fromDate || ot.otDate > periodBounds.toDate) return false
        if (departmentId && !scopedEmpIds.has(ot.employeeId)) return false
        return true
      })
      .sort((a, b) => b.otDate.localeCompare(a.otDate))
  }, [opData?.otRegistrations, periodBounds.fromDate, periodBounds.toDate, departmentId, scopedEmpIds])

  const periodIncidents = useMemo(() => {
    const incs = opData?.incidents ?? []
    return incs
      .filter(inc => {
        const day = officeDate(new Date(inc.detectedAt))
        if (day < periodBounds.fromDate || day > periodBounds.toDate) return false
        if (departmentId) {
          const matchEmp = inc.detectedEmployeeId ? scopedEmpIds.has(inc.detectedEmployeeId) : false
          const matchCam = scopedCameraIds.has(inc.cameraId)
          return matchEmp || matchCam
        }
        return true
      })
      .sort((a, b) => b.detectedAt.localeCompare(a.detectedAt))
  }, [opData?.incidents, periodBounds.fromDate, periodBounds.toDate, departmentId, scopedEmpIds, scopedCameraIds])

  // Dữ liệu Read-Model tổng hợp phòng ban tương ứng với kỳ đang chọn
  const activeSummaryRows: DailyDepartmentSummary[] = useMemo(() => {
    if (periodMode === 'daily') return dailyRows
    if (periodMode === 'weekly') return weeklyData?.dailyBreakdown ?? []
    if (periodMode === 'custom') return customRangeRows
    return monthlyData?.dailyBreakdown ?? []
  }, [periodMode, dailyRows, weeklyData?.dailyBreakdown, customRangeRows, monthlyData?.dailyBreakdown])

  const activeDepartmentGroups = useMemo(
    () => summarizeDepartments(activeSummaryRows),
    [activeSummaryRows],
  )

  const sortedEmployeeOptions = useMemo(
    () =>
      [...employeesList].sort((a, b) => a.employeeCode.localeCompare(b.employeeCode, 'vi')),
    [employeesList],
  )

  const effectiveEmployeeId = useMemo(
    () => (selectedEmployeeId && employeesList.some(e => e.id === selectedEmployeeId) ? selectedEmployeeId : ''),
    [selectedEmployeeId, employeesList],
  )

  const selectedEmployeeObj = useMemo(
    () => (effectiveEmployeeId ? employeesList.find(e => e.id === effectiveEmployeeId) ?? null : null),
    [effectiveEmployeeId, employeesList],
  )

  // Tổng hợp Bảng Chấm công Chi tiết Nhân viên
  const allTimesheetRows = useMemo(
    () =>
      buildEmployeeTimesheet({
        employees: employeesList,
        departments: departmentsList,
        attendanceLogs: periodAttendanceLogs,
        leaveRequests: scopedLeaves,
        otRegistrations: periodOtList,
        shifts: opData?.shifts ?? [],
        seats: opData?.seats ?? [],
        fromDate: periodBounds.fromDate,
        toDate: periodBounds.toDate,
      }),
    [
      employeesList,
      departmentsList,
      periodAttendanceLogs,
      scopedLeaves,
      periodOtList,
      opData?.shifts,
      opData?.seats,
      periodBounds.fromDate,
      periodBounds.toDate,
    ],
  )

  const employee360Row = useMemo(
    () => (effectiveEmployeeId ? allTimesheetRows.find(r => r.employeeId === effectiveEmployeeId) ?? null : null),
    [effectiveEmployeeId, allTimesheetRows],
  )

  const normalizedSearch = searchQuery.trim().toLowerCase()

  const searchMatchedRows = useMemo(() => {
    return allTimesheetRows.filter(row => {
      if (effectiveEmployeeId && row.employeeId !== effectiveEmployeeId) return false
      if (!normalizedSearch) return true
      const hay = `${row.employeeCode} ${row.fullName} ${row.departmentCode} ${row.departmentName} ${row.leaveDetailsText} ${row.assignedSeatText}`.toLowerCase()
      return hay.includes(normalizedSearch)
    })
  }, [allTimesheetRows, effectiveEmployeeId, normalizedSearch])

  const workingRoster = useMemo(
    () => searchMatchedRows.filter(r => r.presentDays > 0),
    [searchMatchedRows],
  )
  const onLeaveRoster = useMemo(
    () => searchMatchedRows.filter(r => r.approvedLeaveDays > 0),
    [searchMatchedRows],
  )
  const absentRoster = useMemo(
    () => searchMatchedRows.filter(r => r.absentDays > 0 || (r.presentDays === 0 && r.approvedLeaveDays === 0)),
    [searchMatchedRows],
  )
  const lateWarningRoster = useMemo(
    () => searchMatchedRows.filter(r => r.lateDays > 0 || r.earlyLeaveDays > 0),
    [searchMatchedRows],
  )

  const filteredTimesheetRows = useMemo(() => {
    const filtered = searchMatchedRows.filter(row => {
      if (timesheetFilter === 'WORKING' && row.presentDays === 0) return false
      if (timesheetFilter === 'ON_TIME_ONLY' && (row.presentDays === 0 || row.lateDays > 0 || row.earlyLeaveDays > 0)) return false
      if (timesheetFilter === 'ON_LEAVE' && row.approvedLeaveDays === 0) return false
      if (timesheetFilter === 'ABSENT_UNEXCUSED' && row.absentDays === 0 && !(row.presentDays === 0 && row.approvedLeaveDays === 0)) return false
      if (timesheetFilter === 'LATE_WARNING' && row.lateDays === 0 && row.earlyLeaveDays === 0) return false
      if (ratingFilter !== 'ALL' && row.ratingLabel !== ratingFilter) return false
      if (specialFilter === 'HAS_OT' && row.approvedOtHours <= 0) return false
      if (specialFilter === 'HAS_SEAT' && row.assignedSeatText === 'Chưa gán bàn') return false
      if (specialFilter === 'NO_SEAT' && row.assignedSeatText !== 'Chưa gán bàn') return false
      if (specialFilter === 'FACE_REGISTERED' && row.registeredVectorCount <= 0) return false
      if (specialFilter === 'NO_FACE' && row.registeredVectorCount > 0) return false
      return true
    })

    if (sortBy === 'DEFAULT') return filtered
    return [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'CODE_ASC':
          return a.employeeCode.localeCompare(b.employeeCode, 'vi')
        case 'NAME_ASC':
          return a.fullName.localeCompare(b.fullName, 'vi')
        case 'RATE_DESC':
          return b.attendanceRatePercent - a.attendanceRatePercent || b.presentDays - a.presentDays
        case 'RATE_ASC':
          return a.attendanceRatePercent - b.attendanceRatePercent || b.absentDays - a.absentDays
        case 'LATE_MINS_DESC':
          return b.totalLateMinutes - a.totalLateMinutes || b.lateDays - a.lateDays
        case 'WORK_HOURS_DESC':
          return b.totalWorkHours - a.totalWorkHours || b.presentDays - a.presentDays
        case 'OT_HOURS_DESC':
          return b.approvedOtHours - a.approvedOtHours || b.totalWorkHours - a.totalWorkHours
        default:
          return 0
      }
    })
  }, [searchMatchedRows, timesheetFilter, ratingFilter, specialFilter, sortBy])

  const scopedAttendanceLogs = useMemo(() => {
    return periodAttendanceLogs.filter(log => {
      if (effectiveEmployeeId && log.employeeId !== effectiveEmployeeId) return false
      if (!normalizedSearch) return true
      const hay = `${log.employeeCode} ${log.employeeFullName} ${log.status}`.toLowerCase()
      return hay.includes(normalizedSearch)
    })
  }, [periodAttendanceLogs, effectiveEmployeeId, normalizedSearch])

  // Tổng hợp Occupancy & Space Utilization
  const periodProlongedEvents = useMemo(
    () => activeSummaryRows.reduce((sum, r) => sum + r.prolongedAwayEvents, 0),
    [activeSummaryRows],
  )

  const scopedOccupancyLogs = useMemo(() => {
    const logs = opData?.occupancyLogs ?? []
    return departmentId ? logs.filter(l => scopedSeatIds.has(l.seatId)) : logs
  }, [opData?.occupancyLogs, departmentId, scopedSeatIds])

  const occupancySummary = useMemo(
    () =>
      buildOccupancyReportSummary({
        seats: opData?.seats ?? [],
        cameras: opData?.cameras ?? [],
        departments: departmentsList,
        occupancyLogs: scopedOccupancyLogs,
        periodProlongedAwayEvents: periodProlongedEvents,
      }),
    [opData?.seats, opData?.cameras, departmentsList, scopedOccupancyLogs, periodProlongedEvents],
  )

  const filteredSeatRows = useMemo(() => {
    return occupancySummary.seatRows.filter(s => {
      if (effectiveEmployeeId) {
        const matchId = s.assignedEmployeeId === effectiveEmployeeId
        const matchCode = selectedEmployeeObj ? s.assignedEmployeeCode === selectedEmployeeObj.employeeCode : false
        if (!matchId && !matchCode) return false
      }
      if (!normalizedSearch) return true
      const hay = `${s.seatCode} ${s.seatName} ${s.cameraCode} ${s.departmentCode} ${s.assignedEmployeeCode ?? ''} ${s.assignedEmployeeName ?? ''}`.toLowerCase()
      return hay.includes(normalizedSearch)
    })
  }, [occupancySummary.seatRows, effectiveEmployeeId, selectedEmployeeObj, normalizedSearch])

  // Tổng hợp An ninh & OT
  const securityOtSummary = useMemo(
    () =>
      buildSecurityOtReportSummary({
        incidents: periodIncidents,
        otRegistrations: periodOtList,
        fromDate: periodBounds.fromDate,
        toDate: periodBounds.toDate,
      }),
    [periodIncidents, periodOtList, periodBounds.fromDate, periodBounds.toDate],
  )

  const filteredOtList = useMemo(() => {
    return periodOtList.filter(ot => {
      if (effectiveEmployeeId && ot.employeeId !== effectiveEmployeeId) return false
      if (!normalizedSearch) return true
      const hay = `${ot.employeeCode} ${ot.employeeFullName} ${ot.reason ?? ''}`.toLowerCase()
      return hay.includes(normalizedSearch)
    })
  }, [periodOtList, effectiveEmployeeId, normalizedSearch])

  const filteredIncidents = useMemo(() => {
    return periodIncidents.filter(inc => {
      if (effectiveEmployeeId && inc.detectedEmployeeId !== effectiveEmployeeId) return false
      if (!normalizedSearch) return true
      const hay = `${inc.detectedEmployeeCode ?? ''} ${inc.detectedEmployeeName ?? ''} ${inc.alertLevel} ${inc.actionSummary} ${inc.resolutionNote ?? ''}`.toLowerCase()
      return hay.includes(normalizedSearch)
    })
  }, [periodIncidents, effectiveEmployeeId, normalizedSearch])

  // Gom nhóm bảng chấm công theo từng phòng ban & phân trang cho các bảng dữ liệu quy mô lớn (1.000+ bản ghi)
  const timesheetDeptGroups = useMemo(
    () => groupTimesheetRowsByDepartment(filteredTimesheetRows),
    [filteredTimesheetRows],
  )
  const effectiveDeptTabId = useMemo(() => {
    if (timesheetDeptGroups.length === 0) return ''
    if (activeDeptTabId && timesheetDeptGroups.some(g => g.departmentId === activeDeptTabId)) {
      return activeDeptTabId
    }
    return timesheetDeptGroups[0]!.departmentId
  }, [timesheetDeptGroups, activeDeptTabId])

  const currentDeptGroup = useMemo(
    () => timesheetDeptGroups.find(g => g.departmentId === effectiveDeptTabId) ?? timesheetDeptGroups[0] ?? null,
    [timesheetDeptGroups, effectiveDeptTabId],
  )

  const advancedFilterCount =
    (timesheetFilter !== 'ALL' ? 1 : 0) +
    (ratingFilter !== 'ALL' ? 1 : 0) +
    (specialFilter !== 'ALL' ? 1 : 0) +
    (sortBy !== 'DEFAULT' ? 1 : 0)

  const pagedAttLogs = paginateSlice(scopedAttendanceLogs, attLogPage, attLogPageSize)
  const pagedSeats = paginateSlice(filteredSeatRows, seatPage, seatPageSize)
  const pagedOccLogs = paginateSlice(scopedOccupancyLogs, occLogPage, occLogPageSize)
  const pagedOtList = paginateSlice(filteredOtList, otPage, otPageSize)
  const pagedIncidents = paginateSlice(filteredIncidents, incPage, incPageSize)

  // Dữ liệu hiển thị trên Phiếu Báo cáo In A4
  const printExceptionsRows = useMemo(
    () =>
      filteredTimesheetRows.filter(
        r =>
          r.approvedLeaveDays > 0 ||
          r.absentDays > 0 ||
          r.lateDays > 0 ||
          r.earlyLeaveDays > 0 ||
          r.approvedOtHours > 0 ||
          r.presentDays === 0,
      ),
    [filteredTimesheetRows],
  )

  const printTimesheetRows = useMemo(() => {
    if (printMode === 'all') return filteredTimesheetRows
    if (printMode === 'top_50') return filteredTimesheetRows.slice(0, 50)
    // exceptions_only: nếu tổng danh sách <= 20 thì in hết cho đầy đủ, nếu đông (>20) thì chỉ in các trường hợp ngoại lệ
    return filteredTimesheetRows.length <= 20 ? filteredTimesheetRows : printExceptionsRows
  }, [printMode, filteredTimesheetRows, printExceptionsRows])

  const printTimesheetDeptGroups = useMemo(
    () => groupTimesheetRowsByDepartment(printTimesheetRows),
    [printTimesheetRows],
  )

  const workingByDeptSummary = useMemo(() => {
    const map = new Map<string, { code: string; count: number; hours: number }>()
    for (const r of workingRoster) {
      const item = map.get(r.departmentCode) ?? { code: r.departmentCode, count: 0, hours: 0 }
      item.count += 1
      item.hours += r.totalWorkHours
      map.set(r.departmentCode, item)
    }
    return [...map.values()].sort((a, b) => a.code.localeCompare(b.code, 'vi'))
  }, [workingRoster])

  // Chỉ số tổng hợp toàn kỳ (phục vụ Overview & Print Sheet)
  const timesheetAggregates = useMemo(() => {
    const totalEmployees = allTimesheetRows.length
    const totalPresentDays = allTimesheetRows.reduce((s, r) => s + r.presentDays, 0)
    const totalOnTimeDays = allTimesheetRows.reduce((s, r) => s + r.onTimeDays, 0)
    const totalLateDays = allTimesheetRows.reduce((s, r) => s + r.lateDays, 0)
    const totalLateMinutes = allTimesheetRows.reduce((s, r) => s + r.totalLateMinutes, 0)
    const totalAbsentDays = allTimesheetRows.reduce((s, r) => s + r.absentDays, 0)
    const totalLeaveDays = allTimesheetRows.reduce((s, r) => s + r.approvedLeaveDays, 0)
    const totalWorkHours = Math.round(allTimesheetRows.reduce((s, r) => s + r.totalWorkHours, 0) * 10) / 10
    const totalOtHours = Math.round(allTimesheetRows.reduce((s, r) => s + r.approvedOtHours, 0) * 10) / 10
    const withConf = allTimesheetRows.filter(r => r.avgMatchConfidence > 0)
    const avgAiConf = withConf.length > 0
      ? Math.round((withConf.reduce((s, r) => s + r.avgMatchConfidence, 0) / withConf.length) * 10) / 10
      : 0
    const considered = totalPresentDays + totalAbsentDays
    const attendanceRate = considered > 0 ? Math.round((totalPresentDays / considered) * 1000) / 10 : 0
    const onTimeRate = totalPresentDays > 0 ? Math.round((totalOnTimeDays / totalPresentDays) * 1000) / 10 : 0

    return {
      totalEmployees,
      totalPresentDays,
      totalOnTimeDays,
      totalLateDays,
      totalLateMinutes,
      totalAbsentDays,
      totalLeaveDays,
      totalWorkHours,
      totalOtHours,
      avgAiConf,
      attendanceRate,
      onTimeRate,
    }
  }, [allTimesheetRows])

  // Cộng thêm giờ làm & OT vào từng phòng ban ở bảng Tổng hợp
  const deptWorkHoursMap = useMemo(() => {
    const map = new Map<string, { empCount: number; workHours: number; otHours: number }>()
    for (const row of allTimesheetRows) {
      const cur = map.get(row.departmentId) ?? { empCount: 0, workHours: 0, otHours: 0 }
      cur.empCount += 1
      cur.workHours += row.totalWorkHours
      cur.otHours += row.approvedOtHours
      map.set(row.departmentId, cur)
    }
    return map
  }, [allTimesheetRows])

  const selectedDepartmentName = departmentsList.find(d => d.id === departmentId)?.departmentName
  const baseScopeLabel = lead
    ? 'Phòng ban của bạn'
    : selectedDepartmentName ?? (departmentId ? 'Phòng ban đã chọn' : 'Toàn bộ công ty (Tất cả phòng ban)')
  const scopeLabel = selectedEmployeeObj
    ? `${baseScopeLabel} · Cá nhân: ${selectedEmployeeObj.employeeCode} – ${selectedEmployeeObj.fullName}`
    : baseScopeLabel

  const resetAllEmployeeFilters = () => {
    setSelectedEmployeeId('')
    setTimesheetFilter('ALL')
    setRatingFilter('ALL')
    setSpecialFilter('ALL')
    setSortBy('DEFAULT')
    setSearchQuery('')
    setDeptPages({})
    setAttLogPage(1)
    setSeatPage(1)
    setOtPage(1)
    setIncPage(1)
  }

  const handleSelectEmployeeFilter = (empId: string) => {
    setSelectedEmployeeId(empId)
    setDeptPages({})
    setAttLogPage(1)
    setSeatPage(1)
    setOtPage(1)
    setIncPage(1)
  }

  const handleDrillDownDepartment = (deptId: string) => {
    if (!lead) {
      setSelectedDepartment(deptId)
      setSelectedEmployeeId('')
    }
    setActiveDeptTabId(deptId)
    setTimesheetSubView('table')
    setDeptPages({})
    handleSelectTab('timesheet')
  }

  // Hàm điều chỉnh ngày / tuần
  const adjustDailyDate = (offsetDays: number) => {
    const [y, m, d] = selectedDate.split('-').map(Number)
    const cur = new Date(y, m - 1, d)
    cur.setDate(cur.getDate() + offsetDays)
    setSelectedDate(officeDate(cur))
  }

  const adjustWeekDate = (offsetWeeks: number) => {
    const [y, m, d] = selectedWeekDate.split('-').map(Number)
    const cur = new Date(y, m - 1, d)
    cur.setDate(cur.getDate() + offsetWeeks * 7)
    setSelectedWeekDate(officeDate(cur))
  }

  const showExportToast = (message: string) => {
    setExportNotice(message)
    if (exportTimerRef.current) window.clearTimeout(exportTimerRef.current)
    exportTimerRef.current = window.setTimeout(() => setExportNotice(null), 5500)
  }

  // Xuất Sổ tay Excel Đa Sheet đồng bộ 1:1 với Phiếu Preview (.xls - Sheet 1 giống bản in, Sheet 2-4 phụ lục)
  const handleExportFullExcelWorkbook = () => {
    const workingByDeptText =
      workingByDeptSummary.length > 0
        ? workingByDeptSummary.map(d => `${d.code}: ${d.count} (${d.hours.toFixed(1)}h)`).join(' · ')
        : 'Chưa ghi nhận nhân sự có mặt.'

    const onLeavePreviewList = onLeaveRoster
      .slice(0, 8)
      .map(r => `• ${r.employeeCode} · ${r.fullName} (${r.leaveDetailsText})`)
    if (onLeaveRoster.length > 8) {
      onLeavePreviewList.push(`+ ${(onLeaveRoster.length - 8).toLocaleString('vi-VN')} nhân sự khác (xem Sheet 2)`)
    }

    const absentPreviewList = absentRoster
      .slice(0, 8)
      .map(r => `• ${r.employeeCode} · ${r.fullName} (${r.absentDays > 0 ? `Vắng ${r.absentDays} ngày` : 'Chưa chấm công'})`)
    if (absentRoster.length > 8) {
      absentPreviewList.push(`+ ${(absentRoster.length - 8).toLocaleString('vi-VN')} nhân sự khác (xem Sheet 2)`)
    }

    const file = exportMultiSheetExcelWorkbook({
      fileTag: periodBounds.fileTag,
      periodLabel: periodBounds.label,
      fromDate: periodBounds.fromDate,
      toDate: periodBounds.toDate,
      scopeLabel,
      generatedBy: session.user.fullName,
      generatedAt: formatDateTime(new Date()),
      printOrientation,
      printSections,
      kpis: {
        totalEmployees: timesheetAggregates.totalEmployees,
        workingCount: workingRoster.length,
        onLeaveCount: onLeaveRoster.length,
        absentRosterCount: absentRoster.length,
        attendanceRate: timesheetAggregates.attendanceRate,
        onTimeRate: timesheetAggregates.onTimeRate,
        totalPresentDays: timesheetAggregates.totalPresentDays,
        totalOnTimeDays: timesheetAggregates.totalOnTimeDays,
        totalLateDays: timesheetAggregates.totalLateDays,
        totalLateMinutes: timesheetAggregates.totalLateMinutes,
        totalAbsentDays: timesheetAggregates.totalAbsentDays,
        totalLeaveDays: timesheetAggregates.totalLeaveDays,
        totalWorkHours: timesheetAggregates.totalWorkHours,
        totalOtHours: timesheetAggregates.totalOtHours,
        spaceUtilizationPercent: occupancySummary.spaceUtilizationPercent,
        totalDesks: occupancySummary.totalDesks,
        presentDesks: occupancySummary.presentCount,
        totalIncidents: securityOtSummary.totalIncidents,
        resolutionRatePercent: securityOtSummary.resolutionRatePercent,
      },
      departmentGroups: activeDepartmentGroups,
      deptWorkHoursMap,
      printTimesheetRows,
      timesheetRows: filteredTimesheetRows,
      workingByDeptText,
      onLeavePreviewList,
      absentPreviewList,
      occupancySummary,
      seatRows: filteredSeatRows,
      otList: filteredOtList,
      incidents: filteredIncidents,
      securityOtSummary,
    })
    setOpenCsvMenu(null)
    showExportToast(
      `Đã xuất Excel ${file}: Sheet 1 giống hệt Phiếu A4 Preview (kèm Quốc hiệu, 6 KPI, Quân số, Bảng đối soát & Chữ ký), Sheet 2–4 là Phụ lục chi tiết.`,
    )
  }

  // Xuất CSV phẳng chuẩn kiểm toán (kèm dòng TỔNG CỘNG / TRUNG BÌNH)
  const handleExportDepartmentCsv = () => {
    const headers = [
      'PhongBan',
      'SoNgayGhiNhan',
      'DungGio',
      'DiMuon',
      'VangMat',
      'RoiBanQuaHan',
      'CanhBaoAnNinh',
      'TongGioLam(h)',
      'TongGioOT(h)',
      'TyLeChuyenCan(%)',
    ]
    let sumOnTime = 0
    let sumLate = 0
    let sumAbsent = 0
    let sumProlonged = 0
    let sumAlerts = 0
    let sumHours = 0
    let sumOt = 0
    let sumConsidered = 0

    const rows: (string | number)[][] = activeDepartmentGroups.map(g => {
      const present = g.onTime + g.late
      const total = g.total
      const rate = total > 0 ? ((present / total) * 100).toFixed(1) : '0.0'
      const extra = deptWorkHoursMap.get(g.departmentId)
      const workH = extra ? extra.workHours : 0
      const otH = extra ? extra.otHours : 0
      sumOnTime += g.onTime
      sumLate += g.late
      sumAbsent += g.absent
      sumProlonged += g.prolongedAway
      sumAlerts += g.securityAlerts
      sumHours += workH
      sumOt += otH
      sumConsidered += total
      return [
        g.departmentCode,
        g.daysRecorded,
        g.onTime,
        g.late,
        g.absent,
        g.prolongedAway,
        g.securityAlerts,
        workH.toFixed(1),
        otH.toFixed(1),
        rate,
      ]
    })

    const totalRate = sumConsidered > 0 ? (((sumOnTime + sumLate) / sumConsidered) * 100).toFixed(1) : '0.0'
    rows.push([
      'TONG CONG / TOAN DON VI',
      activeDepartmentGroups.length,
      sumOnTime,
      sumLate,
      sumAbsent,
      sumProlonged,
      sumAlerts,
      sumHours.toFixed(1),
      sumOt.toFixed(1),
      totalRate,
    ])

    const file = exportCustomCsv(`SmartOffice_TongHopPhongBan_${periodBounds.fileTag}.csv`, headers, rows)
    setOpenCsvMenu(null)
    showExportToast(`Đã xuất tệp CSV ${file} (UTF-8 BOM, kèm dòng Tổng cộng).`)
  }

  const handleExportTimesheetCsv = () => {
    const headers = [
      'MaNV',
      'HoTen',
      'PhongBan',
      'TrangThaiLamNghi',
      'NgayCoMat',
      'DungGio',
      'DiMuon',
      'TongPhutMuon',
      'VeSom',
      'TongPhutVeSom',
      'NghiPhep',
      'VangKhongPhep',
      'CacNgayDiLam',
      'CacNgayVangKP',
      'ChiTietNghiPhep',
      'BanLamViec',
      'GioVaoTB',
      'GioRaTB',
      'TongGioLam(h)',
      'GioOT(h)',
      'DoTinCayAI(%)',
      'TyLeChuyenCan(%)',
      'XepLoai',
    ]
    let sumPresent = 0
    let sumOnTime = 0
    let sumLate = 0
    let sumLateMin = 0
    let sumEarly = 0
    let sumEarlyMin = 0
    let sumLeave = 0
    let sumAbsent = 0
    let sumWorkH = 0
    let sumOtH = 0
    let sumConf = 0
    let confCount = 0
    let sumRate = 0

    const rows: (string | number)[][] = []

    timesheetDeptGroups.forEach((deptGrp, deptIdx) => {
      rows.push([
        `PHONG BAN ${deptIdx + 1}/${timesheetDeptGroups.length}`,
        `${deptGrp.departmentCode} - ${deptGrp.departmentName}`,
        deptGrp.departmentCode,
        `${deptGrp.rows.length} nhan su (Di lam: ${deptGrp.workingCount}, Phep: ${deptGrp.onLeaveCount}, Vang: ${deptGrp.absentCount})`,
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
      ])

      let deptConfSum = 0
      let deptConfCount = 0

      deptGrp.rows.forEach(r => {
        sumPresent += r.presentDays
        sumOnTime += r.onTimeDays
        sumLate += r.lateDays
        sumLateMin += r.totalLateMinutes
        sumEarly += r.earlyLeaveDays
        sumEarlyMin += r.totalEarlyLeaveMinutes
        sumLeave += r.approvedLeaveDays
        sumAbsent += r.absentDays
        sumWorkH += r.totalWorkHours
        sumOtH += r.approvedOtHours
        sumRate += r.attendanceRatePercent
        if (r.avgMatchConfidence > 0) {
          sumConf += r.avgMatchConfidence
          confCount += 1
          deptConfSum += r.avgMatchConfidence
          deptConfCount += 1
        }
        rows.push([
          r.employeeCode,
          r.fullName,
          r.departmentCode,
          r.workStatusLabel,
          r.presentDays,
          r.onTimeDays,
          r.lateDays,
          r.totalLateMinutes,
          r.earlyLeaveDays,
          r.totalEarlyLeaveMinutes,
          r.approvedLeaveDays,
          r.absentDays,
          r.workingDatesList.join(' | '),
          r.absentDatesList.join(' | '),
          r.leaveDetailsText,
          r.assignedSeatText,
          r.firstCheckInText,
          r.lastCheckOutText,
          r.totalWorkHours.toFixed(1),
          r.approvedOtHours.toFixed(1),
          r.avgMatchConfidence.toFixed(1),
          r.attendanceRatePercent.toFixed(1),
          r.ratingLabel,
        ])
      })

      rows.push([
        `CONG PHONG ${deptGrp.departmentCode}`,
        `${deptGrp.rows.length} nhan su`,
        deptGrp.departmentCode,
        `Di lam: ${deptGrp.workingCount} | Phep: ${deptGrp.onLeaveCount} | Vang: ${deptGrp.absentCount}`,
        deptGrp.totalPresentDays,
        deptGrp.totalOnTimeDays,
        deptGrp.totalLateDays,
        deptGrp.totalLateMinutes,
        deptGrp.totalEarlyLeaveDays,
        deptGrp.totalEarlyLeaveMinutes,
        deptGrp.totalLeaveDays,
        deptGrp.totalAbsentDays,
        '',
        '',
        '',
        '',
        '—',
        '—',
        deptGrp.totalWorkHours.toFixed(1),
        deptGrp.totalOtHours.toFixed(1),
        deptConfCount > 0 ? (deptConfSum / deptConfCount).toFixed(1) : '0.0',
        deptGrp.avgAttendanceRatePercent.toFixed(1),
        `TB phong ${deptGrp.departmentCode}`,
      ])
    })

    const count = filteredTimesheetRows.length
    rows.push([
      'TONG CONG TOAN DON VI',
      `${count} nhan su / ${timesheetDeptGroups.length} phong ban`,
      scopeLabel,
      `${periodBounds.label}`,
      sumPresent,
      sumOnTime,
      sumLate,
      sumLateMin,
      sumEarly,
      sumEarlyMin,
      sumLeave,
      sumAbsent,
      '',
      '',
      '',
      '',
      '—',
      '—',
      sumWorkH.toFixed(1),
      sumOtH.toFixed(1),
      confCount > 0 ? (sumConf / confCount).toFixed(1) : '0.0',
      count > 0 ? (sumRate / count).toFixed(1) : '0.0',
      'TB toan danh sach',
    ])

    const file = exportCustomCsv(`SmartOffice_BangCongNhanVien_${periodBounds.fileTag}.csv`, headers, rows)
    setOpenCsvMenu(null)
    showExportToast(`Đã xuất tệp CSV ${file} (${count} nhân sự, tách ${timesheetDeptGroups.length} phòng ban, UTF-8 BOM).`)
  }

  const handleExportOccupancyCsv = () => {
    const headers = [
      'MaBan',
      'TenViTri',
      'LoaiVung',
      'Camera',
      'PhongBan',
      'NhanVienPhuTrach',
      'TrangThaiFSM',
      'ThoiGianHienDien(phut)',
      'HieuSuatSuDung(%)',
    ]
    let sumMins = 0
    let sumUtil = 0
    const rows: (string | number)[][] = filteredSeatRows.map(s => {
      const mins = Math.round(s.activeSecondsToday / 60)
      sumMins += mins
      sumUtil += s.utilizationPercent
      return [
        s.seatCode,
        s.seatName,
        s.zoneType === 'RESTRICTED_ZONE' ? 'Vùng hạn chế' : 'Bàn làm việc',
        s.cameraCode,
        s.departmentCode,
        s.assignedEmployeeName ? `${s.assignedEmployeeCode} - ${s.assignedEmployeeName}` : 'Chưa gán',
        seatStateMeta[s.currentState]?.label ?? s.currentState,
        mins,
        s.utilizationPercent.toFixed(1),
      ]
    })

    rows.push([
      'TONG CONG',
      `${filteredSeatRows.length} vi tri`,
      '',
      '',
      scopeLabel,
      '',
      `Dang ngoi: ${occupancySummary.presentCount}/${occupancySummary.totalDesks}`,
      sumMins,
      filteredSeatRows.length > 0 ? (sumUtil / filteredSeatRows.length).toFixed(1) : '0.0',
    ])

    const file = exportCustomCsv(`SmartOffice_HieuSuatChoNgoi_${periodBounds.fileTag}.csv`, headers, rows)
    setOpenCsvMenu(null)
    showExportToast(`Đã xuất tệp CSV ${file} (UTF-8 BOM kèm dòng Tổng hợp).`)
  }

  const handleExportSecurityOtCsv = () => {
    const headers = [
      'PhanLoai',
      'ThoiDiem_Ngay',
      'NhanSuLienQuan',
      'MucDo_KhungGio',
      'ThoiLuong_OT(h)',
      'TrangThai',
      'ChiTiet_LyDo',
    ]
    const otRows: (string | number)[][] = filteredOtList.map(ot => {
      const hrs = calculateOtDurationHours(ot.startTime, ot.endTime, ot.isOvernight)
      return [
        'DANG_KY_OT',
        ot.otDate,
        `${ot.employeeCode} - ${ot.employeeFullName}`,
        `${ot.startTime.slice(0, 5)} - ${ot.endTime.slice(0, 5)}${ot.isOvernight ? ' (Qua đêm)' : ''}`,
        hrs.toFixed(1),
        otApprovalMeta[ot.approvalStatus]?.label ?? ot.approvalStatus,
        ot.reason || '',
      ]
    })
    const incidentRows: (string | number)[][] = filteredIncidents.map(inc => [
      'SU_CO_AN_NINH',
      formatDateTime(inc.detectedAt),
      inc.detectedEmployeeName ? `${inc.detectedEmployeeCode} - ${inc.detectedEmployeeName}` : 'Người lạ chưa định danh',
      alertLevelMeta[inc.alertLevel]?.label ?? inc.alertLevel,
      '0.0',
      ticketStatusMeta[inc.ticketStatus]?.label ?? inc.ticketStatus,
      inc.resolutionNote || inc.actionSummary,
    ])

    const summaryRow: (string | number)[] = [
      'TONG HOP KY',
      periodBounds.label,
      `OT: ${filteredOtList.length} ca | Su co: ${filteredIncidents.length}`,
      `SLA: ${securityOtSummary.resolutionRatePercent}%`,
      securityOtSummary.totalApprovedOtHours.toFixed(1),
      `Da duyet ${securityOtSummary.approvedOtCount} ca OT`,
      `Muc 3: ${securityOtSummary.level3Breach} | Spoofing: ${securityOtSummary.spoofingAttempts}`,
    ]

    const file = exportCustomCsv(
      `SmartOffice_AnNinh_OT_${periodBounds.fileTag}.csv`,
      headers,
      [...otRows, ...incidentRows, summaryRow],
    )
    setOpenCsvMenu(null)
    showExportToast(`Đã xuất tệp CSV ${file} (UTF-8 BOM kèm tổng hợp OT & SOC).`)
  }

  const handleExportActiveTab = () => {
    if (activeTab === 'timesheet') handleExportTimesheetCsv()
    else if (activeTab === 'occupancy') handleExportOccupancyCsv()
    else if (activeTab === 'security_ot') handleExportSecurityOtCsv()
    else handleExportDepartmentCsv()
  }

  const handlePrintReport = () => {
    setPrintedAt(formatDateTime(new Date()))
    setOpenCsvMenu(null)
    if (activeTab !== 'print_sheet') {
      handleSelectTab('print_sheet')
      window.setTimeout(() => window.print(), 200)
    } else {
      window.print()
    }
  }

  const isLoadingAny =
    queryDaily.loading || queryWeekly.loading || queryMonthly.loading || queryCustomRange.loading || queryOperational.loading

  // 4 KPI cốt lõi cho Tab Tổng quan điều hành
  const overviewStats: KpiStat[] = [
    {
      label: 'Tỷ lệ chuyên cần',
      value: timesheetAggregates.attendanceRate,
      unit: '%',
      tone: timesheetAggregates.attendanceRate >= 90 ? 'success' : timesheetAggregates.attendanceRate >= 75 ? 'warning' : 'danger',
      note: `${timesheetAggregates.totalOnTimeDays} đúng giờ / ${timesheetAggregates.totalPresentDays} ngày công`,
    },
    {
      label: 'Quân số đi làm',
      value: workingRoster.length,
      unit: 'người',
      tone: absentRoster.length > 0 ? 'warning' : 'success',
      note: `${onLeaveRoster.length} nghỉ phép · ${absentRoster.length} vắng/chưa điểm danh`,
    },
    {
      label: 'Hiệu suất chỗ ngồi AI',
      value: occupancySummary.spaceUtilizationPercent,
      unit: '%',
      tone: 'info',
      note: `${occupancySummary.presentCount}/${occupancySummary.totalDesks} bàn đang có người ngồi`,
    },
    {
      label: 'Giờ công & An ninh SOC',
      value: timesheetAggregates.totalWorkHours,
      unit: 'giờ',
      tone: securityOtSummary.openCount > 0 || securityOtSummary.spoofingAttempts > 0 ? 'danger' : 'info',
      note: `+${timesheetAggregates.totalOtHours}h OT · ${securityOtSummary.totalIncidents} sự cố an ninh`,
    },
  ]

  // Số liệu nhanh 3 kỳ cho góc phải khu vực biểu đồ Overview
  const todayPresentTotal = dailyRows.reduce((sum, r) => sum + r.presentCount, 0)
  const todayOnTimeTotal = dailyRows.reduce((sum, r) => sum + onTimeCount(r), 0)

  const handleSearchChange = (val: string) => {
    setSearchQuery(val)
    setDeptPages({})
    setSeatPage(1)
    setOtPage(1)
    setIncPage(1)
  }

  return (
    <div className="reporting-page reporting-hub-page">
      {/* 1. Header Trang Báo Cáo (Ẩn khi in) */}
      <header className="page-heading report-hub-header no-print">
        <div>
          <div className="report-hub-title-row">
            <h1>Trung tâm Báo cáo &amp; Phân tích Tổng hợp</h1>
            <span className="badge badge-info">{periodBounds.label}</span>
          </div>
          <p className="muted">
            Phạm vi: <strong>{scopeLabel}</strong> ({formatViDate(periodBounds.fromDate)} → {formatViDate(periodBounds.toDate)}) · Đồng bộ Chấm công, Chỗ ngồi AI &amp; An ninh.
          </p>
        </div>
        <div className="report-hub-header-actions">
          <button
            className="button button-secondary"
            type="button"
            onClick={handleRefresh}
            disabled={isLoadingAny}
          >
            <ArrowClockwise size={18} aria-hidden="true" />
            {isLoadingAny ? 'Đang cập nhật…' : 'Làm mới'}
          </button>
          <button
            className="button button-excel"
            type="button"
            onClick={handleExportFullExcelWorkbook}
            disabled={isLoadingAny}
            title="Xuất Sổ tay Excel 4 Sheet có định dạng bảng, tổng hợp và phân màu trạng thái"
          >
            <Table size={18} aria-hidden="true" />
            Xuất Excel Đa Sheet (.XLS)
          </button>
          <div className="export-dropdown-wrap" ref={headerCsvMenuRef}>
            <button
              className="button button-secondary"
              type="button"
              onClick={() => setOpenCsvMenu(prev => (prev === 'header' ? null : 'header'))}
              disabled={isLoadingAny}
              aria-expanded={openCsvMenu === 'header'}
              aria-haspopup="menu"
            >
              <DownloadSimple size={18} aria-hidden="true" />
              Tải CSV ▾
            </button>
            {openCsvMenu === 'header' && (
              <div className="export-dropdown-menu" role="menu" aria-label="Chọn bảng CSV để xuất">
                <button type="button" className="export-dropdown-item is-featured" role="menuitem" onClick={handleExportActiveTab}>
                  <span>Xuất nhanh bảng đang mở (.CSV)</span>
                  <small className="muted">UTF-8 BOM chuẩn kiểm toán</small>
                </button>
                <div className="export-dropdown-divider" />
                <button type="button" className="export-dropdown-item" role="menuitem" onClick={handleExportDepartmentCsv}>
                  <span>1. Tổng hợp Phòng ban (.CSV)</span>
                  <small className="muted">{activeDepartmentGroups.length} phòng ban + dòng Tổng</small>
                </button>
                <button type="button" className="export-dropdown-item" role="menuitem" onClick={handleExportTimesheetCsv}>
                  <span>2. Chấm công Nhân viên (.CSV)</span>
                  <small className="muted">{filteredTimesheetRows.length} nhân sự + dòng Tổng</small>
                </button>
                <button type="button" className="export-dropdown-item" role="menuitem" onClick={handleExportOccupancyCsv}>
                  <span>3. Hiệu suất Chỗ ngồi AI (.CSV)</span>
                  <small className="muted">{filteredSeatRows.length} vị trí FSM</small>
                </button>
                <button type="button" className="export-dropdown-item" role="menuitem" onClick={handleExportSecurityOtCsv}>
                  <span>4. An ninh SOC &amp; OT (.CSV)</span>
                  <small className="muted">{filteredOtList.length} OT · {filteredIncidents.length} sự cố</small>
                </button>
              </div>
            )}
          </div>
          <button
            className="button button-primary"
            type="button"
            onClick={handlePrintReport}
          >
            <Printer size={18} aria-hidden="true" />
            In / Xuất PDF A4
          </button>
        </div>
      </header>

      {/* Thông báo realtime hoặc thông báo xuất tệp */}
      {realtimeNotice && (
        <div className="report-realtime-alert no-print" role="status" aria-live="polite">
          <span className="realtime-pulse-dot" />
          <span>{realtimeNotice}</span>
        </div>
      )}

      {exportNotice && (
        <div className="report-export-alert no-print" role="status" aria-live="polite">
          <DownloadSimple size={18} weight="bold" />
          <span>{exportNotice}</span>
        </div>
      )}

      {/* 2. Thanh Tabs 5 Phân Hệ Báo Cáo (Ẩn khi in) */}
      <nav className="report-tabs-bar no-print" aria-label="Các phân hệ báo cáo tổng hợp">
        <button
          type="button"
          className={`report-tab-pill ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => handleSelectTab('overview')}
        >
          <ChartPieSlice size={18} aria-hidden="true" />
          <span>Tổng quan điều hành</span>
        </button>
        <button
          type="button"
          className={`report-tab-pill ${activeTab === 'timesheet' ? 'active' : ''}`}
          onClick={() => handleSelectTab('timesheet')}
        >
          <UsersThree size={18} aria-hidden="true" />
          <span>Chấm công nhân viên ({allTimesheetRows.length})</span>
        </button>
        <button
          type="button"
          className={`report-tab-pill ${activeTab === 'occupancy' ? 'active' : ''}`}
          onClick={() => handleSelectTab('occupancy')}
        >
          <Armchair size={18} aria-hidden="true" />
          <span>Hiệu suất chỗ ngồi AI ({occupancySummary.totalZones})</span>
        </button>
        <button
          type="button"
          className={`report-tab-pill ${activeTab === 'security_ot' ? 'active' : ''}`}
          onClick={() => handleSelectTab('security_ot')}
        >
          <ShieldWarning size={18} aria-hidden="true" />
          <span>An ninh &amp; OT ({securityOtSummary.totalIncidents + securityOtSummary.totalOtRegistrations})</span>
        </button>
        <button
          type="button"
          className={`report-tab-pill ${activeTab === 'print_sheet' ? 'active' : ''}`}
          onClick={() => handleSelectTab('print_sheet')}
        >
          <FileText size={18} aria-hidden="true" />
          <span>Phiếu báo cáo &amp; In A4</span>
        </button>
      </nav>

      {/* 3. Thanh Bộ lọc Đa Chiều: Kỳ báo cáo + Phòng ban + Dropdown Nhân viên + Lọc Trạng thái/Xếp loại/AIoT + Sắp xếp (Ẩn khi in) */}
      <section className="panel report-hub-filter-bar no-print" aria-label="Bộ lọc kỳ báo cáo và nhân sự">
        <div className="filter-row-unified">
          <div className="period-switcher-group">
            <span className="filter-caption">Kỳ phân tích</span>
            <div className="period-segmented" role="group" aria-label="Chọn kỳ báo cáo">
              <button
                type="button"
                className={`period-seg-btn ${periodMode === 'daily' ? 'active' : ''}`}
                onClick={() => handleSelectPeriod('daily')}
              >
                <CalendarCheck size={15} /> Ngày
              </button>
              <button
                type="button"
                className={`period-seg-btn ${periodMode === 'weekly' ? 'active' : ''}`}
                onClick={() => handleSelectPeriod('weekly')}
              >
                <CalendarBlank size={15} /> Tuần
              </button>
              <button
                type="button"
                className={`period-seg-btn ${periodMode === 'monthly' ? 'active' : ''}`}
                onClick={() => handleSelectPeriod('monthly')}
              >
                <ChartBar size={15} /> Tháng
              </button>
              <button
                type="button"
                className={`period-seg-btn ${periodMode === 'custom' ? 'active' : ''}`}
                onClick={() => handleSelectPeriod('custom')}
              >
                <Funnel size={15} /> Tùy chỉnh
              </button>
            </div>
          </div>

          {periodMode === 'daily' && (
            <div className="filter-time-group">
              <label className="field">
                <span>Ngày báo cáo</span>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={e => setSelectedDate(e.target.value)}
                />
              </label>
              <div className="quick-buttons">
                <button type="button" className="button button-ghost" onClick={() => adjustDailyDate(-1)}>
                  <CaretLeft size={16} /> Hôm trước
                </button>
                <button type="button" className="button button-ghost" onClick={() => setSelectedDate(todayStr)}>
                  Hôm nay
                </button>
                <button type="button" className="button button-ghost" onClick={() => adjustDailyDate(1)}>
                  Hôm sau <CaretRight size={16} />
                </button>
              </div>
            </div>
          )}

          {periodMode === 'weekly' && (
            <div className="filter-time-group">
              <label className="field">
                <span>Ngày thuộc tuần</span>
                <input
                  type="date"
                  value={selectedWeekDate}
                  onChange={e => setSelectedWeekDate(e.target.value)}
                />
              </label>
              <div className="quick-buttons">
                <button type="button" className="button button-ghost" onClick={() => adjustWeekDate(-1)}>
                  <CaretLeft size={16} /> Tuần trước
                </button>
                <button type="button" className="button button-ghost" onClick={() => setSelectedWeekDate(todayStr)}>
                  Tuần này
                </button>
                <button type="button" className="button button-ghost" onClick={() => adjustWeekDate(1)}>
                  Tuần sau <CaretRight size={16} />
                </button>
              </div>
            </div>
          )}

          {periodMode === 'monthly' && (
            <div className="filter-time-group">
              <label className="field">
                <span>Tháng báo cáo</span>
                <input
                  type="month"
                  value={selectedMonth}
                  min="0001-01"
                  max="9998-12"
                  onChange={e => setSelectedMonth(e.target.value)}
                />
              </label>
            </div>
          )}

          {periodMode === 'custom' && (
            <div className="filter-time-group">
              <label className="field">
                <span>Từ ngày</span>
                <input
                  type="date"
                  value={customFromDate}
                  max={customToDate || undefined}
                  onChange={e => setCustomFromDate(e.target.value)}
                />
              </label>
              <label className="field">
                <span>Đến ngày</span>
                <input
                  type="date"
                  value={customToDate}
                  min={customFromDate || undefined}
                  onChange={e => setCustomToDate(e.target.value)}
                />
              </label>
            </div>
          )}

          {!lead ? (
            <label className="field report-department-field">
              <span>Phòng ban</span>
              <select
                value={selectedDepartment}
                onChange={e => {
                  setSelectedDepartment(e.target.value)
                  setSelectedEmployeeId('')
                  setDeptPages({})
                  setAttLogPage(1)
                  setSeatPage(1)
                  setOtPage(1)
                  setIncPage(1)
                }}
                disabled={departmentsQuery.loading}
              >
                <option value="">Toàn bộ công ty (Tất cả phòng ban)</option>
                {departmentsList.map(dept => (
                  <option key={dept.id} value={dept.id}>
                    {dept.departmentName} ({dept.departmentCode})
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div className="field">
              <span>Phạm vi tài khoản</span>
              <p className="scope-readonly">Phòng ban của bạn</p>
            </div>
          )}

          <label className="field filter-select-field filter-employee-select">
            <span>Nhân viên ({sortedEmployeeOptions.length})</span>
            <select
              value={effectiveEmployeeId}
              onChange={e => handleSelectEmployeeFilter(e.target.value)}
              disabled={sortedEmployeeOptions.length === 0}
            >
              <option value="">Tất cả nhân sự ({sortedEmployeeOptions.length})</option>
              {sortedEmployeeOptions.map(emp => (
                <option key={emp.id} value={emp.id}>
                  [{emp.employeeCode}] {emp.fullName} ({emp.departmentCode})
                </option>
              ))}
            </select>
          </label>

          <label className="field filter-search-field">
            <span>Tìm nhanh từ khóa</span>
            <div className="search-input-wrap">
              <MagnifyingGlass size={15} className="search-icon" aria-hidden="true" />
              <input
                type="search"
                placeholder="Mã NV, tên, bàn AI, lý do nghỉ..."
                value={searchQuery}
                onChange={e => handleSearchChange(e.target.value)}
              />
            </div>
          </label>

          <button
            type="button"
            className={`button button-secondary filter-advanced-toggle-btn ${showAdvancedFilters || advancedFilterCount > 0 ? 'is-open' : ''}`}
            aria-expanded={showAdvancedFilters || advancedFilterCount > 0}
            onClick={() => setShowAdvancedFilters(prev => !prev)}
          >
            <Funnel size={15} aria-hidden="true" />
            <span>Lọc nâng cao {showAdvancedFilters || advancedFilterCount > 0 ? '▴' : '▾'}</span>
            {advancedFilterCount > 0 && <span className="filter-advanced-badge">{advancedFilterCount}</span>}
          </button>
        </div>

        {/* Hàng 2: Các tùy chọn lọc chuyên sâu nhân sự & sắp xếp đa chiều (Ẩn mặc định cho gọn) */}
        {(showAdvancedFilters || advancedFilterCount > 0) && (
          <div className="filter-row-options">
            <label className="field filter-select-field">
              <span>Trạng thái Làm / Nghỉ</span>
              <select
                value={timesheetFilter}
                onChange={e => {
                  setTimesheetFilter(e.target.value as TimesheetFilterStatus)
                  setDeptPages({})
                }}
              >
                <option value="ALL">Tất cả trạng thái</option>
                <option value="WORKING">Đi làm / Có mặt</option>
                <option value="ON_TIME_ONLY">Đúng giờ tuyệt đối (100%)</option>
                <option value="LATE_WARNING">Có đi muộn / Về sớm</option>
                <option value="ON_LEAVE">Nghỉ có phép</option>
                <option value="ABSENT_UNEXCUSED">Vắng KP / Chưa điểm danh</option>
              </select>
            </label>

            <label className="field filter-select-field">
              <span>Xếp loại chuyên cần</span>
              <select
                value={ratingFilter}
                onChange={e => {
                  setRatingFilter(e.target.value as TimesheetRatingFilter)
                  setDeptPages({})
                }}
              >
                <option value="ALL">Tất cả xếp loại</option>
                <option value="Xuất sắc">Xuất sắc</option>
                <option value="Đạt chuẩn">Đạt chuẩn</option>
                <option value="Cần lưu ý">Cần lưu ý</option>
                <option value="Vi phạm">Vi phạm</option>
              </select>
            </label>

            <label className="field filter-select-field">
              <span>Tiêu chí AIoT &amp; OT</span>
              <select
                value={specialFilter}
                onChange={e => {
                  setSpecialFilter(e.target.value as TimesheetSpecialFilter)
                  setDeptPages({})
                }}
              >
                <option value="ALL">Tất cả đối tượng</option>
                <option value="HAS_OT">Có làm thêm giờ (OT đã duyệt)</option>
                <option value="HAS_SEAT">Đã gán bàn làm việc AI</option>
                <option value="NO_SEAT">Chưa gán bàn AI</option>
                <option value="FACE_REGISTERED">Đã đăng ký khuôn mặt ArcFace</option>
                <option value="NO_FACE">Chưa đăng ký khuôn mặt AI</option>
              </select>
            </label>

            <label className="field filter-select-field">
              <span>Sắp xếp kết quả</span>
              <select
                value={sortBy}
                onChange={e => {
                  setSortBy(e.target.value as TimesheetSortBy)
                  setDeptPages({})
                }}
              >
                <option value="DEFAULT">Mặc định (Ngày công ↓)</option>
                <option value="CODE_ASC">Mã nhân viên (A → Z)</option>
                <option value="NAME_ASC">Họ và tên (A → Z)</option>
                <option value="RATE_DESC">Tỷ lệ chuyên cần (Cao → Thấp)</option>
                <option value="RATE_ASC">Tỷ lệ chuyên cần (Thấp → Cao)</option>
                <option value="LATE_MINS_DESC">Tổng phút đi muộn (Nhiều → Ít)</option>
                <option value="WORK_HOURS_DESC">Tổng giờ làm việc (Nhiều → Ít)</option>
                <option value="OT_HOURS_DESC">Giờ tăng ca OT (Nhiều → Ít)</option>
              </select>
            </label>
          </div>
        )}

        {/* Dải Chip hiển thị các tiêu chí đang lọc & nút Đặt lại */}
        {(effectiveEmployeeId ||
          timesheetFilter !== 'ALL' ||
          ratingFilter !== 'ALL' ||
          specialFilter !== 'ALL' ||
          sortBy !== 'DEFAULT' ||
          normalizedSearch.length > 0) && (
          <div className="active-filters-strip" role="region" aria-label="Bộ lọc đang áp dụng">
            <span className="active-filters-label">
              <Funnel size={14} weight="bold" aria-hidden="true" /> Đang lọc ({filteredTimesheetRows.length}/{allTimesheetRows.length} nhân sự):
            </span>
            {selectedEmployeeObj && (
              <button
                type="button"
                className="active-filter-chip"
                onClick={() => handleSelectEmployeeFilter('')}
                title="Bỏ lọc nhân viên này"
              >
                <span>NV: {selectedEmployeeObj.employeeCode} – {selectedEmployeeObj.fullName}</span>
                <X size={13} weight="bold" aria-hidden="true" />
              </button>
            )}
            {timesheetFilter !== 'ALL' && (
              <button
                type="button"
                className="active-filter-chip"
                onClick={() => {
                  setTimesheetFilter('ALL')
                  setDeptPages({})
                }}
              >
                <span>
                  Trạng thái:{' '}
                  {timesheetFilter === 'WORKING'
                    ? 'Đi làm / Có mặt'
                    : timesheetFilter === 'ON_TIME_ONLY'
                      ? 'Đúng giờ 100%'
                      : timesheetFilter === 'LATE_WARNING'
                        ? 'Muộn / Sớm'
                        : timesheetFilter === 'ON_LEAVE'
                          ? 'Nghỉ phép'
                          : 'Vắng KP'}
                </span>
                <X size={13} weight="bold" aria-hidden="true" />
              </button>
            )}
            {ratingFilter !== 'ALL' && (
              <button
                type="button"
                className="active-filter-chip"
                onClick={() => {
                  setRatingFilter('ALL')
                  setDeptPages({})
                }}
              >
                <span>Xếp loại: {ratingFilter}</span>
                <X size={13} weight="bold" aria-hidden="true" />
              </button>
            )}
            {specialFilter !== 'ALL' && (
              <button
                type="button"
                className="active-filter-chip"
                onClick={() => {
                  setSpecialFilter('ALL')
                  setDeptPages({})
                }}
              >
                <span>
                  AIoT/OT:{' '}
                  {specialFilter === 'HAS_OT'
                    ? 'Có OT'
                    : specialFilter === 'HAS_SEAT'
                      ? 'Đã gán bàn'
                      : specialFilter === 'NO_SEAT'
                        ? 'Chưa gán bàn'
                        : specialFilter === 'FACE_REGISTERED'
                          ? 'Đã nạp khuôn mặt'
                          : 'Chưa nạp khuôn mặt'}
                </span>
                <X size={13} weight="bold" aria-hidden="true" />
              </button>
            )}
            {sortBy !== 'DEFAULT' && (
              <button
                type="button"
                className="active-filter-chip"
                onClick={() => {
                  setSortBy('DEFAULT')
                  setDeptPages({})
                }}
              >
                <span>Sắp xếp tùy chọn</span>
                <X size={13} weight="bold" aria-hidden="true" />
              </button>
            )}
            {normalizedSearch.length > 0 && (
              <button
                type="button"
                className="active-filter-chip"
                onClick={() => handleSearchChange('')}
              >
                <span>Từ khóa: &ldquo;{searchQuery.trim()}&rdquo;</span>
                <X size={13} weight="bold" aria-hidden="true" />
              </button>
            )}
            <button type="button" className="reset-filters-btn" onClick={resetAllEmployeeFilters}>
              Đặt lại bộ lọc
            </button>
          </div>
        )}
      </section>

      {/* Khối Hồ sơ Báo cáo Cá nhân 360° khi chọn đích danh 1 nhân viên */}
      {employee360Row && (
        <section className="panel employee-360-banner no-print" aria-label="Hồ sơ báo cáo cá nhân nhân viên">
          <div className="emp-360-top">
            <div className="emp-360-identity">
              <div className="emp-360-avatar" aria-hidden="true">
                {employee360Row.fullName.trim().slice(0, 1).toUpperCase() || 'N'}
              </div>
              <div>
                <div className="emp-360-name-row">
                  <h2>{employee360Row.employeeCode} — {employee360Row.fullName}</h2>
                  <span className="badge badge-neutral">{employee360Row.departmentName} ({employee360Row.departmentCode})</span>
                  <span className={`badge badge-${employee360Row.workStatusTone}`}>{employee360Row.workStatusLabel}</span>
                  <span className={`badge badge-${employee360Row.ratingTone}`}>Xếp loại: {employee360Row.ratingLabel}</span>
                </div>
                <p className="muted" style={{ margin: '4px 0 0', fontSize: 12.5 }}>
                  Kỳ phân tích: <strong>{periodBounds.label}</strong> · Sinh trắc ArcFace:{' '}
                  <strong>{employee360Row.registeredVectorCount} góc</strong> · Bàn AI:{' '}
                  <strong>{employee360Row.assignedSeatText}</strong>
                </p>
              </div>
            </div>

            <div className="emp-360-actions">
              <button
                type="button"
                className="button button-secondary"
                onClick={() => {
                  handleSelectTab('timesheet')
                  setTimesheetSubView('gate_logs')
                }}
              >
                <User size={16} aria-hidden="true" /> Nhật ký quét mặt ({scopedAttendanceLogs.length})
              </button>
              <button
                type="button"
                className="button button-excel"
                onClick={handleExportFullExcelWorkbook}
              >
                <Table size={16} aria-hidden="true" /> Xuất Excel Cá nhân
              </button>
              <button
                type="button"
                className="button button-primary"
                onClick={handlePrintReport}
              >
                <Printer size={16} aria-hidden="true" /> In Phiếu Cá nhân A4
              </button>
              <button
                type="button"
                className="button button-ghost"
                onClick={() => handleSelectEmployeeFilter('')}
                title="Đóng chế độ xem cá nhân"
              >
                <X size={16} aria-hidden="true" /> Xem tất cả NV
              </button>
            </div>
          </div>

          <div className="emp-360-stats-strip">
            <div>
              <span>Ngày công thực tế</span>
              <strong>{employee360Row.presentDays} ngày</strong>
              <small className="muted">{employee360Row.onTimeDays} đúng giờ · {employee360Row.lateDays} muộn</small>
            </div>
            <div>
              <span>Giờ vào – Giờ ra TB</span>
              <strong>{employee360Row.firstCheckInText} – {employee360Row.lastCheckOutText}</strong>
              <small className="muted">Muộn: {employee360Row.totalLateMinutes}p · Sớm: {employee360Row.totalEarlyLeaveMinutes}p</small>
            </div>
            <div>
              <span>Nghỉ phép / Vắng KP</span>
              <strong>{employee360Row.approvedLeaveDays} phép / {employee360Row.absentDays} vắng</strong>
              <small className="muted">{employee360Row.leaveDetailsText !== '—' ? employee360Row.leaveDetailsText : 'Không có đơn phép'}</small>
            </div>
            <div>
              <span>Giờ làm &amp; OT duyệt</span>
              <strong>{employee360Row.totalWorkHours.toFixed(1)}h (+{employee360Row.approvedOtHours.toFixed(1)}h OT)</strong>
              <small className="muted">{employee360Row.approvedOtSessions} ca OT trong kỳ</small>
            </div>
            <div>
              <span>Tỷ lệ chuyên cần</span>
              <strong>{employee360Row.attendanceRatePercent.toFixed(1)}%</strong>
              <small className="muted">Độ tin cậy AI: {employee360Row.avgMatchConfidence > 0 ? `${employee360Row.avgMatchConfidence.toFixed(1)}%` : '—'}</small>
            </div>
          </div>
        </section>
      )}

      {/* ===================================================================== */}
      {/* TAB 1: TỔNG QUAN ĐIỀU HÀNH (EXECUTIVE SUMMARY - 3 TẦNG GỌN GÀNG)     */}
      {/* ===================================================================== */}
      {activeTab === 'overview' && (
        <div
          key={`${activeTab}_${periodMode}_${periodBounds.fileTag}_${departmentId ?? 'all'}`}
          className={`report-tab-pane ${slideDir}`}
        >
          {/* Tầng 1: 4 Thẻ KPI Cốt lõi */}
          <div className="section-block">
            <KpiStatCards stats={overviewStats} />
          </div>

          {/* Tầng 2: Khối Biểu đồ Trực quan có Sub-tab chuyển đổi gọn */}
          <div className="section-block">
            <div className="overview-chart-switcher panel">
              <div className="panel-subview-bar">
                <div className="subview-tabs" role="tablist" aria-label="Chọn mô hình biểu đồ tổng quan">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={overviewChartMode === 'department'}
                    className={`subview-tab-btn ${overviewChartMode === 'department' ? 'active' : ''}`}
                    onClick={() => setOverviewChartMode('department')}
                  >
                    <ChartPieSlice size={15} /> Cơ cấu Chuyên cần Phòng ban
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={overviewChartMode === 'weekly_trend'}
                    className={`subview-tab-btn ${overviewChartMode === 'weekly_trend' ? 'active' : ''}`}
                    onClick={() => setOverviewChartMode('weekly_trend')}
                  >
                    <ChartBar size={15} /> Diễn biến Xu hướng 7 ngày
                  </button>
                </div>
                <div className="overview-period-pills">
                  <button
                    type="button"
                    className={`mini-period-pill ${periodMode === 'daily' ? 'active' : ''}`}
                    onClick={() => handleSelectPeriod('daily')}
                  >
                    Ngày {formatViDate(selectedDate)}: <strong>{todayPresentTotal} có mặt</strong> ({todayOnTimeTotal} đúng giờ)
                  </button>
                  <button
                    type="button"
                    className={`mini-period-pill ${periodMode === 'weekly' ? 'active' : ''}`}
                    onClick={() => handleSelectPeriod('weekly')}
                  >
                    Tuần {weeklyData?.weekNumber ?? '—'}: <strong>{weeklyData?.totalPresentManDays ?? 0} lượt</strong>
                  </button>
                  <button
                    type="button"
                    className={`mini-period-pill ${periodMode === 'monthly' ? 'active' : ''}`}
                    onClick={() => handleSelectPeriod('monthly')}
                  >
                    Tháng {String(month || '').padStart(2, '0')}: <strong>{monthlyData?.totalPresentManDays ?? 0} lượt</strong>
                  </button>
                </div>
              </div>

              {overviewChartMode === 'department' ? (
                activeDepartmentGroups.length > 0 ? (
                  <AttendanceCharts groups={activeDepartmentGroups} />
                ) : (
                  <div className="empty-state">
                    <ChartBar size={34} className="muted" />
                    <h3>Chưa có dữ liệu tổng hợp cho {periodBounds.label}</h3>
                    <p className="muted">Hệ thống sẽ tự động vẽ biểu đồ ngay khi có lượt chấm công hoặc sự kiện đồng bộ.</p>
                  </div>
                )
              ) : weeklyData ? (
                <WeeklyTrendChart
                  startDate={weeklyData.startDate}
                  endDate={weeklyData.endDate}
                  rows={weeklyData.dailyBreakdown}
                />
              ) : (
                <div className="empty-state">
                  <p className="muted">Đang tải biểu đồ xu hướng 7 ngày…</p>
                </div>
              )}
            </div>
          </div>

          {/* Tầng 3: Bảng Tổng hợp Phòng ban tinh gọn 8 cột */}
          <div className="section-block">
            <section className="panel" aria-labelledby="dept-summary-table-title">
              <div className="report-panel-heading report-panel-heading-row">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Buildings size={22} color="var(--color-primary)" weight="bold" />
                  <div>
                    <p className="eyebrow">TỔNG HỢP THEO PHÒNG BAN · {periodBounds.label.toUpperCase()}</p>
                    <h2 id="dept-summary-table-title">Hiệu suất Chuyên cần &amp; Giờ công các Phòng ban</h2>
                  </div>
                </div>
                <div className="subview-actions">
                  <button
                    type="button"
                    className="button button-ghost"
                    onClick={() => handleSelectTab('timesheet')}
                  >
                    Xem Ai làm / Ai nghỉ →
                  </button>
                  <button type="button" className="button button-secondary" onClick={handleExportDepartmentCsv}>
                    <DownloadSimple size={16} /> Xuất CSV Phòng ban
                  </button>
                </div>
              </div>

              {activeDepartmentGroups.length === 0 ? (
                <div className="empty-state">
                  <p className="muted">Chưa có bản ghi tổng hợp phòng ban trong kỳ {periodBounds.label}.</p>
                </div>
              ) : (
                <div className="table-wrap" tabIndex={0} role="region">
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">Phòng ban</th>
                        <th scope="col" className="numeric">Nhân sự</th>
                        <th scope="col" className="numeric">Đúng giờ</th>
                        <th scope="col" className="numeric">Đi muộn</th>
                        <th scope="col" className="numeric">Vắng mặt</th>
                        <th scope="col" className="numeric">Tổng giờ công (+OT)</th>
                        <th scope="col" className="numeric">Cảnh báo (Bàn / AN)</th>
                        <th scope="col" className="numeric">Tỷ lệ chuyên cần</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeDepartmentGroups.map(grp => {
                        const present = grp.onTime + grp.late
                        const rate = grp.total > 0 ? (present / grp.total) * 100 : 0
                        const extra = deptWorkHoursMap.get(grp.departmentId)
                        return (
                          <tr key={grp.departmentId}>
                            <td>
                              <button
                                type="button"
                                className="dept-drilldown-btn"
                                onClick={() => handleDrillDownDepartment(grp.departmentId)}
                                title={`Xem danh sách nhân sự phòng ${grp.departmentCode}`}
                              >
                                <strong>{grp.departmentCode}</strong>
                                <span className="dept-drilldown-hint">Xem NV →</span>
                              </button>
                              <span className="table-cell-note muted">{grp.daysRecorded} ngày ghi nhận</span>
                            </td>
                            <td className="numeric">{extra?.empCount ?? '—'}</td>
                            <td className="numeric text-success">{grp.onTime}</td>
                            <td className="numeric text-warning">{grp.late}</td>
                            <td className="numeric text-danger">{grp.absent}</td>
                            <td className="numeric">
                              <strong>{extra ? extra.workHours.toFixed(1) : '0.0'}h</strong>
                              {extra && extra.otHours > 0 && (
                                <span className="table-cell-note text-primary">+{extra.otHours.toFixed(1)}h OT</span>
                              )}
                            </td>
                            <td className="numeric">{grp.prolongedAway} bàn · {grp.securityAlerts} AN</td>
                            <td className="numeric">
                              <span className={`badge ${rate >= 90 ? 'badge-success' : rate >= 75 ? 'badge-warning' : 'badge-danger'}`}>
                                {rate.toFixed(1)}%
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 2: CHẤM CÔNG NHÂN VIÊN & QUÂN SỐ (GỌN 3 TẦNG - PROGRESSIVE)      */}
      {/* ===================================================================== */}
      {activeTab === 'timesheet' && (
        <div
          key={`${activeTab}_${periodMode}_${periodBounds.fileTag}_${departmentId ?? 'all'}`}
          className={`report-tab-pane ${slideDir}`}
        >
          {/* Tầng 1: 4 Thẻ Quân số Tương tác (Bấm vào để lọc ngay bảng bên dưới) */}
          <div className="section-block">
            <div className="interactive-kpi-strip" aria-label="Lọc nhanh theo trạng thái quân số">
              <button
                type="button"
                className={`summary-card filter-kpi-card ${timesheetFilter === 'ALL' ? 'active' : ''}`}
                onClick={() => {
                  setTimesheetFilter('ALL')
                  setTimesheetSubView('table')
                  setDeptPages({})
                }}
              >
                <span>Tổng quân số</span>
                <strong>{searchMatchedRows.length.toLocaleString('vi-VN')}</strong>
                <small className="muted">{timesheetAggregates.totalWorkHours}h làm · +{timesheetAggregates.totalOtHours}h OT</small>
              </button>

              <button
                type="button"
                className={`summary-card filter-kpi-card tone-success ${timesheetFilter === 'WORKING' ? 'active' : ''}`}
                onClick={() => {
                  setTimesheetFilter('WORKING')
                  setTimesheetSubView('table')
                  setDeptPages({})
                }}
              >
                <span>Đi làm / Có mặt</span>
                <strong>{workingRoster.length.toLocaleString('vi-VN')}</strong>
                <small className="muted">{timesheetAggregates.totalOnTimeDays} đúng giờ · {lateWarningRoster.length} muộn/sớm</small>
              </button>

              <button
                type="button"
                className={`summary-card filter-kpi-card tone-info ${timesheetFilter === 'ON_LEAVE' ? 'active' : ''}`}
                onClick={() => {
                  setTimesheetFilter('ON_LEAVE')
                  setTimesheetSubView('table')
                  setDeptPages({})
                }}
              >
                <span>Nghỉ có phép</span>
                <strong>{onLeaveRoster.length.toLocaleString('vi-VN')}</strong>
                <small className="muted">Tổng {timesheetAggregates.totalLeaveDays} ngày phép đã duyệt</small>
              </button>

              <button
                type="button"
                className={`summary-card filter-kpi-card tone-danger ${timesheetFilter === 'ABSENT_UNEXCUSED' ? 'active' : ''}`}
                onClick={() => {
                  setTimesheetFilter('ABSENT_UNEXCUSED')
                  setTimesheetSubView('table')
                  setDeptPages({})
                }}
              >
                <span>Vắng / Chưa điểm danh</span>
                <strong>{absentRoster.length.toLocaleString('vi-VN')}</strong>
                <small className="muted">{timesheetAggregates.totalAbsentDays} ngày chốt ABSENT không phép</small>
              </button>
            </div>
          </div>

          {/* Tầng 2: 1 Panel Chính Duy Nhất với Thanh Chuyển Chế Độ Xem */}
          <div className="section-block">
            <section className="panel" aria-labelledby="timesheet-main-title">
              <div className="panel-subview-bar">
                <div className="subview-tabs" role="tablist" aria-label="Chế độ xem chấm công nhân viên">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={timesheetSubView === 'table'}
                    className={`subview-tab-btn ${timesheetSubView === 'table' ? 'active' : ''}`}
                    onClick={() => setTimesheetSubView('table')}
                  >
                    Bảng chấm công ({filteredTimesheetRows.length.toLocaleString('vi-VN')})
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={timesheetSubView === 'roster_cards'}
                    className={`subview-tab-btn ${timesheetSubView === 'roster_cards' ? 'active' : ''}`}
                    onClick={() => setTimesheetSubView('roster_cards')}
                  >
                    Phân nhóm Đi làm / Nghỉ / Vắng
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={timesheetSubView === 'gate_logs'}
                    className={`subview-tab-btn ${timesheetSubView === 'gate_logs' ? 'active' : ''}`}
                    onClick={() => setTimesheetSubView('gate_logs')}
                  >
                    Nhật ký quét mặt ({scopedAttendanceLogs.length.toLocaleString('vi-VN')})
                  </button>
                </div>

                <div className="subview-actions">
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={handleExportTimesheetCsv}
                    title={`Xuất toàn bộ ${filteredTimesheetRows.length} nhân sự khớp bộ lọc (tách theo phòng ban) ra tệp Excel CSV`}
                  >
                    <DownloadSimple size={16} /> Xuất CSV ({filteredTimesheetRows.length})
                  </button>
                </div>
              </div>

              {/* SUB-VIEW 1: BẢNG CHẤM CÔNG TÁCH RIÊNG THEO TAB PHÒNG BAN (1 PHÒNG / 1 BẢNG) */}
              {timesheetSubView === 'table' && (
                <>
                  <div className="report-panel-heading-inline">
                    <h2 id="timesheet-main-title">Bảng Chấm công theo Phòng ban · {periodBounds.label}</h2>
                    <span className="muted">
                      Chọn tab phòng ban để xem tách biệt · Nhấn vào từng dòng để mở chi tiết ngày làm &amp; đơn phép
                    </span>
                  </div>

                  {timesheetDeptGroups.length === 0 || !currentDeptGroup ? (
                    <div className="empty-state">
                      <UsersThree size={36} className="muted" />
                      <h3>Không có dữ liệu nhân sự khớp điều kiện lọc</h3>
                      <p className="muted">Thử điều chỉnh tùy chọn lọc trạng thái, xếp loại, AIoT hoặc đặt lại toàn bộ bộ lọc.</p>
                      <button type="button" className="button button-secondary" onClick={resetAllEmployeeFilters}>
                        Đặt lại bộ lọc
                      </button>
                    </div>
                  ) : (
                    (() => {
                      const currentDeptPage = deptPages[currentDeptGroup.departmentId] ?? 1
                      const pagedDept = paginateSlice(currentDeptGroup.rows, currentDeptPage, tsPageSize)
                      return (
                        <>
                          <div
                            className="timesheet-dept-tabs-bar"
                            role="tablist"
                            aria-label="Chọn phòng ban xem bảng chấm công"
                          >
                            {timesheetDeptGroups.map(deptGrp => {
                              const isActive = deptGrp.departmentId === effectiveDeptTabId
                              return (
                                <button
                                  key={deptGrp.departmentId}
                                  type="button"
                                  role="tab"
                                  aria-selected={isActive}
                                  className={`timesheet-dept-tab-btn ${isActive ? 'active' : ''}`}
                                  onClick={() => setActiveDeptTabId(deptGrp.departmentId)}
                                >
                                  <strong>{deptGrp.departmentCode}</strong>
                                  <span>{deptGrp.departmentName}</span>
                                  <span className="timesheet-dept-tab-count">{deptGrp.rows.length}</span>
                                </button>
                              )
                            })}
                          </div>

                          <div className="timesheet-dept-summary-bar">
                            <div className="timesheet-dept-summary-title">
                              <strong>[{currentDeptGroup.departmentCode}] {currentDeptGroup.departmentName}</strong>
                              <span className="muted">({currentDeptGroup.rows.length.toLocaleString('vi-VN')} nhân sự)</span>
                            </div>
                            <div className="timesheet-dept-summary-metrics">
                              <span className="dept-metric-item">
                                <span className="dept-metric-dot dot-success" aria-hidden="true" />
                                Đi làm: <strong>{currentDeptGroup.workingCount}</strong> ({currentDeptGroup.onTimePeopleCount} đúng giờ
                                {currentDeptGroup.latePeopleCount > 0 ? `, ${currentDeptGroup.latePeopleCount} muộn/sớm` : ''})
                              </span>
                              <span className="dept-metric-item">
                                <span className="dept-metric-dot dot-info" aria-hidden="true" />
                                Nghỉ phép: <strong>{currentDeptGroup.onLeaveCount}</strong>
                              </span>
                              <span className="dept-metric-item">
                                <span className="dept-metric-dot dot-danger" aria-hidden="true" />
                                Vắng/Chưa ĐD: <strong>{currentDeptGroup.absentCount}</strong>
                              </span>
                              <span className="dept-metric-item">
                                Giờ công: <strong>{currentDeptGroup.totalWorkHours.toFixed(1)}h</strong>
                                {currentDeptGroup.totalOtHours > 0 ? ` (+${currentDeptGroup.totalOtHours.toFixed(1)}h OT)` : ''}
                              </span>
                              <span className="dept-metric-item">
                                Chuyên cần: <strong>{currentDeptGroup.avgAttendanceRatePercent.toFixed(1)}%</strong>
                              </span>
                            </div>
                          </div>

                          <div
                            className="table-wrap"
                            tabIndex={0}
                            role="region"
                            aria-label={`Bảng chấm công phòng ${currentDeptGroup.departmentName}`}
                          >
                            <table>
                              <thead>
                                <tr>
                                  <th scope="col" className="numeric" style={{ width: 48 }}>STT</th>
                                  <th scope="col">Mã NV</th>
                                  <th scope="col">Họ và tên</th>
                                  <th scope="col">Trạng thái</th>
                                  <th scope="col" className="numeric">Ngày công</th>
                                  <th scope="col" className="numeric">Phép / Vắng</th>
                                  <th scope="col">{periodMode === 'daily' ? 'Giờ vào – ra' : 'Vào – Ra TB'}</th>
                                  <th scope="col" className="numeric">Tổng giờ</th>
                                  <th scope="col" style={{ width: 96 }}>Chi tiết</th>
                                </tr>
                              </thead>
                              <tbody
                                key={`${currentDeptGroup.departmentId}_${timesheetFilter}_${ratingFilter}_${specialFilter}_${sortBy}_${pagedDept.safePage}`}
                              >
                                {pagedDept.sliced.map((row, idx) => {
                                  const stt = (pagedDept.safePage - 1) * tsPageSize + idx + 1
                                  const isExpanded = expandedEmpId === row.employeeId
                                  return (
                                    <Fragment key={row.employeeId}>
                                      <tr
                                        className={`timesheet-main-row ${isExpanded ? 'is-expanded' : ''}`}
                                        onClick={() => setExpandedEmpId(isExpanded ? null : row.employeeId)}
                                      >
                                        <td className="numeric muted">{stt}</td>
                                        <td><strong>{row.employeeCode}</strong></td>
                                        <td>{row.fullName}</td>
                                        <td>
                                          <span className={`badge badge-${row.workStatusTone}`}>{row.workStatusLabel}</span>
                                        </td>
                                        <td className="numeric">
                                          <strong>{row.presentDays}</strong> ngày
                                          {row.lateDays > 0 && (
                                            <span className="table-cell-note muted">({row.lateDays} muộn)</span>
                                          )}
                                        </td>
                                        <td className="numeric">
                                          {row.approvedLeaveDays === 0 && row.absentDays === 0 ? (
                                            <span className="muted">—</span>
                                          ) : row.approvedLeaveDays > 0 && row.absentDays > 0 ? (
                                            <>
                                              <span className="text-primary">{row.approvedLeaveDays} phép</span>
                                              {' / '}
                                              <span className="text-danger">{row.absentDays} vắng</span>
                                            </>
                                          ) : row.approvedLeaveDays > 0 ? (
                                            <span className="text-primary">{row.approvedLeaveDays} phép</span>
                                          ) : (
                                            <span className="text-danger">{row.absentDays} vắng</span>
                                          )}
                                        </td>
                                        <td>
                                          <span className="clock-pair">{row.firstCheckInText} – {row.lastCheckOutText}</span>
                                        </td>
                                        <td className="numeric">
                                          <strong>{row.totalWorkHours.toFixed(1)}h</strong>
                                          {row.approvedOtHours > 0 && (
                                            <span className="table-cell-note text-primary">+{row.approvedOtHours.toFixed(1)}h OT</span>
                                          )}
                                        </td>
                                        <td>
                                          <button
                                            type="button"
                                            className="row-expand-btn"
                                            aria-expanded={isExpanded}
                                            onClick={e => {
                                              e.stopPropagation()
                                              setExpandedEmpId(isExpanded ? null : row.employeeId)
                                            }}
                                          >
                                            {isExpanded ? 'Thu gọn ▴' : 'Chi tiết ▾'}
                                          </button>
                                        </td>
                                      </tr>
                                      {isExpanded && (
                                        <tr className="timesheet-expanded-row">
                                          <td colSpan={9}>
                                            <div className="expanded-detail-grid">
                                              <div className="expanded-detail-box">
                                                <span className="detail-box-label">Ngày đi làm &amp; AI ArcFace</span>
                                                <p>
                                                  {row.workingDatesList.length > 0
                                                    ? `Các ngày có mặt: ${row.workingDatesList.join(', ')}`
                                                    : 'Chưa có lượt chấm công đi làm trong kỳ.'}
                                                </p>
                                                <small className="muted">
                                                  Độ tin cậy nhận diện TB: {row.avgMatchConfidence > 0 ? `${row.avgMatchConfidence.toFixed(1)}%` : '—'} · Xếp loại: {row.ratingLabel} ({row.attendanceRatePercent.toFixed(0)}%)
                                                </small>
                                              </div>
                                              <div className="expanded-detail-box">
                                                <span className="detail-box-label">Đơn nghỉ phép đã duyệt</span>
                                                <p>{row.leaveDetailsText !== '—' ? row.leaveDetailsText : 'Không có đơn nghỉ phép trong kỳ.'}</p>
                                                <small className="muted">Tổng ngày nghỉ phép giao trong kỳ: {row.approvedLeaveDays} ngày</small>
                                              </div>
                                              <div className="expanded-detail-box">
                                                <span className="detail-box-label">Vắng không phép &amp; Đi muộn</span>
                                                <p>
                                                  {row.absentDatesList.length > 0
                                                    ? `Ngày chốt ABSENT: ${row.absentDatesList.join(', ')}`
                                                    : 'Không có ngày vắng không phép.'}
                                                </p>
                                                <small className="muted">
                                                  Tổng phút đi muộn: {row.totalLateMinutes} phút · Về sớm: {row.totalEarlyLeaveMinutes} phút
                                                </small>
                                              </div>
                                              <div className="expanded-detail-box">
                                                <span className="detail-box-label">Vị trí bàn AI &amp; Làm thêm (OT)</span>
                                                <p>{row.assignedSeatText}</p>
                                                <small className="muted">
                                                  OT đã duyệt: {row.approvedOtSessions} ca ({row.approvedOtHours.toFixed(1)} giờ)
                                                </small>
                                                <button
                                                  type="button"
                                                  className="row-expand-btn"
                                                  style={{ alignSelf: 'flex-start', marginTop: 4 }}
                                                  onClick={() => handleSelectEmployeeFilter(row.employeeId)}
                                                >
                                                  Mở Hồ sơ 360° NV này →
                                                </button>
                                              </div>
                                            </div>
                                          </td>
                                        </tr>
                                      )}
                                    </Fragment>
                                  )
                                })}
                              </tbody>
                              <tfoot>
                                <tr className="timesheet-dept-tfoot-row">
                                  <td colSpan={4}>
                                    <strong>CỘNG PHÒNG {currentDeptGroup.departmentCode} ({currentDeptGroup.rows.length.toLocaleString('vi-VN')} nhân sự)</strong>
                                  </td>
                                  <td className="numeric">
                                    <strong>{currentDeptGroup.totalPresentDays}</strong> ngày
                                    {currentDeptGroup.totalLateDays > 0 && (
                                      <span className="table-cell-note muted">({currentDeptGroup.totalLateDays} muộn)</span>
                                    )}
                                  </td>
                                  <td className="numeric">
                                    {currentDeptGroup.totalLeaveDays === 0 && currentDeptGroup.totalAbsentDays === 0 ? (
                                      <span className="muted">—</span>
                                    ) : (
                                      <>
                                        <span className={currentDeptGroup.totalLeaveDays > 0 ? 'text-primary' : 'muted'}>
                                          {currentDeptGroup.totalLeaveDays} phép
                                        </span>
                                        {' / '}
                                        <span className={currentDeptGroup.totalAbsentDays > 0 ? 'text-danger' : 'muted'}>
                                          {currentDeptGroup.totalAbsentDays} vắng
                                        </span>
                                      </>
                                    )}
                                  </td>
                                  <td>
                                    <span className="muted">
                                      Chuyên cần TB: <strong>{currentDeptGroup.avgAttendanceRatePercent.toFixed(1)}%</strong>
                                    </span>
                                  </td>
                                  <td className="numeric">
                                    <strong>{currentDeptGroup.totalWorkHours.toFixed(1)}h</strong>
                                    {currentDeptGroup.totalOtHours > 0 && (
                                      <span className="table-cell-note text-primary">+{currentDeptGroup.totalOtHours.toFixed(1)}h OT</span>
                                    )}
                                  </td>
                                  <td />
                                </tr>
                              </tfoot>
                            </table>
                          </div>

                          {currentDeptGroup.rows.length > tsPageSize && (
                            <TablePagination
                              totalItems={currentDeptGroup.rows.length}
                              page={pagedDept.safePage}
                              pageSize={tsPageSize}
                              onPageChange={nextPage =>
                                setDeptPages(prev => ({ ...prev, [currentDeptGroup.departmentId]: nextPage }))
                              }
                              onPageSizeChange={nextSize => {
                                setTsPageSize(nextSize)
                                setDeptPages({})
                              }}
                              itemLabel={`nhân viên phòng ${currentDeptGroup.departmentCode}`}
                            />
                          )}
                        </>
                      )
                    })()
                  )}
                </>
              )}

              {/* SUB-VIEW 2: PHÂN NHÓM AI ĐI LÀM - AI NGHỈ - AI VẮNG */}
              {timesheetSubView === 'roster_cards' && (
                <div className="subview-roster-embed">
                  <RosterBreakdownSection
                    periodLabel={periodBounds.label}
                    allRows={searchMatchedRows}
                    workingRows={workingRoster}
                    onLeaveRows={onLeaveRoster}
                    absentRows={absentRoster}
                    onFilterTimesheet={filter => {
                      setTimesheetFilter(filter)
                      setTimesheetSubView('table')
                      setDeptPages({})
                    }}
                  />
                </div>
              )}

              {/* SUB-VIEW 3: NHẬT KÝ QUÉT KHUÔN MẶT TẠI CỔNG */}
              {timesheetSubView === 'gate_logs' && (
                <>
                  <div className="report-panel-heading-inline">
                    <h2 id="timesheet-main-title">Lịch sử Điểm danh Khuôn mặt tại Cổng · {periodBounds.label}</h2>
                    <span className="muted">Tổng {scopedAttendanceLogs.length.toLocaleString('vi-VN')} lượt ghi nhận khớp bộ lọc</span>
                  </div>

                  {scopedAttendanceLogs.length === 0 ? (
                    <div className="empty-state">
                      <p className="muted">Chưa có bản ghi điểm danh nào khớp bộ lọc trong khoảng {formatViDate(periodBounds.fromDate)} – {formatViDate(periodBounds.toDate)}.</p>
                    </div>
                  ) : (
                    <>
                      <div className="table-wrap" tabIndex={0} role="region">
                        <table>
                          <thead>
                            <tr>
                              <th scope="col">Ngày công</th>
                              <th scope="col">Nhân viên</th>
                              <th scope="col">Check-in</th>
                              <th scope="col">Check-out</th>
                              <th scope="col">Trạng thái</th>
                              <th scope="col" className="numeric">Đi muộn / Về sớm</th>
                              <th scope="col" className="numeric">Độ tin cậy AI</th>
                            </tr>
                          </thead>
                          <tbody>
                            {pagedAttLogs.sliced.map(log => {
                              const statusInfo = attendanceStatusLabels[log.status] ?? { label: log.status, class: 'badge-neutral' }
                              const confPct = log.matchConfidence > 0
                                ? (log.matchConfidence <= 1 ? log.matchConfidence * 100 : log.matchConfidence).toFixed(1)
                                : null
                              return (
                                <tr key={log.id}>
                                  <td>{formatViDate(log.workDate)}</td>
                                  <td>
                                    <strong>{log.employeeCode}</strong>
                                    <span className="table-cell-note muted">{log.employeeFullName}</span>
                                  </td>
                                  <td>{formatTimeClock(log.checkInTime)}</td>
                                  <td>{formatTimeClock(log.checkOutTime)}</td>
                                  <td><span className={`badge ${statusInfo.class}`}>{statusInfo.label}</span></td>
                                  <td className="numeric">
                                    {log.lateMinutes > 0 ? `Muộn ${log.lateMinutes}p` : log.earlyLeaveMinutes > 0 ? `Sớm ${log.earlyLeaveMinutes}p` : '—'}
                                  </td>
                                  <td className="numeric">{confPct ? `${confPct}%` : '—'}</td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                      <TablePagination
                        totalItems={scopedAttendanceLogs.length}
                        page={pagedAttLogs.safePage}
                        pageSize={attLogPageSize}
                        onPageChange={setAttLogPage}
                        onPageSizeChange={setAttLogPageSize}
                        itemLabel="lượt điểm danh"
                      />
                    </>
                  )}
                </>
              )}
            </section>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 3: BÁO CÁO HIỆU SUẤT CHỖ NGỒI & VÙNG LÀM VIỆC AI (OCCUPANCY)      */}
      {/* ===================================================================== */}
      {activeTab === 'occupancy' && (
        <div
          key={`${activeTab}_${periodMode}_${periodBounds.fileTag}_${departmentId ?? 'all'}`}
          className={`report-tab-pane ${slideDir}`}
        >
          <div className="section-block">
            <div className="monthly-summary-strip" aria-label="Tóm tắt hiệu suất không gian">
              <div className="summary-card">
                <span>Tỷ lệ lấp đầy bàn làm việc</span>
                <strong>{occupancySummary.spaceUtilizationPercent}%</strong>
                <small className="muted">{occupancySummary.presentCount + occupancySummary.wrongSeatCount}/{occupancySummary.totalDesks} bàn đang có người</small>
              </div>
              <div className="summary-card">
                <span>Đang ngồi / Rời tạm thời</span>
                <strong>{occupancySummary.presentCount} / {occupancySummary.tempAwayCount}</strong>
                <small className="muted">Cảnh báo rời quá hạn: {occupancySummary.prolongedAwayCount} bàn</small>
              </div>
              <div className="summary-card">
                <span>Tổng giờ hiện diện hôm nay</span>
                <strong>{occupancySummary.totalActiveHoursToday}g</strong>
                <small className="muted">Trung bình {occupancySummary.avgActiveMinutesPerDesk} phút/bàn</small>
              </div>
              <div className="summary-card">
                <span>Sự kiện rời bàn quá hạn trong kỳ</span>
                <strong>{occupancySummary.periodProlongedAwayEvents}</strong>
                <small className="muted">Ngồi sai chỗ: {occupancySummary.wrongSeatCount} · Bàn gán NV: {occupancySummary.assignedDeskRatePercent}%</small>
              </div>
            </div>
          </div>

          {/* Thanh Phân bổ 5 Trạng thái FSM & Mật độ theo Camera */}
          <div className="section-block occupancy-analytics-grid">
            <section className="panel occupancy-dist-panel">
              <div className="report-panel-heading">
                <p className="eyebrow">MÁY TRẠNG THÁI HỮU HẠN 5 TRẠNG THÁI (FSM)</p>
                <h2>Phân bổ Trạng thái Bàn làm việc Hiện tại</h2>
              </div>
              <div className="fsm-distribution-body">
                {occupancySummary.totalDesks === 0 ? (
                  <p className="muted">Chưa có bàn làm việc nào được cấu hình.</p>
                ) : (
                  <>
                    <div className="fsm-stacked-track" role="img" aria-label="Biểu đồ tỷ trọng trạng thái chỗ ngồi">
                      {(
                        [
                          { key: 'PRESENT', count: occupancySummary.presentCount },
                          { key: 'TEMP_AWAY', count: occupancySummary.tempAwayCount },
                          { key: 'PROLONGED_AWAY', count: occupancySummary.prolongedAwayCount },
                          { key: 'WRONG_SEAT', count: occupancySummary.wrongSeatCount },
                          { key: 'EMPTY', count: occupancySummary.emptyCount },
                        ] as const
                      ).map(seg => {
                        const pct = (seg.count / occupancySummary.totalDesks) * 100
                        if (pct <= 0) return null
                        const meta = seatStateMeta[seg.key]
                        return (
                          <div
                            key={seg.key}
                            style={{ width: `${pct}%`, background: meta.color }}
                            title={`${meta.label}: ${seg.count} bàn (${pct.toFixed(1)}%)`}
                          />
                        )
                      })}
                    </div>
                    <div className="fsm-legend-grid">
                      {(
                        [
                          { key: 'PRESENT', count: occupancySummary.presentCount },
                          { key: 'TEMP_AWAY', count: occupancySummary.tempAwayCount },
                          { key: 'PROLONGED_AWAY', count: occupancySummary.prolongedAwayCount },
                          { key: 'WRONG_SEAT', count: occupancySummary.wrongSeatCount },
                          { key: 'EMPTY', count: occupancySummary.emptyCount },
                        ] as const
                      ).map(seg => {
                        const meta = seatStateMeta[seg.key]
                        const pct = occupancySummary.totalDesks > 0 ? ((seg.count / occupancySummary.totalDesks) * 100).toFixed(1) : '0.0'
                        return (
                          <div key={seg.key} className="fsm-legend-item">
                            <span className="legend-dot" style={{ background: meta.color }} />
                            <div>
                              <span>{meta.label}</span>
                              <strong>{seg.count} bàn <small className="muted">({pct}%)</small></strong>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
            </section>

            <section className="panel occupancy-camera-panel">
              <div className="report-panel-heading">
                <p className="eyebrow">HIỆU SUẤT THEO KHU VỰC CAMERA</p>
                <h2>Mật độ Sử dụng theo Camera Giám sát</h2>
              </div>
              <div className="camera-breakdown-list">
                {occupancySummary.cameraBreakdown.length === 0 ? (
                  <p className="muted" style={{ padding: '0 20px 20px' }}>Chưa có dữ liệu camera bàn làm việc.</p>
                ) : (
                  occupancySummary.cameraBreakdown.map(cam => (
                    <div key={cam.cameraId} className="camera-breakdown-item">
                      <div className="camera-breakdown-head">
                        <div>
                          <strong>{cam.cameraCode}</strong>
                          <span className="muted"> · {cam.cameraName}</span>
                        </div>
                        <span><strong>{cam.utilizationPercent}%</strong> ({cam.presentCount}/{cam.totalDesks} bàn)</span>
                      </div>
                      <div className="progress-track">
                        <div className="progress-fill" style={{ width: `${cam.utilizationPercent}%` }} />
                      </div>
                      <small className="muted">
                        Tích lũy hôm nay: {cam.totalActiveHoursToday} giờ · Rời tạm: {cam.tempAwayCount} · Quá hạn: {cam.prolongedAwayCount}
                      </small>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>

          {/* Tầng 3: 1 Panel Bảng Duy Nhất với Sub-View Switcher (Vị trí bàn vs Lịch sử FSM) */}
          <div className="section-block">
            <section className="panel" aria-labelledby="occupancy-main-table-title">
              <div className="panel-subview-bar">
                <div className="subview-tabs" role="tablist" aria-label="Chế độ xem dữ liệu chỗ ngồi">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={occupancySubView === 'seats'}
                    className={`subview-tab-btn ${occupancySubView === 'seats' ? 'active' : ''}`}
                    onClick={() => setOccupancySubView('seats')}
                  >
                    Danh sách Vị trí Bàn ({filteredSeatRows.length.toLocaleString('vi-VN')})
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={occupancySubView === 'transitions'}
                    className={`subview-tab-btn ${occupancySubView === 'transitions' ? 'active' : ''}`}
                    onClick={() => setOccupancySubView('transitions')}
                  >
                    Lịch sử Chuyển trạng thái AI ({scopedOccupancyLogs.length.toLocaleString('vi-VN')})
                  </button>
                </div>

                <div className="subview-actions">
                  <label className="inline-search-box" aria-label="Tìm nhanh mã bàn, camera, nhân viên">
                    <MagnifyingGlass size={15} className="search-icon" aria-hidden="true" />
                    <input
                      type="search"
                      placeholder="Tìm mã bàn, camera, nhân sự..."
                      value={searchQuery}
                      onChange={e => handleSearchChange(e.target.value)}
                    />
                  </label>
                  <button type="button" className="button button-secondary" onClick={handleExportOccupancyCsv}>
                    <DownloadSimple size={16} /> Xuất CSV Chỗ ngồi
                  </button>
                </div>
              </div>

              {occupancySubView === 'seats' ? (
                <>
                  <div className="report-panel-heading-inline">
                    <h2 id="occupancy-main-table-title">Hiệu suất Sử dụng từng Vị trí Bàn làm việc</h2>
                    <span className="muted">Chuẩn quy đổi theo ca làm việc tiêu chuẩn 8 giờ/ngày</span>
                  </div>

                  {filteredSeatRows.length === 0 ? (
                    <div className="empty-state">
                      <Armchair size={36} className="muted" />
                      <h3>Không có vị trí bàn phù hợp</h3>
                    </div>
                  ) : (
                    <>
                      <div className="table-wrap" tabIndex={0} role="region">
                        <table>
                          <thead>
                            <tr>
                              <th scope="col">Mã bàn &amp; Vị trí</th>
                              <th scope="col">Loại vùng</th>
                              <th scope="col">Camera / Phòng</th>
                              <th scope="col">Nhân sự phụ trách</th>
                              <th scope="col">Trạng thái FSM</th>
                              <th scope="col" className="numeric">Thời gian hiện diện</th>
                              <th scope="col" className="numeric">Mức sử dụng (chuẩn 8h)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {pagedSeats.sliced.map(seat => {
                              const meta = seatStateMeta[seat.currentState] ?? { label: seat.currentState, badge: 'badge-neutral', color: '#64748b' }
                              return (
                                <tr key={seat.seatId}>
                                  <td>
                                    <strong>{seat.seatCode}</strong>
                                    <span className="table-cell-note muted">{seat.seatName}</span>
                                  </td>
                                  <td>
                                    <span className={`badge ${seat.zoneType === 'RESTRICTED_ZONE' ? 'badge-warning' : 'badge-info'}`}>
                                      {seat.zoneType === 'RESTRICTED_ZONE' ? 'Vùng hạn chế' : 'Bàn làm việc'}
                                    </span>
                                  </td>
                                  <td>
                                    <span>{seat.cameraCode}</span>
                                    <span className="table-cell-note muted">{seat.departmentCode}</span>
                                  </td>
                                  <td>
                                    {seat.assignedEmployeeName ? (
                                      <>
                                        <strong>{seat.assignedEmployeeCode}</strong>
                                        <span className="table-cell-note muted">{seat.assignedEmployeeName}</span>
                                      </>
                                    ) : (
                                      <span className="muted">Bàn dùng chung</span>
                                    )}
                                  </td>
                                  <td><span className={`badge ${meta.badge}`}>{meta.label}</span></td>
                                  <td className="numeric">{formatDurationLabel(seat.activeSecondsToday)}</td>
                                  <td className="numeric"><strong>{seat.utilizationPercent.toFixed(1)}%</strong></td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                      <TablePagination
                        totalItems={filteredSeatRows.length}
                        page={pagedSeats.safePage}
                        pageSize={seatPageSize}
                        onPageChange={setSeatPage}
                        onPageSizeChange={setSeatPageSize}
                        itemLabel="vị trí bàn"
                      />
                    </>
                  )}
                </>
              ) : (
                <>
                  <div className="report-panel-heading-inline">
                    <h2 id="occupancy-main-table-title">Nhật ký Chuyển trạng thái Chỗ ngồi AI (FSM)</h2>
                    <span className="muted">Ghi nhận tự động khi thay đổi trạng thái hiện diện tại bàn</span>
                  </div>

                  {scopedOccupancyLogs.length === 0 ? (
                    <div className="empty-state">
                      <p className="muted">Chưa ghi nhận lượt chuyển trạng thái FSM nào từ dịch vụ AI.</p>
                    </div>
                  ) : (
                    <>
                      <div className="table-wrap" tabIndex={0} role="region">
                        <table>
                          <thead>
                            <tr>
                              <th scope="col">Thời điểm</th>
                              <th scope="col">Mã bàn</th>
                              <th scope="col">Trạng thái trước</th>
                              <th scope="col">Trạng thái mới</th>
                              <th scope="col" className="numeric">Thời lượng giữ trạng thái</th>
                            </tr>
                          </thead>
                          <tbody>
                            {pagedOccLogs.sliced.map(log => {
                              const prevMeta = seatStateMeta[log.previousState] ?? { label: log.previousState, badge: 'badge-neutral', color: '#64748b' }
                              const nextMeta = seatStateMeta[log.newState] ?? { label: log.newState, badge: 'badge-neutral', color: '#64748b' }
                              return (
                                <tr key={log.id}>
                                  <td>{formatDateTime(log.recordedAt)}</td>
                                  <td><strong>{log.seatCode}</strong></td>
                                  <td><span className={`badge ${prevMeta.badge}`}>{prevMeta.label}</span></td>
                                  <td><span className={`badge ${nextMeta.badge}`}>{nextMeta.label}</span></td>
                                  <td className="numeric">{log.durationSeconds} giây</td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                      <TablePagination
                        totalItems={scopedOccupancyLogs.length}
                        page={pagedOccLogs.safePage}
                        pageSize={occLogPageSize}
                        onPageChange={setOccLogPage}
                        onPageSizeChange={setOccLogPageSize}
                        itemLabel="sự kiện"
                      />
                    </>
                  )}
                </>
              )}
            </section>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 4: BÁO CÁO AN NINH NGOÀI GIỜ & LÀM THÊM GIỜ (SECURITY & OT)       */}
      {/* ===================================================================== */}
      {activeTab === 'security_ot' && (
        <div
          key={`${activeTab}_${periodMode}_${periodBounds.fileTag}_${departmentId ?? 'all'}`}
          className={`report-tab-pane ${slideDir}`}
        >
          <div className="section-block">
            <div className="monthly-summary-strip" aria-label="Tóm tắt an ninh và OT">
              <div className="summary-card">
                <span>Tổng sự cố an ninh trong kỳ</span>
                <strong>{securityOtSummary.totalIncidents}</strong>
                <small className="muted">Mức 3: {securityOtSummary.level3Breach} · Spoofing: {securityOtSummary.spoofingAttempts}</small>
              </div>
              <div className="summary-card">
                <span>Tỷ lệ xử lý SOC (SLA)</span>
                <strong>{securityOtSummary.resolutionRatePercent}%</strong>
                <small className="muted">Chờ xử lý: {securityOtSummary.openCount} · Email đã gửi: {securityOtSummary.telegramAlertCount}</small>
              </div>
              <div className="summary-card">
                <span>Ca đăng ký làm thêm (OT)</span>
                <strong>{securityOtSummary.totalOtRegistrations}</strong>
                <small className="muted">Đã duyệt: {securityOtSummary.approvedOtCount} · Qua đêm: {securityOtSummary.overnightOtCount}</small>
              </div>
              <div className="summary-card">
                <span>Tổng giờ OT đã phê duyệt</span>
                <strong>{securityOtSummary.totalApprovedOtHours}g</strong>
                <small className="muted">Chờ duyệt: {securityOtSummary.pendingOtCount} · Từ chối: {securityOtSummary.rejectedOtCount}</small>
              </div>
            </div>
          </div>

          {/* Phân tích Cây quyết định An ninh 4 mức & Tiến độ xử lý SOC */}
          <div className="section-block occupancy-analytics-grid">
            <section className="panel">
              <div className="report-panel-heading">
                <p className="eyebrow">CÂY QUYẾT ĐỊNH NIGHT GUARD (19:00 – 06:00)</p>
                <h2>Phân bổ Sự cố theo Mức độ Cảnh báo</h2>
              </div>
              <div className="security-level-list">
                {(
                  [
                    { key: 'LEVEL_1_APPROVED_OT', count: securityOtSummary.level1ApprovedOt },
                    { key: 'LEVEL_2_UNAUTHORIZED_PRESENCE', count: securityOtSummary.level2Unauthorized },
                    { key: 'LEVEL_3_SECURITY_BREACH', count: securityOtSummary.level3Breach },
                    { key: 'SPOOFING_ATTEMPT', count: securityOtSummary.spoofingAttempts },
                  ] as const
                ).map(item => {
                  const meta = alertLevelMeta[item.key]
                  const pct = securityOtSummary.totalIncidents > 0
                    ? Math.round((item.count / securityOtSummary.totalIncidents) * 100)
                    : 0
                  return (
                    <div key={item.key} className="camera-breakdown-item">
                      <div className="camera-breakdown-head">
                        <span><strong>{meta.label}</strong></span>
                        <span><strong>{item.count}</strong> sự cố ({pct}%)</span>
                      </div>
                      <div className="progress-track">
                        <div className="progress-fill" style={{ width: `${pct}%`, background: meta.color }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>

            <section className="panel">
              <div className="report-panel-heading">
                <p className="eyebrow">HIỆU SUẤT PHẢN ỨNG TRUNG TÂM AN NINH</p>
                <h2>Trạng thái Đóng Biên bản &amp; Duyệt OT</h2>
              </div>
              <div className="soc-metrics-grid">
                <div className="soc-metric-box">
                  <span className="badge badge-danger">Chờ xử lý (OPEN)</span>
                  <strong>{securityOtSummary.openCount}</strong>
                </div>
                <div className="soc-metric-box">
                  <span className="badge badge-success">Đã xác minh</span>
                  <strong>{securityOtSummary.acknowledgedCount}</strong>
                </div>
                <div className="soc-metric-box">
                  <span className="badge badge-neutral">Báo động giả</span>
                  <strong>{securityOtSummary.falseAlarmCount}</strong>
                </div>
                <div className="soc-metric-box">
                  <span className="badge badge-info">Đã duyệt OT</span>
                  <strong>{securityOtSummary.approvedOtCount} ca</strong>
                </div>
              </div>
            </section>
          </div>

          {/* Tầng 3: 1 Panel Bảng Duy Nhất với Sub-View Switcher (Ca OT vs Sự cố An ninh) */}
          <div className="section-block">
            <section className="panel" aria-labelledby="security-main-table-title">
              <div className="panel-subview-bar">
                <div className="subview-tabs" role="tablist" aria-label="Chế độ xem an ninh và làm thêm giờ">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={securitySubView === 'ot_list'}
                    className={`subview-tab-btn ${securitySubView === 'ot_list' ? 'active' : ''}`}
                    onClick={() => setSecuritySubView('ot_list')}
                  >
                    Danh sách Ca Đăng ký OT ({filteredOtList.length.toLocaleString('vi-VN')})
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={securitySubView === 'incidents'}
                    className={`subview-tab-btn ${securitySubView === 'incidents' ? 'active' : ''}`}
                    onClick={() => setSecuritySubView('incidents')}
                  >
                    Nhật ký Sự cố An ninh ({filteredIncidents.length.toLocaleString('vi-VN')})
                  </button>
                </div>

                <div className="subview-actions">
                  <label className="inline-search-box" aria-label="Tìm nhanh nhân viên hoặc nội dung sự cố">
                    <MagnifyingGlass size={15} className="search-icon" aria-hidden="true" />
                    <input
                      type="search"
                      placeholder="Tìm mã NV, lý do OT, sự cố..."
                      value={searchQuery}
                      onChange={e => handleSearchChange(e.target.value)}
                    />
                  </label>
                  <button type="button" className="button button-secondary" onClick={handleExportSecurityOtCsv}>
                    <DownloadSimple size={16} /> Xuất CSV An ninh &amp; OT
                  </button>
                </div>
              </div>

              {securitySubView === 'ot_list' ? (
                <>
                  <div className="report-panel-heading-inline">
                    <h2 id="security-main-table-title">Ca Đăng ký Làm thêm giờ (OT) · {periodBounds.label}</h2>
                    <span className="muted">Đã duyệt: {securityOtSummary.approvedOtCount} ca · Tổng {securityOtSummary.totalApprovedOtHours} giờ</span>
                  </div>

                  {filteredOtList.length === 0 ? (
                    <div className="empty-state">
                      <Clock size={36} className="muted" />
                      <h3>Không có ca đăng ký OT nào trong kỳ {periodBounds.label}</h3>
                    </div>
                  ) : (
                    <>
                      <div className="table-wrap" tabIndex={0} role="region">
                        <table>
                          <thead>
                            <tr>
                              <th scope="col">Ngày OT</th>
                              <th scope="col">Nhân viên</th>
                              <th scope="col">Khung giờ</th>
                              <th scope="col" className="numeric">Thời lượng</th>
                              <th scope="col">Loại ca</th>
                              <th scope="col">Lý do công việc</th>
                              <th scope="col">Trạng thái duyệt</th>
                            </tr>
                          </thead>
                          <tbody>
                            {pagedOtList.sliced.map(ot => {
                              const statusInfo = otApprovalMeta[ot.approvalStatus] ?? { label: ot.approvalStatus, badge: 'badge-neutral' }
                              const hours = calculateOtDurationHours(ot.startTime, ot.endTime, ot.isOvernight)
                              return (
                                <tr key={ot.id}>
                                  <td>{formatViDate(ot.otDate)}</td>
                                  <td>
                                    <strong>{ot.employeeCode}</strong>
                                    <span className="table-cell-note muted">{ot.employeeFullName}</span>
                                  </td>
                                  <td>{ot.startTime.slice(0, 5)} – {ot.endTime.slice(0, 5)}</td>
                                  <td className="numeric"><strong>{hours.toFixed(1)}h</strong></td>
                                  <td>
                                    <span className={`badge ${ot.isOvernight ? 'badge-special' : 'badge-neutral'}`}>
                                      {ot.isOvernight ? 'Qua đêm' : 'Trong ngày'}
                                    </span>
                                  </td>
                                  <td>{ot.reason || '—'}</td>
                                  <td><span className={`badge ${statusInfo.badge}`}>{statusInfo.label}</span></td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                      <TablePagination
                        totalItems={filteredOtList.length}
                        page={pagedOtList.safePage}
                        pageSize={otPageSize}
                        onPageChange={setOtPage}
                        onPageSizeChange={setOtPageSize}
                        itemLabel="ca OT"
                      />
                    </>
                  )}
                </>
              ) : (
                <>
                  <div className="report-panel-heading-inline">
                    <h2 id="security-main-table-title">Nhật ký Sự cố An ninh Ngoài giờ · {periodBounds.label}</h2>
                    <span className="muted">Tỷ lệ đã xử lý (SLA): {securityOtSummary.resolutionRatePercent}%</span>
                  </div>

                  {filteredIncidents.length === 0 ? (
                    <div className="empty-state">
                      <ShieldWarning size={36} className="muted" />
                      <h3>Không ghi nhận sự cố an ninh nào trong kỳ {periodBounds.label}</h3>
                    </div>
                  ) : (
                    <>
                      <div className="table-wrap" tabIndex={0} role="region">
                        <table>
                          <thead>
                            <tr>
                              <th scope="col">Thời điểm</th>
                              <th scope="col">Mức cảnh báo</th>
                              <th scope="col">Đối tượng nhận diện</th>
                              <th scope="col">Email</th>
                              <th scope="col">Trạng thái</th>
                              <th scope="col">Tóm tắt / Biên bản xử lý</th>
                            </tr>
                          </thead>
                          <tbody>
                            {pagedIncidents.sliced.map(inc => {
                              const lvl = alertLevelMeta[inc.alertLevel] ?? { label: inc.alertLevel, badge: 'badge-neutral', color: '#64748b' }
                              const tkt = ticketStatusMeta[inc.ticketStatus] ?? { label: inc.ticketStatus, badge: 'badge-neutral' }
                              return (
                                <tr key={inc.id}>
                                  <td>{formatDateTime(inc.detectedAt)}</td>
                                  <td><span className={`badge ${lvl.badge}`}>{lvl.label}</span></td>
                                  <td>
                                    {inc.detectedEmployeeName ? (
                                      <>
                                        <strong>{inc.detectedEmployeeCode}</strong>
                                        <span className="table-cell-note muted">{inc.detectedEmployeeName}</span>
                                      </>
                                    ) : (
                                      <span className="text-danger">Người lạ chưa định danh</span>
                                    )}
                                  </td>
                                  <td>{inc.telegramSent ? 'Đã gửi' : 'Không'}</td>
                                  <td><span className={`badge ${tkt.badge}`}>{tkt.label}</span></td>
                                  <td>{inc.resolutionNote || inc.actionSummary || '—'}</td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                      <TablePagination
                        totalItems={filteredIncidents.length}
                        page={pagedIncidents.safePage}
                        pageSize={incPageSize}
                        onPageChange={setIncPage}
                        onPageSizeChange={setIncPageSize}
                        itemLabel="sự cố"
                      />
                    </>
                  )}
                </>
              )}
            </section>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 5: PHIẾU BÁO CÁO HÀNH CHÍNH & IN A4 / XUẤT PDF                   */}
      {/* ===================================================================== */}
      {activeTab === 'print_sheet' && (
        <div
          key={`${activeTab}_${periodMode}_${periodBounds.fileTag}_${departmentId ?? 'all'}`}
          className={`report-tab-pane ${slideDir}`}
        >
          {printOrientation === 'landscape' && (
            <style>{`@media print { @page { size: A4 landscape; margin: 11mm; } }`}</style>
          )}

          {/* Thanh Điều khiển Bản in & Xuất Sổ tay Excel / CSV */}
          <div className="print-actions-toolbar panel no-print">
            <div className="print-toolbar-top">
              <div>
                <strong>Thiết lập Bản in A4 / Xuất PDF &amp; Gói Báo cáo Doanh nghiệp</strong>
                <p className="muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
                  Mẫu phiếu tách biệt khối KPI, Quân số Làm/Nghỉ/Vắng và Bảng đối soát 8 cột để giữ bố cục in 1–2 trang A4 sắc nét.
                </p>
              </div>
              <div className="print-toolbar-buttons">
                <button
                  type="button"
                  className="button button-excel"
                  onClick={handleExportFullExcelWorkbook}
                  disabled={isLoadingAny}
                  title="Sheet 1 trình bày giống hệt Phiếu Preview bên dưới; Sheet 2–4 chứa đầy đủ phụ lục chi tiết"
                >
                  <Table size={16} aria-hidden="true" />
                  Xuất Excel giống Bản in (.XLS)
                </button>

                <div className="export-dropdown-wrap" ref={toolbarCsvMenuRef}>
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => setOpenCsvMenu(prev => (prev === 'toolbar' ? null : 'toolbar'))}
                    aria-expanded={openCsvMenu === 'toolbar'}
                    aria-haspopup="menu"
                  >
                    <DownloadSimple size={16} aria-hidden="true" />
                    Tải CSV từng bảng ▾
                  </button>
                  {openCsvMenu === 'toolbar' && (
                    <div className="export-dropdown-menu" role="menu" aria-label="Xuất CSV từng phân hệ">
                      <button type="button" className="export-dropdown-item" role="menuitem" onClick={handleExportDepartmentCsv}>
                        <span>1. Tổng hợp Phòng ban (.CSV)</span>
                        <small className="muted">{activeDepartmentGroups.length} phòng ban + dòng Tổng</small>
                      </button>
                      <button type="button" className="export-dropdown-item" role="menuitem" onClick={handleExportTimesheetCsv}>
                        <span>2. Chấm công Nhân viên (.CSV)</span>
                        <small className="muted">{filteredTimesheetRows.length} nhân sự + dòng Tổng</small>
                      </button>
                      <button type="button" className="export-dropdown-item" role="menuitem" onClick={handleExportOccupancyCsv}>
                        <span>3. Hiệu suất Chỗ ngồi AI (.CSV)</span>
                        <small className="muted">{filteredSeatRows.length} vị trí bàn</small>
                      </button>
                      <button type="button" className="export-dropdown-item" role="menuitem" onClick={handleExportSecurityOtCsv}>
                        <span>4. An ninh SOC &amp; OT (.CSV)</span>
                        <small className="muted">{filteredOtList.length} OT · {filteredIncidents.length} sự cố</small>
                      </button>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  className="button button-primary"
                  onClick={() => {
                    setPrintedAt(formatDateTime(new Date()))
                    window.print()
                  }}
                >
                  <Printer size={18} aria-hidden="true" /> In Phiếu / Lưu PDF
                </button>
              </div>
            </div>

            <div className="print-config-bar">
              <div className="print-config-group">
                <span className="filter-caption">Khổ giấy A4</span>
                <div className="period-segmented" role="group" aria-label="Chọn hướng giấy in A4">
                  <button
                    type="button"
                    className={`period-seg-btn ${printOrientation === 'portrait' ? 'active' : ''}`}
                    onClick={() => setPrintOrientation('portrait')}
                  >
                    A4 Dọc (Portrait)
                  </button>
                  <button
                    type="button"
                    className={`period-seg-btn ${printOrientation === 'landscape' ? 'active' : ''}`}
                    onClick={() => setPrintOrientation('landscape')}
                  >
                    A4 Ngang (Landscape)
                  </button>
                </div>
              </div>

              <label className="print-mode-selector">
                <span>Phạm vi nhân sự in:</span>
                <select
                  value={printMode}
                  onChange={e => setPrintMode(e.target.value as 'exceptions_only' | 'top_50' | 'all')}
                >
                  <option value="exceptions_only">Tóm tắt &amp; Ngoại lệ (Khuyến nghị)</option>
                  <option value="top_50">Tối đa 50 nhân sự</option>
                  <option value="all">Toàn bộ ({filteredTimesheetRows.length} người)</option>
                </select>
              </label>

              <div className="print-section-toggles" role="group" aria-label="Chọn các mục đưa vào bản in">
                <span className="filter-caption">Hiển thị mục:</span>
                {[
                  { key: 'kpi' as const, label: 'I. KPI' },
                  { key: 'dept' as const, label: 'II. Phòng ban' },
                  { key: 'roster' as const, label: 'III. Quân số & Công' },
                  { key: 'occSec' as const, label: 'IV. AI & An ninh' },
                ].map(sec => (
                  <label key={sec.key} className={`print-section-pill ${printSections[sec.key] ? 'active' : ''}`}>
                    <input
                      type="checkbox"
                      checked={printSections[sec.key]}
                      onChange={e => setPrintSections(prev => ({ ...prev, [sec.key]: e.target.checked }))}
                    />
                    <span>{sec.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <article
            className={`panel print-sheet-document print-${printOrientation}`}
            aria-label="Mẫu phiếu báo cáo tổng hợp Smart Office"
          >
            {/* Quốc hiệu & Định danh Chứng từ */}
            <div className="print-national-header">
              <div className="print-org-left">
                <strong>HỆ THỐNG QUẢN TRỊ VĂN PHÒNG THÔNG MINH AIoT</strong>
                <span>SMART OFFICE COMPUTER VISION &amp; AIOT SYSTEM</span>
                <small>Phân hệ Báo cáo Tổng hợp Điều hành · Chứng từ nội bộ</small>
              </div>
              <div className="print-org-right">
                <strong>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</strong>
                <span>Độc lập - Tự do - Hạnh phúc</span>
                <small>Mã phiếu: BC-SO/{periodBounds.fileTag}</small>
              </div>
            </div>

            <div className="print-document-title">
              <h2>BÁO CÁO TỔNG HỢP CHẤM CÔNG, HIỆU SUẤT KHÔNG GIAN &amp; AN NINH</h2>
            </div>

            {/* Dải Metadata 4 ô đóng khung chuẩn hành chính */}
            <div className="print-meta-strip">
              <div>
                <span>Kỳ báo cáo</span>
                <strong>{periodBounds.label}</strong>
                <small>{formatViDate(periodBounds.fromDate)} – {formatViDate(periodBounds.toDate)}</small>
              </div>
              <div>
                <span>Phạm vi áp dụng</span>
                <strong>{scopeLabel}</strong>
                <small>{activeDepartmentGroups.length} phòng ban · {timesheetAggregates.totalEmployees} nhân sự</small>
              </div>
              <div>
                <span>Người lập biểu</span>
                <strong>{session.user.fullName}</strong>
                <small>Phòng Quản trị / Nhân sự</small>
              </div>
              <div>
                <span>Thời điểm kết xuất</span>
                <strong>{printedAt}</strong>
                <small>Múi giờ UTC+7 (Việt Nam)</small>
              </div>
            </div>

            {/* Phần I: 6 Thẻ KPI Điều hành kèm Thanh Tiến độ */}
            {printSections.kpi && (
              <section className="print-section">
                <h3>I. CHỈ SỐ TỔNG HỢP ĐIỀU HÀNH TOÀN HỆ THỐNG</h3>
                <div className="print-kpi-grid">
                  {(() => {
                    const totalEmp = timesheetAggregates.totalEmployees
                    const workingPct = totalEmp > 0 ? Math.round((workingRoster.length / totalEmp) * 1000) / 10 : 0
                    const kpiItems = [
                      {
                        label: 'Quân số đi làm thực tế',
                        value: `${workingRoster.length.toLocaleString('vi-VN')} / ${totalEmp.toLocaleString('vi-VN')} người`,
                        sub: `${workingPct}% quân số · ${onLeaveRoster.length} nghỉ phép · ${absentRoster.length} vắng`,
                        pct: workingPct,
                        tone: workingPct >= 85 ? 'success' : 'warning',
                      },
                      {
                        label: 'Tỷ lệ chuyên cần kỳ',
                        value: `${timesheetAggregates.attendanceRate}%`,
                        sub: `${timesheetAggregates.totalPresentDays} ngày công · ${timesheetAggregates.totalAbsentDays} vắng KP`,
                        pct: timesheetAggregates.attendanceRate,
                        tone: timesheetAggregates.attendanceRate >= 90 ? 'success' : timesheetAggregates.attendanceRate >= 75 ? 'warning' : 'danger',
                      },
                      {
                        label: 'Tỷ lệ đi làm đúng giờ',
                        value: `${timesheetAggregates.onTimeRate}%`,
                        sub: `${timesheetAggregates.totalOnTimeDays} đúng giờ · ${timesheetAggregates.totalLateDays} muộn (${timesheetAggregates.totalLateMinutes}p)`,
                        pct: timesheetAggregates.onTimeRate,
                        tone: timesheetAggregates.onTimeRate >= 85 ? 'success' : 'warning',
                      },
                      {
                        label: 'Quỹ giờ công & OT duyệt',
                        value: `${timesheetAggregates.totalWorkHours.toLocaleString('vi-VN')} giờ`,
                        sub: `+${timesheetAggregates.totalOtHours.toFixed(1)} giờ OT đã duyệt (${securityOtSummary.approvedOtCount} ca)`,
                        pct: Math.min(100, timesheetAggregates.totalEmployees > 0 ? Math.round((timesheetAggregates.totalWorkHours / (timesheetAggregates.totalEmployees * 8)) * 100) : 0),
                        tone: 'info',
                      },
                      {
                        label: 'Hiệu suất sử dụng bàn AI',
                        value: `${occupancySummary.spaceUtilizationPercent}%`,
                        sub: `${occupancySummary.presentCount}/${occupancySummary.totalDesks} bàn đang ngồi · ${occupancySummary.periodProlongedAwayEvents} rời >15p`,
                        pct: occupancySummary.spaceUtilizationPercent,
                        tone: 'info',
                      },
                      {
                        label: 'An ninh ngoài giờ & SLA',
                        value: `${securityOtSummary.totalIncidents} sự cố · SLA ${securityOtSummary.resolutionRatePercent}%`,
                        sub: `Mức 3: ${securityOtSummary.level3Breach} · Spoofing: ${securityOtSummary.spoofingAttempts} · Mở: ${securityOtSummary.openCount}`,
                        pct: securityOtSummary.resolutionRatePercent,
                        tone: securityOtSummary.openCount > 0 || securityOtSummary.level3Breach > 0 ? 'danger' : 'success',
                      },
                    ]
                    return kpiItems.map(item => (
                      <div key={item.label} className={`print-kpi-card tone-${item.tone}`}>
                        <span className="print-kpi-label">{item.label}</span>
                        <strong>{item.value}</strong>
                        <div className="print-kpi-bar-track" aria-hidden="true">
                          <div className={`print-kpi-bar-fill fill-${item.tone}`} style={{ width: `${Math.min(100, Math.max(0, item.pct))}%` }} />
                        </div>
                        <small>{item.sub}</small>
                      </div>
                    ))
                  })()}
                </div>
              </section>
            )}

            {/* Phần II: Bảng Phòng ban kèm Tổng cộng Toàn đơn vị */}
            {printSections.dept && (
              <section className="print-section">
                <h3>II. TỔNG HỢP CHUYÊN CẦN, GIỜ CÔNG &amp; AN NINH THEO PHÒNG BAN</h3>
                <table className="print-table">
                  <thead>
                    <tr>
                      <th style={{ width: 38, textAlign: 'center' }}>STT</th>
                      <th>Phòng ban</th>
                      <th className="numeric">Đúng giờ</th>
                      <th className="numeric">Đi muộn</th>
                      <th className="numeric">Vắng mặt</th>
                      <th className="numeric">Giờ công (h)</th>
                      <th className="numeric">Giờ OT (h)</th>
                      <th className="numeric">Rời bàn &gt;15p</th>
                      <th className="numeric">Cảnh báo AN</th>
                      <th className="numeric">Tỷ lệ CC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeDepartmentGroups.length === 0 ? (
                      <tr><td colSpan={10} style={{ textAlign: 'center' }}>Chưa có dữ liệu phòng ban trong kỳ.</td></tr>
                    ) : (
                      activeDepartmentGroups.map((grp, idx) => {
                        const present = grp.onTime + grp.late
                        const rate = grp.total > 0 ? ((present / grp.total) * 100).toFixed(1) : '0.0'
                        const extra = deptWorkHoursMap.get(grp.departmentId)
                        return (
                          <tr key={grp.departmentId}>
                            <td style={{ textAlign: 'center' }}>{idx + 1}</td>
                            <td><strong>{grp.departmentCode}</strong></td>
                            <td className="numeric">{grp.onTime}</td>
                            <td className="numeric">{grp.late}</td>
                            <td className="numeric">{grp.absent}</td>
                            <td className="numeric">{extra ? extra.workHours.toFixed(1) : '0.0'}</td>
                            <td className="numeric">{extra ? extra.otHours.toFixed(1) : '0.0'}</td>
                            <td className="numeric">{grp.prolongedAway}</td>
                            <td className="numeric">{grp.securityAlerts}</td>
                            <td className="numeric"><strong>{rate}%</strong></td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                  {activeDepartmentGroups.length > 0 && (() => {
                    const sumOnTime = activeDepartmentGroups.reduce((s, g) => s + g.onTime, 0)
                    const sumLate = activeDepartmentGroups.reduce((s, g) => s + g.late, 0)
                    const sumAbsent = activeDepartmentGroups.reduce((s, g) => s + g.absent, 0)
                    const sumProlonged = activeDepartmentGroups.reduce((s, g) => s + g.prolongedAway, 0)
                    const sumAlerts = activeDepartmentGroups.reduce((s, g) => s + g.securityAlerts, 0)
                    const sumConsidered = activeDepartmentGroups.reduce((s, g) => s + g.total, 0)
                    const sumWork = activeDepartmentGroups.reduce((s, g) => s + (deptWorkHoursMap.get(g.departmentId)?.workHours ?? 0), 0)
                    const sumOt = activeDepartmentGroups.reduce((s, g) => s + (deptWorkHoursMap.get(g.departmentId)?.otHours ?? 0), 0)
                    const overallRate = sumConsidered > 0 ? (((sumOnTime + sumLate) / sumConsidered) * 100).toFixed(1) : '0.0'
                    return (
                      <tfoot>
                        <tr>
                          <td colSpan={2}>TỔNG CỘNG TOÀN ĐƠN VỊ ({activeDepartmentGroups.length} phòng)</td>
                          <td className="numeric">{sumOnTime}</td>
                          <td className="numeric">{sumLate}</td>
                          <td className="numeric">{sumAbsent}</td>
                          <td className="numeric">{sumWork.toFixed(1)}</td>
                          <td className="numeric">{sumOt.toFixed(1)}</td>
                          <td className="numeric">{sumProlonged}</td>
                          <td className="numeric">{sumAlerts}</td>
                          <td className="numeric">{overallRate}%</td>
                        </tr>
                      </tfoot>
                    )
                  })()}
                </table>
              </section>
            )}

            {/* Phần III: Phân loại Quân số 3 Khối & Bảng Chấm công 8 cột cân đối */}
            {printSections.roster && (
              <section className="print-section">
                <h3>
                  III. PHÂN LOẠI QUÂN SỐ &amp; BẢNG CHẤM CÔNG ĐỐI SOÁT (
                  {printTimesheetRows.length < filteredTimesheetRows.length
                    ? `Hiển thị ${printTimesheetRows.length}/${filteredTimesheetRows.length} nhân sự`
                    : `${filteredTimesheetRows.length} nhân sự`}
                  )
                </h3>

                {/* 3 Thẻ Tóm tắt Quân số Đặt cạnh nhau (Không còn đoạn văn xuôi dài dòng) */}
                <div className="print-roster-cards-grid">
                  <div className="print-roster-card tone-success">
                    <div className="print-roster-card-head">
                      <span>1. Đi làm / Có mặt</span>
                      <strong>{workingRoster.length.toLocaleString('vi-VN')} người</strong>
                    </div>
                    <p className="print-roster-card-sub">
                      Đúng giờ cả kỳ: <strong>{workingRoster.filter(r => r.lateDays === 0 && r.earlyLeaveDays === 0).length}</strong> · Có muộn/sớm:{' '}
                      <strong>{workingRoster.filter(r => r.lateDays > 0 || r.earlyLeaveDays > 0).length}</strong>
                    </p>
                    <p className="print-roster-card-body">
                      {workingByDeptSummary.length > 0
                        ? workingByDeptSummary.map(d => `${d.code}: ${d.count} (${d.hours.toFixed(1)}h)`).join(' · ')
                        : 'Chưa ghi nhận nhân sự có mặt.'}
                    </p>
                  </div>

                  <div className="print-roster-card tone-info">
                    <div className="print-roster-card-head">
                      <span>2. Nghỉ có phép</span>
                      <strong>{onLeaveRoster.length.toLocaleString('vi-VN')} người</strong>
                    </div>
                    <p className="print-roster-card-sub">
                      Tổng quỹ ngày phép đã duyệt: <strong>{timesheetAggregates.totalLeaveDays} ngày</strong>
                    </p>
                    {onLeaveRoster.length === 0 ? (
                      <p className="print-roster-card-body">Không có nhân sự nghỉ phép trong kỳ.</p>
                    ) : (
                      <ul className="print-roster-mini-list">
                        {onLeaveRoster.slice(0, 8).map(r => (
                          <li key={r.employeeId}>
                            <strong>{r.employeeCode}</strong> · {r.fullName} <span>({r.leaveDetailsText})</span>
                          </li>
                        ))}
                        {onLeaveRoster.length > 8 && (
                          <li className="more-note">+ {(onLeaveRoster.length - 8).toLocaleString('vi-VN')} nhân sự khác (xem file Excel)</li>
                        )}
                      </ul>
                    )}
                  </div>

                  <div className="print-roster-card tone-danger">
                    <div className="print-roster-card-head">
                      <span>3. Vắng KP / Chưa điểm danh</span>
                      <strong>{absentRoster.length.toLocaleString('vi-VN')} người</strong>
                    </div>
                    <p className="print-roster-card-sub">
                      Ngày vắng chốt ABSENT: <strong>{timesheetAggregates.totalAbsentDays} ngày</strong>
                    </p>
                    {absentRoster.length === 0 ? (
                      <p className="print-roster-card-body">Đầy đủ quân số, không có trường hợp vắng không phép.</p>
                    ) : (
                      <ul className="print-roster-mini-list">
                        {absentRoster.slice(0, 8).map(r => (
                          <li key={r.employeeId}>
                            <strong>{r.employeeCode}</strong> · {r.fullName}{' '}
                            <span>({r.absentDays > 0 ? `Vắng ${r.absentDays} ngày` : 'Chưa chấm công'})</span>
                          </li>
                        ))}
                        {absentRoster.length > 8 && (
                          <li className="more-note">+ {(absentRoster.length - 8).toLocaleString('vi-VN')} nhân sự khác (xem file Excel)</li>
                        )}
                      </ul>
                    )}
                  </div>
                </div>

                {/* 1 Bảng Chấm công 8 cột duy nhất, phân nhóm Phòng ban rõ ràng trên A4 */}
                <table className="print-table">
                  <thead>
                    <tr>
                      <th style={{ width: 34, textAlign: 'center' }}>STT</th>
                      <th>Nhân sự</th>
                      <th style={{ width: 58 }}>Phòng</th>
                      <th>Trạng thái</th>
                      <th className="numeric">Công / Phép / Vắng</th>
                      <th className="numeric">Đi muộn</th>
                      <th className="numeric">Giờ làm / OT</th>
                      <th>Chi tiết Ngày làm · Nghỉ phép · Bàn AI</th>
                    </tr>
                  </thead>
                  <tbody>
                    {printTimesheetDeptGroups.length === 0 ? (
                      <tr>
                        <td colSpan={8} style={{ textAlign: 'center' }}>
                          {filteredTimesheetRows.length > 0 && printMode === 'exceptions_only'
                            ? `Toàn bộ ${filteredTimesheetRows.length} nhân sự đều đi làm đúng giờ, không có trường hợp nghỉ phép, đi muộn hay vắng mặt.`
                            : 'Chưa có bản ghi chấm công nhân sự.'}
                        </td>
                      </tr>
                    ) : (
                      <>
                        {printTimesheetDeptGroups.map(deptGrp => (
                          <Fragment key={deptGrp.departmentId}>
                            <tr className="print-dept-divider-row">
                              <td colSpan={8}>
                                PHÒNG {deptGrp.departmentName.toUpperCase()} ({deptGrp.departmentCode}) — {deptGrp.rows.length} nhân sự · Đi làm: {deptGrp.workingCount} · Nghỉ phép: {deptGrp.onLeaveCount} · Vắng: {deptGrp.absentCount} · Chuyên cần: {deptGrp.avgAttendanceRatePercent.toFixed(1)}%
                              </td>
                            </tr>
                            {deptGrp.rows.map((r, idx) => {
                              const detailsText = [
                                r.workingDatesList.length > 0 ? `Làm: ${r.workingDatesList.join(', ')}` : '',
                                r.leaveDetailsText !== '—' ? `Phép: ${r.leaveDetailsText}` : '',
                                r.absentDatesList.length > 0 ? `Vắng KP: ${r.absentDatesList.join(', ')}` : '',
                                r.assignedSeatText !== 'Chưa gán bàn' ? `Bàn: ${r.assignedSeatText}` : '',
                              ]
                                .filter(Boolean)
                                .join(' · ') || 'Chưa phát sinh dữ liệu'
                              return (
                                <tr key={r.employeeId}>
                                  <td style={{ textAlign: 'center' }}>{idx + 1}</td>
                                  <td>
                                    <strong>{r.employeeCode}</strong>
                                    <span className="print-cell-sub">{r.fullName}</span>
                                  </td>
                                  <td>{r.departmentCode}</td>
                                  <td>
                                    <span className={`print-status-pill pill-${r.workStatusTone}`}>{r.workStatusLabel}</span>
                                  </td>
                                  <td className="numeric">
                                    <strong>{r.presentDays}</strong> / {r.approvedLeaveDays} / {r.absentDays}
                                  </td>
                                  <td className="numeric">
                                    {r.lateDays > 0 ? `${r.lateDays} (${r.totalLateMinutes}p)` : '—'}
                                  </td>
                                  <td className="numeric">
                                    <strong>{r.totalWorkHours.toFixed(1)}h</strong>
                                    {r.approvedOtHours > 0 ? ` (+${r.approvedOtHours.toFixed(1)}h)` : ''}
                                  </td>
                                  <td className="print-detail-col">{detailsText}</td>
                                </tr>
                              )
                            })}
                            <tr className="print-dept-subtotal-row">
                              <td colSpan={4}>Cộng phòng {deptGrp.departmentCode} ({deptGrp.rows.length} người)</td>
                              <td className="numeric">{deptGrp.totalPresentDays} / {deptGrp.totalLeaveDays} / {deptGrp.totalAbsentDays}</td>
                              <td className="numeric">{deptGrp.totalLateDays > 0 ? `${deptGrp.totalLateDays} (${deptGrp.totalLateMinutes}p)` : '—'}</td>
                              <td className="numeric">{deptGrp.totalWorkHours.toFixed(1)}h{deptGrp.totalOtHours > 0 ? ` (+${deptGrp.totalOtHours.toFixed(1)}h)` : ''}</td>
                              <td>Chuyên cần TB phòng: {deptGrp.avgAttendanceRatePercent.toFixed(1)}%</td>
                            </tr>
                          </Fragment>
                        ))}
                        {printTimesheetRows.length < filteredTimesheetRows.length && (
                          <tr>
                            <td colSpan={8} style={{ textAlign: 'center', fontStyle: 'italic', color: '#475569' }}>
                              * Đang ẩn {(filteredTimesheetRows.length - printTimesheetRows.length).toLocaleString('vi-VN')} nhân sự đi làm bình thường để tối ưu khổ giấy in A4. Xuất Excel Đa Sheet (.XLS) hoặc CSV để xem toàn bộ theo từng phòng ban.
                            </td>
                          </tr>
                        )}
                      </>
                    )}
                  </tbody>
                  {printTimesheetDeptGroups.length > 0 && (() => {
                    const pSum = printTimesheetDeptGroups.reduce((s, g) => s + g.totalPresentDays, 0)
                    const lSum = printTimesheetDeptGroups.reduce((s, g) => s + g.totalLeaveDays, 0)
                    const aSum = printTimesheetDeptGroups.reduce((s, g) => s + g.totalAbsentDays, 0)
                    const lateDSum = printTimesheetDeptGroups.reduce((s, g) => s + g.totalLateDays, 0)
                    const lateMSum = printTimesheetDeptGroups.reduce((s, g) => s + g.totalLateMinutes, 0)
                    const hSum = printTimesheetDeptGroups.reduce((s, g) => s + g.totalWorkHours, 0)
                    const otSum = printTimesheetDeptGroups.reduce((s, g) => s + g.totalOtHours, 0)
                    return (
                      <tfoot>
                        <tr>
                          <td colSpan={4}>TỔNG CỘNG TOÀN ĐƠN VỊ ({printTimesheetRows.length} người / {printTimesheetDeptGroups.length} phòng ban)</td>
                          <td className="numeric">{pSum} / {lSum} / {aSum}</td>
                          <td className="numeric">{lateDSum} ({lateMSum}p)</td>
                          <td className="numeric">{hSum.toFixed(1)}h{otSum > 0 ? ` (+${otSum.toFixed(1)}h)` : ''}</td>
                          <td>Đã đối soát dữ liệu Face ArcFace &amp; Đơn nghỉ phép</td>
                        </tr>
                      </tfoot>
                    )
                  })()}
                </table>
              </section>
            )}

            {/* Phần IV: 2 Bảng Đối xứng Không gian AI & An ninh SOC/OT */}
            {printSections.occSec && (
              <section className="print-section">
                <h3>IV. ĐỐI SOÁT KHÔNG GIAN CHỖ NGỒI AI &amp; AN NINH NGOÀI GIỜ (SOC)</h3>
                <div className="print-dual-tables-grid">
                  <div>
                    <h4 className="print-subtable-title">A. Hiệu suất Chỗ ngồi AI (FSM)</h4>
                    <table className="print-table print-table-compact">
                      <tbody>
                        <tr>
                          <td>Tổng số bàn làm việc / Vùng hạn chế</td>
                          <td className="numeric"><strong>{occupancySummary.totalDesks} bàn / {occupancySummary.restrictedZones} vùng</strong></td>
                        </tr>
                        <tr>
                          <td>Đang làm việc tại bàn (PRESENT)</td>
                          <td className="numeric"><strong>{occupancySummary.presentCount} bàn</strong></td>
                        </tr>
                        <tr>
                          <td>Rời tạm thời / Rời quá hạn &gt;15 phút</td>
                          <td className="numeric">{occupancySummary.tempAwayCount} tạm · {occupancySummary.prolongedAwayCount} quá hạn</td>
                        </tr>
                        <tr>
                          <td>Ngồi sai vị trí / Bàn đang trống</td>
                          <td className="numeric">{occupancySummary.wrongSeatCount} sai chỗ · {occupancySummary.emptyCount} trống</td>
                        </tr>
                        <tr>
                          <td>Tổng giờ hiện diện tích lũy &amp; Lấp đầy</td>
                          <td className="numeric"><strong>{occupancySummary.totalActiveHoursToday}h ({occupancySummary.spaceUtilizationPercent}%)</strong></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <div>
                    <h4 className="print-subtable-title">B. Kiểm soát An ninh Ngoài giờ &amp; OT</h4>
                    <table className="print-table print-table-compact">
                      <tbody>
                        <tr>
                          <td>Ca đăng ký OT / Đã phê duyệt</td>
                          <td className="numeric"><strong>{securityOtSummary.totalOtRegistrations} ca ({securityOtSummary.approvedOtCount} duyệt)</strong></td>
                        </tr>
                        <tr>
                          <td>Tổng giờ OT duyệt / Ca qua đêm</td>
                          <td className="numeric"><strong>{securityOtSummary.totalApprovedOtHours}h ({securityOtSummary.overnightOtCount} qua đêm)</strong></td>
                        </tr>
                        <tr>
                          <td>Cảnh báo Mức 1 (OT) / Mức 2 (Chưa OT)</td>
                          <td className="numeric">M1: {securityOtSummary.level1ApprovedOt} · M2: {securityOtSummary.level2Unauthorized}</td>
                        </tr>
                        <tr>
                          <td>Xâm nhập Mức 3 / Giả mạo sinh trắc</td>
                          <td className="numeric"><strong>M3: {securityOtSummary.level3Breach} · Spoof: {securityOtSummary.spoofingAttempts}</strong></td>
                        </tr>
                        <tr>
                          <td>Tổng sự cố / Tỷ lệ xử lý SLA</td>
                          <td className="numeric"><strong>{securityOtSummary.totalIncidents} sự cố ({securityOtSummary.resolutionRatePercent}%)</strong></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            )}

            {/* Khung Chữ ký 3 cột & Chân trang Kiểm toán */}
            <footer className="print-signatures">
              <div className="print-sig-col">
                <strong>NGƯỜI LẬP BIỂU</strong>
                <small>(Ký, ghi rõ họ tên)</small>
                <div className="sig-space" />
                <span>{session.user.fullName}</span>
              </div>
              <div className="print-sig-col">
                <strong>PHÒNG HÀNH CHÍNH NHÂN SỰ</strong>
                <small>(Xác nhận bảng công &amp; OT)</small>
                <div className="sig-space" />
                <span>........................................</span>
              </div>
              <div className="print-sig-col">
                <strong>BAN GIÁM ĐỐC PHÊ DUYỆT</strong>
                <small>(Ký tên, đóng dấu)</small>
                <div className="sig-space" />
                <span>........................................</span>
              </div>
            </footer>

            <div className="print-audit-footer">
              <span>Chứng từ trích xuất tự động từ Smart Office AIoT · Số hiệu: BC-SO/{periodBounds.fileTag}</span>
              <span>Khổ in: {printOrientation === 'landscape' ? 'A4 Ngang (Landscape)' : 'A4 Dọc (Portrait)'} · Xuất lúc {printedAt}</span>
            </div>
          </article>
        </div>
      )}
    </div>
  )
}
