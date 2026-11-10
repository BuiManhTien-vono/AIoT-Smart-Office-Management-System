import { apiRequest, apiFetch } from './apiClient'
import type {
  Camera,
  CreateCameraInput,
  UpdateCameraInput,
  CalibrationFrameUploadResponse,
  Seat,
  CreateSeatInput,
  UpdateSeatPolygonInput,
  SyncAiZonesResponse,
  DetectPreviewResponse,
} from '../types/occupancy.types'

const AI_BASE_URL = (import.meta.env.VITE_AI_SERVICE_URL || 'http://localhost:8000').replace(/\/+$/, '')

export async function listCameras(
  token: string,
  departmentId?: string,
  signal?: AbortSignal
): Promise<Camera[]> {
  const query = departmentId ? `?departmentId=${encodeURIComponent(departmentId)}` : ''
  return apiRequest<Camera[]>(`/occupancy/cameras${query}`, {
    method: 'GET',
    token,
    signal,
  })
}

export async function createCamera(
  token: string,
  input: CreateCameraInput,
  signal?: AbortSignal
): Promise<Camera> {
  return apiRequest<Camera>('/occupancy/cameras', {
    method: 'POST',
    token,
    body: JSON.stringify(input),
    signal,
  })
}

export async function updateCamera(
  token: string,
  cameraId: string,
  input: UpdateCameraInput,
  signal?: AbortSignal
): Promise<Camera> {
  return apiRequest<Camera>(`/occupancy/cameras/${encodeURIComponent(cameraId)}`, {
    method: 'PUT',
    token,
    body: JSON.stringify(input),
    signal,
  })
}

export async function deleteCamera(
  token: string,
  cameraId: string,
  signal?: AbortSignal
): Promise<void> {
  return apiRequest<void>(`/occupancy/cameras/${encodeURIComponent(cameraId)}`, {
    method: 'DELETE',
    token,
    signal,
  })
}

export async function uploadCalibrationFrame(
  token: string,
  cameraId: string,
  file: File,
  signal?: AbortSignal
): Promise<CalibrationFrameUploadResponse> {
  const formData = new FormData()
  formData.append('file', file)

  const response = await apiFetch(`/occupancy/cameras/${encodeURIComponent(cameraId)}/calibration-frame`, {
    method: 'POST',
    token,
    body: formData,
    signal,
  })

  return response.json() as Promise<CalibrationFrameUploadResponse>
}

export async function listSeats(
  token: string,
  options?: { departmentId?: string; cameraId?: string },
  signal?: AbortSignal
): Promise<Seat[]> {
  const params = new URLSearchParams()
  if (options?.departmentId) params.set('departmentId', options.departmentId)
  if (options?.cameraId) params.set('cameraId', options.cameraId)
  const qs = params.toString() ? `?${params.toString()}` : ''

  return apiRequest<Seat[]>(`/occupancy/seats${qs}`, {
    method: 'GET',
    token,
    signal,
  })
}

export async function createSeat(
  token: string,
  input: CreateSeatInput,
  signal?: AbortSignal
): Promise<Seat> {
  return apiRequest<Seat>('/occupancy/seats', {
    method: 'POST',
    token,
    body: JSON.stringify(input),
    signal,
  })
}

export async function updateSeatPolygon(
  token: string,
  seatId: string,
  input: UpdateSeatPolygonInput,
  signal?: AbortSignal
): Promise<Seat> {
  return apiRequest<Seat>(`/occupancy/seats/${encodeURIComponent(seatId)}/polygon`, {
    method: 'PUT',
    token,
    body: JSON.stringify(input),
    signal,
  })
}

export async function deleteSeat(
  token: string,
  seatId: string,
  signal?: AbortSignal
): Promise<void> {
  return apiRequest<void>(`/occupancy/seats/${encodeURIComponent(seatId)}`, {
    method: 'DELETE',
    token,
    signal,
  })
}

export async function syncZonesToAi(
  cameraCode: string,
  signal?: AbortSignal
): Promise<SyncAiZonesResponse> {
  const response = await fetch(
    `${AI_BASE_URL}/api/v1/occupancy/sync-zones-from-backend?camera_code=${encodeURIComponent(cameraCode)}`,
    {
      method: 'POST',
      headers: { Accept: 'application/json' },
      signal,
    }
  )

  if (!response.ok) {
    let detail = ''
    try {
      const errJson = (await response.json()) as { detail?: string }
      detail = errJson.detail || ''
    } catch {
      detail = await response.text()
    }
    throw new Error(detail || `Không thể đồng bộ sang AI Service (HTTP ${response.status})`)
  }

  return response.json() as Promise<SyncAiZonesResponse>
}

