import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
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
  Gear,
  Cpu,
  Broadcast,
  Eye,
  EyeSlash,
} from '@phosphor-icons/react'
import { testDetectPreview } from '../../services/occupancyService'
import type { Camera, Seat, HeadDetectionPreview, PolygonPoint } from '../../types/occupancy.types'

interface Props {
  cameras: Camera[]
  seats: Seat[]
  onSelectSeat?: (seat: Seat) => void
  onResetCamera?: (cameraCode: string) => Promise<void>
}

type GridLayout = 'auto' | '1x1' | '1x2' | '2x2' | '3x3'

function normalizeStreamUrl(source: string): string {
  const s = source.trim()
  if (!s) return ''
  if (/^https?:\/\/[^/]+:8080\/?$/i.test(s)) return s.replace(/\/?$/, '/video')
  if (/^https?:\/\/[^/]+:4747\/?$/i.test(s)) return s.replace(/\/?$/, '/video')
  return s
}

function isPointInPolygon(nx: number, ny: number, pts: PolygonPoint[]): boolean {
  if (!pts || pts.length < 3) return false
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i]!.x
    const yi = pts[i]!.y
    const xj = pts[j]!.x
    const yj = pts[j]!.y
    const intersect =
      yi > ny !== yj > ny && nx < ((xj - xi) * (ny - yi)) / (yj - yi + 1e-12) + xi
    if (intersect) inside = !inside
  }
  return inside
}

interface CameraScreenCardProps {
  camera: Camera
  camSeats: Seat[]
  isFocused: boolean
  resettingCode: string | null
  currentTimeStr: string
  globalAiEnabled: boolean
  onToggleFocus: () => void
  onResetCamera?: (cameraCode: string) => Promise<void>
  onSelectSeat?: (seat: Seat) => void
}

