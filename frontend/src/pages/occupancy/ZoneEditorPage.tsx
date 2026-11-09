import { useState, useEffect, useCallback } from 'react'
import { ArrowClockwise, VideoCamera, Square, SquaresFour } from '@phosphor-icons/react'
import type { Session } from '../../types/auth.types'
import type { Camera, Seat, PolygonPoint } from '../../types/occupancy.types'
import { listCameras, listSeats, uploadCalibrationFrame, syncZonesToAi } from '../../services/occupancyService'
import { CameraManagementPanel } from '../../components/zone-editor/CameraManagementPanel'
import { InteractiveZoneCanvas } from '../../components/zone-editor/InteractiveZoneCanvas'
import { SeatConfigSidebar } from '../../components/zone-editor/SeatConfigSidebar'
import { LiveCameraGrid } from '../../components/zone-editor/LiveCameraGrid'
import './zone-editor.css'

export function ZoneEditorPage({ session }: { session: Session }) {
  const [cameras, setCameras] = useState<Camera[]>([])
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null)
  const [seats, setSeats] = useState<Seat[]>([])
  const [allSeats, setAllSeats] = useState<Seat[]>([])
  const [selectedSeat, setSelectedSeat] = useState<Seat | null>(null)
  const [currentPolygon, setCurrentPolygon] = useState<PolygonPoint[]>([])
  const [viewMode, setViewMode] = useState<'SINGLE' | 'GRID'>('SINGLE')

  const [loadingCameras, setLoadingCameras] = useState(false)
  const [loadingSeats, setLoadingSeats] = useState(false)
  const [capturingSnapshot, setCapturingSnapshot] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [calibrationUrlOverride, setCalibrationUrlOverride] = useState<string | null>(null)

  const token = session.accessToken

  // Load cameras
  const fetchCameras = useCallback(async () => {
    setLoadingCameras(true)
    setError(null)
    try {
      const data = await listCameras(token)
      setCameras(data)
      if (data.length > 0) {
        setSelectedCameraId(prev => {
          if (prev && data.some(c => c.id === prev)) return prev
          // Prioritize CAM_DEMO first, then other DESK cameras
          const demoCam = data.find(c => c.cameraCode === 'CAM_DEMO')
          const deskCam = data.find(c => c.cameraType === 'DESK')
          return (demoCam || deskCam || data[0]).id
        })
      } else {
        setSelectedCameraId(null)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Không thể tải danh sách camera.')
    } finally {
      setLoadingCameras(false)
    }
  }, [token])

  useEffect(() => {
    fetchCameras()
  }, [fetchCameras])

  const selectedCamera = cameras.find(c => c.id === selectedCameraId) ?? null

  // Load seats when selected camera changes
  const fetchSeats = useCallback(async () => {
    setLoadingSeats(true)
    try {
      const allData = await listSeats(token)
      setAllSeats(allData)
      if (selectedCameraId) {
        setSeats(allData.filter(s => s.cameraId === selectedCameraId))
      } else {
        setSeats([])
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Không thể tải danh sách vị trí ngồi.')
    } finally {
      setLoadingSeats(false)
    }
  }, [token, selectedCameraId])

  useEffect(() => {
    fetchSeats()
    setSelectedSeat(null)
    setCurrentPolygon([])
    setCalibrationUrlOverride(null)
  }, [selectedCameraId, fetchSeats])

  function handleSelectCamera(cam: Camera) {
    setSelectedCameraId(cam.id)
  }

  function handleSelectSeat(seat: Seat | null) {
    setSelectedSeat(seat)
    if (seat) {
      setCurrentPolygon(seat.polygonPoints || [])
    } else {
      setCurrentPolygon([])
    }
  }

  function handleCalibrationUploaded(cam: Camera, presignedUrl: string) {
    setCalibrationUrlOverride(presignedUrl)
    setCameras(prev =>
      prev.map(c => (c.id === cam.id ? { ...c, calibrationFramePresignedUrl: presignedUrl, calibrationFrameKey: 'uploaded' } : c))
    )
  }

  async function handleCaptureSnapshot(file: File) {
    if (!selectedCamera) return
    setCapturingSnapshot(true)
    setError(null)
    const localUrl = URL.createObjectURL(file)
    setCalibrationUrlOverride(localUrl)
    try {
      const res = await uploadCalibrationFrame(token, selectedCamera.id, file)
      setCameras(prev =>
        prev.map(c => (c.id === selectedCamera.id ? { ...c, calibrationFrameKey: res.objectKey, calibrationFramePresignedUrl: res.presignedUrl } : c))
      )
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Lỗi khi lưu khung hình mẫu.')
    } finally {
      setCapturingSnapshot(false)
    }
  }

  async function handleSyncZonesToAi() {
    if (!selectedCamera) return
    try {
      await syncZonesToAi(selectedCamera.cameraCode)
    } catch (err: unknown) {
      console.warn('Sync to AI failed:', err)
    }
  }

  const backgroundUrl = calibrationUrlOverride || selectedCamera?.calibrationFramePresignedUrl || null

  return (
    <div className="zone-editor-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">QUẢN TRỊ / KHÔNG GIAN LÀM VIỆC</p>
          <h1>Camera và giám sát</h1>
          <p className="muted">
            Quản lý thiết bị camera, quan sát góc nhìn trực tiếp toàn màn hình, chấm tọa độ đa giác và đồng bộ cấu hình sang AI.
          </p>
        </div>

        <div className="toolbar">
          <button
            type="button"
            className="button button-secondary"
            onClick={() => {
              fetchCameras()
              fetchSeats()
            }}
            disabled={loadingCameras || loadingSeats}
          >
            <ArrowClockwise size={16} className={loadingCameras || loadingSeats ? 'spin' : ''} aria-hidden="true" />
            <span>{loadingCameras || loadingSeats ? 'Đang làm mới…' : 'Làm mới dữ liệu'}</span>
          </button>
        </div>
      </header>

      {error && (
        <div className="alert alert-error" role="alert">
          <div>
            <strong>Đã xảy ra lỗi:</strong>
            <p>{error}</p>
          </div>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => {
              fetchCameras()
              fetchSeats()
            }}
          >
            Thử lại
          </button>
        </div>
      )}

      <div className="zone-editor-layout">
        {/* Cột 1: Danh sách Camera (kèm menu 3 chấm Chỉnh sửa & Xóa) */}
        <CameraManagementPanel
          cameras={cameras}
          selectedCameraId={selectedCameraId}
          onSelectCamera={handleSelectCamera}
          onCameraCreated={fetchCameras}
          onCameraUpdated={updated => {
            fetchCameras()
            if (selectedCameraId === updated.id) {
              setSelectedCameraId(updated.id)
            }
          }}
          onCameraDeleted={deletedId => {
            fetchCameras()
            if (selectedCameraId === deletedId) {
              setSelectedCameraId(null)
            }
          }}
          onCalibrationUploaded={handleCalibrationUploaded}
          token={token}
          loading={loadingCameras}
        />

        {/* Cột 2: Không gian làm việc chính (Workspace rộng rãi) */}
        <div className="zone-editor-workspace">
          {/* Vùng Góc nhìn tiêu chuẩn mở rộng hoặc Lưới camera LiveGrid */}
          <section className="panel canvas-main-panel" aria-label="Bàn vẽ đa giác trực quan">
            <div className="panel-subheading" style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <p className="eyebrow" style={{ margin: 0 }}>
                  {viewMode === 'SINGLE' ? 'GÓC NHÌN HIỆU CHUẨN MỞ RỘNG' : 'GIÁM SÁT TRỰC TIẾP TẬP TRUNG'}
                </p>
                <h2 style={{ margin: 0, fontSize: '1.05rem' }}>
                  {viewMode === 'SINGLE'
                    ? selectedCamera
                      ? `${selectedCamera.cameraCode} — ${selectedCamera.cameraName}`
                      : 'Chưa chọn camera'
                    : `Lưới quan sát trực tiếp (LiveGrid — ${cameras.length} camera)`}
                </h2>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {viewMode === 'SINGLE' && selectedCamera && (
                  <span className={`badge ${selectedCamera.cameraType === 'DESK' ? 'badge-info' : 'badge-special'}`}>
                    {selectedCamera.cameraType === 'DESK' ? 'Camera Bàn làm việc' : 'Camera Cổng'}
                  </span>
                )}

                {/* Bộ nút chuyển đổi góc nhìn: Khung đơn <-> Lưới LiveGrid */}
                <div className="view-switcher-group" role="tablist" aria-label="Chế độ hiển thị">
                  <button
                    type="button"
                    className={`view-switcher-btn ${viewMode === 'SINGLE' ? 'active' : ''}`}
                    onClick={() => setViewMode('SINGLE')}
                    role="tab"
                    aria-selected={viewMode === 'SINGLE'}
                    title="Góc nhìn khung đơn hiệu chuẩn (vẽ vùng bàn)"
                  >
                    <Square size={14} weight={viewMode === 'SINGLE' ? 'bold' : 'regular'} aria-hidden="true" />
                    <span>Khung đơn</span>
                  </button>
                  <button
                    type="button"
                    className={`view-switcher-btn ${viewMode === 'GRID' ? 'active' : ''}`}
                    onClick={() => setViewMode('GRID')}
                    role="tab"
                    aria-selected={viewMode === 'GRID'}
                    title="Lưới giám sát nhiều camera đồng thời (LiveGrid)"
                  >
                    <SquaresFour size={14} weight={viewMode === 'GRID' ? 'bold' : 'regular'} aria-hidden="true" />
                    <span>Lưới LiveGrid</span>
                  </button>
                </div>
              </div>
            </div>

            {viewMode === 'GRID' ? (
              <LiveCameraGrid
                cameras={cameras}
                allSeats={allSeats}
                selectedCameraId={selectedCameraId}
                onInspectCamera={cam => {
                  setSelectedCameraId(cam.id)
                  setViewMode('SINGLE')
                }}
              />
            ) : selectedCamera ? (
              <InteractiveZoneCanvas
                cameraCode={selectedCamera.cameraCode}
                backgroundImageUrl={backgroundUrl}
                streamSource={selectedCamera.streamSource}
                existingSeats={seats}
                selectedSeatId={selectedSeat?.id || null}
                currentPolygon={currentPolygon}
                onPolygonChange={setCurrentPolygon}
                onSelectExistingSeat={handleSelectSeat}
                onCaptureSnapshot={handleCaptureSnapshot}
                onSyncZonesToAi={handleSyncZonesToAi}
                isCapturing={capturingSnapshot}
              />
            ) : (
              <div className="empty-state" style={{ padding: '80px 20px' }}>
                <VideoCamera size={56} className="muted" aria-hidden="true" />
                <h3>Vui lòng chọn một camera từ danh sách bên trái</h3>
                <p>Khung hình hoặc luồng camera sẽ hiển thị toàn màn hình tại đây để bạn vẽ vùng bàn.</p>
              </div>
            )}
          </section>

          {/* Phần Cấu hình vùng ảo nằm ngay bên dưới phần góc nhìn tiêu chuẩn (chỉ hiện khi ở chế độ Khung đơn) */}
          {viewMode === 'SINGLE' && selectedCamera && (
            <SeatConfigSidebar
              selectedCamera={selectedCamera}
              seats={seats}
              allSeats={allSeats}
              selectedSeat={selectedSeat}
              currentPolygon={currentPolygon}
              onSelectSeat={handleSelectSeat}
              onSeatSaved={fetchSeats}
              onClearPolygon={() => setCurrentPolygon([])}
              token={token}
            />
          )}
        </div>
      </div>
    </div>
  )
}
