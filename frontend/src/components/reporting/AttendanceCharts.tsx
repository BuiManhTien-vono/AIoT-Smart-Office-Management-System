import { useState, useMemo } from 'react'
import { ChartPieSlice, ChartBar, CheckCircle, Warning, XCircle } from '@phosphor-icons/react'
import type { DepartmentAttendance } from '../../types/reporting.types'

interface Props {
  groups: DepartmentAttendance[]
}

export function AttendanceCharts({ groups }: Props) {
  const [hoveredDept, setHoveredDept] = useState<string | null>(null)
  const [hoveredSegment, setHoveredSegment] = useState<'onTime' | 'late' | 'absent' | null>(null)

  // 1. Tính toán số liệu tổng thể toàn công ty
  const totals = useMemo(() => {
    let onTime = 0
    let late = 0
    let absent = 0
    let prolongedAway = 0
    let securityAlerts = 0

    groups.forEach(g => {
      onTime += g.onTime
      late += g.late
      absent += g.absent
      prolongedAway += g.prolongedAway
      securityAlerts += g.securityAlerts
    })

    const grandTotal = onTime + late + absent
    const onTimeRate = grandTotal > 0 ? (onTime / grandTotal) * 100 : 0
    const lateRate = grandTotal > 0 ? (late / grandTotal) * 100 : 0
    const absentRate = grandTotal > 0 ? (absent / grandTotal) * 100 : 0

    return {
      onTime,
      late,
      absent,
      prolongedAway,
      securityAlerts,
      grandTotal,
      onTimeRate,
      lateRate,
      absentRate,
    }
  }, [groups])

  // Tính toán góc cho SVG Donut Chart
  const donutPaths = useMemo(() => {
    if (totals.grandTotal === 0) return []

    const radius = 64
    const circumference = 2 * Math.PI * radius

    const onTimeDash = (totals.onTimeRate / 100) * circumference
    const lateDash = (totals.lateRate / 100) * circumference
    const absentDash = (totals.absentRate / 100) * circumference

    // Offset tích lũy
    const onTimeOffset = 0
    const lateOffset = -onTimeDash
    const absentOffset = -(onTimeDash + lateDash)

    return [
      {
        key: 'onTime',
        label: 'Đúng giờ',
        dash: `${onTimeDash} ${circumference}`,
        offset: onTimeOffset,
        color: '#16a34a', // Xanh lục
        count: totals.onTime,
        rate: totals.onTimeRate,
      },
      {
        key: 'late',
        label: 'Đi muộn',
        dash: `${lateDash} ${circumference}`,
        offset: lateOffset,
        color: '#f59e0b', // Vàng hổ phách
        count: totals.late,
        rate: totals.lateRate,
      },
      {
        key: 'absent',
        label: 'Vắng mặt',
        dash: `${absentDash} ${circumference}`,
        offset: absentOffset,
        color: '#ef4444', // Đỏ san hô
        count: totals.absent,
        rate: totals.absentRate,
      },
    ]
  }, [totals])

  // Chi tiết hiển thị động ở tâm Donut khi rê chuột
  const activeDonutInfo = useMemo(() => {
    if (!hoveredSegment) {
      return {
        rate: totals.onTimeRate,
        label: 'Đúng giờ',
        count: totals.onTime,
        color: '#16a34a',
        isHovered: false,
      }
    }
    const found = donutPaths.find(p => p.key === hoveredSegment)
    if (found) {
      return {
        rate: found.rate,
        label: found.label,
        count: found.count,
        color: found.color,
        isHovered: true,
      }
    }
    return {
      rate: totals.onTimeRate,
      label: 'Đúng giờ',
      count: totals.onTime,
      color: '#16a34a',
      isHovered: false,
    }
  }, [hoveredSegment, donutPaths, totals])

  const hoveredGroup = useMemo(() => {
    return hoveredDept ? groups.find(g => g.departmentId === hoveredDept) : null
  }, [hoveredDept, groups])

  return (
    <section className="panel attendance-model-panel" aria-labelledby="attendance-model-title">
      <div className="report-panel-heading">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ChartBar size={24} color="var(--color-primary)" weight="bold" />
          <div>
            <p className="eyebrow">MÔ HÌNH HÓA DỮ LIỆU CHUYÊN CẦN</p>
            <h2 id="attendance-model-title">Phân tích Tỷ lệ &amp; Phân bổ theo Phòng ban</h2>
          </div>
        </div>
        <p className="muted">Mô hình biểu đồ hình tròn Donut kết hợp ma trận cột chồng tỷ lệ chuẩn hóa.</p>
      </div>

      <div className="attendance-models-container">
        {/* ============================================================== */}
        {/* MÔ HÌNH 1: BIỂU ĐỒ DONUT TỔNG THỂ CÔNG TY */}
        {/* ============================================================== */}
        <div className="model-donut-box">
          <div className="model-box-header">
            <ChartPieSlice size={18} weight="bold" />
            <h3>Tỷ trọng Toàn công ty</h3>
          </div>

          <div className="donut-chart-wrapper">
            <svg width="168" height="168" viewBox="0 0 160 160" className="donut-svg" aria-label="Biểu đồ Donut chuyên cần">
              <circle
                cx="80"
                cy="80"
                r="64"
                fill="none"
                stroke="var(--color-border)"
                strokeWidth="24"
              />
              {totals.grandTotal > 0 && donutPaths.map(item => {
                const isSelected = hoveredSegment === item.key
                return (
                  <circle
                    key={item.key}
                    cx="80"
                    cy="80"
                    r="64"
                    fill="none"
                    stroke={item.color}
                    strokeWidth={isSelected ? 32 : 24}
                    strokeDasharray={item.dash}
                    strokeDashoffset={item.offset}
                    className={`donut-segment ${isSelected ? 'active' : ''}`}
                    transform="rotate(-90 80 80)"
                    style={{
                      opacity: hoveredSegment && !isSelected ? 0.35 : 1,
                      cursor: 'pointer',
                    }}
                    onMouseEnter={() => setHoveredSegment(item.key as 'onTime' | 'late' | 'absent')}
                    onMouseLeave={() => setHoveredSegment(null)}
                  >
                    <title>{`${item.label}: ${item.count} lượt (${item.rate.toFixed(1)}%)`}</title>
                  </circle>
                )
              })}
              <g className="donut-center-text">
                <text
                  x="80"
                  y="68"
                  textAnchor="middle"
                  className="donut-number"
                  style={{
                    fill: activeDonutInfo.isHovered ? activeDonutInfo.color : 'var(--color-foreground)',
                    transition: 'fill 0.2s ease',
                  }}
                >
                  {activeDonutInfo.rate.toFixed(1)}%
                </text>
                <text
                  x="80"
                  y="88"
                  textAnchor="middle"
                  className="donut-caption"
                  style={{
                    fill: activeDonutInfo.isHovered ? activeDonutInfo.color : 'var(--color-muted-foreground)',
                    fontWeight: activeDonutInfo.isHovered ? 700 : 500,
                  }}
                >
                  {activeDonutInfo.label}
                </text>
                <text x="80" y="104" textAnchor="middle" className="donut-subcount">
                  {activeDonutInfo.count.toLocaleString('vi-VN')} lượt
                </text>
              </g>
            </svg>

            {/* Thẻ hiển thị số liệu nổi bật khi rê chuột vào tỉ trọng */}
            <div
              className={`donut-hover-pill ${activeDonutInfo.isHovered ? 'visible' : ''}`}
              style={{
                borderColor: activeDonutInfo.isHovered ? activeDonutInfo.color : 'transparent',
                background: activeDonutInfo.isHovered ? `${activeDonutInfo.color}15` : 'transparent',
                color: activeDonutInfo.isHovered ? activeDonutInfo.color : 'inherit',
              }}
            >
              <span className="pill-dot" style={{ background: activeDonutInfo.color }} />
              <span>
                <strong>{activeDonutInfo.label}</strong>: {activeDonutInfo.count.toLocaleString('vi-VN')} lượt ({activeDonutInfo.rate.toFixed(1)}%)
              </span>
            </div>

            <div className="donut-legend-list">
              {donutPaths.map(item => {
                const isSelected = hoveredSegment === item.key
                return (
                  <div
                    key={item.key}
                    className={`legend-item ${isSelected ? 'active' : ''}`}
                    onMouseEnter={() => setHoveredSegment(item.key as 'onTime' | 'late' | 'absent')}
                    onMouseLeave={() => setHoveredSegment(null)}
                    style={{ cursor: 'pointer' }}
                  >
                    <span className="legend-dot" style={{ background: item.color }} />
                    <div className="legend-info">
                      <span className="legend-title">{item.label}</span>
                      <strong>
                        {item.count.toLocaleString('vi-VN')} <small>({item.rate.toFixed(1)}%)</small>
                      </strong>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* ============================================================== */}
        {/* MÔ HÌNH 2: BIỂU ĐỒ CỘT CHỒNG THEO TỪNG PHÒNG BAN */}
        {/* ============================================================== */}
        <div className="model-bars-box">
          <div className="model-box-header">
            <ChartBar size={18} weight="bold" />
            <h3>So sánh Tỷ lệ theo Phòng ban</h3>
          </div>

          <div className="chart-legend-row">
            <span className="legend-badge"><span className="legend-dot" style={{ background: '#16a34a' }} /> Đúng giờ</span>
            <span className="legend-badge"><span className="legend-dot" style={{ background: '#f59e0b' }} /> Đi muộn</span>
            <span className="legend-badge"><span className="legend-dot" style={{ background: '#ef4444' }} /> Vắng mặt</span>
            {hoveredGroup && (
              <span className="hovered-dept-pill">
                <strong>{hoveredGroup.departmentCode}</strong>: {hoveredGroup.onTime} đúng giờ ({((hoveredGroup.total > 0 ? (hoveredGroup.onTime / hoveredGroup.total) * 100 : 0)).toFixed(0)}%) · {hoveredGroup.late} đi muộn · {hoveredGroup.absent} vắng
              </span>
            )}
          </div>

          <div className="model-stacked-plot" role="img" aria-label="Biểu đồ cột chồng theo phòng ban">
            {/* Trục Y tỷ lệ % */}
            <div className="plot-y-axis">
              <span>100%</span>
              <span>75%</span>
              <span>50%</span>
              <span>25%</span>
              <span>0%</span>
            </div>

            {/* Vùng các cột */}
            <div className="plot-columns-area">
              {groups.map(group => {
                const total = group.total || 1
                const onTimePct = group.total > 0 ? (group.onTime / total) * 100 : 0
                const latePct = group.total > 0 ? (group.late / total) * 100 : 0
                const absentPct = group.total > 0 ? (group.absent / total) * 100 : 0
                const isHovered = hoveredDept === group.departmentId

                return (
                  <div
                    key={group.departmentId}
                    className={`dept-bar-group ${isHovered ? 'active' : ''}`}
                    onMouseEnter={() => setHoveredDept(group.departmentId)}
                    onMouseLeave={() => setHoveredDept(null)}
                  >
                    {/* Tooltip khi rê chuột */}
                    {isHovered && (
                      <div className="dept-bar-tooltip">
                        <strong>{group.departmentCode}</strong>
                        <div>🟢 Đúng giờ: {group.onTime} ({onTimePct.toFixed(1)}%)</div>
                        <div>🟡 Đi muộn: {group.late} ({latePct.toFixed(1)}%)</div>
                        <div>🔴 Vắng mặt: {group.absent} ({absentPct.toFixed(1)}%)</div>
                        <div>Tổng lượt: {group.total}</div>
                      </div>
                    )}

                    <div className="dept-bar-track">
                      {group.total > 0 ? (
                        <>
                          <div
                            className="dept-bar-segment segment-ontime"
                            style={{ height: `${onTimePct}%` }}
                            title={`Đúng giờ: ${onTimePct.toFixed(1)}%`}
                          >
                            {onTimePct >= 18 && <span>{onTimePct.toFixed(0)}%</span>}
                          </div>
                          <div
                            className="dept-bar-segment segment-late"
                            style={{ height: `${latePct}%` }}
                            title={`Đi muộn: ${latePct.toFixed(1)}%`}
                          >
                            {latePct >= 18 && <span>{latePct.toFixed(0)}%</span>}
                          </div>
                          <div
                            className="dept-bar-segment segment-absent"
                            style={{ height: `${absentPct}%` }}
                            title={`Vắng mặt: ${absentPct.toFixed(1)}%`}
                          >
                            {absentPct >= 18 && <span>{absentPct.toFixed(0)}%</span>}
                          </div>
                        </>
                      ) : (
                        <div className="dept-bar-empty">0</div>
                      )}
                    </div>

                    <span className="dept-bar-code">{group.departmentCode}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* MÔ HÌNH 3: TIẾN ĐỘ CHUYÊN CẦN TỪNG PHÒNG BAN */}
      {/* ============================================================== */}
      <div className="dept-progress-gauges">
        <h4 className="gauges-title">Chỉ số Hiệu suất Chuyên cần theo Phòng ban</h4>
        <div className="gauges-grid">
          {groups.map(group => {
            const onTimeRate = group.total > 0 ? (group.onTime / group.total) * 100 : 0
            const isGood = onTimeRate >= 90
            const isWarning = onTimeRate >= 75 && onTimeRate < 90

            return (
              <div className="gauge-card" key={group.departmentId}>
                <div className="gauge-header">
                  <strong>{group.departmentCode}</strong>
                  <span className={`badge ${isGood ? 'badge-success' : isWarning ? 'badge-warning' : 'badge-danger'}`}>
                    {isGood ? <CheckCircle size={12} /> : isWarning ? <Warning size={12} /> : <XCircle size={12} />}
                    {onTimeRate.toFixed(1)}%
                  </span>
                </div>
                <div className="gauge-track">
                  <div
                    className={`gauge-fill ${isGood ? 'fill-good' : isWarning ? 'fill-warning' : 'fill-danger'}`}
                    style={{ width: `${Math.min(onTimeRate, 100)}%` }}
                  />
                </div>
                <div className="gauge-meta">
                  <small>{group.onTime} đúng giờ / {group.total} lượt</small>
                  <small className="muted">{group.daysRecorded} ngày ghi nhận</small>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
