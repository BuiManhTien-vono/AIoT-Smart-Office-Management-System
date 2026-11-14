import { useState, useMemo } from 'react'
import {
  VideoCamera,
  ArrowsOutSimple,
  ArrowsInSimple,
  ArrowClockwise,
  Armchair,
  CheckCircle,
  Clock,
  Warning,
  MinusCircle,
  GridFour,
  Square,
  SquaresFour,
  Gear
} from '@phosphor-icons/react'
import type { Camera, Seat } from '../../types/occupancy.types'

interface Props {
  cameras: Camera[]
  seats: Seat[]
  onSelectSeat?: (seat: Seat) => void
  onResetCamera?: (cameraCode: string) => Promise<void>
}

type GridLayout = 'auto' | '1x1' | '1x2' | '2x2' | '3x3'

export function MultiCameraMonitorView({
  cameras,
  seats,
  onSelectSeat,
  onResetCamera,
}: Props) {
  const [layout, setLayout] = useState<GridLayout>('auto')
  const [focusedCameraId, setFocusedCameraId] = useState<string | null>(null)
  const [resettingCode, setResettingCode] = useState<string | null>(null)
  const [filterCameraType, setFilterCameraType] = useState<'ALL' | 'DESK' | 'GATE'>('ALL')

  // Lọc camera theo loại (DESK, GATE)
  const visibleCameras = useMemo(() => {
    let list = cameras
    if (filterCameraType !== 'ALL') {
      list = list.filter(c => c.cameraType === filterCameraType)
    }
    if (focusedCameraId) {
      const match = list.find(c => c.id === focusedCameraId)
      return match ? [match] : list
    }
    return list
  }, [cameras, filterCameraType, focusedCameraId])

  // Gom nhóm bàn theo camera
  const seatsByCamera = useMemo(() => {
    const map = new Map<string, Seat[]>()
    for (const seat of seats) {
      const list = map.get(seat.cameraId) || []
      list.push(seat)
      map.set(seat.cameraId, list)
    }
    return map
  }, [seats])

  const handleResetCamera = async (code: string) => {
    if (!onResetCamera) return
    const confirmed = window.confirm(`Bạn có chắc chắn muốn đưa toàn bộ bàn của camera [${code}] về trạng thái TRỐNG (EMPTY)?`)
    if (!confirmed) return
    try {
      setResettingCode(code)
      await onResetCamera(code)
    } finally {
      setResettingCode(null)
    }
  }

  return (
    <div className="multi-camera-view-container">
      {/* 1. Thanh điều khiển bố cục đa màn hình */}
      <div className="multi-camera-toolbar panel">
        <div className="toolbar-left">
          <div className="camera-type-filter">
            <span className="muted">Hiển thị camera:</span>
            <button
              type="button"
              className={`filter-chip ${filterCameraType === 'ALL' ? 'active' : ''}`}
              onClick={() => { setFilterCameraType('ALL'); setFocusedCameraId(null); }}
            >
              Tất cả ({cameras.length})
            </button>
            <button
              type="button"
              className={`filter-chip ${filterCameraType === 'DESK' ? 'active' : ''}`}
              onClick={() => { setFilterCameraType('DESK'); setFocusedCameraId(null); }}
            >
              📹 Bàn làm việc ({cameras.filter(c => c.cameraType === 'DESK').length})
            </button>
            <button
              type="button"
              className={`filter-chip ${filterCameraType === 'GATE' ? 'active' : ''}`}
              onClick={() => { setFilterCameraType('GATE'); setFocusedCameraId(null); }}
            >
              🚪 Cửa / Sảnh ({cameras.filter(c => c.cameraType === 'GATE').length})
            </button>
          </div>
        </div>

        <div className="toolbar-right">
          {focusedCameraId && (
            <button
              type="button"
              className="button button-ghost button-small"
              onClick={() => setFocusedCameraId(null)}
            >
              <ArrowsInSimple size={16} /> Thu nhỏ về lưới đa màn hình
            </button>
          )}

          <div className="layout-switcher">
            <span className="muted">Bố cục:</span>
            <button
              type="button"
              className={`button-icon ${layout === '1x1' && !focusedCameraId ? 'active' : ''}`}
              onClick={() => { setLayout('1x1'); setFocusedCameraId(null); }}
              title="1 Màn hình lớn"
            >
              <Square size={16} />
            </button>
            <button
              type="button"
              className={`button-icon ${layout === '1x2' ? 'active' : ''}`}
              onClick={() => { setLayout('1x2'); setFocusedCameraId(null); }}
              title="2 Màn hình chia đôi"
            >
              <SquaresFour size={16} />
            </button>
            <button
              type="button"
              className={`button-icon ${layout === '2x2' ? 'active' : ''}`}
              onClick={() => { setLayout('2x2'); setFocusedCameraId(null); }}
              title="Lưới 2x2 (4 Màn hình)"
            >
              <GridFour size={16} />
            </button>
            <button
              type="button"
              className={`button-icon ${layout === 'auto' && !focusedCameraId ? 'active' : ''}`}
              onClick={() => { setLayout('auto'); setFocusedCameraId(null); }}
              title="Tự động lấp đầy"
            >
              <span>Auto</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Lưới các Màn hình Camera */}
      {visibleCameras.length === 0 ? (
        <div className="panel empty-state">
          <VideoCamera size={40} className="muted" />
          <h3>Không có camera nào phù hợp</h3>
          <p className="muted">Chưa có camera nào được cấu hình trong hệ thống hoặc phù hợp với bộ lọc.</p>
        </div>
      ) : (
        <div className={`camera-monitor-grid layout-${focusedCameraId ? '1x1' : layout}`}>
          {visibleCameras.map(camera => {
            const camSeats = seatsByCamera.get(camera.id) || []
            const presentCount = camSeats.filter(s => s.currentState === 'PRESENT').length
            const tempAwayCount = camSeats.filter(s => s.currentState === 'TEMP_AWAY').length
            const prolongedAwayCount = camSeats.filter(s => s.currentState === 'PROLONGED_AWAY').length
            const emptyCount = camSeats.filter(s => s.currentState === 'EMPTY').length
            const isFocused = focusedCameraId === camera.id

            return (
              <div 
                className={`camera-screen-card ${isFocused ? 'camera-screen-focused' : ''}`} 
                key={camera.id}
              >
                {/* Header màn hình camera */}
                <div className="camera-screen-header">
                  <div className="screen-meta">
                    <span className="live-dot" title="Tín hiệu trực tuyến" />
                    <strong>{camera.cameraName}</strong>
                    <code className="camera-code-tag">{camera.cameraCode}</code>
                    <span className="badge badge-info">{camera.cameraType === 'DESK' ? 'Giám sát bàn' : 'Cửa ra vào'}</span>
                  </div>

                  <div className="screen-actions">
                    {onResetCamera && camSeats.length > 0 && (
                      <button
                        type="button"
                        className="button-icon-screen"
                        title={`Reset ${camSeats.length} bàn của camera này về Trống`}
                        disabled={resettingCode === camera.cameraCode}
                        onClick={() => handleResetCamera(camera.cameraCode)}
                      >
                        <ArrowClockwise size={14} className={resettingCode === camera.cameraCode ? 'spin' : ''} />
                      </button>
                    )}
                    <a
                      className="button-icon-screen"
                      href={`#/occupancy/zones?camera=${camera.cameraCode}`}
                      title="Cấu hình vùng ảo camera này"
                    >
                      <Gear size={14} />
                    </a>
                    <button
                      type="button"
                      className="button-icon-screen"
                      title={isFocused ? 'Thu nhỏ' : 'Phóng to màn hình này'}
                      onClick={() => setFocusedCameraId(isFocused ? null : camera.id)}
                    >
                      {isFocused ? <ArrowsInSimple size={14} /> : <ArrowsOutSimple size={14} />}
                    </button>
                  </div>
                </div>

                {/* Dải thống kê bàn của camera */}
                <div className="camera-screen-stats">
                  <span className="stat-pill" title="Tổng số bàn quét được">
                    <Armchair size={13} /> {camSeats.length} bàn
                  </span>
                  <span className="stat-pill stat-present" title="Đang có mặt">
                    <CheckCircle size={13} /> {presentCount}
                  </span>
                  <span className="stat-pill stat-away" title="Tạm vắng">
                    <Clock size={13} /> {tempAwayCount}
                  </span>
                  {prolongedAwayCount > 0 && (
                    <span className="stat-pill stat-alert" title="Rời chỗ quá hạn">
                      <Warning size={13} /> {prolongedAwayCount}
                    </span>
                  )}
                  <span className="stat-pill stat-empty" title="Bàn trống">
                    <MinusCircle size={13} /> {emptyCount}
                  </span>
                </div>

                {/* Khung video / Trực quan hóa các bàn trong camera */}
                <div className="camera-video-frame">
                  <div className="video-stream-overlay">
                    <span className="stream-source-label">{camera.streamSource || 'RTSP Live Stream'}</span>
                    <span className="stream-time">{new Date().toLocaleTimeString('vi-VN')}</span>
                  </div>

                  {camSeats.length === 0 ? (
                    <div className="no-seats-in-cam">
                      <p className="muted">Camera chưa có bàn làm việc được gán vùng.</p>
                      <a className="button button-secondary button-small" href={`#/occupancy/zones?camera=${camera.cameraCode}`}>
                        Vẽ vùng bàn cho camera này
                      </a>
                    </div>
                  ) : (
                    <div className="camera-desk-matrix">
                      {camSeats.map(seat => {
                        let stateClass = 'state-empty'
                        let stateLabel = 'Trống'
                        if (seat.currentState === 'PRESENT') {
                          stateClass = 'state-present'
                          stateLabel = 'Có mặt'
                        } else if (seat.currentState === 'TEMP_AWAY') {
                          stateClass = 'state-away'
                          stateLabel = 'Tạm vắng'
                        } else if (seat.currentState === 'PROLONGED_AWAY') {
                          stateClass = 'state-alert'
                          stateLabel = 'Quá hạn >15p'
                        }

                        return (
                          <button
                            type="button"
                            key={seat.id}
                            className={`desk-cell ${stateClass}`}
                            onClick={() => onSelectSeat?.(seat)}
                            title={`Bàn: ${seat.seatCode} (${seat.seatName}) - Trạng thái: ${stateLabel}${seat.assignedEmployeeName ? ` - Nhân sự: ${seat.assignedEmployeeName}` : ''}`}
                          >
                            <div className="desk-code">{seat.seatCode}</div>
                            <div className="desk-user">
                              {seat.assignedEmployeeName || <span className="muted-name">Chưa gán</span>}
                            </div>
                            <div className="desk-state-tag">{stateLabel}</div>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
