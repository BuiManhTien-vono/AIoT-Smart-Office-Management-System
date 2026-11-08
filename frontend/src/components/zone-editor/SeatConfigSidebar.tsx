import { useState, useEffect } from 'react'
import type { FormEvent } from 'react'
import {
  FloppyDisk,
  ArrowsClockwise,
  User,
  ShieldCheck,
  CheckCircle,
  WarningCircle,
  PlusCircle,
  Trash,
  Warning,
  X,
} from '@phosphor-icons/react'
import type { Camera, Seat, PolygonPoint, ZoneType } from '../../types/occupancy.types'
import type { Employee } from '../../types/biometrics.types'
import { createSeat, updateSeatPolygon, deleteSeat, syncZonesToAi } from '../../services/occupancyService'
import { listEmployees } from '../../services/biometricsService'

interface Props {
  selectedCamera: Camera | null
  seats: Seat[]
  selectedSeat: Seat | null
  currentPolygon: PolygonPoint[]
  onSelectSeat: (seat: Seat | null) => void
  onSeatSaved: () => void
  onClearPolygon: () => void
  token: string
}

export function SeatConfigSidebar({
  selectedCamera,
  seats,
  selectedSeat,
  currentPolygon,
  onSelectSeat,
  onSeatSaved,
  onClearPolygon,
  token,
}: Props) {
  const [seatCode, setSeatCode] = useState('')
  const [seatName, setSeatName] = useState('')
  const [zoneType, setZoneType] = useState<ZoneType>('WORK_DESK')
  const [assignedEmployeeId, setAssignedEmployeeId] = useState<string>('')

  const [employees, setEmployees] = useState<Employee[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [isSyncingAi, setIsSyncingAi] = useState(false)
  const [deletingSeat, setDeletingSeat] = useState<Seat | null>(null)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Load employees for assignment
  useEffect(() => {
    let ignore = false
    listEmployees(token, selectedCamera?.departmentId || undefined)
      .then(emps => {
        if (!ignore) setEmployees(emps.filter(e => e.isActive))
      })
      .catch(() => {})
    return () => {
      ignore = true
    }
  }, [token, selectedCamera?.departmentId])

  // Populate form when selectedSeat changes
  useEffect(() => {
    if (selectedSeat) {
      setSeatCode(selectedSeat.seatCode)
      setSeatName(selectedSeat.seatName)
      setZoneType(selectedSeat.zoneType)
      setAssignedEmployeeId(selectedSeat.assignedEmployeeId || '')
      setFeedback(null)
    } else {
      setSeatCode('')
      setSeatName('')
      setZoneType('WORK_DESK')
      setAssignedEmployeeId('')
    }
  }, [selectedSeat])

  function handleStartNewSeat() {
    onSelectSeat(null)
    onClearPolygon()
    setSeatCode('')
    setSeatName('')
    setZoneType('WORK_DESK')
    setAssignedEmployeeId('')
    setFeedback(null)
  }

  async function handleSaveSeat(e: FormEvent) {
    e.preventDefault()
    if (!selectedCamera) {
      setFeedback({ type: 'error', message: 'Vui lòng chọn camera trước khi lưu bàn.' })
      return
    }

    if (currentPolygon.length < 3) {
      setFeedback({ type: 'error', message: 'Vui lòng chấm tối thiểu 3 đỉnh đa giác trên khung hình.' })
      return
    }

    if (!seatCode.trim() || !seatName.trim()) {
      setFeedback({ type: 'error', message: 'Vui lòng nhập mã và tên chỗ ngồi.' })
      return
    }

    setIsSaving(true)
    setFeedback(null)

    try {
      if (selectedSeat) {
        // Update existing seat polygon
        await updateSeatPolygon(token, selectedSeat.id, {
          polygonPoints: currentPolygon,
          assignedEmployeeId: assignedEmployeeId ? assignedEmployeeId : null,
          zoneType,
        })
        setFeedback({ type: 'success', message: `Đã cập nhật đa giác bàn ${seatCode} thành công!` })
      } else {
        // Create new seat
        await createSeat(token, {
          seatCode: seatCode.trim().toUpperCase(),
          seatName: seatName.trim(),
          cameraId: selectedCamera.id,
          departmentId: selectedCamera.departmentId || '11111111-1111-1111-1111-111111111101',
          assignedEmployeeId: assignedEmployeeId ? assignedEmployeeId : null,
          polygonPoints: currentPolygon,
          zoneType,
        })
        setFeedback({ type: 'success', message: `Đã lưu vị trí ${seatCode} vào cơ sở dữ liệu!` })
      }
      onSeatSaved()
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Không thể lưu bàn làm việc.',
      })
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDeleteSeat(seat: Seat) {
    setIsSaving(true)
    setFeedback(null)

    try {
      await deleteSeat(token, seat.id)
      setFeedback({ type: 'success', message: `Đã xóa bàn làm việc ${seat.seatCode} thành công!` })
      setDeletingSeat(null)
      if (selectedSeat?.id === seat.id) {
        onSelectSeat(null)
        onClearPolygon()
      }
      onSeatSaved()
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Không thể xóa bàn làm việc.',
      })
    } finally {
      setIsSaving(false)
    }
  }

  async function handleSyncAi() {
    if (!selectedCamera) {
      setFeedback({ type: 'error', message: 'Chưa chọn camera để đồng bộ.' })
      return
    }

    setIsSyncingAi(true)
    setFeedback(null)

    try {
      const res = await syncZonesToAi(selectedCamera.cameraCode)
      setFeedback({
        type: 'success',
        message: `Đồng bộ thành công! AI Service đã nạp ${res.synced_seats_count} vùng bàn từ Backend.`,
      })
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Không thể kết nối sang AI Service (Port 8000).',
      })
    } finally {
      setIsSyncingAi(false)
    }
  }

  return (
    <section className="panel seat-bottom-panel" aria-label="Thuộc tính chỗ ngồi và đồng bộ AI">
      <div className="seat-panel-header">
        <div>
          <p className="eyebrow">CẤU HÌNH VÙNG ẢO</p>
          <h2>{selectedSeat ? `Chỉnh sửa vị trí: ${selectedSeat.seatCode}` : 'Thiết lập Vị trí mới'}</h2>
        </div>
        {selectedSeat && (
          <button
            type="button"
            className="button button-secondary button-sm"
            onClick={handleStartNewSeat}
            title="Hủy chọn để tạo vị trí mới"
          >
            <PlusCircle size={15} aria-hidden="true" />
            <span>Tạo vị trí mới</span>
          </button>
        )}
      </div>

      {feedback && (
        <div className={`alert ${feedback.type === 'success' ? 'alert-success' : 'alert-error'}`} role="alert" style={{ marginBottom: '14px' }}>
          {feedback.type === 'success' ? (
            <CheckCircle size={18} aria-hidden="true" />
          ) : (
            <WarningCircle size={18} aria-hidden="true" />
          )}
          <p>{feedback.message}</p>
        </div>
      )}

      <div className="seat-bottom-grid">
        {/* Khối Trái: Form nhập thông tin bàn */}
        <form onSubmit={handleSaveSeat} className="seat-bottom-form">
          <div className="seat-form-fields-grid">
            <div className="field">
              <label htmlFor="seat-code">Mã Vị trí *</label>
              <input
                id="seat-code"
                type="text"
                placeholder="VD: SEAT_IT_01"
                value={seatCode}
                onChange={e => setSeatCode(e.target.value)}
                disabled={!!selectedSeat}
                required
              />
              <small>Mã viết liền không dấu, duy nhất.</small>
            </div>

            <div className="field">
              <label htmlFor="seat-name">Tên hiển thị *</label>
              <input
                id="seat-name"
                type="text"
                placeholder="VD: Bàn Lập trình viên 01"
                value={seatName}
                onChange={e => setSeatName(e.target.value)}
                required
              />
            </div>

            <div className="field">
              <label htmlFor="zone-type">Loại Vùng ảo *</label>
              <select
                id="zone-type"
                value={zoneType}
                onChange={e => setZoneType(e.target.value as ZoneType)}
              >
                <option value="WORK_DESK">WORK_DESK — Bàn làm việc (FSM hiện diện)</option>
                <option value="RESTRICTED_ZONE">RESTRICTED_ZONE — Khu vực cấm (Báo động)</option>
              </select>
            </div>

            <div className="field">
              <label htmlFor="assigned-emp">Nhân viên sở hữu</label>
              <select
                id="assigned-emp"
                value={assignedEmployeeId}
                onChange={e => setAssignedEmployeeId(e.target.value)}
              >
                <option value="">-- Để trống (Không gian chung) --</option>
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>
                    {emp.employeeCode} - {emp.fullName}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="seat-form-footer">
            <div className="polygon-meta-box horizontal">
              <span>Đa giác hiện tại: <strong>{currentPolygon.length} đỉnh</strong></span>
              {currentPolygon.length < 3 && (
                <span className="muted" style={{ fontSize: '0.75rem', marginLeft: '8px' }}>
                  (Cần tối thiểu 3 đỉnh trên khung hình để tạo mặt phẳng khép kín)
                </span>
              )}
            </div>

            <div className="seat-form-actions-row">
              {currentPolygon.length > 0 && (
                <button
                  type="button"
                  className="button button-secondary button-sm"
                  onClick={onClearPolygon}
                  title="Xóa đa giác đang vẽ"
                >
                  <Trash size={15} aria-hidden="true" />
                  <span>Xóa vẽ lại</span>
                </button>
              )}

              {selectedSeat && (
                <button
                  type="button"
                  className="button button-danger button-sm"
                  onClick={() => setDeletingSeat(selectedSeat)}
                  disabled={isSaving}
                  title={`Xóa bàn ${selectedSeat.seatCode}`}
                >
                  <Trash size={15} aria-hidden="true" />
                  <span>Xóa bàn này</span>
                </button>
              )}

              <button
                type="submit"
                className="button button-primary button-sm"
                disabled={isSaving || currentPolygon.length < 3 || !selectedCamera}
              >
                <FloppyDisk size={16} aria-hidden="true" />
                <span>{isSaving ? 'Đang lưu…' : selectedSeat ? 'Cập nhật đa giác' : 'Lưu bàn làm việc'}</span>
              </button>
            </div>
          </div>
        </form>

        {/* Khối Phải: Cụm Đồng bộ AI & Danh sách bàn */}
        <div className="seat-bottom-meta-col">
          {/* Cụm nút đồng bộ AI */}
          <div className="ai-sync-card">
            <div className="ai-sync-card-header">
              <div>
                <p className="eyebrow" style={{ margin: 0 }}>ĐỒNG BỘ MÔ HÌNH AI</p>
                <h3 style={{ margin: '2px 0 0', fontSize: '0.9375rem' }}>Đẩy vùng sang AI Service</h3>
              </div>
              <button
                type="button"
                className="button button-secondary button-sm"
                onClick={handleSyncAi}
                disabled={isSyncingAi || !selectedCamera}
                title="Bắn sự kiện sang FastAPI để nạp ngay tọa độ mới"
              >
                <ArrowsClockwise size={15} className={isSyncingAi ? 'spin' : ''} aria-hidden="true" />
                <span>{isSyncingAi ? 'Đang đồng bộ…' : 'Đồng bộ AI'}</span>
              </button>
            </div>
            <p className="muted" style={{ fontSize: '0.75rem', margin: '4px 0 0' }}>
              Cập nhật trực tiếp bộ nhớ RAM của RT-DETR trên Port 8000.
            </p>
          </div>

          {/* Danh sách các bàn thuộc camera này */}
          <div className="existing-seats-card">
            <div className="existing-seats-card-header">
              <span className="eyebrow" style={{ margin: 0 }}>BÀN ĐÃ CẤU HÌNH</span>
              <span className="badge badge-neutral" style={{ fontSize: '0.7rem' }}>{seats.length}</span>
            </div>

            {seats.length === 0 ? (
              <p className="muted" style={{ fontSize: '0.8125rem', padding: '8px 0' }}>
                Chưa có vùng bàn nào cho camera này.
              </p>
            ) : (
              <div className="seat-chips-wrapper">
                {seats.map(s => {
                  const isSelected = selectedSeat?.id === s.id
                  return (
                    <div
                      key={s.id}
                      className={`seat-chip-compact ${isSelected ? 'active' : ''}`}
                      onClick={() => onSelectSeat(s)}
                      title="Click để xem hoặc chỉnh sửa vị trí này"
                    >
                      <div className="seat-chip-main">
                        <strong className="seat-chip-code">{s.seatCode}</strong>
                        <span className="seat-chip-name muted">{s.seatName}</span>
                      </div>
                      <div className="seat-chip-badge">
                        {s.zoneType === 'RESTRICTED_ZONE' ? (
                          <span className="badge badge-danger badge-subtle" title="Khu vực cấm">
                            <ShieldCheck size={11} aria-hidden="true" /> Cấm
                          </span>
                        ) : s.assignedEmployeeName ? (
                          <span className="badge badge-info badge-subtle" title={`Gán cho: ${s.assignedEmployeeName}`}>
                            <User size={11} aria-hidden="true" /> {s.assignedEmployeeCode}
                          </span>
                        ) : (
                          <span className="badge badge-neutral badge-subtle">Trống</span>
                        )}

                        <button
                          type="button"
                          className="seat-chip-del-icon"
                          onClick={(e) => {
                            e.stopPropagation()
                            setDeletingSeat(s)
                          }}
                          title={`Xóa bàn ${s.seatCode}`}
                          aria-label={`Xóa bàn ${s.seatCode}`}
                        >
                          <Trash size={12} aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal Xác nhận Xóa Bàn làm việc */}
      {deletingSeat && (
        <div className="modal-backdrop" onClick={() => setDeletingSeat(null)}>
          <div
            className="panel app-dialog"
            onClick={e => e.stopPropagation()}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-seat-title"
          >
            <div className="app-dialog-heading">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Warning size={24} className="text-danger" aria-hidden="true" />
                <h2 id="delete-seat-title" style={{ color: '#ef4444' }}>Xác nhận xóa Vùng bàn</h2>
              </div>
              <button
                type="button"
                className="button button-secondary app-dialog-close"
                onClick={() => setDeletingSeat(null)}
                aria-label="Đóng"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>

            <div style={{ margin: '14px 0', fontSize: '0.875rem', lineHeight: '1.5' }}>
              <p>
                Bạn có chắc chắn muốn xóa vị trí bàn{' '}
                <strong>{deletingSeat.seatCode}</strong> ({deletingSeat.seatName}) không?
              </p>
              <p className="text-danger" style={{ marginTop: '8px', fontSize: '0.8125rem' }}>
                ⚠️ Toàn bộ tọa độ đa giác và dữ liệu lịch sử trạng thái của bàn này sẽ bị xóa khỏi hệ thống.
              </p>
            </div>

            <div className="app-dialog-actions">
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setDeletingSeat(null)}
                disabled={isSaving}
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                className="button button-danger"
                onClick={() => handleDeleteSeat(deletingSeat)}
                disabled={isSaving}
              >
                {isSaving ? 'Đang xóa…' : 'Xác nhận xóa'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
