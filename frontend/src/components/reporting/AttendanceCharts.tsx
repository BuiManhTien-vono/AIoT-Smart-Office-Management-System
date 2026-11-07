import type { DepartmentAttendance } from '../../types/reporting.types'

const segments = [
  { key: 'onTime', label: 'Đúng giờ', className: 'on-time' },
  { key: 'late', label: 'Đi muộn', className: 'late' },
  { key: 'absent', label: 'Vắng mặt', className: 'absent' },
] as const

export function AttendanceCharts({ groups }: { groups: DepartmentAttendance[] }) {
  return (
    <section className="panel attendance-chart" aria-labelledby="attendance-chart-title">
      <div className="report-panel-heading">
        <p className="eyebrow">PHÂN TÍCH CHUYÊN CẦN</p>
        <h2 id="attendance-chart-title">Tỷ lệ theo phòng ban</h2>
        <p className="muted">Tỷ lệ trên tổng lượt đúng giờ, đi muộn và vắng mặt.</p>
      </div>
      <ul className="chart-legend" aria-label="Chú giải biểu đồ">
        {segments.map(segment => (
          <li key={segment.key}><span className={`legend-mark ${segment.className}`} aria-hidden="true" />{segment.label}</li>
        ))}
      </ul>
      <div className="stacked-chart" role="img" aria-label="Biểu đồ cột chồng 100 phần trăm theo phòng ban. Số lượng và tỷ lệ chính xác nằm trong bảng tổng hợp bên cạnh.">
        <div className="chart-axis" aria-hidden="true"><span>100%</span><span>50%</span><span>0%</span></div>
        <div className="chart-bars">
          {groups.map(group => (
            <div className="chart-bar-column" key={group.departmentId}>
              <div className="chart-bar">
                {segments.map(segment => {
                  const percent = group.total ? group[segment.key] / group.total * 100 : 0
                  return <span key={segment.key} className={`chart-bar-segment ${segment.className}`} style={{ height: `${percent}%` }} />
                })}
                {group.total === 0 && <span className="chart-zero">0</span>}
              </div>
              <span className="chart-bar-label">{group.departmentCode}</span>
            </div>
          ))}
        </div>
      </div>
      <p className="chart-footnote muted">Đúng giờ = Có mặt − Đi muộn. Tỷ lệ làm tròn 1 chữ số thập phân trong bảng.</p>
    </section>
  )
}
