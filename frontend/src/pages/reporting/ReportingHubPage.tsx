import { 
  ArrowClockwise, 
  CalendarBlank, 
  CalendarCheck, 
  ChartBar, 
  ChartPieSlice, 
  CaretLeft,
  CaretRight,
  Buildings
} from '@phosphor-icons/react'
import { useCallback, useEffect, useState } from 'react'
import { KpiStatCards } from '../../components/common/KpiStatCards'
import type { KpiStat } from '../../components/common/KpiStatCards'
import { useQuery } from '../../components/common/useQuery'
import { AttendanceCharts } from '../../components/reporting/AttendanceCharts'
import { ExportCsvToolbar } from '../../components/reporting/ExportCsvToolbar'
import { WeeklyTrendChart } from '../../components/reporting/WeeklyTrendChart'
import { listDepartments } from '../../services/authService'
import { signalrService } from '../../services/signalrService'
import { 
  dailySummaries, 
  departmentScope, 
  formatDateTime, 
  monthlyReport, 
  officeDate, 
  onTimeCount, 
  summarizeDepartments, 
  weeklyReport 
} from '../../services/reportingService'
import type { Session } from '../../types/auth.types'
import './reporting.css'

export type ReportTab = 'overview' | 'daily' | 'weekly' | 'monthly'