function CameraScreenCard({
  camera,
  camSeats,
  isFocused,
  resettingCode,
  currentTimeStr,
  globalAiEnabled,
  onToggleFocus,
  onResetCamera,
  onSelectSeat,
}: CameraScreenCardProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const webcamStreamRef = useRef<MediaStream | null>(null)

  const [showPolygons, setShowPolygons] = useState(true)
  const [hoveredSeatId, setHoveredSeatId] = useState<string | null>(null)
  const [localAiEnabled, setLocalAiEnabled] = useState(false)
  const [aiLatencyMs, setAiLatencyMs] = useState<number | null>(null)
  const [detectedHeads, setDetectedHeads] = useState<HeadDetectionPreview[]>([])
  const [localSeatStates, setLocalSeatStates] = useState<Map<string, string>>(new Map())
  const [webcamError, setWebcamError] = useState<string | null>(null)
  const [httpStreamError, setHttpStreamError] = useState(false)
  const [useDemoFallback, setUseDemoFallback] = useState(false)
  const [webcamRetryTick, setWebcamRetryTick] = useState(0)

  const isAiRunning = (globalAiEnabled || localAiEnabled) && camera.isOnline

  const rawSource = (camera.streamSource || '').trim()
  const effectiveSource = normalizeStreamUrl(rawSource)

  const isWebcam =
    rawSource === '0' ||
    rawSource === '1' ||
    rawSource === '2' ||
    rawSource.toLowerCase().includes('webcam')

  const isVideoFile =
    !!effectiveSource &&
    (effectiveSource.endsWith('.mp4') ||
      effectiveSource.endsWith('.webm') ||
      effectiveSource.includes('demo'))

  const isRtspSource = effectiveSource.toLowerCase().startsWith('rtsp://')

  const isHttpStream =
    !!effectiveSource &&
    !isVideoFile &&
    !isWebcam &&
    !isRtspSource &&
    (effectiveSource.startsWith('http://') || effectiveSource.startsWith('https://'))

  // Xác định URL video phát trực tiếp (bao gồm cả mô phỏng cho RTSP mẫu chưa có proxy/ảnh hiệu chuẩn)
  const resolvedVideoSrc = useMemo(() => {
    if (!camera.isOnline) return null
    if (useDemoFallback) return '/demo.mp4'
    if (isVideoFile) {
      return effectiveSource.startsWith('http') || effectiveSource.startsWith('/')
        ? effectiveSource
        : `/${effectiveSource}`
    }
    if (isRtspSource && !camera.calibrationFramePresignedUrl) {
      return '/demo.mp4'
    }
    return null
  }, [camera.isOnline, camera.calibrationFramePresignedUrl, effectiveSource, isRtspSource, isVideoFile, useDemoFallback])

  // Kết nối Webcam trình duyệt khi streamSource là '0' / 'webcam'
  useEffect(() => {
    if (!camera.isOnline || !isWebcam || useDemoFallback) {
      if (webcamStreamRef.current) {
        webcamStreamRef.current.getTracks().forEach(t => t.stop())
        webcamStreamRef.current = null
      }
      return
    }

    let isMounted = true

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setTimeout(() => {
        if (isMounted) setWebcamError('Trình duyệt không hỗ trợ WebRTC Webcam')
      }, 0)
      return
    }

    navigator.mediaDevices
      .getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      .then(stream => {
        if (!isMounted) {
          stream.getTracks().forEach(t => t.stop())
          return
        }
        webcamStreamRef.current = stream
        setWebcamError(null)
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          void videoRef.current.play().catch(() => {})
        }
      })
      .catch(err => {
        if (!isMounted) return
        const msg = err instanceof Error ? err.message : 'Không thể mở Webcam'
        setWebcamError(msg)
      })

    return () => {
      isMounted = false
      if (webcamStreamRef.current) {
        webcamStreamRef.current.getTracks().forEach(t => t.stop())
        webcamStreamRef.current = null
      }
    }
  }, [camera.isOnline, isWebcam, useDemoFallback, webcamRetryTick])

  // Vòng lặp suy luận AI RT-DETR thời gian thực cho camera đang bật AI
  useEffect(() => {
    if (!isAiRunning) {
      return
    }

    let cancelled = false
    let timerId: ReturnType<typeof setTimeout> | null = null

    const runDetectionTick = async () => {
      if (cancelled) return

      try {
        let captureFile: File | undefined
        const videoEl = videoRef.current
        const imgEl = imgRef.current

        const offscreen = document.createElement('canvas')
        offscreen.width = 640
        offscreen.height = 360
        const ctx = offscreen.getContext('2d')

        if (ctx) {
          if (videoEl && videoEl.readyState >= 2 && videoEl.videoWidth > 0) {
            ctx.drawImage(videoEl, 0, 0, offscreen.width, offscreen.height)
            const blob = await new Promise<Blob | null>(resolve =>
              offscreen.toBlob(resolve, 'image/jpeg', 0.82)
            )
            if (blob) {
              captureFile = new File([blob], `${camera.cameraCode}_frame.jpg`, {
                type: 'image/jpeg',
              })
            }
          } else if (imgEl && imgEl.complete && imgEl.naturalWidth > 0) {
            try {
              ctx.drawImage(imgEl, 0, 0, offscreen.width, offscreen.height)
              const blob = await new Promise<Blob | null>(resolve =>
                offscreen.toBlob(resolve, 'image/jpeg', 0.82)
              )
              if (blob) {
                captureFile = new File([blob], `${camera.cameraCode}_frame.jpg`, {
                  type: 'image/jpeg',
                })
              }
            } catch {
              // Khung hình MJPEG bị chặn CORS -> để AI Service tự kéo qua streamUrl
              captureFile = undefined
            }
          }
        }

        const fallbackStreamUrl =
          !captureFile && isHttpStream ? effectiveSource : undefined

        if (captureFile || fallbackStreamUrl) {
          const result = await testDetectPreview(
            captureFile,
            camSeats,
            0.35,
            undefined,
            undefined,
            false,
            camera.cameraCode,
            fallbackStreamUrl
          )
          if (!cancelled) {
            setDetectedHeads(result.detections || [])
            setAiLatencyMs(result.inference_time_ms)
            if (result.seat_states && result.seat_states.length > 0) {
              setLocalSeatStates(prev => {
                const next = new Map(prev)
                for (const st of result.seat_states!) {
                  next.set(st.seat_id, st.status)
                  if (st.seat_code) next.set(st.seat_code, st.status)
                }
                return next
              })
            }
          }
        }
      } catch {
        // Bỏ qua lỗi từng nhịp để không gián đoạn luồng trực tiếp
      } finally {
        if (!cancelled) {
          timerId = setTimeout(() => {
            void runDetectionTick()
          }, 950)
        }
      }
    }

    void runDetectionTick()

    return () => {
      cancelled = true
      if (timerId) clearTimeout(timerId)
    }
  }, [isAiRunning, camera.cameraCode, camSeats, effectiveSource, isHttpStream])

  // Vẽ đa giác vùng bàn & hộp giới hạn AI lên Canvas lớp phủ
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { width, height } = canvas
    ctx.clearRect(0, 0, width, height)

    if (showPolygons) {
      camSeats.forEach(seat => {
        const pts = seat.polygonPoints
        if (!pts || pts.length < 3) return

        const effectiveState =
          localSeatStates.get(seat.seatCode) ||
          localSeatStates.get(seat.id) ||
          seat.currentState ||
          'EMPTY'

        const isHovered = hoveredSeatId === seat.id

        let strokeColor = '#94a3b8'
        let fillColor = isHovered ? 'rgba(148, 163, 184, 0.38)' : 'rgba(148, 163, 184, 0.18)'
        let stateShort = 'TRỐNG'

        if (effectiveState === 'PRESENT') {
          strokeColor = '#10b981'
          fillColor = isHovered ? 'rgba(16, 185, 129, 0.42)' : 'rgba(16, 185, 129, 0.24)'
          stateShort = 'CÓ MẶT'
        } else if (effectiveState === 'TEMP_AWAY') {
          strokeColor = '#f59e0b'
          fillColor = isHovered ? 'rgba(245, 158, 11, 0.42)' : 'rgba(245, 158, 11, 0.25)'
          stateShort = 'TẠM VẮNG'
        } else if (effectiveState === 'PROLONGED_AWAY') {
          strokeColor = '#ef4444'
          fillColor = isHovered ? 'rgba(239, 68, 68, 0.48)' : 'rgba(239, 68, 68, 0.30)'
          stateShort = 'QUÁ HẠN'
        }

        ctx.beginPath()
        pts.forEach((pt, idx) => {
          const px = pt.x * width
          const py = pt.y * height
          if (idx === 0) ctx.moveTo(px, py)
          else ctx.lineTo(px, py)
        })
        ctx.closePath()

        ctx.fillStyle = fillColor
        ctx.fill()
        ctx.strokeStyle = strokeColor
        ctx.lineWidth = isHovered ? 3 : 2
        ctx.stroke()

        // Vẽ nhãn thông tin bàn tại tâm đa giác
        const xs = pts.map(p => p.x * width)
        const ys = pts.map(p => p.y * height)
        const cx = xs.reduce((a, b) => a + b, 0) / xs.length
        const cy = ys.reduce((a, b) => a + b, 0) / ys.length

        const topText = `${seat.seatCode} • ${stateShort}`
        const bottomText = seat.assignedEmployeeName || ''

        ctx.font = 'bold 11px Inter, system-ui, sans-serif'
        const topW = ctx.measureText(topText).width
        ctx.font = '10px Inter, system-ui, sans-serif'
        const botW = bottomText ? ctx.measureText(bottomText).width : 0

        const boxW = Math.max(topW, botW) + 14
        const boxH = bottomText ? 32 : 20

        ctx.fillStyle = 'rgba(15, 23, 42, 0.88)'
        ctx.beginPath()
        if (ctx.roundRect) {
          ctx.roundRect(cx - boxW / 2, cy - boxH / 2, boxW, boxH, 5)
        } else {
          ctx.rect(cx - boxW / 2, cy - boxH / 2, boxW, boxH)
        }
        ctx.fill()
        ctx.strokeStyle = strokeColor
        ctx.lineWidth = 1.2
        ctx.stroke()

        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.font = 'bold 10.5px Inter, system-ui, sans-serif'
        ctx.fillStyle = strokeColor
        ctx.fillText(topText, cx, bottomText ? cy - 6 : cy)

        if (bottomText) {
          ctx.font = '10px Inter, system-ui, sans-serif'
          ctx.fillStyle = '#f8fafc'
          ctx.fillText(bottomText, cx, cy + 7)
        }
      })
    }

    // Vẽ bounding box phát hiện đầu người từ AI RT-DETR
    if (isAiRunning && detectedHeads.length > 0) {
      detectedHeads.forEach(det => {
        const [x1, y1, x2, y2] = det.bbox_normalized
        const bx = x1 * width
        const by = y1 * height
        const bw = (x2 - x1) * width
        const bh = (y2 - y1) * height

        const boxColor = det.is_in_zone ? '#22c55e' : '#38bdf8'
        ctx.strokeStyle = boxColor
        ctx.lineWidth = 2
        ctx.strokeRect(bx, by, bw, bh)

        const [cx, cy] = det.center_normalized
        ctx.beginPath()
        ctx.arc(cx * width, cy * height, 3.5, 0, Math.PI * 2)
        ctx.fillStyle = '#facc15'
        ctx.fill()

        const confLabel = `${Math.round(det.confidence * 100)}%`
        ctx.font = 'bold 10px Inter, system-ui, sans-serif'
        const lw = ctx.measureText(confLabel).width + 8
        ctx.fillStyle = boxColor
        ctx.fillRect(bx, Math.max(0, by - 16), lw, 16)
        ctx.fillStyle = '#0f172a'
        ctx.textAlign = 'left'
        ctx.textBaseline = 'middle'
        ctx.fillText(confLabel, bx + 4, Math.max(8, by - 8))
      })
    }
  }, [camSeats, detectedHeads, hoveredSeatId, isAiRunning, localSeatStates, showPolygons])

  const getSeatAtCanvasEvent = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>): Seat | null => {
      const canvas = canvasRef.current
      if (!canvas || !showPolygons) return null
      const rect = canvas.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return null
      const nx = (e.clientX - rect.left) / rect.width
      const ny = (e.clientY - rect.top) / rect.height

      for (let i = camSeats.length - 1; i >= 0; i--) {
        const seat = camSeats[i]!
        if (seat.polygonPoints && isPointInPolygon(nx, ny, seat.polygonPoints)) {
          return seat
        }
      }
      return null
    },
    [camSeats, showPolygons]
  )

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const hit = getSeatAtCanvasEvent(e)
    setHoveredSeatId(hit ? hit.id : null)
  }

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const hit = getSeatAtCanvasEvent(e)
    if (hit && onSelectSeat) {
      onSelectSeat(hit)
    }
  }

  // Tính toán số lượng trạng thái bàn (kết hợp cập nhật tức thời từ AI nếu đang bật)
  const getEffectiveSeatState = (seat: Seat) =>
    localSeatStates.get(seat.seatCode) ||
    localSeatStates.get(seat.id) ||
    seat.currentState ||
    'EMPTY'

  const presentCount = camSeats.filter(s => getEffectiveSeatState(s) === 'PRESENT').length
  const tempAwayCount = camSeats.filter(s => getEffectiveSeatState(s) === 'TEMP_AWAY').length
  const prolongedAwayCount = camSeats.filter(s => getEffectiveSeatState(s) === 'PROLONGED_AWAY').length
  const emptyCount = camSeats.filter(s => getEffectiveSeatState(s) === 'EMPTY').length

  // Nhãn loại luồng trực tiếp
  let streamTypeBadge = 'LIVE STREAM'
  if (!camera.isOnline) {
    streamTypeBadge = 'OFFLINE'
  } else if (isWebcam && !useDemoFallback) {
    streamTypeBadge = 'LIVE WEBCAM'
  } else if (isHttpStream && !useDemoFallback) {
    streamTypeBadge = 'IP CAMERA LIVE'
  } else if (isRtspSource && !camera.calibrationFramePresignedUrl) {
    streamTypeBadge = 'RTSP LIVE SIM'
  } else if (isVideoFile || useDemoFallback) {
    streamTypeBadge = 'LIVE VIDEO'
  }

  return (
    <div className={`camera-screen-card ${isFocused ? 'camera-screen-focused' : ''}`}>
      {/* Header màn hình camera */}
      <div className="camera-screen-header">
        <div className="screen-meta">
          <span
            className={`live-dot ${camera.isOnline ? '' : 'offline-dot'}`}
            title={camera.isOnline ? 'Camera đang hoạt động trực tuyến' : 'Camera ngoại tuyến'}
          />
          <strong>{camera.cameraName}</strong>
          <code className="camera-code-tag">{camera.cameraCode}</code>
          <span className="badge badge-info">
            {camera.cameraType === 'DESK' ? 'Giám sát bàn' : 'Cửa ra vào'}
          </span>
        </div>

        <div className="screen-actions">
          <button
            type="button"
            className={`button-icon-screen ${isAiRunning ? 'active-ai-btn' : ''}`}
            title={
              isAiRunning
                ? 'Đang bật AI RT-DETR quét thời gian thực (Bấm để tắt)'
                : 'Bật AI RT-DETR quét thời gian thực trên camera này'
            }
            onClick={() => {
              const next = !localAiEnabled
              setLocalAiEnabled(next)
              if (!next && !globalAiEnabled) {
                setDetectedHeads([])
                setAiLatencyMs(null)
              }
            }}
          >
            <Cpu size={14} weight={isAiRunning ? 'fill' : 'regular'} />
          </button>

          {camSeats.length > 0 && (
            <button
              type="button"
              className="button-icon-screen"
              title={showPolygons ? 'Ẩn khung vùng bàn trên video' : 'Hiện khung vùng bàn trên video'}
              onClick={() => setShowPolygons(prev => !prev)}
            >
              {showPolygons ? <Eye size={14} /> : <EyeSlash size={14} />}
            </button>
          )}

          {onResetCamera && camSeats.length > 0 && (
            <button
              type="button"
              className="button-icon-screen"
              title={`Reset ${camSeats.length} bàn của camera này về Trống`}
              disabled={resettingCode === camera.cameraCode}
              onClick={() => void onResetCamera(camera.cameraCode)}
            >
              <ArrowClockwise
                size={14}
                className={resettingCode === camera.cameraCode ? 'spin' : ''}
              />
            </button>
          )}

          <a
            className="button-icon-screen"
            href={`#/occupancy/zones?camera=${camera.cameraCode}`}
            title="Cấu hình & hiệu chuẩn vùng bàn cho camera này"
          >
            <Gear size={14} />
          </a>

          <button
            type="button"
            className="button-icon-screen"
            title={isFocused ? 'Thu nhỏ' : 'Phóng to màn hình này'}
            onClick={onToggleFocus}
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

        {isAiRunning && (
          <span className="stat-pill stat-ai-live" title="Trạng thái suy luận AI thời gian thực">
            <Broadcast size={12} weight="bold" />
            {aiLatencyMs !== null
              ? `AI ${aiLatencyMs}ms • ${detectedHeads.length} người`
              : 'AI đang quét...'}
          </span>
        )}
      </div>

      {/* Khung phát luồng hình ảnh Camera thời gian thực + Lớp phủ đa giác vùng bàn */}
      <div className="camera-video-frame camera-video-live-stage">
        {/* 1. Nguồn phát hình ảnh thực tế (Webcam / Video / MJPEG HTTP / Calibration Frame) */}
        {!camera.isOnline ? (
          <div className="camera-offline-placeholder">
            <VideoCamera size={40} className="muted" />
            <p>Camera đang ở trạng thái ngoại tuyến (Offline)</p>
          </div>
        ) : isWebcam && !useDemoFallback ? (
          webcamError ? (
            camera.calibrationFramePresignedUrl ? (
              <img
                ref={imgRef}
                src={camera.calibrationFramePresignedUrl}
                alt={camera.cameraName}
                className="camera-live-media"
              />
            ) : (
              <div className="camera-offline-placeholder">
                <VideoCamera size={36} className="muted" />
                <p>Không mở được Webcam thiết bị ({webcamError})</p>
                <div className="camera-fallback-actions">
                  <button
                    type="button"
                    className="button button-secondary button-small"
                    onClick={() => {
                      setWebcamError(null)
                      setWebcamRetryTick(t => t + 1)
                    }}
                  >
                    Thử mở lại Webcam
                  </button>
                  <button
                    type="button"
                    className="button button-ghost button-small"
                    onClick={() => setUseDemoFallback(true)}
                  >
                    Phát luồng mẫu
                  </button>
                </div>
              </div>
            )
          ) : (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="camera-live-media"
            />
          )
        ) : resolvedVideoSrc ? (
          <video
            ref={videoRef}
            src={resolvedVideoSrc}
            autoPlay
            loop
            muted
            playsInline
            crossOrigin="anonymous"
            className="camera-live-media"
          />
        ) : isHttpStream && !httpStreamError ? (
          <img
            ref={imgRef}
            src={effectiveSource}
            alt={camera.cameraName}
            crossOrigin="anonymous"
            className="camera-live-media"
            onError={e => {
              const el = e.currentTarget
              if (el.crossOrigin) {
                el.removeAttribute('crossOrigin')
                el.src = effectiveSource
              } else {
                setHttpStreamError(true)
              }
            }}
          />
        ) : camera.calibrationFramePresignedUrl ? (
          <img
            ref={imgRef}
            src={camera.calibrationFramePresignedUrl}
            alt={camera.cameraName}
            className="camera-live-media"
          />
        ) : (
          <div className="camera-offline-placeholder">
            <VideoCamera size={36} className="muted" />
            <p>Không thể kết nối tới nguồn {camera.streamSource || 'Camera'}</p>
            <button
              type="button"
              className="button button-secondary button-small"
              onClick={() => setUseDemoFallback(true)}
            >
              Phát luồng mô phỏng trực tiếp
            </button>
          </div>
        )}

        {/* 2. Lớp phủ Canvas vẽ đa giác vùng bàn & bounding box AI */}
        <canvas
          ref={canvasRef}
          width={640}
          height={360}
          className="camera-polygon-canvas"
          style={{ cursor: hoveredSeatId ? 'pointer' : 'default' }}
          onMouseMove={handleCanvasMouseMove}
          onMouseLeave={() => setHoveredSeatId(null)}
          onClick={handleCanvasClick}
        />

        {/* 3. HUD Overlay phía trên (Trạng thái LIVE, Nguồn luồng, Đồng hồ thời gian thực) */}
        <div className="video-stream-overlay">
          <div className="stream-overlay-left">
            <span className={`live-stream-badge ${camera.isOnline ? 'is-live' : 'is-offline'}`}>
              <span className="live-badge-dot" />
              {streamTypeBadge}
            </span>
            <span className="stream-source-label">
              {rawSource === '0' ? 'Webcam Thiết bị (0)' : rawSource || 'RTSP Stream'}
            </span>
          </div>
          <span className="stream-time">{currentTimeStr}</span>
        </div>

        {/* 4. Thanh trạng thái bàn làm việc nổi phía dưới khung hình */}
        <div className="camera-bottom-overlay">
          {camSeats.length === 0 ? (
            <div className="camera-no-seat-bar">
              <span>Chưa gán vùng bàn trên camera này</span>
              <a
                className="camera-zone-link-btn"
                href={`#/occupancy/zones?camera=${camera.cameraCode}`}
              >
                + Vẽ vùng bàn
              </a>
            </div>
          ) : (
            <div className="camera-seat-chips-row">
              {camSeats.map(seat => {
                const effState = getEffectiveSeatState(seat)
                let stateClass = 'state-empty'
                let stateLabel = 'Trống'
                if (effState === 'PRESENT') {
                  stateClass = 'state-present'
                  stateLabel = 'Có mặt'
                } else if (effState === 'TEMP_AWAY') {
                  stateClass = 'state-away'
                  stateLabel = 'Tạm vắng'
                } else if (effState === 'PROLONGED_AWAY') {
                  stateClass = 'state-alert'
                  stateLabel = 'Quá hạn >15p'
                }

                return (
                  <button
                    type="button"
                    key={seat.id}
                    className={`camera-seat-chip ${stateClass}`}
                    onMouseEnter={() => setHoveredSeatId(seat.id)}
                    onMouseLeave={() => setHoveredSeatId(null)}
                    onClick={() => onSelectSeat?.(seat)}
                    title={`Bàn: ${seat.seatCode} (${seat.seatName}) - Trạng thái: ${stateLabel}${
                      seat.assignedEmployeeName ? ` - Nhân sự: ${seat.assignedEmployeeName}` : ''
                    }`}
                  >
                    <span className="chip-dot" />
                    <strong className="chip-code">{seat.seatCode}</strong>
                    <span className="chip-user">
                      {seat.assignedEmployeeName || 'Chưa gán'}
                    </span>
                    <span className="chip-state">{stateLabel}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

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
  const [onlyOnline, setOnlyOnline] = useState(true)
  const [globalAiEnabled, setGlobalAiEnabled] = useState(false)
  const [currentTimeStr, setCurrentTimeStr] = useState<string>('--:--:--')

  // Đồng hồ thời gian thực cập nhật mỗi giây cho toàn bộ tường camera
  useEffect(() => {
    const updateClock = () => {
      setCurrentTimeStr(new Date().toLocaleTimeString('vi-VN'))
    }
    updateClock()
    const timer = setInterval(updateClock, 1000)
    return () => clearInterval(timer)
  }, [])

  // Lọc camera theo trạng thái đang bật & loại (DESK, GATE)
  const visibleCameras = useMemo(() => {
    let list = cameras
    if (onlyOnline) {
      const onlineList = list.filter(c => c.isOnline)
      if (onlineList.length > 0) {
        list = onlineList
      }
    }
    if (filterCameraType !== 'ALL') {
      list = list.filter(c => c.cameraType === filterCameraType)
    }
    if (focusedCameraId) {
      const match = list.find(c => c.id === focusedCameraId)
      return match ? [match] : list
    }
    return list
  }, [cameras, onlyOnline, filterCameraType, focusedCameraId])

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
    const confirmed = window.confirm(
      `Bạn có chắc chắn muốn đưa toàn bộ bàn của camera [${code}] về trạng thái TRỐNG (EMPTY)?`
    )
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
              onClick={() => {
                setFilterCameraType('ALL')
                setFocusedCameraId(null)
              }}
            >
              Tất cả ({cameras.length})
            </button>
            <button
              type="button"
              className={`filter-chip ${filterCameraType === 'DESK' ? 'active' : ''}`}
              onClick={() => {
                setFilterCameraType('DESK')
                setFocusedCameraId(null)
              }}
            >
              📹 Bàn làm việc ({cameras.filter(c => c.cameraType === 'DESK').length})
            </button>
            <button
              type="button"
              className={`filter-chip ${filterCameraType === 'GATE' ? 'active' : ''}`}
              onClick={() => {
                setFilterCameraType('GATE')
                setFocusedCameraId(null)
              }}
            >
              🚪 Cửa / Sảnh ({cameras.filter(c => c.cameraType === 'GATE').length})
            </button>
          </div>
        </div>

        <div className="toolbar-right">
          <button
            type="button"
            className={`filter-chip ${onlyOnline ? 'active' : ''}`}
            onClick={() => setOnlyOnline(prev => !prev)}
            title="Chỉ hiển thị các camera đang bật trực tuyến"
          >
            <Broadcast size={14} weight="bold" style={{ marginRight: '4px' }} />
            Đang bật ({cameras.filter(c => c.isOnline).length})
          </button>

          <button
            type="button"
            className={`filter-chip ${globalAiEnabled ? 'active ai-chip-active' : ''}`}
            onClick={() => setGlobalAiEnabled(prev => !prev)}
            title="Bật/Tắt quét AI RT-DETR thời gian thực đồng loạt trên tất cả camera"
          >
            <Cpu size={14} weight="bold" style={{ marginRight: '4px' }} />
            {globalAiEnabled ? 'Đang quét AI tất cả' : 'Quét AI tất cả'}
          </button>

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
              onClick={() => {
                setLayout('1x1')
                setFocusedCameraId(null)
              }}
              title="1 Màn hình lớn"
            >
              <Square size={16} />
            </button>
            <button
              type="button"
              className={`button-icon ${layout === '1x2' ? 'active' : ''}`}
              onClick={() => {
                setLayout('1x2')
                setFocusedCameraId(null)
              }}
              title="2 Màn hình chia đôi"
            >
              <SquaresFour size={16} />
            </button>
            <button
              type="button"
              className={`button-icon ${layout === '2x2' ? 'active' : ''}`}
              onClick={() => {
                setLayout('2x2')
                setFocusedCameraId(null)
              }}
              title="Lưới 2x2 (4 Màn hình)"
            >
              <GridFour size={16} />
            </button>
            <button
              type="button"
              className={`button-icon ${layout === 'auto' && !focusedCameraId ? 'active' : ''}`}
              onClick={() => {
                setLayout('auto')
                setFocusedCameraId(null)
              }}
              title="Tự động lấp đầy"
            >
              <span>Auto</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Lưới các Màn hình Camera phát trực tiếp */}
      {visibleCameras.length === 0 ? (
        <div className="panel empty-state">
          <VideoCamera size={40} className="muted" />
          <h3>Không có camera nào phù hợp</h3>
          <p className="muted">
            Chưa có camera nào được cấu hình trong hệ thống hoặc phù hợp với bộ lọc.
          </p>
        </div>
      ) : (
        <div className={`camera-monitor-grid layout-${focusedCameraId ? '1x1' : layout}`}>
          {visibleCameras.map(camera => {
            const camSeats = seatsByCamera.get(camera.id) || []
            const isFocused = focusedCameraId === camera.id

            return (
              <CameraScreenCard
                key={camera.id}
                camera={camera}
                camSeats={camSeats}
                isFocused={isFocused}
                resettingCode={resettingCode}
                currentTimeStr={currentTimeStr}
                globalAiEnabled={globalAiEnabled}
                onToggleFocus={() => setFocusedCameraId(isFocused ? null : camera.id)}
                onResetCamera={onResetCamera ? handleResetCamera : undefined}
                onSelectSeat={onSelectSeat}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
