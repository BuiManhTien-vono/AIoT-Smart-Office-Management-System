import { useState, useEffect } from 'react'
import {
  Armchair,
  Clock,
  Coffee,
  User,
  Warning,
  WarningCircle,
  ShieldWarning,
} from '@phosphor-icons/react'
import type { Seat } from '../../types/occupancy.types'

interface Props {
  seat: Seat
  onClick?: () => void
}

function isLunchTime(): boolean {
  const now = new Date()
  const totalMinutes = now.getHours() * 60 + now.getMinutes()
  return totalMinutes >= 720 && totalMinutes <= 810 // 12:00 - 13:30
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return '0m'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours > 0) {
    return `${hours}h ${minutes.toString().padStart(2, '0')}m`
  }
  return `${minutes}m ${Math.floor(seconds % 60).toString().padStart(2, '0')}s`
}

export function SeatCard({ seat, onClick }: Props) {
  const [awayElapsedSec, setAwayElapsedSec] = useState<number>(0)
  const isLunch = isLunchTime()

  // Đồng hồ đếm thời gian vắng mặt thời gian thực
  useEffect(() => {
    const isAway = seat.currentState === 'TEMP_AWAY' || seat.currentState === 'PROLONGED_AWAY'
    if (!isAway) {
      return
    }

    const stateStartTime = seat.stateUpdatedAt ? new Date(seat.stateUpdatedAt).getTime() : Date.now()
    const updateElapsed = () => {
      const now = Date.now()
      const diffSec = Math.max(0, Math.floor((now - stateStartTime) / 1000))
      setAwayElapsedSec(diffSec)
    }

    updateElapsed()
    const interval = setInterval(updateElapsed, 1000)
    return () => clearInterval(interval)
  }, [seat.currentState, seat.stateUpdatedAt])

  // Phân loại kiểu trạng thái & màu sắc
  let cardStatusClass = 'seat-card-empty'
  let statusBadgeText = 'Trống'
  let StatusIcon = Armchair
  let isWarningPulse = false

  if (seat.zoneType === 'RESTRICTED_ZONE') {
    cardStatusClass = 'seat-card-restricted'
    statusBadgeText = 'Khu vực cấm'
    StatusIcon = ShieldWarning
  } else if (seat.currentState === 'PRESENT') {
    cardStatusClass = 'seat-card-present'
    statusBadgeText = 'Đang có mặt'
    StatusIcon = User
  } else if (seat.currentState === 'TEMP_AWAY') {
    cardStatusClass = 'seat-card-away'
    statusBadgeText = 'Tạm vắng'
    StatusIcon = Clock
  } else if (seat.currentState === 'PROLONGED_AWAY') {
    cardStatusClass = 'seat-card-prolonged'
    statusBadgeText = 'Rời chỗ quá hạn'
    StatusIcon = Warning
    isWarningPulse = true
  } else if (seat.currentState === 'WRONG_SEAT') {
    cardStatusClass = 'seat-card-wrong'
    statusBadgeText = 'Sai vị trí'
    StatusIcon = WarningCircle
  } else if (isLunch) {
    cardStatusClass = 'seat-card-lunch'
    statusBadgeText = 'Nghỉ trưa (Đóng băng)'
    StatusIcon = Coffee
  }

  // Tên viết tắt làm Avatar đại diện
  const employeeName = seat.assignedEmployeeName || 'Chưa gán'
  const initials = employeeName
    .split(' ')
    .filter(Boolean)
    .slice(-2)
    .map(part => part[0]?.toUpperCase())
    .join('') || '?'

  return (
    <div
      className={`seat-card ${cardStatusClass} ${isWarningPulse ? 'seat-card-pulse' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {/* Header: Mã bàn + Huy hiệu trạng thái */}
      <div className="seat-card-header">
        <div className="seat-card-code-wrap">
          <Armchair size={16} weight="bold" className="seat-card-icon" />
          <span className="seat-card-code">{seat.seatCode}</span>
        </div>
        <span className={`seat-card-badge ${cardStatusClass}-badge`}>
          <StatusIcon size={12} weight="bold" />
          <span>{statusBadgeText}</span>
        </span>
      </div>

      {/* Body: Tên bàn + Nhân viên được gán */}
      <div className="seat-card-body">
        <div className="seat-card-name" title={seat.seatName}>
          {seat.seatName}
        </div>

        <div className="seat-card-employee-row">
          <div className="seat-card-avatar" title={employeeName}>
            {initials}
          </div>
          <div className="seat-card-employee-info">
            <div className="seat-card-employee-name" title={employeeName}>
              {employeeName}
            </div>
            {seat.assignedEmployeeCode && (
              <div className="seat-card-employee-code">
                Mã: {seat.assignedEmployeeCode}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer: Thời gian làm việc tích luỹ / Đếm ngược vắng mặt */}
      <div className="seat-card-footer">
        {seat.zoneType === 'RESTRICTED_ZONE' ? (
          <div className="seat-card-stat muted">Giám sát an ninh 24/7</div>
        ) : seat.currentState === 'PRESENT' ? (
          <div className="seat-card-stat stat-active">
            <span>Đã ngồi hôm nay:</span>
            <strong>{formatDuration(seat.activeSecondsToday)}</strong>
          </div>
        ) : seat.currentState === 'TEMP_AWAY' ? (
          <div className="seat-card-stat stat-away">
            <span>Thời gian rời ghế:</span>
            <strong>{formatDuration(awayElapsedSec)}</strong>
          </div>
        ) : seat.currentState === 'PROLONGED_AWAY' ? (
          <div className="seat-card-stat stat-alert">
            <span>⚠️ Quá hạn:</span>
            <strong>{formatDuration(awayElapsedSec)}</strong>
          </div>
        ) : isLunch ? (
          <div className="seat-card-stat stat-lunch">
            <span>Khung giờ nghỉ:</span>
            <strong>12:00 – 13:30</strong>
          </div>
        ) : (
          <div className="seat-card-stat muted">
            <span>Ghế trống</span>
            <span>{formatDuration(seat.activeSecondsToday)}</span>
          </div>
        )}
      </div>
    </div>
  )
}