export async function testDetectPreview(
  file?: File,
  seats: Seat[] = [],
  confThreshold: number = 0.35,
  signal?: AbortSignal,
  awayAlertSec?: number,
  resetFsm?: boolean,
  cameraCode?: string,
  streamUrl?: string
): Promise<DetectPreviewResponse> {
  const formData = new FormData()
  if (file) {
    formData.append('file', file)
  }
  if (streamUrl) {
    formData.append('stream_url', streamUrl)
  }
  formData.append('seats_json', JSON.stringify(seats))
  formData.append('conf_threshold', String(confThreshold))
  if (awayAlertSec !== undefined) {
    formData.append('away_alert_sec', String(awayAlertSec))
  }
  if (resetFsm) {
    formData.append('reset_fsm', 'true')
  }
  if (cameraCode) {
    formData.append('camera_code', cameraCode)
  }
  formData.append('sync_backend', 'true')

  // Determine endpoint: prefer gateway '/ai/', fallback to direct AI port (8000)
  const isGateway = typeof window !== 'undefined' && (window.location.port === '' || window.location.port === '80')
  const primaryUrl = isGateway ? '/ai/api/v1/occupancy/detect-preview' : `${AI_BASE_URL}/api/v1/occupancy/detect-preview`
  const fallbackUrl = isGateway ? `${AI_BASE_URL}/api/v1/occupancy/detect-preview` : '/ai/api/v1/occupancy/detect-preview'

  let response: Response
  try {
    response = await fetch(primaryUrl, {
      method: 'POST',
      body: formData,
      signal,
    })
    const cType = response.headers.get('content-type') || ''
    if (!response.ok || !cType.includes('application/json')) {
      throw new Error(`Primary AI endpoint returned status ${response.status}`)
    }
  } catch {
    response = await fetch(fallbackUrl, {
      method: 'POST',
      body: formData,
      signal,
    })
  }

  if (!response.ok) {
    let detail = ''
    try {
      const errJson = (await response.json()) as { detail?: string }
      detail = errJson.detail || ''
    } catch {
      detail = await response.text()
    }
    throw new Error(detail || `Lỗi chạy thử mô hình AI RT-DETR (HTTP ${response.status})`)
  }

  return response.json() as Promise<DetectPreviewResponse>
}

export async function getSeatMap(
  token: string,
  departmentId?: string,
  signal?: AbortSignal
): Promise<Seat[]> {
  const query = departmentId ? `?departmentId=${encodeURIComponent(departmentId)}` : ''
  return apiRequest<Seat[]>(`/occupancy/seat-map${query}`, {
    method: 'GET',
    token,
    signal,
  })
}

/**
 * Đưa toàn bộ bàn làm việc thuộc camera về trạng thái TRỐNG (EMPTY) trên Backend .NET và phát sự kiện SignalR.
 */
export async function resetCameraSeats(cameraCode: string, token?: string): Promise<{ cameraCode: string; resetSeatsCount: number; message: string }> {
  return apiRequest<{ cameraCode: string; resetSeatsCount: number; message: string }>(
    `/occupancy/cameras/${encodeURIComponent(cameraCode)}/reset-seats`,
    {
      method: 'POST',
      token,
    }
  )
}

/**
 * Reset bộ nhớ máy trạng thái FSM trong RAM của AI Service về trạng thái EMPTY.
 */
export async function resetAiFsm(): Promise<{ status: string; message: string }> {
  const isGateway = typeof window !== 'undefined' && (window.location.port === '' || window.location.port === '80')
  const primaryUrl = isGateway ? '/ai/api/v1/occupancy/reset-fsm' : `${AI_BASE_URL}/api/v1/occupancy/reset-fsm`
  const fallbackUrl = isGateway ? `${AI_BASE_URL}/api/v1/occupancy/reset-fsm` : '/ai/api/v1/occupancy/reset-fsm'

  try {
    const res = await fetch(primaryUrl, { method: 'POST' })
    if (res.ok) return (await res.json()) as { status: string; message: string }
  } catch {
    // fallback
  }

  try {
    const res = await fetch(fallbackUrl, { method: 'POST' })
    if (res.ok) return (await res.json()) as { status: string; message: string }
  } catch {
    // ignore
  }

  return { status: 'ok', message: 'FSM reset locally' }
}


