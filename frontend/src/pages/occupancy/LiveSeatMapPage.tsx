import { useEffect, useState, useCallback, useRef } from 'react'
import { HubConnectionState } from '@microsoft/signalr'
import {
  Broadcast,
  ArrowClockwise,
  Warning,
  Armchair,
  X,
  Television,
  SquaresFour,
  Table,
} from '@phosphor-icons/react'
import { LiveSeatMapGrid } from '../../components/seat-map/LiveSeatMapGrid'
import { MultiCameraMonitorView } from '../../components/seat-map/MultiCameraMonitorView'
import { BatchSeatManagerView } from '../../components/seat-map/BatchSeatManagerView'
import { getSeatMap, listCameras, resetCameraSeats, batchSeatAction } from '../../services/occupancyService'
import { listDepartments } from '../../services/biometricsService'
import { signalrService } from '../../services/signalrService'
import type { Session, Department } from '../../types/auth.types'
import type {
  Seat,
  Camera,
  SeatStateChangedEvent,
  ProlongedAbsenceAlertEvent,
  BatchSeatActionInput,
} from '../../types/occupancy.types'
import './seat-map.css'

interface Props {
  session: Session
}

interface AlertToast {
  id: string
  message: string
  timestamp: Date
}

export type SeatMapViewMode = 'multi-camera' | 'batch-manager' | 'classic-grid'

