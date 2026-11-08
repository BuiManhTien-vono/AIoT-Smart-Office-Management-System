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
} from '@phosphor-icons/react'
import type { PolygonPoint, Seat, DetectPreviewResponse } from '../../types/occupancy.types'
import { testDetectPreview } from '../../services/occupancyService'

interface Props {
  backgroundImageUrl: string | null
  streamSource?: string | null
  existingSeats: Seat[]
  selectedSeatId: string | null
  currentPolygon: PolygonPoint[]
  onPolygonChange: (points: PolygonPoint[]) => void
  onSelectExistingSeat?: (seat: Seat) => void
  onCaptureSnapshot?: (file: File) => Promise<void>
  onQuickCommitZone?: (points: PolygonPoint[]) => Promise<void> | void
  onSyncZonesToAi?: () => Promise<void> | void
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
  onQuickCommitZone,
  onSyncZonesToAi,
  isCapturing = false,
  isReadOnly = false,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const liveImgRef = useRef<HTMLImageElement>(null)

  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null)
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

  const trimmedSource = streamSource?.trim() || ''
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

    // 2. Draw existing seats
    existingSeats.forEach(seat => {
      if (!seat.polygonPoints || seat.polygonPoints.length < 3) return
      const isSelected = seat.id === selectedSeatId
      const isRestricted = seat.zoneType === 'RESTRICTED_ZONE'
      const isAiOccupied = aiResult?.occupied_seat_ids.includes(seat.id) || aiResult?.occupied_seat_ids.includes(seat.seatCode)

      ctx.beginPath()
      seat.polygonPoints.forEach((pt, idx) => {
        const px = pt.x * width
        const py = pt.y * height
        if (idx === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      })
      ctx.closePath()

      // Styling: Highlight AI occupied seats in vibrant green
      if (isAiOccupied) {
        ctx.fillStyle = 'rgba(16, 185, 129, 0.42)'
        ctx.strokeStyle = '#10b981'
        ctx.lineWidth = 3.5
      } else if (isSelected) {
        ctx.fillStyle = isRestricted ? 'rgba(239, 68, 68, 0.4)' : 'rgba(37, 99, 235, 0.35)'
        ctx.strokeStyle = isRestricted ? '#ef4444' : '#2563eb'
        ctx.lineWidth = 3
      } else {
        ctx.fillStyle = isRestricted ? 'rgba(239, 68, 68, 0.2)' : 'rgba(37, 99, 235, 0.18)'
        ctx.strokeStyle = isRestricted ? 'rgba(239, 68, 68, 0.8)' : 'rgba(37, 99, 235, 0.75)'
        ctx.lineWidth = 1.8
      }
      ctx.fill()
      ctx.stroke()

      // Draw label in center
      const centerX = (seat.polygonPoints.reduce((acc, p) => acc + p.x, 0) / seat.polygonPoints.length) * width
      const centerY = (seat.polygonPoints.reduce((acc, p) => acc + p.y, 0) / seat.polygonPoints.length) * height

      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 12px Inter, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.shadowColor = 'rgba(0, 0, 0, 0.8)'
      ctx.shadowBlur = 4
      const displayLabel = isAiOccupied ? `${seat.seatCode} (CÓ NGƯỜI)` : seat.seatCode
      ctx.fillText(displayLabel, centerX, centerY)
      ctx.shadowBlur = 0
    })

    // 3. Draw current working polygon
    if (currentPolygon.length > 0) {
      ctx.beginPath()
      currentPolygon.forEach((pt, idx) => {
        const px = pt.x * width
        const py = pt.y * height
        if (idx === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      })

      // If mouse is moving and drawing is in progress
      if (mousePos && !isReadOnly) {
        ctx.lineTo(mousePos.x, mousePos.y)
      }

      ctx.strokeStyle = '#2563eb'
      ctx.lineWidth = 2.5
      ctx.setLineDash([4, 4])
      ctx.stroke()
      ctx.setLineDash([])

      // Fill polygon if >= 3 vertices
      if (currentPolygon.length >= 3) {
        ctx.fillStyle = 'rgba(37, 99, 235, 0.22)'
        ctx.fill()
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

    // 4. Draw RT-DETR AI Head Detections (Bounding Box + Head Center)
    if (aiResult?.detections && aiResult.detections.length > 0) {
      aiResult.detections.forEach((det) => {
        const [xmin, ymin, xmax, ymax] = det.bbox_normalized
        const bx = xmin * width
        const by = ymin * height
        const bw = (xmax - xmin) * width
        const bh = (ymax - ymin) * height
        const [xc, yc] = det.center_normalized
        const cx = xc * width
        const cy = yc * height

        // Hộp nhận diện đầu người (Màu cam nổi bật)
        ctx.strokeStyle = '#f59e0b'
        ctx.lineWidth = 2.5
        ctx.strokeRect(bx, by, bw, bh)
        ctx.fillStyle = 'rgba(245, 158, 11, 0.16)'
        ctx.fillRect(bx, by, bw, bh)

        // Điểm tâm đỉnh đầu (Chấm xanh lá cây)
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

    // Normalize coordinates to [0.0, 1.0]
    const normX = Math.max(0, Math.min(1, Number((pixelX / rect.width).toFixed(4))))
    const normY = Math.max(0, Math.min(1, Number((pixelY / rect.height).toFixed(4))))

    // Check if clicked near first point to close polygon (snap threshold: 18px)
    if (currentPolygon.length >= 3) {
      const first = currentPolygon[0]
      const dist = Math.hypot(pixelX - first.x * rect.width, pixelY - first.y * rect.height)
      if (dist < 18) {
        setMousePos(null)
        return
      }
    }

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
    if (isReadOnly || currentPolygon.length === 0) {
      if (mousePos) setMousePos(null)
      return
    }
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    setMousePos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    })
  }

  function handleMouseLeave() {
    setMousePos(null)
  }

  const handleUndoVertex = useCallback(() => {
    if (currentPolygon.length === 0) return
    onPolygonChange(currentPolygon.slice(0, -1))
  }, [currentPolygon, onPolygonChange])

  const handleClearPolygon = useCallback(() => {
    onPolygonChange([])
    setMousePos(null)
  }, [onPolygonChange])

  // Chốt vùng hiện tại (Bàn 1 -> Bàn 2 -> ...)
  const handleCommitCurrentZone = useCallback(async () => {
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

    if (onQuickCommitZone) {
      showToast('⏳ Đang lưu chốt vùng bàn...')
      await onQuickCommitZone(currentPolygon)
      showToast('🎉 Đã chốt bàn thành công! Hãy click tiếp để vẽ bàn kế tiếp.')
    } else {
      setMousePos(null)
      showToast('✅ Đã khép góc đa giác. Bấm "Lưu bàn" bên dưới.')
    }
  }, [currentPolygon, onQuickCommitZone, showToast])

  // Hoàn tất tất cả và BẮT ĐẦU GIÁM SÁT (Phím SPACE / ENTER / 'c' hoặc nút Chạy AI Thật)
  const handleStartOrToggleMonitoring = useCallback(async () => {
    // Tự động chốt bàn đang vẽ nếu có >= 3 đỉnh
    if (currentPolygon.length >= 3 && onQuickCommitZone) {
      await onQuickCommitZone(currentPolygon)
    }

    if (isRealtimeAiActive) {
      setIsRealtimeAiActive(false)
      showToast('⏹ Đã dừng giám sát AI thật.')
    } else {
      if (onSyncZonesToAi) {
        showToast('🔄 Đang đồng bộ vùng bàn sang AI...')
        await onSyncZonesToAi()
      }
      setIsRealtimeAiActive(true)
      showToast('🚀 Đang chạy giám sát AI thật liên tục!')
    }
  }, [currentPolygon, onQuickCommitZone, isRealtimeAiActive, onSyncZonesToAi, showToast])

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

        if (!frameBlob) {
          await new Promise(r => setTimeout(r, 400))
          continue
        }

        const file = new File([frameBlob], `rt_${Date.now()}.jpg`, { type: 'image/jpeg' })
        try {
          const res = await testDetectPreview(file, existingSeatsRef.current, 0.35)
          if (!cancelled && isRealtimeRef.current) {
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
  }, [isRealtimeAiActive, imgElement, imageLoaded])

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
      testDetectPreview(file, existingSeats, 0.35)
        .then(res => {
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
      if (viewMode === 'LIVE' && liveImgRef.current && liveImgRef.current.naturalWidth > 0) {
        offscreen.width = liveImgRef.current.naturalWidth
        offscreen.height = liveImgRef.current.naturalHeight
        ctx.drawImage(liveImgRef.current, 0, 0, offscreen.width, offscreen.height)
        offscreen.toBlob(blob => {
          if (blob) sendToAi(blob)
          else {
            setIsRunningAi(false)
            setAiError('Không thể tạo file ảnh từ luồng camera.')
          }
        }, 'image/jpeg', 0.95)
        return
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
            src={streamSource!}
            alt="Luồng trực tiếp camera"
            className="canvas-video-layer"
            crossOrigin="anonymous"
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
              <span>Đỉnh: <strong>{currentPolygon.length}</strong></span>
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
                    className="button button-primary button-xs"
                    onClick={() => void handleCommitCurrentZone()}
                    title="Chốt bàn này (Phím tắt: Chuột phải hoặc 'n')"
                  >
                    <Check size={14} aria-hidden="true" />
                    <span>Chốt bàn (n)</span>
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
              <span>AI LIVE: <strong>{aiResult?.detections_count || 0} người</strong> ({aiResult?.inference_time_ms || 0}ms)</span>
            </div>
          )}

          {/* Thống kê kết quả AI 1 lần */}
          {!isRealtimeAiActive && aiResult && (
            <div className="canvas-stat-pill ai-stat-pill">
              <span>AI: <strong>{aiResult.detections_count} người</strong> ({aiResult.inference_time_ms}ms)</span>
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

        {/* Hướng Dẫn Thao Tác Ngắn Gọn Ở Góc Bên Phải */}
        <div
          className="canvas-cheatsheet-compact"
          title="Phím tắt: Click trái thêm điểm, Chuột phải hoặc 'n' chốt bàn, 'u' hoàn tác, 'r' reset, 'Space' chạy AI, 'Esc' hủy"
        >
          <Keyboard size={15} style={{ color: 'var(--color-muted)', flexShrink: 0 }} aria-hidden="true" />
          <span className="cheatsheet-chip">
            <kbd>Trái</kbd> Chấm điểm
          </span>
          <span className="cheatsheet-chip highlight">
            <kbd>Phải</kbd>/<kbd>n</kbd> Chốt bàn
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