export function ReportingHubPage({ session }: { session: Session }) {
  const [activeTab, setActiveTab] = useState<ReportTab>('overview')

  // Bộ lọc
  const todayStr = officeDate()
  const [selectedDate, setSelectedDate] = useState(todayStr)
  const [selectedWeekDate, setSelectedWeekDate] = useState(todayStr)
  const [selectedMonth, setSelectedMonth] = useState(() => todayStr.slice(0, 7))
  const [selectedDepartment, setSelectedDepartment] = useState('')
  const [exporting, setExporting] = useState(false)

  const lead = session.user.role === 'DEPT_LEAD'
  const scopedDepartment = lead ? session.user.departmentId : null
  const departmentId = scopedDepartment ?? (selectedDepartment || undefined)

  // Danh sách phòng ban
  const loadDepartments = useCallback((signal: AbortSignal) => lead
    ? Promise.resolve([])
    : listDepartments(session.accessToken, signal), [lead, session.accessToken])
  const departments = useQuery(loadDepartments)

  // Tải dữ liệu Báo cáo Ngày
  const loadDaily = useCallback(async (signal: AbortSignal) => {
    departmentScope(session)
    const rows = await dailySummaries(session, selectedDate, signal)
    const filtered = departmentId ? rows.filter(r => r.departmentId === departmentId) : rows
    return { date: selectedDate, rows: filtered }
  }, [session, selectedDate, departmentId])
  const queryDaily = useQuery(loadDaily)

  // Tải dữ liệu Báo cáo Tuần
  const loadWeekly = useCallback(async (signal: AbortSignal) => {
    departmentScope(session)
    const report = await weeklyReport(session, selectedWeekDate, departmentId, signal)
    return { date: selectedWeekDate, report }
  }, [session, selectedWeekDate, departmentId])
  const queryWeekly = useQuery(loadWeekly)

  // Tải dữ liệu Báo cáo Tháng
  const [year, month] = selectedMonth.split('-').map(Number)
  const validPeriod = /^\d{4}-\d{2}$/.test(selectedMonth) && year >= 1 && year <= 9998 && month >= 1 && month <= 12
  const monthFilters = { year, month, departmentId }
  const monthFilterKey = `${selectedMonth}/${departmentId ?? 'all'}`

  const loadMonthly = useCallback(async (signal: AbortSignal) => {
    departmentScope(session)
    if (!validPeriod) return null
    const report = await monthlyReport(session, { year, month, departmentId }, signal)
    return { key: monthFilterKey, report }
  }, [session, validPeriod, year, month, departmentId, monthFilterKey])
  const queryMonthly = useQuery(loadMonthly)

  // Dữ liệu đã xử lý
  const dailyRows = queryDaily.data?.date === selectedDate ? queryDaily.data.rows : []
  const weeklyData = queryWeekly.data?.date === selectedWeekDate ? queryWeekly.data.report : undefined
  const monthlyData = queryMonthly.data?.key === monthFilterKey ? queryMonthly.data.report : undefined

  // Lắng nghe sự kiện Realtime qua SignalR: Khi có chấm công mới, tự động refresh tức thì
  const [realtimeNotice, setRealtimeNotice] = useState<string | null>(null)

  useEffect(() => {
    const unsub = signalrService.onAttendanceRecorded(evt => {
      queryDaily.refresh()
      queryWeekly.refresh()
      queryMonthly.refresh()
      const timeStr = new Date().toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
      const isAbsent = evt.status === 'ABSENT'
      const label = isAbsent
        ? `Đã chốt vắng mặt (${evt.employeeCode})`
        : `Vừa ghi nhận chấm công (${evt.employeeCode} - ${evt.status})`
      setRealtimeNotice(`⚡ ${label} lúc ${timeStr}. Biểu đồ vừa tự động cập nhật!`)
      const timer = setTimeout(() => setRealtimeNotice(null), 6000)
      return () => clearTimeout(timer)
    })
    return unsub
  }, [queryDaily, queryWeekly, queryMonthly])

  const selectedDepartmentName = departments.data?.find(d => d.id === departmentId)?.departmentName
  const scopeLabel = lead 
    ? 'Phòng ban của bạn' 
    : selectedDepartmentName ?? (departmentId ? 'Phòng ban đã chọn' : 'Toàn bộ công ty (Tất cả phòng ban)')

  // Hàm chuyển ngày / tuần
  const adjustDailyDate = (offsetDays: number) => {
    const [y, m, d] = selectedDate.split('-').map(Number)
    const cur = new Date(y, m - 1, d)
    cur.setDate(cur.getDate() + offsetDays)
    setSelectedDate(officeDate(cur))
  }

  const adjustWeekDate = (offsetWeeks: number) => {
    const [y, m, d] = selectedWeekDate.split('-').map(Number)
    const cur = new Date(y, m - 1, d)
    cur.setDate(cur.getDate() + (offsetWeeks * 7))
    setSelectedWeekDate(officeDate(cur))
  }

  const handleRefresh = () => {
    if (activeTab === 'daily') queryDaily.refresh()
    else if (activeTab === 'weekly') queryWeekly.refresh()
    else if (activeTab === 'monthly') queryMonthly.refresh()
    else {
      queryDaily.refresh()
      queryWeekly.refresh()
      queryMonthly.refresh()
    }
  }

  const isCurrentLoading = 
    activeTab === 'daily' ? queryDaily.loading :
    activeTab === 'weekly' ? queryWeekly.loading :
    activeTab === 'monthly' ? queryMonthly.loading :
    (queryDaily.loading || queryWeekly.loading || queryMonthly.loading)

  return (
    <div className="reporting-page reporting-hub-page">
      {/* 1. Header Trang Báo Cáo */}
      <header className="page-heading report-hub-header">
        <div>
          <div className="report-hub-title-row">
            <h1>Trung tâm Báo cáo &amp; Thống kê</h1>
            <span className="badge badge-info">Đa kỳ báo cáo</span>
          </div>
          <p className="muted">Hệ thống phân tích và mô hình hóa dữ liệu chuyên cần theo Ngày, Tuần, Tháng.</p>
        </div>
        <div className="report-hub-header-actions">
          <button 
            className="button button-secondary" 
            type="button" 
            onClick={handleRefresh} 
            disabled={isCurrentLoading || exporting}
          >
            <ArrowClockwise size={18} aria-hidden="true" />
            {isCurrentLoading ? 'Đang cập nhật…' : 'Làm mới'}
          </button>
        </div>
      </header>

      {/* Thông báo cập nhật dữ liệu thời gian thực */}
      {realtimeNotice && (
        <div className="report-realtime-alert" role="status" aria-live="polite">
          <span className="realtime-pulse-dot" />
          <span>{realtimeNotice}</span>
        </div>
      )}

      {/* 2. Thanh Tabs Lồng Nhau: Tổng quan | Báo cáo Ngày | Báo cáo Tuần | Báo cáo Tháng */}
      <nav className="report-tabs-bar" aria-label="Các phân hệ báo cáo">
        <button
          type="button"
          className={`report-tab-pill ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          <ChartPieSlice size={18} aria-hidden="true" />
          <span>Báo cáo tổng quan</span>
        </button>
        <button
          type="button"
          className={`report-tab-pill ${activeTab === 'daily' ? 'active' : ''}`}
          onClick={() => setActiveTab('daily')}
        >
          <CalendarCheck size={18} aria-hidden="true" />
          <span>Báo cáo ngày</span>
        </button>
        <button
          type="button"
          className={`report-tab-pill ${activeTab === 'weekly' ? 'active' : ''}`}
          onClick={() => setActiveTab('weekly')}
        >
          <CalendarBlank size={18} aria-hidden="true" />
          <span>Báo cáo tuần</span>
        </button>
        <button
          type="button"
          className={`report-tab-pill ${activeTab === 'monthly' ? 'active' : ''}`}
          onClick={() => setActiveTab('monthly')}
        >
          <ChartBar size={18} aria-hidden="true" />
          <span>Báo cáo tháng</span>
        </button>
      </nav>

      {/* 3. Khung Bộ lọc Phân tách Rõ Ràng (Tránh chồng lấn) */}
      <section className="panel report-hub-filter-bar" aria-label="Bộ lọc báo cáo">
        <div className="filter-row-primary">
          {!lead ? (
            <label className="field report-department-field">
              <span>Phòng ban</span>
              <select 
                value={selectedDepartment} 
                onChange={e => setSelectedDepartment(e.target.value)}
                disabled={departments.loading || exporting}
              >
                <option value="">Toàn bộ công ty (Tất cả phòng ban)</option>
                {departments.data?.map(dept => (
                  <option key={dept.id} value={dept.id}>{dept.departmentName} ({dept.departmentCode})</option>
                ))}
              </select>
            </label>
          ) : (
            <div className="field">
              <span>Phạm vi tài khoản</span>
              <p className="scope-readonly">Phòng ban của bạn ({session.user.departmentId})</p>
            </div>
          )}

          {/* Bộ lọc theo kỳ tùy chọn */}
          {activeTab === 'daily' && (
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

          {activeTab === 'weekly' && (
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

          {activeTab === 'monthly' && (
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
              <div className="csv-export-wrapper">
                <ExportCsvToolbar 
                  key={monthFilterKey}
                  session={session}
                  filters={monthFilters}
                  periodLabel={`Tháng ${month}/${year}`}
                  scopeLabel={scopeLabel}
                  disabled={!validPeriod || !monthlyData || queryMonthly.loading}
                  onBusyChange={setExporting}
                />
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Thông tin ngữ cảnh */}
      <div className="report-context-info">
        <span>
          <strong>Phạm vi: {scopeLabel}</strong>
          {activeTab === 'daily' && ` · Ngày ${selectedDate.split('-').reverse().join('/')}`}
          {activeTab === 'weekly' && weeklyData && ` · Tuần ${weeklyData.weekNumber}/${weeklyData.year} (${weeklyData.startDate.split('-').reverse().join('/')} – ${weeklyData.endDate.split('-').reverse().join('/')})`}
          {activeTab === 'monthly' && validPeriod && ` · Tháng ${month}/${year}`}
        </span>
        <span className="muted">Smart Office Intelligence System (UTC+7)</span>
      </div>

      {/* ========================================================================= */}
      {/* 4. NỘI DUNG TỪNG TAB LỒNG NHAU (KHOẢNG CÁCH RÕ RÀNG, KHÔNG CHỒNG LẤN) */}
      {/* ========================================================================= */}

      {/* TAB 1: BÁO CÁO TỔNG QUAN (OVERVIEW) */}
      {activeTab === 'overview' && (
        <div className="report-tab-pane">
          {/* Banner 3 cột tổng quan */}
          <div className="overview-summary-banner panel">
            <div className="overview-banner-item">
              <span className="banner-icon-box icon-daily"><CalendarCheck size={26} /></span>
              <div className="banner-text">
                <small className="muted">Hôm nay ({todayStr.split('-').reverse().join('/')})</small>
                <strong>{dailyRows.reduce((sum, r) => sum + r.presentCount, 0)} người có mặt</strong>
                <p className="muted">{dailyRows.reduce((sum, r) => sum + onTimeCount(r), 0)} đúng giờ · {dailyRows.reduce((sum, r) => sum + r.lateCount, 0)} đi muộn</p>
              </div>
            </div>

            <div className="overview-banner-item">
              <span className="banner-icon-box icon-weekly"><CalendarBlank size={26} /></span>
              <div className="banner-text">
                <small className="muted">Tuần hiện tại (Tuần {weeklyData?.weekNumber ?? '—'})</small>
                <strong>{weeklyData?.totalPresentManDays ?? '—'} lượt có mặt</strong>
                <p className="muted">{weeklyData?.totalProlongedAwayEvents ?? '—'} rời bàn · {weeklyData?.totalSecurityAlerts ?? '—'} cảnh báo</p>
              </div>
            </div>

            <div className="overview-banner-item">
              <span className="banner-icon-box icon-monthly"><ChartBar size={26} /></span>
              <div className="banner-text">
                <small className="muted">Tháng {todayStr.slice(5, 7)}/{todayStr.slice(0, 4)}</small>
                <strong>{monthlyData?.totalPresentManDays ?? '—'} lượt công</strong>
                <p className="muted">{monthlyData?.totalDaysRecorded ?? '—'} ngày ghi nhận dữ liệu</p>
              </div>
            </div>
          </div>

          {/* Mô hình hóa Biểu đồ Chuyên cần Toàn diện */}
          <div className="section-block">
            {monthlyData ? (
              <AttendanceCharts groups={summarizeDepartments(monthlyData.dailyBreakdown)} />
            ) : (
              <section className="panel empty-state">
                <ChartBar size={36} className="muted" />
                <h3>Đang mô hình hóa dữ liệu chuyên cần…</h3>
              </section>
            )}
          </div>

          {/* Bảng tổng hợp chuyên cần ngày hôm nay */}
          <div className="section-block">
            <section className="panel" aria-labelledby="today-overview-title">
              <div className="report-panel-heading">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Buildings size={22} color="var(--color-primary)" weight="bold" />
                  <div>
                    <p className="eyebrow">TỔNG HỢP THEO PHÒNG BAN</p>
                    <h2 id="today-overview-title">Chuyên cần hôm nay ({todayStr.split('-').reverse().join('/')})</h2>
                  </div>
                </div>
                <p className="muted">Số liệu cập nhật thời gian thực từ các trạm chấm công &amp; camera văn phòng.</p>
              </div>

              {dailyRows.length === 0 ? (
                <div className="empty-state">
                  <p className="muted">Chưa có bản ghi hoạt động cho ngày hôm nay.</p>
                </div>
              ) : (
                <div className="table-wrap" tabIndex={0} role="region">
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">Phòng ban</th>
                        <th scope="col" className="numeric">Tổng nhân sự</th>
                        <th scope="col" className="numeric">Có mặt</th>
                        <th scope="col" className="numeric">Đúng giờ</th>
                        <th scope="col" className="numeric">Đi muộn</th>
                        <th scope="col" className="numeric">Vắng mặt</th>
                        <th scope="col" className="numeric">Tỷ lệ chuyên cần</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dailyRows.map(row => (
                        <tr key={row.departmentId}>
                          <td><strong>{row.departmentCode}</strong></td>
                          <td className="numeric">{row.totalEmployees}</td>
                          <td className="numeric"><strong>{row.presentCount}</strong></td>
                          <td className="numeric text-success">{onTimeCount(row)}</td>
                          <td className="numeric text-warning">{row.lateCount}</td>
                          <td className="numeric text-danger">{row.absentCount}</td>
                          <td className="numeric">
                            <span className={`badge ${row.attendanceRatePercent >= 90 ? 'badge-success' : row.attendanceRatePercent >= 75 ? 'badge-warning' : 'badge-danger'}`}>
                              {row.attendanceRatePercent.toFixed(1)}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        </div>
      )}

      {/* TAB 2: BÁO CÁO NGÀY (DAILY REPORT) */}
      {activeTab === 'daily' && (
        <div className="report-tab-pane">
          {(() => {
            const hasRecs = dailyRows.length > 0
            const sumVal = (fn: (r: typeof dailyRows[0]) => number) => hasRecs ? dailyRows.reduce((acc, r) => acc + fn(r), 0) : null
            const dailyStats: KpiStat[] = [
              { label: 'Tổng nhân sự', value: sumVal(r => r.totalEmployees), unit: 'người', tone: 'info', note: 'Theo các phòng ban ghi nhận' },
              { label: 'Có mặt đúng giờ', value: sumVal(r => onTimeCount(r)), unit: 'người', tone: 'success', note: 'Có mặt trừ số đi muộn' },
              { label: 'Đi muộn', value: sumVal(r => r.lateCount), unit: 'người', tone: 'warning', note: 'Đến sau thời gian quy định' },
              { label: 'Vắng mặt', value: sumVal(r => r.absentCount), unit: 'người', tone: 'danger', note: 'Không phát hiện hiện diện' },
              { label: 'Rời bàn quá hạn', value: sumVal(r => r.prolongedAwayEvents), unit: 'lượt', tone: 'warning', note: 'Rời bàn trên 15 phút' },
              { label: 'Cảnh báo an ninh', value: sumVal(r => r.securityAlertsCount), unit: 'cảnh báo', tone: 'danger', note: 'Sự kiện ngoài giờ' },
            ]

            return (
              <>
                <div className="section-block">
                  <KpiStatCards stats={dailyStats} />
                </div>

                <div className="section-block">
                  <section className="panel" aria-labelledby="daily-table-title">
                    <div className="report-panel-heading report-panel-heading-row">
                      <div>
                        <p className="eyebrow">CHI TIẾT NGÀY {selectedDate.split('-').reverse().join('/')}</p>
                        <h2 id="daily-table-title">Bảng Tổng hợp Chuyên cần &amp; An ninh từng Phòng ban</h2>
                      </div>
                    </div>

                    {queryDaily.loading && dailyRows.length === 0 ? (
                      <p className="empty-state">Đang tải số liệu ngày…</p>
                    ) : !hasRecs ? (
                      <div className="empty-state">
                        <h3>Chưa có dữ liệu cho ngày {selectedDate.split('-').reverse().join('/')}</h3>
                        <p>Chọn ngày khác hoặc chờ hệ thống camera AI đồng bộ bản ghi.</p>
                      </div>
                    ) : (
                      <div className="table-wrap" tabIndex={0} role="region">
                        <table>
                          <thead>
                            <tr>
                              <th scope="col">Phòng ban</th>
                              <th scope="col" className="numeric">Tổng nhân sự</th>
                              <th scope="col" className="numeric">Có mặt</th>
                              <th scope="col" className="numeric">Đúng giờ</th>
                              <th scope="col" className="numeric">Đi muộn</th>
                              <th scope="col" className="numeric">Vắng mặt</th>
                              <th scope="col" className="numeric">Rời bàn quá hạn</th>
                              <th scope="col" className="numeric">Cảnh báo an ninh</th>
                              <th scope="col" className="numeric">Tỷ lệ chuyên cần</th>
                            </tr>
                          </thead>
                          <tbody>
                            {dailyRows.map(row => (
                              <tr key={row.departmentId}>
                                <td>
                                  <strong>{row.departmentCode}</strong>
                                  <small className="table-cell-note muted">Cập nhật: {formatDateTime(row.updatedAt)}</small>
                                </td>
                                <td className="numeric">{row.totalEmployees}</td>
                                <td className="numeric"><strong>{row.presentCount}</strong></td>
                                <td className="numeric text-success">{onTimeCount(row)}</td>
                                <td className="numeric text-warning">{row.lateCount}</td>
                                <td className="numeric text-danger">{row.absentCount}</td>
                                <td className="numeric">{row.prolongedAwayEvents}</td>
                                <td className="numeric">{row.securityAlertsCount}</td>
                                <td className="numeric">
                                  <span className={`badge ${row.attendanceRatePercent >= 90 ? 'badge-success' : row.attendanceRatePercent >= 75 ? 'badge-warning' : 'badge-danger'}`}>
                                    {row.attendanceRatePercent.toFixed(1)}%
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </section>
                </div>
              </>
            )
          })()}
        </div>
      )}

      {/* TAB 3: BÁO CÁO TUẦN (WEEKLY REPORT) */}
      {activeTab === 'weekly' && (
        <div className="report-tab-pane">
          {(() => {
            const wRows = weeklyData?.dailyBreakdown ?? []
            const wGroups = summarizeDepartments(wRows)
            const hasRecs = wRows.length > 0

            return (
              <>
                {/* Dải thẻ KPI tuần */}
                <div className="section-block">
                  <div className="monthly-summary-strip" aria-label="Tóm tắt tuần">
                    <div className="summary-card">
                      <span>Tuần số</span>
                      <strong>{weeklyData ? `Tuần ${weeklyData.weekNumber}/${weeklyData.year}` : '—'}</strong>
                    </div>
                    <div className="summary-card">
                      <span>Tổng lượt có mặt</span>
                      <strong>{weeklyData?.totalPresentManDays?.toLocaleString('vi-VN') ?? '—'}</strong>
                    </div>
                    <div className="summary-card">
                      <span>Rời bàn quá hạn</span>
                      <strong>{weeklyData?.totalProlongedAwayEvents?.toLocaleString('vi-VN') ?? '—'}</strong>
                    </div>
                    <div className="summary-card">
                      <span>Cảnh báo an ninh</span>
                      <strong>{weeklyData?.totalSecurityAlerts?.toLocaleString('vi-VN') ?? '—'}</strong>
                    </div>
                  </div>
                </div>

                {/* Mô hình hóa Biểu đồ Xu hướng 7 ngày trong tuần */}
                <div className="section-block">
                  {weeklyData ? (
                    <WeeklyTrendChart 
                      startDate={weeklyData.startDate} 
                      endDate={weeklyData.endDate} 
                      rows={wRows} 
                    />
                  ) : (
                    <section className="panel empty-state">
                      <p className="muted">Đang tải mô hình xu hướng tuần…</p>
                    </section>
                  )}
                </div>

                {/* Bảng chi tiết tổng hợp theo phòng ban trong tuần */}
                <div className="section-block">
                  <section className="panel" aria-labelledby="weekly-table-title">
                    <div className="report-panel-heading">
                      <p className="eyebrow">TỔNG HỢP THEO PHÒNG BAN</p>
                      <h2 id="weekly-table-title">Chuyên cần Lũy kế trong Tuần</h2>
                      <p className="muted">Số lượt đúng giờ, đi muộn và tỷ lệ chuyên cần qua các ngày làm việc.</p>
                    </div>

                    {!hasRecs ? (
                      <div className="empty-state">
                        <h3>Chưa có dữ liệu cho tuần này</h3>
                        <p>Hãy chọn tuần khác bằng thanh công cụ chọn ngày bên trên.</p>
                      </div>
                    ) : (
                      <div className="table-wrap" tabIndex={0} role="region">
                        <table>
                          <thead>
                            <tr>
                              <th scope="col">Phòng ban</th>
                              <th scope="col" className="numeric">Số ngày ghi nhận</th>
                              <th scope="col" className="numeric">Đúng giờ</th>
                              <th scope="col" className="numeric">Đi muộn</th>
                              <th scope="col" className="numeric">Vắng mặt</th>
                              <th scope="col" className="numeric">Rời bàn quá hạn</th>
                              <th scope="col" className="numeric">Cảnh báo an ninh</th>
                              <th scope="col" className="numeric">Tỷ lệ đúng giờ</th>
                            </tr>
                          </thead>
                          <tbody>
                            {wGroups.map(grp => {
                              const onTimePct = grp.total > 0 ? ((grp.onTime / grp.total) * 100).toFixed(1) : '0.0'
                              return (
                                <tr key={grp.departmentId}>
                                  <td><strong>{grp.departmentCode}</strong></td>
                                  <td className="numeric">{grp.daysRecorded} ngày</td>
                                  <td className="numeric text-success">{grp.onTime}</td>
                                  <td className="numeric text-warning">{grp.late}</td>
                                  <td className="numeric text-danger">{grp.absent}</td>
                                  <td className="numeric">{grp.prolongedAway}</td>
                                  <td className="numeric">{grp.securityAlerts}</td>
                                  <td className="numeric">
                                    <strong>{onTimePct}%</strong>
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
              </>
            )
          })()}
        </div>
      )}

      {/* TAB 4: BÁO CÁO THÁNG (MONTHLY REPORT) */}
      {activeTab === 'monthly' && (
        <div className="report-tab-pane">
          {(() => {
            const mRows = monthlyData?.dailyBreakdown ?? []
            const mGroups = summarizeDepartments(mRows)
            const hasRecs = mGroups.length > 0

            return (
              <>
                <div className="section-block">
                  <div className="monthly-summary-strip" aria-label="Tóm tắt báo cáo tháng">
                    <div className="summary-card">
                      <span>Ngày có dữ liệu</span>
                      <strong>{monthlyData?.totalDaysRecorded ?? '—'}</strong>
                    </div>
                    <div className="summary-card">
                      <span>Tổng lượt có mặt</span>
                      <strong>{monthlyData?.totalPresentManDays?.toLocaleString('vi-VN') ?? '—'}</strong>
                    </div>
                    <div className="summary-card">
                      <span>Rời bàn quá hạn</span>
                      <strong>{monthlyData?.totalProlongedAwayEvents?.toLocaleString('vi-VN') ?? '—'}</strong>
                    </div>
                    <div className="summary-card">
                      <span>Cảnh báo an ninh</span>
                      <strong>{monthlyData?.totalSecurityAlerts?.toLocaleString('vi-VN') ?? '—'}</strong>
                    </div>
                  </div>
                </div>

                {/* Mô hình hóa Biểu đồ Chuyên cần Tháng */}
                <div className="section-block">
                  <AttendanceCharts groups={mGroups} />
                </div>

                {/* Bảng số liệu chi tiết theo phòng ban */}
                <div className="section-block">
                  <section className="panel monthly-table-panel" aria-labelledby="monthly-table-title">
                    <div className="report-panel-heading">
                      <p className="eyebrow">SỐ LIỆU CHI TIẾT</p>
                      <h2 id="monthly-table-title">Tổng hợp theo Phòng ban</h2>
                      <p className="muted">Số lượt và tỷ lệ trên tổng dữ liệu đã ghi nhận trong tháng.</p>
                    </div>

                    {!hasRecs ? (
                      <div className="empty-state">
                        <ChartBar size={36} aria-hidden="true" className="muted" />
                        <h3>Chưa có dữ liệu cho tháng {month}/{year}</h3>
                        <p>Chọn tháng khác hoặc xuất file CSV khi có dữ liệu.</p>
                      </div>
                    ) : (
                      <div className="table-wrap" tabIndex={0} role="region">
                        <table>
                          <thead>
                            <tr>
                              <th scope="col">Phòng ban</th>
                              <th scope="col" className="numeric">Đúng giờ</th>
                              <th scope="col" className="numeric">Đi muộn</th>
                              <th scope="col" className="numeric">Vắng mặt</th>
                            </tr>
                          </thead>
                          <tbody>
                            {mGroups.map(group => {
                              const onTimeRate = group.total ? (group.onTime / group.total * 100).toFixed(1) : '0.0'
                              const lateRate = group.total ? (group.late / group.total * 100).toFixed(1) : '0.0'
                              const absentRate = group.total ? (group.absent / group.total * 100).toFixed(1) : '0.0'

                              return (
                                <tr key={group.departmentId}>
                                  <th scope="row">
                                    <span>{group.departmentCode}</span>
                                    <span className="table-cell-note muted">{group.daysRecorded} ngày ghi nhận</span>
                                  </th>
                                  <td className="numeric text-success">
                                    <span>{group.onTime.toLocaleString('vi-VN')}</span>
                                    <span className="table-cell-note muted">{onTimeRate}%</span>
                                  </td>
                                  <td className="numeric text-warning">
                                    <span>{group.late.toLocaleString('vi-VN')}</span>
                                    <span className="table-cell-note muted">{lateRate}%</span>
                                  </td>
                                  <td className="numeric text-danger">
                                    <span>{group.absent.toLocaleString('vi-VN')}</span>
                                    <span className="table-cell-note muted">{absentRate}%</span>
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
              </>
            )
          })()}
        </div>
      )}
    </div>
  )
}
