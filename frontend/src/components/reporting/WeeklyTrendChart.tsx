import { useState, useMemo } from 'react'
import { CalendarBlank, TrendUp, CheckCircle } from '@phosphor-icons/react'
import type { DailyDepartmentSummary } from '../../types/reporting.types'
import { onTimeCount } from '../../services/reportingService'

interface WeeklyTrendChartProps {
  startDate: string
  endDate: string
  rows: DailyDepartmentSummary[]
}

const dayNames = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật']

export function WeeklyTrendChart({ startDate, endDate, rows }: WeeklyTrendChartProps) {
  const [activeDayIdx, setActiveDayIdx] = useState<number | null>(null)

  // Tạo danh sách 7 ngày trong tuần từ startDate
  const days = useMemo(() => {
    const list: {
      dateStr: string
      label: string
      dayName: string
      onTime: number
      late: number
      absent: number
      prolongedAway: number
      securityAlerts: number
      total: number
      onTimeRate: number
    }[] = []

    const [startYear, startMonth, startDay] = startDate.split('-').map(Number)
    const baseDate = new Date(startYear, startMonth - 1, startDay)

    for (let i = 0; i < 7; i++) {
      const cur = new Date(baseDate)
      cur.setDate(baseDate.getDate() + i)
      const y = cur.getFullYear()
      const m = String(cur.getMonth() + 1).padStart(2, '0')
      const d = String(cur.getDate()).padStart(2, '0')
      const dateStr = `${y}-${m}-${d}`
      const label = `${d}/${m}`

      const dayRows = rows.filter(r => r.summaryDate === dateStr)
      const onTime = dayRows.reduce((sum, r) => sum + onTimeCount(r), 0)
      const late = dayRows.reduce((sum, r) => sum + r.lateCount, 0)
      const absent = dayRows.reduce((sum, r) => sum + r.absentCount, 0)
      const prolongedAway = dayRows.reduce((sum, r) => sum + r.prolongedAwayEvents, 0)
      const securityAlerts = dayRows.reduce((sum, r) => sum + r.securityAlertsCount, 0)
      const total = onTime + late + absent
      const onTimeRate = total > 0 ? (onTime / total) * 100 : 0

      list.push({
        dateStr,
        label,
        dayName: dayNames[i]!,
        onTime,
        late,
        absent,
        prolongedAway,
        securityAlerts,
        total,
        onTimeRate,
      })
    }

    return list
  }, [startDate, rows])

  const maxTotal = Math.max(...days.map(d => d.total), 1)

  // Tìm ngày có tỷ lệ đúng giờ cao nhất và ngày có nhiều lượt đi muộn nhất
  const bestDay = useMemo(() => {
    const withData = days.filter(d => d.total > 0)
    if (withData.length === 0) return null
    return withData.reduce((prev, cur) => cur.onTimeRate > prev.onTimeRate ? cur : prev, withData[0]!)
  }, [days])

  return (
    <section className="panel weekly-trend-model-panel" aria-labelledby="weekly-model-title">
      <div className="report-panel-heading">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <TrendUp size={24} color="var(--color-primary)" weight="bold" />
          <div>
            <p className="eyebrow">MÔ HÌNH HÓA XU HƯỚNG TUẦN</p>
            <h2 id="weekly-model-title">Diễn biến Chuyên cần 7 Ngày ({startDate.split('-').reverse().join('/')} – {endDate.split('-').reverse().join('/')})</h2>
          </div>
        </div>
        <p className="muted">Biểu đồ thanh phân tầng trực quan hóa các ngày làm việc từ Thứ 2 đến Chủ nhật.</p>
      </div>

      {/* Dải thống kê nổi bật của tuần */}
      {bestDay && (
        <div className="weekly-highlights-strip">
          <div className="highlight-card">
            <span className="highlight-icon icon-success"><CheckCircle size={20} /></span>
            <div>
              <span className="muted">Ngày chuyên cần tốt nhất</span>
              <strong>{bestDay.dayName} ({bestDay.label}) · {bestDay.onTimeRate.toFixed(1)}% đúng giờ</strong>
            </div>
          </div>
          <div className="highlight-card">
            <span className="highlight-icon icon-info"><CalendarBlank size={20} /></span>
            <div>
              <span className="muted">Tổng lượt ghi nhận tuần</span>
              <strong>{days.reduce((sum, d) => sum + d.total, 0).toLocaleString('vi-VN')} lượt có mặt &amp; vắng</strong>
            </div>
          </div>
        </div>
      )}

      {/* Chú giải màu sắc */}
      <div className="chart-legend-row" style={{ padding: '0 var(--panel-padding) 12px' }}>
        <span className="legend-badge"><span className="legend-dot" style={{ background: '#16a34a' }} /> Đúng giờ</span>
        <span className="legend-badge"><span className="legend-dot" style={{ background: '#f59e0b' }} /> Đi muộn</span>
        <span className="legend-badge"><span className="legend-dot" style={{ background: '#ef4444' }} /> Vắng mặt</span>
      </div>

      {/* Khung Biểu đồ Mô hình hóa 7 ngày */}
      <div className="weekly-model-plot-area">
        <div className="weekly-grid-lines" aria-hidden="true">
          <div className="grid-line"><span>{maxTotal}</span></div>
          <div className="grid-line"><span>{Math.round(maxTotal * 0.75)}</span></div>
          <div className="grid-line"><span>{Math.round(maxTotal * 0.5)}</span></div>
          <div className="grid-line"><span>{Math.round(maxTotal * 0.25)}</span></div>
          <div className="grid-line"><span>0</span></div>
        </div>

        <div className="weekly-columns-container">
          {days.map((day, idx) => {
            const heightPercent = day.total > 0 ? Math.max((day.total / maxTotal) * 100, 14) : 8
            const onTimePct = day.total > 0 ? (day.onTime / day.total) * 100 : 0
            const latePct = day.total > 0 ? (day.late / day.total) * 100 : 0
            const absentPct = day.total > 0 ? (day.absent / day.total) * 100 : 0
            const isActive = activeDayIdx === idx

            return (
              <div
                className={`weekly-col-item ${isActive ? 'active' : ''}`}
                key={day.dateStr}
                onMouseEnter={() => setActiveDayIdx(idx)}
                onMouseLeave={() => setActiveDayIdx(null)}
              >
                {/* Tooltip khi hover */}
                {isActive && (
                  <div className="weekly-col-tooltip">
                    <strong>{day.dayName} · {day.label}</strong>
                    <div>🟢 Đúng giờ: {day.onTime}</div>
                    <div>🟡 Đi muộn: {day.late}</div>
                    <div>🔴 Vắng mặt: {day.absent}</div>
                    <div>Tổng: {day.total} lượt ({day.onTimeRate.toFixed(1)}% đúng giờ)</div>
                    {day.prolongedAway > 0 && <div>⚠️ Rời bàn quá hạn: {day.prolongedAway}</div>}
                    {day.securityAlerts > 0 && <div>🚨 Cảnh báo an ninh: {day.securityAlerts}</div>}
                  </div>
                )}

                <div className="weekly-track-wrap">
                  {day.total > 0 && (
                    <span className="col-total-label">{day.total}</span>
                  )}
                  <div
                    className="weekly-bar-body"
                    style={{ height: `${heightPercent}%` }}
                  >
                    {day.total > 0 ? (
                      <>
                        <div
                          className="bar-sub-segment segment-ontime"
                          style={{ height: `${onTimePct}%` }}
                          title={`Đúng giờ: ${day.onTime}`}
                        />
                        <div
                          className="bar-sub-segment segment-late"
                          style={{ height: `${latePct}%` }}
                          title={`Đi muộn: ${day.late}`}
                        />
                        <div
                          className="bar-sub-segment segment-absent"
                          style={{ height: `${absentPct}%` }}
                          title={`Vắng mặt: ${day.absent}`}
                        />
                      </>
                    ) : (
                      <div className="bar-zero-mark">—</div>
                    )}
                  </div>
                </div>

                <div className="weekly-col-caption">
                  <span className="caption-day">{day.dayName}</span>
                  <span className="caption-date">{day.label}</span>
                  {day.total > 0 ? (
                    <span className={`caption-badge ${day.onTimeRate >= 90 ? 'rate-good' : day.onTimeRate >= 75 ? 'rate-mid' : 'rate-low'}`}>
                      {day.onTimeRate.toFixed(0)}%
                    </span>
                  ) : (
                    <span className="caption-badge rate-none">N/A</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
