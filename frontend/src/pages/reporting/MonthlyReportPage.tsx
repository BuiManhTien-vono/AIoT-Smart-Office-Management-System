import { ArrowClockwise, ChartBar } from '@phosphor-icons/react'
import { useCallback, useState } from 'react'
import { useQuery } from '../../components/common/useQuery'
import { AttendanceCharts } from '../../components/reporting/AttendanceCharts'
import { ExportCsvToolbar } from '../../components/reporting/ExportCsvToolbar'
import { listDepartments } from '../../services/authService'
import { departmentScope, formatDateTime, monthlyReport, officeDate, summarizeDepartments } from '../../services/reportingService'
import type { Session } from '../../types/auth.types'
import './reporting.css'

export function MonthlyReportPage({ session }: { session: Session }) {
  const [period, setPeriod] = useState(() => officeDate().slice(0, 7))
  const [selectedDepartment, setSelectedDepartment] = useState('')
  const [exporting, setExporting] = useState(false)
  const [year, month] = period.split('-').map(Number)
  const validPeriod = /^\d{4}-\d{2}$/.test(period) && year >= 1 && year <= 9998 && month >= 1 && month <= 12
  const lead = session.user.role === 'DEPT_LEAD'
  const scopedDepartment = lead ? session.user.departmentId : null
  const departmentId = scopedDepartment ?? (selectedDepartment || undefined)
  const filters = { year, month, departmentId }
  const filterKey = `${period}/${departmentId ?? 'all'}`
  const load = useCallback(async (signal: AbortSignal) => {
    departmentScope(session)
    if (!validPeriod) return null
    const report = await monthlyReport(session, { year, month, departmentId }, signal)
    return { filterKey, report }
  }, [session, validPeriod, year, month, departmentId, filterKey])
  const loadDepartments = useCallback((signal: AbortSignal) => lead
    ? Promise.resolve([])
    : listDepartments(session.accessToken, signal), [lead, session.accessToken])
  const query = useQuery(load)
  const departments = useQuery(loadDepartments)
  const report = query.data?.filterKey === filterKey ? query.data.report : undefined
  const rows = report?.dailyBreakdown.filter(row => !departmentId || row.departmentId === departmentId) ?? []
  const groups = summarizeDepartments(rows)
  const selectedDepartmentName = departments.data?.find(department => department.id === departmentId)?.departmentName
  const scopeLabel = lead ? 'Phòng ban được gán cho tài khoản' : selectedDepartmentName ?? (departmentId ? 'Phòng ban đã chọn' : 'Tất cả phòng ban')
  const periodLabel = validPeriod ? `Tháng ${month}/${year}` : 'Chưa chọn kỳ hợp lệ'
  const ready = validPeriod && !!report && groups.length > 0 && !query.loading && !query.error

  return (
    <div className="reporting-page">
      <header className="page-heading">
        <div>
          <h1>Báo cáo chuyên cần</h1>
          <p className="muted">Phân tích ngày công và xuất báo cáo theo kỳ, phòng ban.</p>
        </div>
        <button className="button button-secondary" type="button" onClick={query.refresh} disabled={query.loading || exporting || !validPeriod}>
          <ArrowClockwise size={18} aria-hidden="true" />{query.loading ? 'Đang cập nhật…' : 'Làm mới'}
        </button>
      </header>

      <section className="panel report-filter-panel" aria-label="Bộ lọc báo cáo">
        <div className="report-filter-fields">
          <label className="field">Kỳ báo cáo
            <input type="month" value={period} min="0001-01" max="9998-12" onChange={event => setPeriod(event.target.value)} disabled={exporting} aria-describedby={!validPeriod ? 'period-error' : undefined} aria-invalid={!validPeriod} />
          </label>
          {lead ? <div className="field"><span>Phạm vi dữ liệu</span><p className="scope-readonly">Phòng ban của bạn</p></div> : (
            <label className="field report-department-field">Phòng ban
              <select value={selectedDepartment} onChange={event => setSelectedDepartment(event.target.value)} disabled={exporting || departments.loading}>
                <option value="">Tất cả phòng ban</option>
                {departments.data?.map(department => <option key={department.id} value={department.id}>{department.departmentName}</option>)}
              </select>
            </label>
          )}
        </div>
        <ExportCsvToolbar key={filterKey} session={session} filters={filters} periodLabel={periodLabel} scopeLabel={scopeLabel} disabled={!ready} onBusyChange={setExporting} />
      </section>

      {departments.error && <div className="alert alert-error" role="alert"><p>Không tải được danh sách phòng ban. {departments.error}</p><button className="button button-secondary" type="button" onClick={departments.refresh}>Thử lại phòng ban</button></div>}
      <div className="report-context"><span><strong>{periodLabel}</strong> · {scopeLabel}</span><span className="muted">{query.updatedAt && report ? `Cập nhật ${formatDateTime(query.updatedAt)} · UTC+7` : 'Chưa có dữ liệu cho kỳ đang chọn'}</span></div>

      {!validPeriod ? <div className="alert alert-error" role="alert" id="period-error"><p>Hãy chọn tháng và năm hợp lệ (năm 0001–9998).</p></div>
        : query.error ? <div className="alert alert-error" role="alert"><div><strong>Không tải được báo cáo</strong><p>{query.error}</p></div><button className="button button-secondary" type="button" onClick={query.refresh}>Thử lại</button></div>
          : query.loading || !report ? <section className="panel empty-state" role="status"><p>Đang tải báo cáo tháng…</p></section>
            : groups.length === 0 ? <section className="panel empty-state"><ChartBar size={40} aria-hidden="true" /><h2>Chưa có dữ liệu cho kỳ này</h2><p>Chọn kỳ hoặc phòng ban khác. Báo cáo được tổng hợp từ dữ liệu các phân hệ đã ghi nhận.</p></section>
              : <>
                <div className="monthly-summary-strip" aria-label="Tóm tắt báo cáo tháng">
                  <div><span>Ngày có dữ liệu</span><strong>{new Set(rows.map(row => row.summaryDate)).size}</strong></div>
                  <div><span>Tổng lượt có mặt</span><strong>{rows.reduce((sum, row) => sum + row.presentCount, 0).toLocaleString('vi-VN')}</strong></div>
                  <div><span>Rời bàn quá hạn</span><strong>{rows.reduce((sum, row) => sum + row.prolongedAwayEvents, 0).toLocaleString('vi-VN')}</strong></div>
                  <div><span>Cảnh báo an ninh</span><strong>{rows.reduce((sum, row) => sum + row.securityAlertsCount, 0).toLocaleString('vi-VN')}</strong></div>
                </div>
                <div className="monthly-report-grid">
                  <AttendanceCharts groups={groups} />
                  <section className="panel monthly-table-panel" aria-labelledby="monthly-table-title">
                    <div className="report-panel-heading"><p className="eyebrow">SỐ LIỆU CHI TIẾT</p><h2 id="monthly-table-title">Tổng hợp theo phòng ban</h2><p className="muted">Số lượt và tỷ lệ trên tổng dữ liệu đã ghi nhận.</p></div>
                    <div className="table-wrap" tabIndex={0} role="region" aria-label="Bảng chuyên cần theo phòng ban">
                      <table>
                        <caption className="sr-only">{periodLabel}, {scopeLabel}. Mỗi ô ghi số lượt và tỷ lệ, mẫu số là tổng lượt đúng giờ, đi muộn, vắng mặt của phòng ban.</caption>
                        <thead>
                          <tr>
                            <th scope="col">Phòng ban</th>
                            <th scope="col" className="numeric">Đúng giờ</th>
                            <th scope="col" className="numeric">Đi muộn</th>
                            <th scope="col" className="numeric">Vắng mặt</th>
                          </tr>
                        </thead>
                        <tbody>
                          {groups.map(group => (
                            <tr key={group.departmentId}>
                              <th scope="row">
                                <span>{group.departmentCode}</span>
                                <small className="muted table-cell-note">{group.daysRecorded} ngày</small>
                              </th>
                              {(['onTime', 'late', 'absent'] as const).map(key => (
                                <td className="numeric" key={key}>
                                  <span>{group[key].toLocaleString('vi-VN')}</span>
                                  <small className="muted table-cell-note">
                                    {group.total ? (group[key] / group.total * 100).toLocaleString('vi-VN', {
                                      minimumFractionDigits: 1,
                                      maximumFractionDigits: 1,
                                    }) : '0,0'}%
                                  </small>
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="chart-footnote muted">Mẫu số bằng tổng lượt đúng giờ + đi muộn + vắng mặt. Đây là lượt trong kỳ, không phải số nhân viên duy nhất.</p>
                  </section>
                </div>
              </>}
    </div>
  )
}