export function LiveSeatMapPage({ session }: Props) {
  const [viewMode, setViewMode] = useState<SeatMapViewMode>('multi-camera')
  const [departments, setDepartments] = useState<Department[]>([])
  const [cameras, setCameras] = useState<Camera[]>([])
  const [selectedDeptId, setSelectedDeptId] = useState<string>(
    session.user.departmentId || 'ALL'
  )
  const [seats, setSeats] = useState<Seat[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [signalrState, setSignalrState] = useState<HubConnectionState>(
    signalrService.getConnectionState()
  )
  const [alerts, setAlerts] = useState<AlertToast[]>([])
  const [selectedSeatDetail, setSelectedSeatDetail] = useState<Seat | null>(null)

  const activeDeptRef = useRef(selectedDeptId)
  useEffect(() => {
    activeDeptRef.current = selectedDeptId
  }, [selectedDeptId])

  // 1. Tải danh sách phòng ban & camera
  useEffect(() => {
    let isMounted = true
    Promise.all([
      listDepartments(session.accessToken),
      listCameras(session.accessToken),
    ])
      .then(([depts, cams]) => {
        if (isMounted) {
          setDepartments(depts)
          setCameras(cams)
        }
      })
      .catch(err => {
        console.warn('Không tải được danh mục ban đầu:', err)
      })
    return () => {
      isMounted = false
    }
  }, [session.accessToken])

  // 2. Tải danh sách bàn làm việc theo phòng ban
  const loadSeatMap = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const deptId = selectedDeptId === 'ALL' ? undefined : selectedDeptId
      const [seatData, camData] = await Promise.all([
        getSeatMap(session.accessToken, deptId),
        listCameras(session.accessToken, deptId),
      ])
      setSeats(seatData)
      setCameras(camData)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi khi tải sơ đồ chỗ ngồi.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [session.accessToken, selectedDeptId])

  useEffect(() => {
    void loadSeatMap()
  }, [loadSeatMap])

  // 3. Khởi tạo kết nối SignalR & Lắng nghe sự kiện đẩy thời gian thực
  useEffect(() => {
    const unsubState = signalrService.onConnectionState(state => {
      setSignalrState(state)
    })

    const unsubSeatState = signalrService.onSeatStateChanged(
      (event: SeatStateChangedEvent) => {
        setSeats(prevSeats => {
          const index = prevSeats.findIndex(
            s => s.id === event.seatId || s.seatCode === event.seatCode
          )
          if (index === -1) {
            return prevSeats
          }
          const updated = [...prevSeats]
          const existing = updated[index]!
          updated[index] = {
            ...existing,
            currentState: event.newState,
            activeSecondsToday: event.activeSecondsToday,
            stateUpdatedAt: event.occurredOnUtc,
          }
          return updated
        })
      }
    )

    const unsubAlert = signalrService.onProlongedAbsence(
      (event: ProlongedAbsenceAlertEvent) => {
        const awayMinutes = Math.round(event.awayDurationSeconds / 60)
        const newAlert: AlertToast = {
          id: `${event.seatCode}-${Date.now()}`,
          message: `Bàn [${event.seatCode}] đã vắng mặt hơn ${awayMinutes} phút mà chưa trở lại.`,
          timestamp: new Date(),
        }
        setAlerts(prev => [newAlert, ...prev.slice(0, 4)])
      }
    )

    signalrService
      .start(session.accessToken)
      .then(() => {
        if (selectedDeptId !== 'ALL') {
          void signalrService.joinDepartmentGroup(selectedDeptId)
        }
        if (session.user.role === 'ADMIN' || session.user.role === 'HR') {
          void signalrService.joinOverviewGroup(session.user.role)
        }
      })
      .catch(err => {
        console.warn('Lỗi kết nối OccupancyHub SignalR:', err)
      })

    return () => {
      unsubState()
      unsubSeatState()
      unsubAlert()
    }
  }, [session.accessToken, session.user.role, selectedDeptId])

  // Xử lý chuyển đổi phòng ban
  const handleDepartmentChange = (newDeptId: string) => {
    if (activeDeptRef.current !== 'ALL') {
      void signalrService.leaveDepartmentGroup(activeDeptRef.current)
    }
    setSelectedDeptId(newDeptId)
    if (newDeptId !== 'ALL') {
      void signalrService.joinDepartmentGroup(newDeptId)
    }
  }

  const dismissAlert = (id: string) => {
    setAlerts(prev => prev.filter(a => a.id !== id))
  }

  // Xử lý Reset toàn bộ bàn của 1 camera
  const handleResetCamera = async (cameraCode: string) => {
    await resetCameraSeats(cameraCode, session.accessToken)
    await loadSeatMap()
  }

  // Xử lý thao tác hàng loạt trên nhiều bàn
  const handleBatchAction = async (input: BatchSeatActionInput) => {
    await batchSeatAction(session.accessToken, input)
    await loadSeatMap()
  }

  // Nhãn trạng thái SignalR
  let statusText = 'Đã kết nối trực tiếp'
  let statusClass = 'connected'
  if (signalrState === HubConnectionState.Connecting || signalrState === HubConnectionState.Reconnecting) {
    statusText = 'Đang đồng bộ kết nối...'
    statusClass = 'reconnecting'
  } else if (signalrState === HubConnectionState.Disconnected) {
    statusText = 'Mất kết nối máy chủ'
    statusClass = 'disconnected'
  }

  return (
    <div className="seat-map-page-layout">
      {/* 1. Header Trang & Trạng thái SignalR */}
      <div className="seat-map-header">
        <div className="seat-map-title-wrap">
          <p className="eyebrow">HIỆN DIỆN &amp; KHÔNG GIAN</p>
          <h1>Sơ đồ Chỗ ngồi &amp; Giám sát Đa Camera</h1>
        </div>

        <div className="seat-map-actions-wrap">
          {/* Badge Trạng thái SignalR */}
          <div className={`signalr-status-badge ${statusClass}`} title="Trạng thái WebSocket SignalR">
            <span className="status-indicator-dot" />
            <Broadcast size={16} weight="bold" />
            <span>{statusText}</span>
          </div>

          {/* Bộ chọn phòng ban */}
          <div className="dept-select-wrap">
            <select
              value={selectedDeptId}
              onChange={e => handleDepartmentChange(e.target.value)}
              disabled={loading}
              title="Lọc sơ đồ theo phòng ban"
            >
              <option value="ALL">🏢 Toàn bộ văn phòng ({departments.length} phòng)</option>
              {departments.map(dept => (
                <option key={dept.id} value={dept.id}>
                  {dept.departmentName} ({dept.departmentCode})
                </option>
              ))}
            </select>
          </div>

          {/* Nút Làm mới thủ công */}
          <button
            type="button"
            className="button button-secondary"
            onClick={() => void loadSeatMap()}
            disabled={loading}
            title="Tải lại sơ đồ chỗ ngồi"
          >
            <ArrowClockwise size={16} className={loading ? 'spin' : ''} />
            <span>Làm mới</span>
          </button>
        </div>
      </div>

      {/* 2. Thanh Tabs Chế độ xem: Đa màn hình Camera | Quản lý nhiều bàn | Lưới truyền thống */}
      <nav className="seat-map-view-tabs" aria-label="Chế độ giám sát chỗ ngồi">
        <button
          type="button"
          className={`view-tab-btn ${viewMode === 'multi-camera' ? 'active' : ''}`}
          onClick={() => setViewMode('multi-camera')}
        >
          <Television size={18} weight="bold" />
          <span>Đa màn hình Camera ({cameras.length} camera)</span>
        </button>

        <button
          type="button"
          className={`view-tab-btn ${viewMode === 'batch-manager' ? 'active' : ''}`}
          onClick={() => setViewMode('batch-manager')}
        >
          <Table size={18} weight="bold" />
          <span>Quản lý nhiều bàn cùng lúc</span>
        </button>

        <button
          type="button"
          className={`view-tab-btn ${viewMode === 'classic-grid' ? 'active' : ''}`}
          onClick={() => setViewMode('classic-grid')}
        >
          <SquaresFour size={18} weight="bold" />
          <span>Lưới chi tiết toàn văn phòng ({seats.length} bàn)</span>
        </button>
      </nav>

      {/* 3. Dải Thông báo Cảnh báo Rời chỗ quá hạn nổi (Realtime Alert Toasts) */}
      {alerts.length > 0 && (
        <div className="seat-map-alerts-container">
          {alerts.map(alert => (
            <div key={alert.id} className="seat-map-alert-toast">
              <div className="seat-map-alert-content">
                <Warning size={18} weight="bold" />
                <span>{alert.message}</span>
              </div>
              <button
                type="button"
                className="seat-map-alert-close"
                onClick={() => dismissAlert(alert.id)}
                title="Đóng thông báo"
              >
                <X size={14} weight="bold" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 4. Lỗi nạp dữ liệu */}
      {error && (
        <div className="alert alert-error">
          <Warning size={20} weight="bold" />
          <p>{error}</p>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => void loadSeatMap()}
          >
            Thử lại
          </button>
        </div>
      )}

      {/* 5. Nội dung Chế độ xem tương ứng */}
      {loading && seats.length === 0 && cameras.length === 0 ? (
        <div className="panel empty-state">
          <ArrowClockwise size={32} className="spin muted" />
          <p className="muted">Đang tải cấu hình đa camera và sơ đồ chỗ ngồi...</p>
        </div>
      ) : (
        <>
          {viewMode === 'multi-camera' && (
            <MultiCameraMonitorView
              cameras={cameras}
              seats={seats}
              onSelectSeat={seat => setSelectedSeatDetail(seat)}
              onResetCamera={handleResetCamera}
            />
          )}

          {viewMode === 'batch-manager' && (
            <BatchSeatManagerView
              seats={seats}
              cameras={cameras}
              onSelectSeat={seat => setSelectedSeatDetail(seat)}
              onBatchAction={handleBatchAction}
            />
          )}

          {viewMode === 'classic-grid' && (
            <LiveSeatMapGrid
              seats={seats}
              onSelectSeat={seat => setSelectedSeatDetail(seat)}
            />
          )}
        </>
      )}

      {/* 6. Modal Chi tiết Ghế */}
      {selectedSeatDetail && (
        <div
          className="modal-backdrop"
          onClick={() => setSelectedSeatDetail(null)}
        >
          <div
            className="app-dialog app-dialog-confirm"
            onClick={e => e.stopPropagation()}
          >
            <div className="app-dialog-heading">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Armchair size={24} weight="bold" color="var(--color-primary)" />
                <h3 style={{ margin: 0 }}>Chi tiết vị trí {selectedSeatDetail.seatCode}</h3>
              </div>
              <button
                type="button"
                className="button-icon"
                onClick={() => setSelectedSeatDetail(null)}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'grid', gap: 14, margin: '16px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="muted">Tên vị trí:</span>
                <strong>{selectedSeatDetail.seatName}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="muted">Loại vùng:</span>
                <span>
                  {selectedSeatDetail.zoneType === 'WORK_DESK'
                    ? 'Bàn làm việc'
                    : 'Khu vực an ninh'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="muted">Trạng thái hiện tại:</span>
                <span className="badge badge-info">
                  {selectedSeatDetail.currentState}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="muted">Nhân viên sở hữu:</span>
                <span>
                  {selectedSeatDetail.assignedEmployeeName || 'Chưa gán nhân sự'}
                </span>
              </div>
              {selectedSeatDetail.assignedEmployeeCode && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="muted">Mã nhân viên:</span>
                  <code>{selectedSeatDetail.assignedEmployeeCode}</code>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="muted">Thời gian ngồi tích luỹ:</span>
                <strong>
                  {Math.floor(selectedSeatDetail.activeSecondsToday / 3600)}h{' '}
                  {Math.floor((selectedSeatDetail.activeSecondsToday % 3600) / 60)}m
                </strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="muted">Cập nhật lần cuối:</span>
                <time className="numeric">
                  {new Date(selectedSeatDetail.stateUpdatedAt).toLocaleTimeString('vi-VN')}
                </time>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <button
                type="button"
                className="button button-primary"
                onClick={() => setSelectedSeatDetail(null)}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
