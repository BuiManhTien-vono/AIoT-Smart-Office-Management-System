import { useState, useMemo } from 'react'
import {
  MagnifyingGlass,
  Armchair,
  CheckCircle,
  Warning,
  MinusCircle,
  Trash,
  UserMinus,
  ShieldCheck,
  ShieldWarning,
  CheckSquare,
  Square
} from '@phosphor-icons/react'
import type { Camera, Seat, SeatState, ZoneType } from '../../types/occupancy.types'
import type { BatchSeatActionInput } from '../../types/occupancy.types'

interface Props {
  seats: Seat[]
  cameras: Camera[]
  onSelectSeat?: (seat: Seat) => void
  onBatchAction: (input: BatchSeatActionInput) => Promise<void>
}

export function BatchSeatManagerView({
  seats,
  cameras,
  onSelectSeat,
  onBatchAction,
}: Props) {
  const [selectedSeatIds, setSelectedSeatIds] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [filterCameraId, setFilterCameraId] = useState<string>('ALL')
  const [filterState, setFilterState] = useState<string>('ALL')
  const [busy, setBusy] = useState(false)
  const [actionMessage, setActionMessage] = useState<string | null>(null)

  // Tạo map camera id -> camera name
  const cameraMap = useMemo(() => {
    const map = new Map<string, string>()
    cameras.forEach(c => map.set(c.id, `${c.cameraName} (${c.cameraCode})`))
    return map
  }, [cameras])

  // Lọc danh sách bàn
  const filteredSeats = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return seats.filter(seat => {
      if (filterCameraId !== 'ALL' && seat.cameraId !== filterCameraId) return false
      if (filterState !== 'ALL' && seat.currentState !== filterState) return false
      if (!q) return true
      return (
        seat.seatCode.toLowerCase().includes(q) ||
        seat.seatName.toLowerCase().includes(q) ||
        (seat.assignedEmployeeName && seat.assignedEmployeeName.toLowerCase().includes(q))
      )
    })
  }, [seats, filterCameraId, filterState, searchQuery])

  // Chọn/Bỏ chọn từng bàn
  const toggleSelectSeat = (id: string) => {
    setSelectedSeatIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Chọn tất cả bàn hiển thị
  const selectAllFiltered = () => {
    setSelectedSeatIds(new Set(filteredSeats.map(s => s.id)))
  }

  // Bỏ chọn tất cả
  const deselectAll = () => {
    setSelectedSeatIds(new Set())
  }

  // Chọn theo trạng thái
  const selectByState = (state: SeatState) => {
    const matched = seats.filter(s => s.currentState === state).map(s => s.id)
    setSelectedSeatIds(new Set(matched))
  }

  // Thực hiện tác vụ hàng loạt
  const executeBatch = async (
    action: BatchSeatActionInput['action'],
    newState?: SeatState,
    zoneType?: ZoneType,
    confirmMsg?: string
  ) => {
    const ids = Array.from(selectedSeatIds)
    if (ids.length === 0) return

    if (confirmMsg) {
      const confirmed = window.confirm(confirmMsg)
      if (!confirmed) return
    }

    setBusy(true)
    setActionMessage(null)
    try {
      await onBatchAction({
        seatIds: ids,
        action,
        newState,
        zoneType,
      })
      setActionMessage(`Đã xử lý thành công trên ${ids.length} bàn làm việc.`)
      setSelectedSeatIds(new Set())
      setTimeout(() => setActionMessage(null), 4000)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Có lỗi khi thao tác hàng loạt.'
      alert(`Lỗi: ${msg}`)
    } finally {
      setBusy(false)
    }
  }

  const isAllSelected = filteredSeats.length > 0 && filteredSeats.every(s => selectedSeatIds.has(s.id))

  return (
    <div className="batch-seat-manager">
      {/* 1. Thanh lọc nâng cao cho việc quản lý nhiều bàn */}
      <div className="panel batch-filter-bar">
        <div className="search-wrap">
          <MagnifyingGlass size={16} className="search-icon" />
          <input
            type="text"
            className="seat-search-input"
            placeholder="Tìm theo mã bàn, tên bàn, nhân sự..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="filter-selects">
          <label className="field-inline">
            <span className="muted">Camera:</span>
            <select value={filterCameraId} onChange={e => setFilterCameraId(e.target.value)}>
              <option value="ALL">Tất cả camera ({cameras.length})</option>
              {cameras.map(c => (
                <option key={c.id} value={c.id}>{c.cameraName} ({c.cameraCode})</option>
              ))}
            </select>
          </label>

          <label className="field-inline">
            <span className="muted">Trạng thái:</span>
            <select value={filterState} onChange={e => setFilterState(e.target.value)}>
              <option value="ALL">Tất cả trạng thái</option>
              <option value="EMPTY">⚪ Trống</option>
              <option value="PRESENT">🟢 Có mặt</option>
              <option value="TEMP_AWAY">🟡 Tạm vắng</option>
              <option value="PROLONGED_AWAY">🔴 Rời chỗ &gt;15p</option>
            </select>
          </label>
        </div>
      </div>

      {/* 2. Thanh hỗ trợ chọn nhanh */}
      <div className="selection-helper-bar">
        <div className="selection-quick-buttons">
          <button
            type="button"
            className="button button-ghost button-small"
            onClick={isAllSelected ? deselectAll : selectAllFiltered}
          >
            {isAllSelected ? <CheckSquare size={16} /> : <Square size={16} />}
            <span>{isAllSelected ? 'Bỏ chọn tất cả' : 'Chọn tất cả bàn đang lọc'}</span>
          </button>
          <button
            type="button"
            className="button button-ghost button-small"
            onClick={() => selectByState('EMPTY')}
          >
            <MinusCircle size={14} /> Chọn tất cả bàn trống
          </button>
          <button
            type="button"
            className="button button-ghost button-small"
            onClick={() => selectByState('PRESENT')}
          >
            <CheckCircle size={14} /> Chọn tất cả bàn có mặt
          </button>
          <button
            type="button"
            className="button button-ghost button-small"
            onClick={() => selectByState('PROLONGED_AWAY')}
          >
            <Warning size={14} /> Chọn bàn rời chỗ &gt;15p
          </button>
        </div>

        <div className="selection-counter">
          <span>Đang chọn: <strong>{selectedSeatIds.size}</strong> / {filteredSeats.length} bàn</span>
        </div>
      </div>

      {/* Thông báo kết quả tác vụ */}
      {actionMessage && (
        <div className="alert alert-success" style={{ margin: '8px 0' }}>
          <CheckCircle size={18} weight="bold" />
          <span>{actionMessage}</span>
        </div>
      )}

      {/* 3. Floating Batch Action Bar khi có bàn được chọn */}
      {selectedSeatIds.size > 0 && (
        <div className="floating-batch-bar panel" role="region" aria-label="Thanh tác vụ hàng loạt">
          <div className="batch-bar-info">
            <span className="badge badge-info">{selectedSeatIds.size} bàn đã chọn</span>
            <span className="batch-hint">Chọn tác vụ muốn áp dụng đồng thời:</span>
          </div>

          <div className="batch-actions-cluster">
            {/* Đổi trạng thái hàng loạt */}
            <div className="batch-btn-group">
              <span className="btn-group-label">Đổi trạng thái:</span>
              <button
                type="button"
                className="button button-secondary button-small"
                disabled={busy}
                onClick={() => executeBatch('SET_STATE', 'EMPTY', undefined, `Đặt ${selectedSeatIds.size} bàn đã chọn về trạng thái TRỐNG?`)}
              >
                ⚪ Về Trống
              </button>
              <button
                type="button"
                className="button button-secondary button-small"
                disabled={busy}
                onClick={() => executeBatch('SET_STATE', 'PRESENT', undefined, `Đặt ${selectedSeatIds.size} bàn đã chọn thành CÓ MẶT?`)}
              >
                🟢 Có mặt
              </button>
              <button
                type="button"
                className="button button-secondary button-small"
                disabled={busy}
                onClick={() => executeBatch('SET_STATE', 'TEMP_AWAY', undefined, `Đặt ${selectedSeatIds.size} bàn đã chọn thành TẠM VẮNG?`)}
              >
                🟡 Tạm vắng
              </button>
            </div>

            {/* Cấu hình hàng loạt */}
            <div className="batch-btn-group">
              <span className="btn-group-label">Cấu hình:</span>
              <button
                type="button"
                className="button button-secondary button-small"
                disabled={busy}
                onClick={() => executeBatch('UNASSIGN_EMPLOYEE', undefined, undefined, `Hủy gán nhân viên của ${selectedSeatIds.size} bàn đã chọn?`)}
              >
                <UserMinus size={14} /> Hủy gán nhân sự
              </button>
              <button
                type="button"
                className="button button-secondary button-small"
                disabled={busy}
                onClick={() => executeBatch('CHANGE_ZONE_TYPE', undefined, 'WORK_DESK', `Chuyển ${selectedSeatIds.size} vị trí thành BÀN LÀM VIỆC?`)}
              >
                <ShieldCheck size={14} /> Là Bàn làm việc
              </button>
              <button
                type="button"
                className="button button-secondary button-small"
                disabled={busy}
                onClick={() => executeBatch('CHANGE_ZONE_TYPE', undefined, 'RESTRICTED_ZONE', `Chuyển ${selectedSeatIds.size} vị trí thành VÙNG AN NINH?`)}
              >
                <ShieldWarning size={14} /> Là Vùng an ninh
              </button>
            </div>

            {/* Xóa hàng loạt */}
            <button
              type="button"
              className="button button-danger button-small"
              disabled={busy}
              onClick={() => executeBatch('DELETE', undefined, undefined, `CẢNH BÁO: Bạn có chắc chắn muốn XÓA VĨNH VIỄN ${selectedSeatIds.size} bàn đã chọn?`)}
            >
              <Trash size={14} /> Xóa {selectedSeatIds.size} bàn
            </button>
          </div>
        </div>
      )}

      {/* 4. Bảng danh sách bàn với Checkbox */}
      {filteredSeats.length === 0 ? (
        <div className="panel empty-state">
          <Armchair size={40} className="muted" />
          <h3>Không tìm thấy bàn làm việc</h3>
          <p className="muted">Không có bàn nào khớp với bộ lọc hoặc từ khóa tìm kiếm.</p>
        </div>
      ) : (
        <div className="panel table-wrap" tabIndex={0} role="region">
          <table>
            <thead>
              <tr>
                <th scope="col" style={{ width: 44 }}>
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    onChange={isAllSelected ? deselectAll : selectAllFiltered}
                    title="Chọn tất cả"
                  />
                </th>
                <th scope="col">Mã bàn</th>
                <th scope="col">Tên vị trí</th>
                <th scope="col">Camera quản lý</th>
                <th scope="col">Loại vùng</th>
                <th scope="col">Nhân sự gán</th>
                <th scope="col">Trạng thái hiện tại</th>
                <th scope="col" className="numeric">Thời gian ngồi</th>
                <th scope="col">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {filteredSeats.map(seat => {
                const isSelected = selectedSeatIds.has(seat.id)
                let stateBadge = <span className="badge badge-neutral">⚪ Trống</span>
                if (seat.currentState === 'PRESENT') stateBadge = <span className="badge badge-success">🟢 Có mặt</span>
                else if (seat.currentState === 'TEMP_AWAY') stateBadge = <span className="badge badge-warning">🟡 Tạm vắng</span>
                else if (seat.currentState === 'PROLONGED_AWAY') stateBadge = <span className="badge badge-danger">🔴 Rời chỗ &gt;15p</span>

                const hours = Math.floor(seat.activeSecondsToday / 3600)
                const mins = Math.floor((seat.activeSecondsToday % 3600) / 60)

                return (
                  <tr 
                    key={seat.id} 
                    className={isSelected ? 'row-selected' : ''}
                    onClick={() => toggleSelectSeat(seat.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectSeat(seat.id)}
                      />
                    </td>
                    <td><strong>{seat.seatCode}</strong></td>
                    <td>{seat.seatName}</td>
                    <td>
                      <small className="muted">{cameraMap.get(seat.cameraId) || seat.cameraId}</small>
                    </td>
                    <td>
                      <span className="badge badge-neutral">
                        {seat.zoneType === 'WORK_DESK' ? 'Bàn làm việc' : 'Vùng an ninh'}
                      </span>
                    </td>
                    <td>
                      {seat.assignedEmployeeName ? (
                        <span>{seat.assignedEmployeeName} {seat.assignedEmployeeCode && <code>({seat.assignedEmployeeCode})</code>}</span>
                      ) : (
                        <span className="muted">Chưa gán</span>
                      )}
                    </td>
                    <td>{stateBadge}</td>
                    <td className="numeric">
                      {hours > 0 || mins > 0 ? `${hours}h ${mins}m` : '0m'}
                    </td>
                    <td onClick={e => e.stopPropagation()}>
                      <button
                        type="button"
                        className="button button-ghost button-small"
                        onClick={() => onSelectSeat?.(seat)}
                      >
                        Chi tiết
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
