export interface PolygonPoint {
  x: number
  y: number
}

export type CameraType = 'GATE' | 'DESK'
export type ZoneType = 'WORK_DESK' | 'RESTRICTED_ZONE'
export type SeatState = 'EMPTY' | 'PRESENT' | 'TEMP_AWAY' | 'PROLONGED_AWAY' | 'WRONG_SEAT'

export interface Camera {
  id: string
  cameraCode: string
  cameraName: string
  cameraType: CameraType
  departmentId: string | null
  streamSource: string
  calibrationFrameKey?: string | null
  calibrationFramePresignedUrl?: string | null
  isOnline: boolean
  createdAt: string
}

export interface CreateCameraInput {
  cameraCode: string
  cameraName: string
  streamSource: string
  cameraType?: CameraType
  departmentId?: string | null
  isOnline?: boolean
}

export interface UpdateCameraInput {
  cameraName: string
  streamSource: string
  cameraType?: CameraType
  departmentId?: string | null
  isOnline?: boolean
}

export interface CalibrationFrameUploadResponse {
  cameraId: string
  cameraCode: string
  objectKey: string
  presignedUrl: string
  expiryMinutes: number
}

export interface HeadDetectionPreview {
  bbox_normalized: [number, number, number, number]
  center_normalized: [number, number]
  confidence: number
  matched_seat_id?: string | null
  is_in_zone?: boolean
}

export interface SeatStatePreview {
  seat_id: string
  seat_code?: string
  status: SeatState
  away_duration_sec?: number
  has_occupant: boolean
  is_alert?: boolean
}

export interface DetectPreviewResponse {
  status: string
  inference_time_ms: number
  detections_count: number
  detections: HeadDetectionPreview[]
  occupied_seat_ids: string[]
  seat_states?: SeatStatePreview[]
}

export interface Seat {
  id: string
  seatCode: string
  seatName: string
  zoneType: ZoneType
  cameraId: string
  departmentId: string
  assignedEmployeeId?: string | null
  assignedEmployeeCode?: string | null
  assignedEmployeeName?: string | null
  polygonPoints: PolygonPoint[]
  currentState: SeatState
  activeSecondsToday: number
  stateUpdatedAt: string
}

export interface CreateSeatInput {
  seatCode: string
  seatName: string
  cameraId: string
  departmentId: string
  assignedEmployeeId?: string | null
  polygonPoints: PolygonPoint[]
  zoneType?: ZoneType
}

export interface UpdateSeatPolygonInput {
  polygonPoints: PolygonPoint[]
  assignedEmployeeId?: string | null
  zoneType?: ZoneType
}

export interface SyncAiZonesResponse {
  status: string
  camera_code: string
  synced_seats_count: number
  seats: unknown[]
}

export interface SeatStateChangedEvent {
  eventId: string
  occurredOnUtc: string
  seatId: string
  seatCode: string
  cameraId: string
  departmentId: string
  assignedEmployeeId: string | null
  detectedEmployeeId: string | null
  previousState: SeatState
  newState: SeatState
  durationSeconds: number
  activeSecondsToday: number
}

export interface ProlongedAbsenceAlertEvent {
  eventId: string
  occurredOnUtc: string
  seatId: string
  seatCode: string
  departmentId: string
  assignedEmployeeId: string | null
  awayDurationSeconds: number
}

export interface WrongSeatAlertEvent {
  eventId: string
  occurredOnUtc: string
  seatId: string
  seatCode: string
  departmentId: string
  assignedEmployeeId: string
  detectedEmployeeId: string
}

export interface BatchSeatActionInput {
  seatIds: string[]
  action: 'SET_STATE' | 'UNASSIGN_EMPLOYEE' | 'CHANGE_ZONE_TYPE' | 'DELETE'
  newState?: SeatState
  zoneType?: ZoneType
}

export interface BatchSeatActionResult {
  processedCount: number
  action: string
  message: string
}

