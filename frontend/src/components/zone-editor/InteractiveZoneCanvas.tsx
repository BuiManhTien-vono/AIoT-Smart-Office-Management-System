import { useEffect, useRef, useState, useCallback } from 'react'
import {
  ArrowCounterClockwise,
  Trash,
  Check,
  Compass,
  Warning,
  Camera as CameraIcon,
  Broadcast,
  Image as ImageIcon,
  Sparkle,
  Play,
  Stop,
  Keyboard,
  Clock,
} from '@phosphor-icons/react'
import type { PolygonPoint, Seat, DetectPreviewResponse, SeatState } from '../../types/occupancy.types'
import { testDetectPreview, resetCameraSeats, resetAiFsm } from '../../services/occupancyService'

interface Props {
  backgroundImageUrl: string | null
  streamSource?: string | null
  existingSeats: Seat[]
  selectedSeatId: string | null
  currentPolygon: PolygonPoint[]
  onPolygonChange: (points: PolygonPoint[]) => void
  onSelectExistingSeat?: (seat: Seat) => void
  onCaptureSnapshot?: (file: File) => Promise<void>
  onSyncZonesToAi?: () => Promise<void> | void
  cameraCode?: string
  isCapturing?: boolean
  isReadOnly?: boolean
}

function calculateShoelaceArea(points: PolygonPoint[]): number {
  if (points.length < 3) return 0
  let sum = 0
  const n = points.length
  for (let i = 0; i < n; i++) {
    const cur = points[i]
    const next = points[(i + 1) % n]
    sum += cur.x * next.y - next.x * cur.y
  }
  return Math.abs(sum) * 0.5
}

function isPointInPolygon(px: number, py: number, polygon: PolygonPoint[]): boolean {
  if (!polygon || polygon.length < 3) return false
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x
    const yi = polygon[i].y
    const xj = polygon[j].x
    const yj = polygon[j].y
    const intersect = ((yi > py) !== (yj > py)) &&
      (px < ((xj - xi) * (py - yi)) / (yj - yi) + xi)
    if (intersect) inside = !inside
  }
  return inside
}

