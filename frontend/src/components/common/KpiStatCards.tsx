import { Alarm, ShieldWarning, Users, UserCheck } from '@phosphor-icons/react'

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
  return (
    <div className="kpi-grid" aria-label="Chỉ số tổng quan trong ngày">
      {stats.map(stat => {
        const Icon = metricIcons[stat.tone]
        return (
          <article className={`panel kpi-card kpi-${stat.tone}`} key={stat.label}>
            <div className="kpi-card-heading">
              <h2>{stat.label}</h2>
              <span className="kpi-icon"><Icon size={22} aria-hidden="true" /></span>
            </div>
            <p className="kpi-number">
              {stat.value === null ? '—' : stat.value.toLocaleString('vi-VN')}
              <span>{stat.unit}</span>
            </p>
            <p className="muted kpi-note">{stat.note}</p>
          </article>
        )
      })}
    </div>
  )
}
