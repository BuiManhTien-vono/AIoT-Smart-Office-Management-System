import { Alarm, ShieldWarning, Users, UserCheck } from '@phosphor-icons/react'
import './KpiStatCards.css'

export interface KpiStat {
  label: string
  value: number | null
  unit: string
  note: string
  tone: 'info' | 'success' | 'warning' | 'danger'
}

const metricIcons = {
  info: Users,
  success: UserCheck,
  warning: Alarm,
  danger: ShieldWarning,
}

export function KpiStatCards({ stats }: { stats: KpiStat[] }) {
  const isSixColumns = stats.length >= 5

  return (
    <div 
      className={`kpi-grid ${isSixColumns ? 'kpi-grid-6' : 'kpi-grid-4'}`} 
      aria-label="Chỉ số tổng quan trong ngày"
    >
      {stats.map(stat => {
        const Icon = metricIcons[stat.tone]
        return (
          <article 
            className={`panel kpi-card kpi-stat-card tone-${stat.tone} kpi-${stat.tone}`} 
            key={stat.label}
          >
            <div className="kpi-stat-header">
              <div className="kpi-stat-title-wrap">
                <div className="kpi-stat-icon">
                  <Icon size={20} weight="bold" aria-hidden="true" />
                </div>
                <span className="kpi-stat-label">{stat.label}</span>
              </div>
            </div>

            <div className="kpi-stat-value-row">
              <span className="kpi-stat-number">
                {stat.value === null ? '—' : stat.value.toLocaleString('vi-VN')}
              </span>
              <span className="kpi-stat-unit">{stat.unit}</span>
            </div>

            {stat.note && (
              <p className="kpi-stat-note" title={stat.note}>
                {stat.note}
              </p>
            )}
          </article>
        )
      })}
    </div>
  )
}
