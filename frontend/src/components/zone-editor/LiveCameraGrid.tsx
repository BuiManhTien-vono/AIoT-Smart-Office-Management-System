import { useEffect, useRef } from 'react'
import {
  ArrowsOutSimple,
  VideoCamera,
  Broadcast,
  Armchair,
} from '@phosphor-icons/react'
import type { Camera, Seat } from '../../types/occupancy.types'

interface Props {
  cameras: Camera[]
  allSeats: Seat[]
  selectedCameraId: string | null
  onInspectCamera: (camera: Camera) => void
}

function LiveGridCard({
  camera,
  cameraSeats,
  isSelected,
  onInspect,
}: {
  camera: Camera
  cameraSeats: Seat[]
  isSelected: boolean
  onInspect: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  function getEffectiveStreamUrl(source: string): string {
    const s = source.trim()
    if (!s) return ''
    if (/^https?:\/\/[^/]+:8080\/?$/i.test(s)) return s.replace(/\/?$/, '/video')
    if (/^https?:\/\/[^/]+:4747\/?$/i.test(s)) return s.replace(/\/?$/, '/video')
    return s
  }

  const effectiveSource = getEffectiveStreamUrl(camera.streamSource || '')
  const isVideoFile =
    !!effectiveSource &&
    (effectiveSource.endsWith('.mp4') ||
      effectiveSource.endsWith('.webm') ||
      effectiveSource.includes('demo'))

  const videoSrc = isVideoFile
    ? effectiveSource.startsWith('http') || effectiveSource.startsWith('/')
      ? effectiveSource
      : `/${effectiveSource}`
    : null

  const isLiveStream = !!effectiveSource && !isVideoFile && effectiveSource !== '0'

  // Vẽ các đa giác bàn đã lưu lên canvas mini overlay
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const { width, height } = canvas
    ctx.clearRect(0, 0, width, height)

    cameraSeats.forEach(seat => {
      const pts = seat.polygonPoints
      if (!pts || pts.length < 3) return

      ctx.beginPath()
      pts.forEach((pt, idx) => {
        const px = pt.x * width
        const py = pt.y * height
        if (idx === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      })
      ctx.closePath()

      // Màu sắc theo trạng thái FSM
      const state = seat.currentState || 'EMPTY'
      let strokeColor = '#94a3b8'
      let fillColor = 'rgba(148, 163, 184, 0.22)'
      if (state === 'PRESENT') {
        strokeColor = '#10b981'
        fillColor = 'rgba(16, 185, 129, 0.3)'
      } else if (state === 'TEMP_AWAY') {
        strokeColor = '#f59e0b'
        fillColor = 'rgba(245, 158, 11, 0.3)'
      } else if (state === 'PROLONGED_AWAY') {
        strokeColor = '#ef4444'
        fillColor = 'rgba(239, 68, 68, 0.3)'
      }

      ctx.strokeStyle = strokeColor
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.fillStyle = fillColor
      ctx.fill()

      // Nhãn tên bàn ở tâm đa giác
      const xs = pts.map(p => p.x * width)
      const ys = pts.map(p => p.y * height)
      const cx = xs.reduce((a, b) => a + b, 0) / xs.length
      const cy = ys.reduce((a, b) => a + b, 0) / ys.length

      ctx.font = 'bold 10px sans-serif'
      const textW = ctx.measureText(seat.seatCode).width + 8
      const textH = 16

      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)'
      ctx.beginPath()
      if (ctx.roundRect) {
        ctx.roundRect(cx - textW / 2, cy - textH / 2, textW, textH, 3)
      } else {
        ctx.rect(cx - textW / 2, cy - textH / 2, textW, textH)
      }
      ctx.fill()

      ctx.fillStyle = strokeColor
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(seat.seatCode, cx, cy)
    })
  }, [cameraSeats])

  return (
    <div
      className={`live-grid-card ${isSelected ? 'selected' : ''}`}
      onDoubleClick={onInspect}
      title="Click đúp hoặc bấm nút 'Hiệu chuẩn' để mở khung đơn vẽ bàn"
    >
      <div className="live-grid-card-header">
        <div className="live-grid-header-info">
          <span className={`status-dot ${camera.isOnline ? 'online' : 'offline'}`} />
          <strong className="camera-code-label">{camera.cameraCode}</strong>
          <span className="camera-name-label">{camera.cameraName}</span>
        </div>

        <div className="live-grid-header-actions">
          <span className="badge badge-neutral" style={{ fontSize: '0.7rem' }}>
            <Armchair size={12} style={{ marginRight: '3px' }} aria-hidden="true" />
            {cameraSeats.length} bàn
          </span>
          <button
            type="button"
            className="button button-secondary button-xs inspect-btn"
            onClick={onInspect}
            title={`Chuyển sang chế độ hiệu chuẩn cho camera ${camera.cameraCode}`}
          >
            <ArrowsOutSimple size={13} aria-hidden="true" />
            <span>Hiệu chuẩn</span>
          </button>
        </div>
      </div>

      <div className="live-grid-media-wrap">
        {videoSrc ? (
          <video
            src={videoSrc}
            autoPlay
            loop
            muted
            playsInline
            crossOrigin="anonymous"
            className="live-grid-media"
          />
        ) : isLiveStream ? (
          <img
            src={effectiveSource}
            alt={camera.cameraName}
            className="live-grid-media"
            onError={e => {
              const el = e.currentTarget
              if (el.crossOrigin) {
                el.removeAttribute('crossOrigin')
                el.src = effectiveSource
              }
            }}
          />
        ) : camera.calibrationFramePresignedUrl ? (
          <img
            src={camera.calibrationFramePresignedUrl}
            alt={camera.cameraName}
            className="live-grid-media"
          />
        ) : (
          <div className="live-grid-placeholder">
            <VideoCamera size={36} className="muted" aria-hidden="true" />
            <p>Chưa có luồng hình ảnh</p>
          </div>
        )}

        {/* Lớp phủ Canvas mini hiển thị vùng bàn */}
        <canvas
          ref={canvasRef}
          width={640}
          height={360}
          className="live-grid-overlay-canvas"
        />

        {/* Huy hiệu luồng trực tiếp */}
        {(videoSrc || isLiveStream) && (
          <div className="live-grid-tag">
            <span className="live-dot" />
            <Broadcast size={11} aria-hidden="true" />
            <span>LIVE</span>
          </div>
        )}
      </div>
    </div>
  )
}

