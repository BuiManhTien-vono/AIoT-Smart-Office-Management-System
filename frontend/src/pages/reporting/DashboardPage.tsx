import { ArrowClockwise, CalendarBlank, ArrowRight } from '@phosphor-icons/react'
import { useCallback, useEffect, useState } from 'react'
import { KpiStatCards } from '../../components/common/KpiStatCards'
import type { KpiStat } from '../../components/common/KpiStatCards'
import { useQuery } from '../../components/common/useQuery'
import { dailySummaries, formatDateTime, officeDate, onTimeCount } from '../../services/reportingService'
import { signalrService } from '../../services/signalrService'
import type { Session } from '../../types/auth.types'
import './reporting.css'

const refreshOptions = [
  { value: 0, label: 'Chỉ làm mới thủ công' },
  { value: 30_000, label: 'Mỗi 30 giây' },
  { value: 60_000, label: 'Mỗi phút' },
  { value: 300_000, label: 'Mỗi 5 phút' },
]

export function DashboardPage({ session }: { session: Session }) {
  const [now, setNow] = useState(() => new Date())
  const [refreshMs, setRefreshMs] = useState(60_000)
  const date = officeDate(now)
  const load = useCallback(async (signal: AbortSignal) => ({
    date,
    rows: await dailySummaries(session, date, signal),
  }), [date, session])
  const query = useQuery(load, refreshMs)
  const rows = query.data?.date === date ? query.data.rows : undefined
  const securityOnly = session.user.role === 'SECURITY'

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  const [realtimeNotice, setRealtimeNotice] = useState<string | null>(null)

  useEffect(() => {
    const unsub = signalrService.onAttendanceRecorded(evt => {
      query.refresh()
      const timeStr = new Date().toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
      const isAbsent = evt.status === 'ABSENT'
      const label = isAbsent
        ? `Đã chốt vắng mặt (${evt.employeeCode})`
        : `Vừa ghi nhận chấm công (${evt.employeeCode} - ${evt.status})`
      setRealtimeNotice(`⚡ ${label} lúc ${timeStr}. Số liệu đã tự động cập nhật!`)
      const timer = setTimeout(() => setRealtimeNotice(null), 5000)
      return () => clearTimeout(timer)
    })
    return unsub
  }, [query])

  const sourceTimes = (rows ?? []).map(row => Date.parse(row.updatedAt)).filter(Number.isFinite)
  const sourceTime = sourceTimes.length ? Math.max(...sourceTimes) : null
  const stale = sourceTime !== null && now.getTime() - sourceTime > 5 * 60_000
  const hasRecords = !!rows?.length
  const sum = (field: 'totalEmployees' | 'prolongedAwayEvents' | 'securityAlertsCount') => hasRecords
    ? rows.reduce((total, row) => total + row[field], 0)
    : null
  const stats: KpiStat[] = [
    { label: 'Tổng nhân sự', value: sum('totalEmployees'), unit: 'người', note: 'Theo các bản ghi tổng hợp trong ngày', tone: 'info' },
    { label: 'Đi làm đúng giờ hôm nay', value: hasRecords ? rows.reduce((total, row) => total + onTimeCount(row), 0) : null, unit: 'người', note: 'Có mặt trừ số đi muộn đã ghi nhận', tone: 'success' },
    { label: 'Rời bàn quá hạn', value: sum('prolongedAwayEvents'), unit: 'lượt', note: 'Số lượt rời bàn từ 15 phút', tone: 'warning' },
    { label: 'Cảnh báo an ninh ngoài giờ', value: sum('securityAlertsCount'), unit: 'cảnh báo', note: 'Số sự kiện được ghi nhận trong ngày', tone: 'danger' },
  ]

  return (
    <div className="reporting-page">
      <header className="page-heading dashboard-heading">
        <div>
          <h1>Tổng quan vận hành</h1>
        </div>
        <div className="dashboard-heading-actions">
          <div className="dashboard-date">
            <CalendarBlank size={18} aria-hidden="true" />
            <span>Ngày làm việc · <time dateTime={date}>{date.split('-').reverse().join('/')}</time></span>
          </div>
          <button className="button button-secondary" type="button" onClick={query.refresh} disabled={query.loading}>
            <ArrowClockwise size={18} aria-hidden="true" />{query.loading ? 'Đang cập nhật…' : 'Làm mới'}
          </button>
        </div>
      </header>

      {realtimeNotice && (
        <div className="report-realtime-alert" role="status" aria-live="polite">
          <span className="realtime-pulse-dot" />
          <span>{realtimeNotice}</span>
        </div>
      )}

      <section className="panel dashboard-update-bar" aria-label="Cập nhật dữ liệu tổng quan">
        <div>
          <span className={`badge ${query.error || stale ? 'badge-warning' : 'badge-neutral'}`}>
            {query.error ? 'Chưa đồng bộ được' : query.loading ? 'Đang cập nhật' : stale ? 'Dữ liệu cần làm mới' : 'Dữ liệu tổng hợp'}
          </span>
          <p className="muted">{query.updatedAt ? `Lấy dữ liệu lúc ${formatDateTime(query.updatedAt)}` : 'Chưa nhận dữ liệu từ hệ thống'} · Giờ Việt Nam (UTC+7)</p>
          {sourceTime !== null && <p className="muted">Bản ghi mới nhất: {formatDateTime(new Date(sourceTime))}</p>}
        </div>
        <label className="field refresh-field">Chu kỳ cập nhật
          <select value={refreshMs} onChange={event => setRefreshMs(Number(event.target.value))}>
            {refreshOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
      </section>

      {session.user.role === 'DEPT_LEAD' && <p className="scope-caption muted">Phạm vi dữ liệu: phòng ban được gán cho tài khoản của bạn.</p>}
      {query.error && <div className="alert alert-error" role="alert"><div><strong>Không cập nhật được tổng quan</strong><p>{query.error}</p>{rows && <p>Số liệu bên dưới thuộc lần lấy dữ liệu trước.</p>}</div><button className="button button-secondary" type="button" onClick={query.refresh}>Thử lại</button></div>}
      {!query.error && !query.loading && !hasRecords && <div className="alert alert-info" role="status"><p>Chưa có bản ghi tổng hợp cho ngày này. Dấu “—” thể hiện chưa có dữ liệu; giá trị 0 chỉ hiển thị khi hệ thống đã có bản ghi.</p></div>}
      <div aria-busy={query.loading}>
        <KpiStatCards stats={securityOnly ? stats.slice(-1) : stats} />
      </div>

      <section className="panel daily-summary-panel" aria-labelledby="daily-summary-title">
        <div className="report-panel-heading report-panel-heading-row">
          <div>
            <p className="eyebrow">HOẠT ĐỘNG TRONG NGÀY</p>
            <h2 id="daily-summary-title">{securityOnly ? 'Tổng hợp cảnh báo an ninh' : 'Chuyên cần theo phòng ban'}</h2>
          </div>
          {!securityOnly && <a className="report-link" href="#/reports/hub">Xem báo cáo tổng hợp <ArrowRight size={16} aria-hidden="true" /></a>}
        </div>
        {query.loading && !rows ? <p className="empty-state" role="status">Đang tải số liệu tổng hợp…</p>
          : !hasRecords ? <div className="empty-state"><h3>Chưa có dữ liệu trong ngày</h3><p>Dữ liệu xuất hiện khi các phân hệ ghi nhận và tổng hợp hoạt động.</p></div>
            : <div className="table-wrap" role="region" aria-label="Bảng tổng hợp ngày" tabIndex={0}>
              <table>
                <caption className="sr-only">Số liệu ngày {date.split('-').reverse().join('/')}. Chỉ gồm các phòng ban có bản ghi.</caption>
                <thead>
                  <tr>
                    <th scope="col">Phòng ban</th>
                    {securityOnly ? <th scope="col" className="numeric">Cảnh báo</th> : <>
                      <th scope="col" className="numeric">Nhân sự</th>
                      <th scope="col" className="numeric">Đúng giờ</th>
                      <th scope="col" className="numeric">Đi muộn</th>
                      <th scope="col" className="numeric">Vắng mặt</th>
                    </>}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => (
                    <tr key={row.id}>
                      <th scope="row">{row.departmentCode}</th>
                      {securityOnly ? <td className="numeric">{row.securityAlertsCount.toLocaleString('vi-VN')}</td> : <>
                        <td className="numeric">{row.totalEmployees.toLocaleString('vi-VN')}</td>
                        <td className="numeric">{onTimeCount(row).toLocaleString('vi-VN')}</td>
                        <td className="numeric">{row.lateCount.toLocaleString('vi-VN')}</td>
                        <td className="numeric">{row.absentCount.toLocaleString('vi-VN')}</td>
                      </>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>}
      </section>
    </div>
  )
}
