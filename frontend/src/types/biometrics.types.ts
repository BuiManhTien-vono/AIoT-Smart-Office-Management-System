export interface Department {
  id: string
  departmentCode: string
  departmentName: string
  description?: string | null
  createdAt?: string
}

export interface CreateDepartmentInput {
  departmentCode: string
  departmentName: string
  description?: string
}

export interface Employee {
  id: string
  employeeCode: string
  fullName: string
  email?: string | null
  phoneNumber?: string | null
  departmentId: string
  departmentCode: string
  defaultShiftId?: string | null
  avatarObjectKey?: string | null
  isActive: boolean
  registeredVectorCount: number
  createdAt: string
}

export interface CreateEmployeeInput {
  employeeCode: string
  fullName: string
  email?: string
  phoneNumber?: string
  departmentId: string
  defaultShiftId?: string | null
  avatarObjectKey?: string
}

export type BiometricPose = 'FRONTAL' | 'LEFT' | 'RIGHT'

export const POSE_OPTIONS: { value: BiometricPose; label: string }[] = [
  { value: 'FRONTAL', label: 'Chính diện' },
  { value: 'LEFT', label: 'Nghiêng trái' },
  { value: 'RIGHT', label: 'Nghiêng phải' },
]

export interface RegisterBiometricVectorInput {
  embeddingVector: number[]
  sampleImageKey?: string
  qualityScore?: number
  poseLabel?: string
}

export interface BiometricVectorResponse {
  id: string
  employeeId: string
  sampleImageKey: string
  qualityScore: number
  poseLabel: string
  vectorDimension: number
  createdAt: string
}

export interface AiExtractFeaturesResponse {
  success: boolean
  error_code?: string
  message: string
  embedding?: number[]
  embedding_dim?: number
  blur_score?: number
  bbox?: [number, number, number, number]
}

export interface AiVerifyDuplicateResponse {
  is_duplicate: boolean
  matched_employee_id?: string | null
  similarity_score: number
  threshold: number
  warning?: string | null
}

export interface AiGateCheckinResponse {
  success: boolean
  status: string
  liveness_score?: number
  liveness?: {
    is_real: boolean
    real_score: number
    spoof_print_score?: number
    spoof_screen_score?: number
  }
  identification?: {
    isMatched?: boolean
    employeeId?: string
    employeeCode?: string
    fullName?: string
    similarity?: number
  }
  attendance?: {
    isDebounced?: boolean
    status?: string
    message?: string
    recorded?: boolean
    event_type?: string
    timestamp?: string
  }
  security_incident?: Record<string, unknown>
}
