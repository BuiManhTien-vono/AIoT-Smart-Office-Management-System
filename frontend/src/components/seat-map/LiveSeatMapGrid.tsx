import { useState, useMemo } from 'react'
import {
  MagnifyingGlass,
  Funnel,
  Armchair,
  CheckCircle,
  Clock,
  Warning,
  MinusCircle,
  ShieldWarning,
} from '@phosphor-icons/react'
import { SeatCard } from './SeatCard'
import type { Seat, SeatState } from '../../types/occupancy.types'

interface Props {
  seats: Seat[]
  onSelectSeat?: (seat: Seat) => void
}

type FilterState = 'ALL' | SeatState | 'RESTRICTED'

export function LiveSeatMapGrid({ seats, onSelectSeat }: Props) {
  const [searchQuery, setSearchQuery] = useState('')
  const [filterState, setFilterState] = useState<FilterState>('ALL')

  // Tính toán KPI Tổng hợp
  const stats = useMemo(() => {
    let present = 0
    let tempAway = 0
    let prolongedAway = 0
    let empty = 0
    let restricted = 0
    let workDesks = 0

    seats.forEach(seat => {
      if (seat.zoneType === 'RESTRICTED_ZONE') {
        restricted++
        return
      }
      workDesks++
      if (seat.currentState === 'PRESENT') {
        present++
      } else if (seat.currentState === 'TEMP_AWAY') {
        tempAway++
      } else if (seat.currentState === 'PROLONGED_AWAY') {
        prolongedAway++
      } else {
        empty++
      }
    })

    const occupancyRate = workDesks > 0 ? Math.round((present / workDesks) * 100) : 0

    return {
      total: seats.length,
      workDesks,
      present,
      tempAway,
      prolongedAway,
      empty,
      restricted,
      occupancyRate,
    }
  }, [seats])

  // Lọc danh sách bàn theo từ khóa và trạng thái
  const filteredSeats = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return seats.filter(seat => {
      // Lọc theo trạng thái
      if (filterState === 'RESTRICTED') {
        if (seat.zoneType !== 'RESTRICTED_ZONE') return false
      } else if (filterState !== 'ALL') {
        if (seat.zoneType === 'RESTRICTED_ZONE' || seat.currentState !== filterState) return false
      }

      // Tìm kiếm từ khóa
      if (!q) return true
      return (
        seat.seatCode.toLowerCase().includes(q) ||
        seat.seatName.toLowerCase().includes(q) ||
        (seat.assignedEmployeeName && seat.assignedEmployeeName.toLowerCase().includes(q)) ||
        (seat.assignedEmployeeCode && seat.assignedEmployeeCode.toLowerCase().includes(q))
      )
    })
  }, [seats, filterState, searchQuery])

  return (
    <div className="seat-map-grid-container">
      {/* 1. Dải KPI Thống kê thời gian thực */}
      <div className="seat-kpi-strip">
        <div className="seat-kpi-item kpi-total">
          <div className="kpi-icon-wrap">
            <Armchair size={20} weight="bold" />
          </div>
          <div className="kpi-data">
            <span className="kpi-label">Tổng số bàn</span>
            <span className="kpi-value">{stats.total}</span>
          </div>
        </div>

        <div className="seat-kpi-item kpi-present">
          <div className="kpi-icon-wrap">
            <CheckCircle size={20} weight="bold" />
          </div>
          <div className="kpi-data">
            <span className="kpi-label">Có mặt</span>
            <span className="kpi-value">
              {stats.present} <small>({stats.occupancyRate}%)</small>
            </span>
          </div>
        </div>

        <div className="seat-kpi-item kpi-away">
          <div className="kpi-icon-wrap">
            <Clock size={20} weight="bold" />
          </div>
          <div className="kpi-data">
            <span className="kpi-label">Tạm vắng</span>
            <span className="kpi-value">{stats.tempAway}</span>
          </div>
        </div>

        <div className="seat-kpi-item kpi-alert">
          <div className="kpi-icon-wrap">
            <Warning size={20} weight="bold" />
          </div>
          <div className="kpi-data">
            <span className="kpi-label">Rời chỗ &gt;15p</span>
            <span className="kpi-value">{stats.prolongedAway}</span>
          </div>
        </div>

        <div className="seat-kpi-item kpi-empty">
          <div className="kpi-icon-wrap">
            <MinusCircle size={20} weight="bold" />
          </div>
          <div className="kpi-data">
            <span className="kpi-label">Bàn trống</span>
            <span className="kpi-value">{stats.empty}</span>
          </div>
        </div>

        {stats.restricted > 0 && (
          <div className="seat-kpi-item kpi-restricted">
            <div className="kpi-icon-wrap">
              <ShieldWarning size={20} weight="bold" />
            </div>
            <div className="kpi-data">
              <span className="kpi-label">Vùng an ninh</span>
              <span className="kpi-value">{stats.restricted}</span>
            </div>
          </div>
        )}
      </div>

      {/* 2. Thanh lọc và tìm kiếm */}
      <div className="seat-filter-bar">
        <div className="seat-search-input-wrap">
          <MagnifyingGlass size={16} className="search-icon" />
          <input
            type="text"
            className="seat-search-input"
            placeholder="Tìm theo mã bàn, tên bàn, tên hoặc mã nhân viên..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className="seat-search-clear"
              onClick={() => setSearchQuery('')}
              title="Xóa tìm kiếm"
            >
              ✕
            </button>
          )}
        </div>

        <div className="seat-filter-chips">
          <Funnel size={16} className="muted" />
          <button
            type="button"
            className={`filter-chip ${filterState === 'ALL' ? 'active' : ''}`}
            onClick={() => setFilterState('ALL')}
          >
            Tất cả ({seats.length})
          </button>
          <button
            type="button"
            className={`filter-chip chip-present ${filterState === 'PRESENT' ? 'active' : ''}`}
            onClick={() => setFilterState('PRESENT')}
          >
            🟢 Có mặt ({stats.present})
          </button>
          <button
            type="button"
            className={`filter-chip chip-away ${filterState === 'TEMP_AWAY' ? 'active' : ''}`}
            onClick={() => setFilterState('TEMP_AWAY')}
          >
            🟡 Tạm vắng ({stats.tempAway})
          </button>
          {stats.prolongedAway > 0 && (
            <button
              type="button"
              className={`filter-chip chip-alert ${filterState === 'PROLONGED_AWAY' ? 'active' : ''}`}
              onClick={() => setFilterState('PROLONGED_AWAY')}
            >
              🔴 Quá hạn ({stats.prolongedAway})
            </button>
          )}
          <button
            type="button"
            className={`filter-chip chip-empty ${filterState === 'EMPTY' ? 'active' : ''}`}
            onClick={() => setFilterState('EMPTY')}
          >
            ⚪ Trống ({stats.empty})
          </button>
          {stats.restricted > 0 && (
            <button
              type="button"
              className={`filter-chip chip-restricted ${filterState === 'RESTRICTED' ? 'active' : ''}`}
              onClick={() => setFilterState('RESTRICTED')}
            >
              🛡️ An ninh ({stats.restricted})
            </button>
          )}
        </div>
      </div>

      {/* 3. Lưới các ô bàn làm việc */}
      {filteredSeats.length === 0 ? (
        <div className="seat-map-empty">
          <Armchair size={48} className="muted" />
          <h3>Không tìm thấy bàn làm việc phù hợp</h3>
          <p className="muted">
            {searchQuery
              ? `Không có kết quả khớp với từ khóa "${searchQuery}".`
              : 'Chưa có bàn làm việc nào trong trạng thái hoặc phòng ban này.'}
          </p>
        </div>
      ) : (
        <div className="seat-card-grid">
          {filteredSeats.map(seat => (
            <SeatCard
              key={seat.id}
              seat={seat}
              onClick={onSelectSeat ? () => onSelectSeat(seat) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  )
}