export function InteractiveZoneCanvas({
  backgroundImageUrl,
  streamSource,
  existingSeats,
  selectedSeatId,
  currentPolygon,
  onPolygonChange,
  onSelectExistingSeat,
  onCaptureSnapshot,
  onSyncZonesToAi,
  cameraCode,
  isCapturing = false,
  isReadOnly = false,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const liveImgRef = useRef<HTMLImageElement>(null)

  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null)
  const [isZoneCommitted, setIsZoneCommitted] = useState(false)
  const [imageLoaded, setImageLoaded] = useState(false)
  const [imgElement, setImgElement] = useState<HTMLImageElement | null>(null)

  // AI Testing State (On-demand single scan vs Realtime continuous monitoring)
  const [isRunningAi, setIsRunningAi] = useState(false)
  const [isRealtimeAiActive, setIsRealtimeAiActive] = useState(false)
  const [aiResult, setAiResult] = useState<DetectPreviewResponse | null>(null)
  const [aiError, setAiError] = useState<string | null>(null)

  const isRealtimeRef = useRef(false)
  const isLoopRunningRef = useRef(false)
  const existingSeatsRef = useRef(existingSeats)

  useEffect(() => {
    isRealtimeRef.current = isRealtimeAiActive
    existingSeatsRef.current = existingSeats
  }, [isRealtimeAiActive, existingSeats])

  // Tự động đồng bộ trạng thái chốt vùng khi thay đổi đa giác hoặc chọn bàn
  useEffect(() => {
    if (currentPolygon.length === 0) {
      setIsZoneCommitted(false)
      setMousePos(null)
    } else if (selectedSeatId) {
      setIsZoneCommitted(true)
      setMousePos(null)
    }
  }, [currentPolygon.length, selectedSeatId])

  // Cấu hình ngưỡng thời gian vắng mặt (mặc định 15s cho chế độ thử nghiệm/demo, hoặc 900s quy chuẩn 15 phút)
  const [awayThresholdSec, setAwayThresholdSec] = useState<number>(15)
  const awayThresholdSecRef = useRef<number>(15)
  useEffect(() => {
    awayThresholdSecRef.current = awayThresholdSec
  }, [awayThresholdSec])

  // Quản lý 4 trạng thái FSM chỗ ngồi:
  // EMPTY (Xám) | PRESENT (Xanh lá) | TEMP_AWAY (Vàng cam) | PROLONGED_AWAY (Đỏ)
  const seatFsmMapRef = useRef<Map<string, {
    status: SeatState
    awayStartTime: number | null
    awayDurationSec: number
    hasOccupant: boolean
  }>>(new Map())

  const updateFsmStateFromAi = useCallback((res: DetectPreviewResponse) => {
    const now = Date.now()
    if (res.seat_states && res.seat_states.length > 0) {
      res.seat_states.forEach(ss => {
        const sid = ss.seat_id
        const existing = seatFsmMapRef.current.get(sid)
        const isAway = ss.status === 'TEMP_AWAY' || ss.status === 'PROLONGED_AWAY'
        seatFsmMapRef.current.set(sid, {
          status: ss.status,
          awayStartTime: isAway ? (existing?.awayStartTime || (now - (ss.away_duration_sec || 0) * 1000)) : null,
          awayDurationSec: ss.away_duration_sec || 0,
          hasOccupant: ss.has_occupant
        })
      })
    } else {
      existingSeatsRef.current.forEach(seat => {
        const isOcc = res.occupied_seat_ids.includes(seat.id) || res.occupied_seat_ids.includes(seat.seatCode)
        const current = seatFsmMapRef.current.get(seat.id) || {
          status: 'EMPTY' as SeatState,
          awayStartTime: null,
          awayDurationSec: 0,
          hasOccupant: false
        }

        if (isOcc) {
          current.status = 'PRESENT'
          current.awayStartTime = null
          current.awayDurationSec = 0
          current.hasOccupant = true
        } else {
          current.hasOccupant = false
          if (current.status === 'PRESENT' || current.awayStartTime !== null) {
            if (!current.awayStartTime) current.awayStartTime = now
            current.awayDurationSec = Math.round((now - current.awayStartTime) / 1000)
            if (current.awayDurationSec >= awayThresholdSecRef.current) {
              current.status = 'PROLONGED_AWAY'
            } else {
              current.status = 'TEMP_AWAY'
            }
          } else {
            current.status = 'EMPTY'
            current.awayStartTime = null
            current.awayDurationSec = 0
          }
        }
        seatFsmMapRef.current.set(seat.id, current)
      })
    }
  }, [])

  // Hotkey notice toast
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = useCallback((msg: string) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current)
    setToastMessage(msg)
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null)
    }, 2500)
  }, [])

  // View mode: Live stream vs Static calibration frame
  const isStreamAvailable = !!streamSource && (
    streamSource.startsWith('http://') ||
    streamSource.startsWith('https://') ||
    streamSource === '0' ||
    streamSource.toLowerCase().includes('webcam')
  )
  const [viewMode, setViewMode] = useState<'LIVE' | 'STATIC'>('LIVE')

  // Load static background image
  useEffect(() => {
    if (!backgroundImageUrl) {
      setImgElement(null)
      setImageLoaded(false)
      return
    }

    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = backgroundImageUrl
    img.onload = () => {
      setImgElement(img)
      setImageLoaded(true)
    }
    img.onerror = () => {
      // Retry without crossOrigin attribute in case server lacks CORS headers
      const fallback = new Image()
      fallback.src = backgroundImageUrl
      fallback.onload = () => {
        setImgElement(fallback)
        setImageLoaded(true)
      }
      fallback.onerror = () => {
        setImgElement(null)
        setImageLoaded(false)
      }
    }
  }, [backgroundImageUrl])

  function getEffectiveStreamUrl(source: string): string {
    const s = source.trim()
    if (!s) return ''
    if (/^https?:\/\/[^/]+:8080\/?$/i.test(s)) {
      return s.replace(/\/?$/, '/video')
    }
    if (/^https?:\/\/[^/]+:4747\/?$/i.test(s)) {
      return s.replace(/\/?$/, '/video')
    }
    return s
  }

  const rawTrimmed = streamSource?.trim() || ''
  const trimmedSource = getEffectiveStreamUrl(rawTrimmed)
  const isVideoFile = Boolean(
    trimmedSource &&
    (trimmedSource.toLowerCase().endsWith('.mp4') ||
     trimmedSource.toLowerCase().endsWith('.webm') ||
     trimmedSource.toLowerCase().includes('demo'))
  )
  const videoUrl = isVideoFile
    ? (trimmedSource.startsWith('http') || trimmedSource.startsWith('/') ? trimmedSource : `/${trimmedSource}`)
    : null

  const isLocalWebcam = !isVideoFile && Boolean(
    trimmedSource && (trimmedSource === '0' || trimmedSource.toLowerCase().includes('webcam'))
  )
  const isHttpStream = !isVideoFile && Boolean(
    trimmedSource && (trimmedSource.startsWith('http://') || trimmedSource.startsWith('https://'))
  )

  // Handle local webcam if streamSource === '0'
  useEffect(() => {
    if (viewMode !== 'LIVE' || !streamSource || isVideoFile) return
    const trimmed = streamSource.trim().toLowerCase()
    const isWebcam = trimmed === '0' || trimmed.includes('webcam')
    if (!isWebcam) return

    let activeStream: MediaStream | null = null
    navigator.mediaDevices?.getUserMedia({ video: { width: 1280, height: 720 } })
      .then(stream => {
        activeStream = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.play().catch(() => {})
        }
      })
      .catch(err => {
        console.warn('Webcam permission or device error:', err)
      })

    return () => {
      if (activeStream) {
        activeStream.getTracks().forEach(t => t.stop())
      }
    }
  }, [viewMode, streamSource, isVideoFile])

  // Reset video source when switching to a video file
  useEffect(() => {
    if (viewMode === 'LIVE' && isVideoFile && videoRef.current && videoUrl) {
      videoRef.current.srcObject = null
      videoRef.current.src = videoUrl
      videoRef.current.play().catch(() => {})
    }
  }, [viewMode, isVideoFile, videoUrl])

  // Canvas drawing loop
  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { width, height } = canvas
    ctx.clearRect(0, 0, width, height)

    // 1. In static mode, draw background image or grid
    if (viewMode === 'STATIC') {
      if (imgElement && imageLoaded) {
        ctx.drawImage(imgElement, 0, 0, width, height)
      } else {
        // Dark slate grid placeholder
        ctx.fillStyle = '#0f172a'
        ctx.fillRect(0, 0, width, height)
        ctx.strokeStyle = '#1e293b'
        ctx.lineWidth = 1
        const step = 40
        for (let x = 0; x < width; x += step) {
          ctx.beginPath()
          ctx.moveTo(x, 0)
          ctx.lineTo(x, height)
          ctx.stroke()
        }
        for (let y = 0; y < height; y += step) {
          ctx.beginPath()
          ctx.moveTo(0, y)
          ctx.lineTo(width, y)
          ctx.stroke()
        }
        ctx.fillStyle = '#64748b'
        ctx.font = '14px Inter, sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(
          backgroundImageUrl ? 'Đang nạp ảnh hiệu chuẩn…' : 'Chưa có ảnh hiệu chuẩn tĩnh (Gạt sang "Trực tiếp" để xem luồng live)',
          width / 2,
          height / 2
        )
      }
    }

    // 2. Draw existing seats with 4-State FSM:
    // EMPTY: Xám (Bàn trống / Chưa có ai ngồi)
    // PRESENT: Xanh lá (Có mặt tại bàn)
    // TEMP_AWAY: Vàng cam (Vắng mặt tạm thời < threshold)
    // PROLONGED_AWAY: Đỏ (Vắng mặt kéo dài / Cảnh báo rời chỗ)
    existingSeats.forEach(seat => {
      if (!seat.polygonPoints || seat.polygonPoints.length < 3) return
      const isSelected = seat.id === selectedSeatId
      const isRestricted = seat.zoneType === 'RESTRICTED_ZONE'

      const fsmEntry = seatFsmMapRef.current.get(seat.id) || seatFsmMapRef.current.get(seat.seatCode)
      const seatStatus: SeatState = fsmEntry ? fsmEntry.status : (seat.currentState || 'EMPTY')
      const awaySec = fsmEntry ? fsmEntry.awayDurationSec : 0

      ctx.beginPath()
      seat.polygonPoints.forEach((pt, idx) => {
        const px = pt.x * width
        const py = pt.y * height
        if (idx === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      })
      ctx.closePath()

      let fillColor: string
      let strokeColor: string
      let lineWidth: number
      let statusBadgeText: string
      let statusBadgeBg: string

      if (isRestricted) {
        fillColor = isSelected ? 'rgba(239, 68, 68, 0.45)' : 'rgba(239, 68, 68, 0.22)'
        strokeColor = '#ef4444'
        lineWidth = isSelected ? 3.5 : 2
        statusBadgeText = 'KHU VỰC CẤM'
        statusBadgeBg = '#ef4444'
      } else {
        switch (seatStatus) {
          case 'PRESENT':
            // Xanh lá: Có mặt tại bàn
            fillColor = 'rgba(16, 185, 129, 0.38)'
            strokeColor = '#10b981'
            lineWidth = isSelected ? 4 : 3
            statusBadgeText = 'CÓ MẶT'
            statusBadgeBg = '#10b981'
            break

          case 'TEMP_AWAY':
            // Vàng cam: Vắng mặt tạm thời (< threshold)
            fillColor = 'rgba(245, 158, 11, 0.36)'
            strokeColor = '#f59e0b'
            lineWidth = isSelected ? 4 : 3
            statusBadgeText = awaySec > 0 ? `TẠM VẮNG (${awaySec}s)` : 'TẠM VẮNG'
            statusBadgeBg = '#f59e0b'
            break

          case 'PROLONGED_AWAY':
            // Đỏ: Vắng mặt kéo dài / Cảnh báo rời chỗ
            fillColor = 'rgba(239, 68, 68, 0.42)'
            strokeColor = '#ef4444'
            lineWidth = isSelected ? 4.5 : 3.5
            statusBadgeText = awaySec > 0 ? `⚠️ RỜI CHỖ (${awaySec}s)` : '⚠️ RỜI CHỖ'
            statusBadgeBg = '#ef4444'
            break

          case 'EMPTY':
          default:
            // Xám: Bàn trống / Chưa có ai ngồi
            fillColor = isSelected ? 'rgba(148, 163, 184, 0.35)' : 'rgba(148, 163, 184, 0.16)'
            strokeColor = isSelected ? '#3b82f6' : '#94a3b8'
            lineWidth = isSelected ? 3 : 1.8
            statusBadgeText = 'TRỐNG'
            statusBadgeBg = '#64748b'
            break
        }
      }

      ctx.fillStyle = fillColor
      ctx.strokeStyle = strokeColor
      ctx.lineWidth = lineWidth
      ctx.fill()
      ctx.stroke()

      // Nhãn trung tâm: Mã bàn + Huy hiệu trạng thái FSM
      const centerX = (seat.polygonPoints.reduce((acc, p) => acc + p.x, 0) / seat.polygonPoints.length) * width
      const centerY = (seat.polygonPoints.reduce((acc, p) => acc + p.y, 0) / seat.polygonPoints.length) * height

      // Tên mã bàn
      ctx.font = 'bold 12px Inter, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.shadowColor = 'rgba(0, 0, 0, 0.85)'
      ctx.shadowBlur = 4
      ctx.fillStyle = '#ffffff'
      ctx.fillText(seat.seatCode, centerX, centerY - 9)

      // Vẽ status badge bên dưới tên bàn
      ctx.font = 'bold 10px Inter, sans-serif'
      const badgeText = statusBadgeText
      const badgeWidth = ctx.measureText(badgeText).width + 12
      const badgeHeight = 18
      const badgeX = centerX - badgeWidth / 2
      const badgeY = centerY + 3

      ctx.shadowBlur = 0
      ctx.fillStyle = statusBadgeBg
      ctx.beginPath()
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, 4)
      } else {
        ctx.rect(badgeX, badgeY, badgeWidth, badgeHeight)
      }
      ctx.fill()

      ctx.fillStyle = '#ffffff'
      ctx.fillText(badgeText, centerX, badgeY + badgeHeight / 2)
    })

    // 3. Draw current working polygon
    if (currentPolygon.length > 0) {
      // Khi đang vẽ (chưa chốt) và có >= 2 đỉnh + có vị trí trỏ chuột:
      // Tô mờ diện tích khép góc tạm thời để người dùng ước tính diện tích trực quan
      if (!isZoneCommitted && mousePos && !isReadOnly && currentPolygon.length >= 2) {
        ctx.save()
        ctx.beginPath()
        currentPolygon.forEach((pt, idx) => {
          const px = pt.x * width
          const py = pt.y * height
          if (idx === 0) ctx.moveTo(px, py)
          else ctx.lineTo(px, py)
        })
        ctx.lineTo(mousePos.x, mousePos.y)
        ctx.closePath()
        ctx.fillStyle = 'rgba(37, 99, 235, 0.16)'
        ctx.fill()
        ctx.restore()
      }

      ctx.beginPath()
      currentPolygon.forEach((pt, idx) => {
        const px = pt.x * width
        const py = pt.y * height
        if (idx === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      })

      // If mouse is moving and drawing is in progress
      if (!isZoneCommitted && mousePos && !isReadOnly) {
        ctx.lineTo(mousePos.x, mousePos.y)
        ctx.strokeStyle = '#2563eb'
        ctx.lineWidth = 2.5
        ctx.setLineDash([4, 4])
        ctx.stroke()
        ctx.setLineDash([])
      } else {
        // Vùng đã được chốt (Chuột phải / phím n) -> Khép góc bằng nét liền cố định
        ctx.closePath()
        ctx.strokeStyle = '#2563eb'
        ctx.lineWidth = 3
        ctx.setLineDash([])
        ctx.stroke()
      }

      // Fill polygon if >= 3 vertices
      if (currentPolygon.length >= 3) {
        ctx.fillStyle = isZoneCommitted ? 'rgba(37, 99, 235, 0.35)' : 'rgba(37, 99, 235, 0.22)'
        ctx.fill()

        // Khi đã chốt vùng, luôn hiển thị nhãn chỉ báo trung tâm
        if (isZoneCommitted) {
          const xs = currentPolygon.map(p => p.x * width)
          const ys = currentPolygon.map(p => p.y * height)
          const cx = xs.reduce((a, b) => a + b, 0) / xs.length
          const cy = ys.reduce((a, b) => a + b, 0) / ys.length

          const tagText = '✓ ĐÃ CHỐT VÙNG (BẤM LƯU BÀN BÊN DƯỚI)'
          ctx.font = 'bold 12px sans-serif'
          const tagW = ctx.measureText(tagText).width + 18
          const tagH = 26

          ctx.fillStyle = 'rgba(37, 99, 235, 0.95)'
          ctx.beginPath()
          if (ctx.roundRect) {
            ctx.roundRect(cx - tagW / 2, cy - tagH / 2, tagW, tagH, 6)
          } else {
            ctx.rect(cx - tagW / 2, cy - tagH / 2, tagW, tagH)
          }
          ctx.fill()

          ctx.fillStyle = '#ffffff'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(tagText, cx, cy)
        }
      }

      // Draw vertex handles
      currentPolygon.forEach((pt, idx) => {
        const px = pt.x * width
        const py = pt.y * height
        ctx.beginPath()
        ctx.arc(px, py, idx === 0 ? 6 : 4.5, 0, Math.PI * 2)
        ctx.fillStyle = idx === 0 ? '#10b981' : '#ffffff'
        ctx.fill()
        ctx.strokeStyle = '#2563eb'
        ctx.lineWidth = 2
        ctx.stroke()
      })
    }

    // 4. Draw RT-DETR / SCRFD AI Head Detections (Bounding Box + Head Center)
    if (aiResult?.detections && aiResult.detections.length > 0) {
      aiResult.detections.forEach((det) => {
        // Lọc vùng khoang: Nếu camera đã có danh sách bàn (existingSeats.length > 0),
        // chỉ hiển thị các đối tượng thực sự nằm trong vùng bàn (det.matched_seat_id != null)
        // để loại bỏ hoàn toàn các phát hiện rác bên ngoài hành lang / hậu cảnh
        if (existingSeats.length > 0 && !det.matched_seat_id) {
          return
        }

        const [xmin, ymin, xmax, ymax] = det.bbox_normalized
        const bx = xmin * width
        const by = ymin * height
        const bw = (xmax - xmin) * width
        const bh = (ymax - ymin) * height
        const [xc, yc] = det.center_normalized
        const cx = xc * width
        const cy = yc * height

        // Hộp nhận diện đầu người / khuôn mặt
        ctx.strokeStyle = det.matched_seat_id ? '#10b981' : '#f59e0b'
        ctx.lineWidth = 2.5
        ctx.strokeRect(bx, by, bw, bh)
        ctx.fillStyle = det.matched_seat_id ? 'rgba(16, 185, 129, 0.16)' : 'rgba(245, 158, 11, 0.16)'
        ctx.fillRect(bx, by, bw, bh)

        // Điểm tâm đỉnh đầu / khuôn mặt (Chấm xanh lá cây)
        ctx.beginPath()
        ctx.arc(cx, cy, 6, 0, Math.PI * 2)
        ctx.fillStyle = '#10b981'
        ctx.fill()
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 2
        ctx.stroke()
      })
    }
  }, [
    viewMode,
    imgElement,
    imageLoaded,
    backgroundImageUrl,
    existingSeats,
    selectedSeatId,
    currentPolygon,
    mousePos,
    isZoneCommitted,
    isReadOnly,
    aiResult,
  ])

  useEffect(() => {
    redraw()
  }, [redraw])

  // Mouse event handlers
  function handleCanvasClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (isReadOnly) return
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const pixelX = e.clientX - rect.left
    const pixelY = e.clientY - rect.top

    // Nếu vùng đã chốt, không thêm đỉnh mới nữa mà hướng dẫn lưu hoặc xóa vẽ lại
    if (isZoneCommitted) {
      showToast('⚠️ Vùng này đã được chốt! Bấm "Lưu bàn" bên dưới hoặc bấm "Xóa vẽ lại (r)" nếu muốn vẽ lại.')
      return
    }

    // Check if clicked near first point to close polygon (snap threshold: 18px)
    if (currentPolygon.length >= 3) {
      const first = currentPolygon[0]
      const dist = Math.hypot(pixelX - first.x * rect.width, pixelY - first.y * rect.height)
      if (dist < 18) {
        handleCommitCurrentZone()
        return
      }
    }

    // Normalize coordinates to [0.0, 1.0]
    const normX = Math.max(0, Math.min(1, Number((pixelX / rect.width).toFixed(4))))
    const normY = Math.max(0, Math.min(1, Number((pixelY / rect.height).toFixed(4))))

    // If not drawing and clicked on an existing seat polygon, select it!
    if (currentPolygon.length === 0 && onSelectExistingSeat) {
      const clicked = existingSeats.find(s => isPointInPolygon(normX, normY, s.polygonPoints))
      if (clicked) {
        onSelectExistingSeat(clicked)
        return
      }
    }

    onPolygonChange([...currentPolygon, { x: normX, y: normY }])
  }

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (isReadOnly || currentPolygon.length === 0 || isZoneCommitted) {
      if (mousePos) setMousePos(null)
      return
    }
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const pixelX = e.clientX - rect.left
    const pixelY = e.clientY - rect.top

    // Quy đổi chính xác từ tọa độ CSS hiển thị màn hình sang hệ tọa độ Canvas nội bộ (960x540)
    const canvasX = (pixelX / rect.width) * canvas.width
    const canvasY = (pixelY / rect.height) * canvas.height

    setMousePos({
      x: canvasX,
      y: canvasY,
    })
  }

  function handleMouseLeave() {
    setMousePos(null)
  }

  const handleUndoVertex = useCallback(() => {
    if (currentPolygon.length === 0) return
    setIsZoneCommitted(false)
    onPolygonChange(currentPolygon.slice(0, -1))
  }, [currentPolygon, onPolygonChange])

  const handleClearPolygon = useCallback(() => {
    setIsZoneCommitted(false)
    setMousePos(null)
    onPolygonChange([])
  }, [onPolygonChange])

  // Chốt vùng hiện tại (Chuột phải / phím 'n')
  const handleCommitCurrentZone = useCallback(() => {
    if (currentPolygon.length < 3) {
      if (currentPolygon.length > 0) {
        showToast('⚠️ Cần tối thiểu 3 điểm để chốt một vùng bàn!')
      } else {
        showToast('👉 Click chuột trái để chấm các điểm góc bàn trước khi chốt.')
      }
      return
    }

    const polyArea = calculateShoelaceArea(currentPolygon)
    if (polyArea < 1e-6) {
      showToast('⚠️ Đa giác quá nhỏ hoặc thẳng hàng!')
      return
    }

    // Đánh dấu khóa chốt vùng và ngắt hoàn toàn đường vẽ chuột
    setIsZoneCommitted(true)
    setMousePos(null)
    showToast('✅ Đã chốt vùng đa giác! Hãy kiểm tra Mã / Tên và bấm "Lưu bàn" bên dưới.')

    setTimeout(() => {
      const codeInput = document.getElementById('seat-code') as HTMLInputElement | null
      if (codeInput) {
        codeInput.focus()
        codeInput.select()
      }
    }, 100)
  }, [currentPolygon, showToast])

  // Hoàn tất tất cả và BẮT ĐẦU GIÁM SÁT (Phím SPACE / ENTER / 'c' hoặc nút Chạy AI Thật)
  const handleStartOrToggleMonitoring = useCallback(async () => {
    // Khép góc đa giác đang vẽ nếu có >= 3 đỉnh
    if (currentPolygon.length >= 3) {
      setMousePos(null)
    }

    if (isRealtimeAiActive) {
      setIsRealtimeAiActive(false)
      setAiResult(null)
      setAiError(null)

      // Đưa toàn bộ máy trạng thái bàn trong bộ nhớ Canvas về trạng thái TRỐNG (EMPTY)
      seatFsmMapRef.current.clear()
      existingSeatsRef.current.forEach(s => {
        const emptyEntry = {
          status: 'EMPTY' as SeatState,
          awayStartTime: null,
          awayDurationSec: 0,
          hasOccupant: false
        }
        seatFsmMapRef.current.set(s.id, emptyEntry)
        if (s.seatCode) {
          seatFsmMapRef.current.set(s.seatCode, emptyEntry)
        }
      })

      // Đồng thời reset máy trạng thái trên AI Service và Backend .NET (phát sự kiện SignalR tới Live Seat Map)
      const camCode = cameraCode || 'CAM_DEMO'
      void resetAiFsm()
      void resetCameraSeats(camCode).catch(() => {})

      showToast('⏹ Đã dừng giám sát AI. Các bàn đã đưa về trạng thái TRỐNG.')
    } else {
      seatFsmMapRef.current.clear()
      if (onSyncZonesToAi) {
        showToast('🔄 Đang đồng bộ vùng bàn sang AI...')
        await onSyncZonesToAi()
      }
      setIsRealtimeAiActive(true)
      showToast('🚀 Đang chạy giám sát AI thật liên tục!')
    }
  }, [currentPolygon, isRealtimeAiActive, onSyncZonesToAi, showToast, cameraCode])

  // Vòng lặp suy luận AI liên tục thời gian thực (Realtime Continuous AI Monitoring)
  useEffect(() => {
    if (!isRealtimeAiActive) return

    let cancelled = false

    async function loop() {
      if (isLoopRunningRef.current) return
      isLoopRunningRef.current = true

      while (isRealtimeRef.current && !cancelled) {
        const offscreen = document.createElement('canvas')
        const ctx = offscreen.getContext('2d')
        if (!ctx) break

        let frameBlob: Blob | null = null

        // 1. Chụp từ video webcam hoặc demo.mp4
        if (videoRef.current && videoRef.current.videoWidth > 0) {
          offscreen.width = videoRef.current.videoWidth
          offscreen.height = videoRef.current.videoHeight
          ctx.drawImage(videoRef.current, 0, 0, offscreen.width, offscreen.height)
          frameBlob = await new Promise<Blob | null>(res => offscreen.toBlob(res, 'image/jpeg', 0.85))
        } else if (liveImgRef.current && liveImgRef.current.naturalWidth > 0) {
          offscreen.width = liveImgRef.current.naturalWidth
          offscreen.height = liveImgRef.current.naturalHeight
          try {
            ctx.drawImage(liveImgRef.current, 0, 0, offscreen.width, offscreen.height)
            frameBlob = await new Promise<Blob | null>(res => offscreen.toBlob(res, 'image/jpeg', 0.85))
          } catch {
            // CORS
          }
        } else if (imgElement && imageLoaded) {
          offscreen.width = imgElement.naturalWidth || 1280
          offscreen.height = imgElement.naturalHeight || 720
          ctx.drawImage(imgElement, 0, 0, offscreen.width, offscreen.height)
          frameBlob = await new Promise<Blob | null>(res => offscreen.toBlob(res, 'image/jpeg', 0.85))
        }

        // Nếu không có frameBlob và cũng không phải http stream thì chờ rồi thử lại
        if (!frameBlob && !isHttpStream) {
          await new Promise(r => setTimeout(r, 400))
          continue
        }

        const file = frameBlob ? new File([frameBlob], `rt_${Date.now()}.jpg`, { type: 'image/jpeg' }) : undefined
        try {
          const res = await testDetectPreview(
            file,
            existingSeatsRef.current,
            0.35,
            undefined,
            awayThresholdSecRef.current,
            undefined,
            cameraCode || 'CAM_DEMO',
            isHttpStream ? trimmedSource : undefined
          )
          if (!cancelled && isRealtimeRef.current) {
            updateFsmStateFromAi(res)
            setAiResult(res)
            setAiError(null)
          }
        } catch (err: unknown) {
          if (!cancelled && isRealtimeRef.current) {
            setAiError(err instanceof Error ? err.message : 'Lỗi kết nối AI.')
          }
        }

        // Delay ~280ms giữa các frame (~3-4 FPS suy luận liên tục, mượt mà và không tải nặng)
        await new Promise(r => setTimeout(r, 280))
      }

      isLoopRunningRef.current = false
    }

    void loop()

    return () => {
      cancelled = true
      isLoopRunningRef.current = false
    }
  }, [isRealtimeAiActive, imgElement, imageLoaded, updateFsmStateFromAi, isHttpStream, cameraCode, trimmedSource])

  // Lắng nghe toàn bộ phím tắt thao tác bàn vẽ (Hotkeys)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
         target.tagName === 'TEXTAREA' ||
         target.isContentEditable)
      ) {
        return
      }

      const key = e.key.toLowerCase()

      // Phím 'u': Undo (xóa điểm vừa click nhầm)
      if (key === 'u') {
        e.preventDefault()
        handleUndoVertex()
        showToast('↩️ Đã hoàn tác 1 điểm (u)')
        return
      }

      // Phím 'r': Reset (xóa toàn bộ để vẽ lại từ đầu)
      if (key === 'r') {
        e.preventDefault()
        handleClearPolygon()
        showToast('🗑️ Đã xóa đa giác vẽ lại (r)')
        return
      }

      // Chuột phải / 'n': Chốt vùng hiện tại (Bàn 1 -> Bàn 2 -> ...)
      if (key === 'n') {
        e.preventDefault()
        void handleCommitCurrentZone()
        return
      }

      // SPACE / ENTER / 'c': Hoàn tất tất cả và BẮT ĐẦU GIÁM SÁT
      if (e.key === ' ' || e.key === 'Enter' || key === 'c') {
        e.preventDefault()
        void handleStartOrToggleMonitoring()
        return
      }

      // Phím ESC: Bỏ qua / Hủy
      if (e.key === 'Escape') {
        e.preventDefault()
        handleClearPolygon()
        showToast('❌ Đã hủy thao tác vẽ (Esc)')
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleCommitCurrentZone, handleStartOrToggleMonitoring, handleUndoVertex, handleClearPolygon, showToast])

  // Capture current live frame into a file
  async function handleCaptureCurrentFrame() {
    if (!onCaptureSnapshot) return
    setAiError(null)

    // Case 1: Video element (Webcam)
    if (videoRef.current && videoRef.current.videoWidth > 0) {
      const offscreen = document.createElement('canvas')
      const ctx = offscreen.getContext('2d')
      if (!ctx) return
      offscreen.width = videoRef.current.videoWidth
      offscreen.height = videoRef.current.videoHeight
      ctx.drawImage(videoRef.current, 0, 0, offscreen.width, offscreen.height)
      offscreen.toBlob(blob => {
        if (blob) {
          const file = new File([blob], `calibration_${Date.now()}.jpg`, { type: 'image/jpeg' })
          onCaptureSnapshot(file)
        }
      }, 'image/jpeg', 0.95)
      return
    }

    // Case 2: Live image stream (IP Webcam / MJPEG)
    if (liveImgRef.current && liveImgRef.current.naturalWidth > 0) {
      const offscreen = document.createElement('canvas')
      const ctx = offscreen.getContext('2d')
      if (!ctx) return
      offscreen.width = liveImgRef.current.naturalWidth
      offscreen.height = liveImgRef.current.naturalHeight
      try {
        ctx.drawImage(liveImgRef.current, 0, 0, offscreen.width, offscreen.height)
        offscreen.toBlob(blob => {
          if (blob) {
            const file = new File([blob], `calibration_${Date.now()}.jpg`, { type: 'image/jpeg' })
            onCaptureSnapshot(file)
          }
        }, 'image/jpeg', 0.95)
      } catch {
        alert('Trình duyệt chặn chụp ảnh do chính sách CORS của luồng video IP. Vui lòng tải file ảnh bằng nút "Cập nhật ảnh khung hình" ở danh sách camera bên trái.')
      }
      return
    }

    // Case 3: Notice when video stream is not running
    alert('Chưa có luồng video trực tiếp từ Webcam hoặc HTTP Camera đang phát để chụp. Hãy đảm bảo bạn đã cấp quyền Webcam cho trình duyệt và đang ở chế độ TRỰC TIẾP (LIVE), hoặc bấm "Cập nhật ảnh khung hình" ở cột trái để tải file ảnh lên.')
  }

  // Chạy thử nghiệm AI RT-DETR (Phương án 1)
  async function handleRunAiTest() {
    setAiError(null)
    setIsRunningAi(true)

    const offscreen = document.createElement('canvas')
    const ctx = offscreen.getContext('2d')
    if (!ctx) {
      setIsRunningAi(false)
      return
    }

    function sendToAi(blob: Blob) {
      const file = new File([blob], `preview_${Date.now()}.jpg`, { type: 'image/jpeg' })
      testDetectPreview(file, existingSeats, 0.35, undefined, awayThresholdSecRef.current, undefined, cameraCode || 'CAM_DEMO')
        .then(res => {
          updateFsmStateFromAi(res)
          setAiResult(res)
        })
        .catch(err => {
          setAiError(err instanceof Error ? err.message : 'Không thể kết nối sang AI Service.')
        })
        .finally(() => {
          setIsRunningAi(false)
        })
    }

    function sendStreamUrlToAi() {
      testDetectPreview(undefined, existingSeats, 0.35, undefined, awayThresholdSecRef.current, undefined, cameraCode || 'CAM_DEMO', trimmedSource)
        .then(res => {
          updateFsmStateFromAi(res)
          setAiResult(res)
        })
        .catch(err => {
          setAiError(err instanceof Error ? err.message : 'Không thể kết nối sang AI Service.')
        })
        .finally(() => {
          setIsRunningAi(false)
        })
    }

    try {
      // 1. Chụp từ video webcam nếu đang xem LIVE
      if (viewMode === 'LIVE' && videoRef.current && videoRef.current.videoWidth > 0) {
        offscreen.width = videoRef.current.videoWidth
        offscreen.height = videoRef.current.videoHeight
        ctx.drawImage(videoRef.current, 0, 0, offscreen.width, offscreen.height)
        offscreen.toBlob(blob => {
          if (blob) sendToAi(blob)
          else {
            setIsRunningAi(false)
            setAiError('Không thể tạo file ảnh từ video webcam.')
          }
        }, 'image/jpeg', 0.95)
        return
      }

      // 2. Chụp từ ảnh stream IP camera nếu đang xem LIVE
      if (viewMode === 'LIVE' && isHttpStream) {
        if (liveImgRef.current && liveImgRef.current.naturalWidth > 0) {
          offscreen.width = liveImgRef.current.naturalWidth
          offscreen.height = liveImgRef.current.naturalHeight
          try {
            ctx.drawImage(liveImgRef.current, 0, 0, offscreen.width, offscreen.height)
            offscreen.toBlob(blob => {
              if (blob) sendToAi(blob)
              else sendStreamUrlToAi()
            }, 'image/jpeg', 0.95)
            return
          } catch {
            sendStreamUrlToAi()
            return
          }
        } else {
          sendStreamUrlToAi()
          return
        }
      }

      // 3. Chụp từ ảnh tĩnh hiệu chuẩn nếu có
      if (imgElement && imageLoaded) {
        offscreen.width = imgElement.naturalWidth || 1280
        offscreen.height = imgElement.naturalHeight || 720
        ctx.drawImage(imgElement, 0, 0, offscreen.width, offscreen.height)
        offscreen.toBlob(blob => {
          if (blob) sendToAi(blob)
          else {
            setIsRunningAi(false)
            setAiError('Không thể tạo file ảnh từ ảnh hiệu chuẩn.')
          }
        }, 'image/jpeg', 0.95)
        return
      }

      // 4. Nếu video webcam có nhưng chưa chuyển sang LIVE, thử lấy từ videoRef nếu có frame
      if (videoRef.current && videoRef.current.videoWidth > 0) {
        offscreen.width = videoRef.current.videoWidth
        offscreen.height = videoRef.current.videoHeight
        ctx.drawImage(videoRef.current, 0, 0, offscreen.width, offscreen.height)
        offscreen.toBlob(blob => {
          if (blob) sendToAi(blob)
          else {
            setIsRunningAi(false)
            setAiError('Không thể tạo file ảnh từ video.')
          }
        }, 'image/jpeg', 0.95)
        return
      }

      // 5. Nếu không có khung hình thực tế nào
      setIsRunningAi(false)
      setAiError('Chưa có khung hình để AI quét. Vui lòng bật chế độ TRỰC TIẾP (Webcam) hoặc bấm "Cập nhật ảnh khung hình" ở cột trái để tải ảnh mẫu lên trước.')
    } catch (err: unknown) {
      setIsRunningAi(false)
      setAiError(err instanceof Error ? err.message : 'Lỗi khi chụp khung hình chạy thử AI.')
    }
  }

  const area = calculateShoelaceArea(currentPolygon)
  const isTooSmall = currentPolygon.length >= 3 && area < 1e-6

  return (
    <div className="zone-canvas-container" ref={containerRef}>
      <div className="canvas-wrapper">
        {/* Case 1: Video File (.mp4 / demo) */}
        {viewMode === 'LIVE' && isVideoFile && videoUrl && (
          <video
            ref={videoRef}
            src={videoUrl}
            autoPlay
            loop
            playsInline
            muted
            crossOrigin="anonymous"
            className="canvas-video-layer"
          />
        )}

        {/* Case 2: Local Webcam */}
        {viewMode === 'LIVE' && isLocalWebcam && (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="canvas-video-layer"
          />
        )}

        {/* Case 3: Live HTTP/IP Image Stream */}
        {viewMode === 'LIVE' && isHttpStream && (
          <img
            ref={liveImgRef}
            src={trimmedSource}
            alt="Luồng trực tiếp camera"
            className="canvas-video-layer"
            onError={e => {
              const el = e.currentTarget
              if (el.crossOrigin) {
                el.removeAttribute('crossOrigin')
                el.src = trimmedSource
              }
            }}
          />
        )}

        {/* Foreground Interactive Canvas */}
        <canvas
          ref={canvasRef}
          width={960}
          height={540}
          onClick={handleCanvasClick}
          onContextMenu={e => {
            e.preventDefault()
            void handleCommitCurrentZone()
          }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          className="zone-canvas"
          aria-label="Khung vẽ đa giác vùng bàn làm việc"
        />

        {/* Floating Toast Notification for Hotkeys */}
        {toastMessage && <div className="canvas-notice-toast">{toastMessage}</div>}

        {/* Thanh công cụ nổi trên Canvas: Chỉ hiển thị khi đang vẽ đa giác */}
        {currentPolygon.length > 0 && (
          <div className="canvas-toolbar">
            <div className="canvas-stat-pill">
              <Compass size={14} aria-hidden="true" />
              <span>{isZoneCommitted ? 'Đã chốt:' : 'Đỉnh:'} <strong>{currentPolygon.length}</strong></span>
              {currentPolygon.length >= 3 && (
                <span className="muted" style={{ marginLeft: '4px' }}>
                  ({(area * 100).toFixed(1)}%)
                </span>
              )}
            </div>

            {isTooSmall && (
              <div className="canvas-stat-pill warning-pill">
                <Warning size={14} aria-hidden="true" />
                <span>Đa giác quá nhỏ hoặc thẳng hàng!</span>
              </div>
            )}

            {!isReadOnly && (
              <div className="canvas-actions-row">
                <button
                  type="button"
                  className="button button-secondary button-xs"
                  onClick={handleUndoVertex}
                  title="Xóa đỉnh vừa chấm (Phím tắt: 'u')"
                >
                  <ArrowCounterClockwise size={14} aria-hidden="true" />
                  <span>Hoàn tác (u)</span>
                </button>

                <button
                  type="button"
                  className="button button-secondary button-xs"
                  onClick={handleClearPolygon}
                  title="Xóa toàn bộ đa giác đang vẽ (Phím tắt: 'r')"
                >
                  <Trash size={14} aria-hidden="true" />
                  <span>Xóa vẽ lại (r)</span>
                </button>

                {currentPolygon.length >= 3 && (
                  <button
                    type="button"
                    className={`button ${isZoneCommitted ? 'button-special' : 'button-primary'} button-xs`}
                    onClick={() => void handleCommitCurrentZone()}
                    title="Chốt vùng này (Phím tắt: Chuột phải hoặc 'n')"
                  >
                    <Check size={14} aria-hidden="true" />
                    <span>{isZoneCommitted ? '✓ Đã chốt vùng' : 'Chốt vùng (n)'}</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Thanh Điều Khiển Nút Bấm & Hướng Dẫn Phím Tắt Gọn Bên Dưới */}
      <div className="canvas-bottom-bar">
        {/* Nhóm Nút Thao Tác Bên Trái: Nguồn hình, Chụp mẫu, AI Thật, Thử nghiệm AI */}
        <div className="canvas-controls-left">
          {/* View Mode Toggle Button */}
          {isStreamAvailable && (
            <button
              type="button"
              className={`button button-xs ${viewMode === 'LIVE' ? 'button-danger live-indicator' : 'button-secondary'}`}
              onClick={() => setViewMode(v => (v === 'LIVE' ? 'STATIC' : 'LIVE'))}
              title="Bật/Tắt chế độ xem luồng trực tiếp"
            >
              {viewMode === 'LIVE' ? (
                <>
                  <span className="live-dot" />
                  <Broadcast size={14} aria-hidden="true" />
                  <span>TRỰC TIẾP</span>
                </>
              ) : (
                <>
                  <ImageIcon size={14} aria-hidden="true" />
                  <span>ẢNH MẪU</span>
                </>
              )}
            </button>
          )}

          {/* Nút Chụp khung hình mẫu */}
          {onCaptureSnapshot && (
            <button
              type="button"
              className="button button-secondary button-xs"
              onClick={handleCaptureCurrentFrame}
              disabled={isCapturing}
              title="Chụp khung hình live hiện tại làm ảnh nền vẽ bàn"
            >
              <CameraIcon size={14} aria-hidden="true" />
              <span>{isCapturing ? 'Đang lưu…' : 'Chụp khung hình làm mẫu'}</span>
            </button>
          )}

          {/* Nút Chạy AI Thật liên tục thời gian thực */}
          <button
            type="button"
            className={`button button-xs ${isRealtimeAiActive ? 'button-danger live-indicator' : 'button-primary'}`}
            onClick={() => void handleStartOrToggleMonitoring()}
            title="Bật/Tắt chế độ chạy AI giám sát liên tục thực tế (Phím tắt: Space / Enter / 'c')"
          >
            {isRealtimeAiActive ? (
              <>
                <span className="live-dot" />
                <Stop size={14} weight="fill" aria-hidden="true" />
                <span>DỪNG GIÁM SÁT AI</span>
              </>
            ) : (
              <>
                <Play size={14} weight="fill" aria-hidden="true" />
                <span>CHẠY AI THẬT</span>
              </>
            )}
          </button>

          {/* Bộ chọn ngưỡng thời gian vắng mặt */}
          <div className="canvas-threshold-selector" title="Cấu hình ngưỡng thời gian vắng mặt để FSM chuyển từ TẠM VẮNG sang RỜI CHỖ (PROLONGED_AWAY)">
            <Clock size={13} weight="bold" aria-hidden="true" style={{ color: '#94a3b8' }} />
            <span className="threshold-label">Ngưỡng:</span>
            <select
              className="threshold-select"
              value={awayThresholdSec}
              onChange={e => setAwayThresholdSec(Number(e.target.value))}
              disabled={isRealtimeAiActive}
            >
              <option value={15}>15s (Thử nghiệm)</option>
              <option value={30}>30s (Thử nghiệm)</option>
              <option value={60}>1 phút</option>
              <option value={900}>15 phút (Quy chuẩn)</option>
            </select>
          </div>

          {/* Nút Chạy thử nghiệm AI RT-DETR quét 1 lần */}
          <button
            type="button"
            className={`button button-xs ${aiResult && !isRealtimeAiActive ? 'button-special' : 'button-secondary'}`}
            onClick={handleRunAiTest}
            disabled={isRunningAi || isRealtimeAiActive}
            title="Quét thử nghiệm mô hình RT-DETR 1 lần"
          >
            <Sparkle size={14} className={isRunningAi ? 'spin' : ''} aria-hidden="true" style={{ color: '#f59e0b' }} />
            <span>{isRunningAi ? 'Đang quét…' : 'Thử nghiệm AI'}</span>
          </button>

          {/* Thống kê kết quả AI Realtime */}
          {isRealtimeAiActive && (
            <div className="canvas-stat-pill live-ai-stat-pill">
              <span className="live-dot" />
              <span>
                AI LIVE: <strong>{existingSeats.length > 0 ? `${aiResult?.occupied_seat_ids?.length || 0}/${existingSeats.length} bàn có người` : `${aiResult?.detections_count || 0} người`}</strong> ({aiResult?.inference_time_ms || 0}ms)
              </span>
            </div>
          )}

          {/* Thống kê kết quả AI 1 lần */}
          {!isRealtimeAiActive && aiResult && (
            <div className="canvas-stat-pill ai-stat-pill">
              <span>
                AI: <strong>{existingSeats.length > 0 ? `${aiResult.occupied_seat_ids?.length || 0}/${existingSeats.length} bàn có người` : `${aiResult.detections_count} người`}</strong> ({aiResult.inference_time_ms}ms)
              </span>
              <button
                type="button"
                className="ai-clear-btn"
                onClick={() => setAiResult(null)}
                title="Đóng kết quả quét AI"
              >
                ✕
              </button>
            </div>
          )}

          {aiError && (
            <div className="canvas-stat-pill warning-pill">
              <Warning size={14} aria-hidden="true" />
              <span>{aiError}</span>
            </div>
          )}
        </div>

        {/* Chú thích 4 Trạng thái Chỗ ngồi FSM */}
        <div className="fsm-status-legend" title="4 trạng thái giám sát hiện diện chỗ ngồi FSM">
          <span className="legend-chip">
            <span className="legend-dot dot-gray" /> EMPTY (Trống)
          </span>
          <span className="legend-chip">
            <span className="legend-dot dot-green" /> PRESENT (Có mặt)
          </span>
          <span className="legend-chip">
            <span className="legend-dot dot-amber" /> {`TEMP_AWAY (Tạm vắng < ${awayThresholdSec >= 60 ? `${Math.round(awayThresholdSec / 60)}'` : `${awayThresholdSec}s`})`}
          </span>
          <span className="legend-chip">
            <span className="legend-dot dot-red" /> {`PROLONGED_AWAY (Rời chỗ ≥ ${awayThresholdSec >= 60 ? `${Math.round(awayThresholdSec / 60)}'` : `${awayThresholdSec}s`})`}
          </span>
        </div>

        {/* Hướng Dẫn Thao Tác Ngắn Gọn Ở Góc Bên Phải */}
        <div
          className="canvas-cheatsheet-compact"
          title="Phím tắt: Click trái thêm điểm, Chuột phải hoặc 'n' chốt vùng, 'u' hoàn tác, 'r' reset, 'Space' chạy AI, 'Esc' hủy"
        >
          <Keyboard size={15} style={{ color: 'var(--color-muted)', flexShrink: 0 }} aria-hidden="true" />
          <span className="cheatsheet-chip">
            <kbd>Trái</kbd> Chấm điểm
          </span>
          <span className="cheatsheet-chip highlight">
            <kbd>Phải</kbd>/<kbd>n</kbd> Chốt vùng
          </span>
          <span className="cheatsheet-chip">
            <kbd>u</kbd> Lùi
          </span>
          <span className="cheatsheet-chip">
            <kbd>r</kbd> Reset
          </span>
          <span className="cheatsheet-chip highlight-green">
            <kbd>Space</kbd> AI
          </span>
        </div>
      </div>
    </div>
  )
}
