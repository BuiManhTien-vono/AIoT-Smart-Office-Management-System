import { apiRequest } from './apiClient';
import type {
  Department,
  Employee,
  CreateEmployeeInput,
  RegisterBiometricVectorInput,
  AiExtractFeaturesResponse,
  AiVerifyDuplicateResponse,
  AiGateCheckinResponse,
} from '../types/biometrics.types';

const AI_BASE_URL = import.meta.env.VITE_AI_SERVICE_URL || 'http://localhost:8000';

export async function listDepartments(token: string, signal?: AbortSignal): Promise<Department[]> {
  return apiRequest<Department[]>('/biometrics/departments', {
    method: 'GET',
    token,
    signal,
  });
}

export async function createDepartment(
  token: string,
  input: { departmentCode: string; departmentName: string; description?: string },
  signal?: AbortSignal
): Promise<Department> {
  return apiRequest<Department>('/biometrics/departments', {
    method: 'POST',
    token,
    body: JSON.stringify(input),
    signal,
  });
}

export async function listEmployees(
  token: string,
  departmentId?: string,
  signal?: AbortSignal
): Promise<Employee[]> {
  const query = departmentId ? `?departmentId=${encodeURIComponent(departmentId)}` : '';
  return apiRequest<Employee[]>(`/biometrics/employees${query}`, {
    method: 'GET',
    token,
    signal,
  });
}

export async function getEmployee(
  token: string,
  id: string,
  signal?: AbortSignal
): Promise<Employee> {
  return apiRequest<Employee>(`/biometrics/employees/${encodeURIComponent(id)}`, {
    method: 'GET',
    token,
    signal,
  });
}

export async function createEmployee(
  token: string,
  input: CreateEmployeeInput,
  signal?: AbortSignal
): Promise<Employee> {
  return apiRequest<Employee>('/biometrics/employees', {
    method: 'POST',
    token,
    body: JSON.stringify(input),
    signal,
  });
}

export async function deactivateEmployee(
  token: string,
  id: string,
  signal?: AbortSignal
): Promise<{ success: boolean; message: string }> {
  return apiRequest<{ success: boolean; message: string }>(
    `/biometrics/employees/${encodeURIComponent(id)}`,
    {
      method: 'DELETE',
      token,
      signal,
    }
  );
}

export async function registerBiometricVector(
  token: string,
  employeeId: string,
  input: RegisterBiometricVectorInput,
  signal?: AbortSignal
): Promise<{ success: boolean; message: string; vectorCount: number }> {
  return apiRequest<{ success: boolean; message: string; vectorCount: number }>(
    `/biometrics/employees/${encodeURIComponent(employeeId)}/vectors`,
    {
      method: 'POST',
      token,
      body: JSON.stringify(input),
      signal,
    }
  );
}

// ==========================================
// AI Service APIs (Port 8000)
// ==========================================

export async function extractFaceFeatures(
  file: File | Blob,
  signal?: AbortSignal
): Promise<AiExtractFeaturesResponse> {
  const formData = new FormData();
  formData.append('file', file, 'face.jpg');

  const response = await fetch(`${AI_BASE_URL}/api/v1/face/extract-features`, {
    method: 'POST',
    body: formData,
    signal,
  });

  if (!response.ok) {
    if (response.status === 422) {
      try {
        const errorJson = (await response.json()) as { detail?: AiExtractFeaturesResponse };
        if (errorJson?.detail && typeof errorJson.detail === 'object') {
          return errorJson.detail;
        }
      } catch {
        // fall through
      }
    }
    const errorText = await response.text();
    throw new Error(`AI Service error (${response.status}): ${errorText}`);
  }

  return response.json() as Promise<AiExtractFeaturesResponse>;
}

export async function verifyDuplicateFace(
  newEmbedding: number[],
  existingRecords: Array<{ employee_id: string; embedding: number[] }>,
  threshold = 0.65,
  signal?: AbortSignal
): Promise<AiVerifyDuplicateResponse> {
  const response = await fetch(`${AI_BASE_URL}/api/v1/face/verify-duplicate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      new_embedding: newEmbedding,
      existing_records: existingRecords,
      threshold,
    }),
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AI Duplicate Check error (${response.status}): ${errorText}`);
  }

  return response.json() as Promise<AiVerifyDuplicateResponse>;
}

export async function testGateCheckin(
  file: File | Blob,
  gateCameraId = 'GATE_MAIN_CAM_01',
  signal?: AbortSignal
): Promise<AiGateCheckinResponse> {
  const formData = new FormData();
  formData.append('file', file, 'checkin.jpg');
  formData.append('camera_id', gateCameraId);

  const response = await fetch(`${AI_BASE_URL}/api/v1/face/gate-checkin`, {
    method: 'POST',
    body: formData,
    signal,
  });

  if (!response.ok) {
    let errorDetail = '';
    try {
      const errorJson = (await response.json()) as { detail?: string };
      errorDetail = errorJson.detail || '';
    } catch {
      errorDetail = await response.text();
    }
    const err = new Error(errorDetail || `AI Gate Check-in error (${response.status})`);
    (err as unknown as { status: number }).status = response.status;
    throw err;
  }

  return response.json() as Promise<AiGateCheckinResponse>;
}