export function LiveCameraGrid({
  cameras,
  allSeats,
  selectedCameraId,
  onInspectCamera,
}: Props) {
  if (cameras.length === 0) {
    return (
      <div className="empty-state" style={{ padding: '80px 20px' }}>
        <VideoCamera size={56} className="muted" aria-hidden="true" />
        <h3>Chưa có camera nào trong hệ thống</h3>
        <p>Vui lòng thêm camera từ danh sách bên trái để quan sát qua lưới LiveGrid.</p>
      </div>
    )
  }

  // Tự động phân bổ số cột: <=4 cam: 2 cột (2x2), 5-9 cam: 3 cột (3x3)
  const cols = cameras.length <= 1 ? 1 : cameras.length <= 4 ? 2 : 3

  return (
    <div className={`live-grid-container cols-${cols}`} aria-label="Lưới quan sát trực tiếp camera">
      {cameras.map(camera => {
        const cameraSeats = allSeats.filter(s => s.cameraId === camera.id)
        const isSelected = camera.id === selectedCameraId
        return (
          <LiveGridCard
            key={camera.id}
            camera={camera}
            cameraSeats={cameraSeats}
            isSelected={isSelected}
            onInspect={() => onInspectCamera(camera)}
          />
        )
      })}
    </div>
  )
}
