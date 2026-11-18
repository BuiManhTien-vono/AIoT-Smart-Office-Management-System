import { apiRequest, apiFetch } from './apiClient';
import type {
  Department,
  Employee,
  CreateEmployeeInput,
  RegisterBiometricVectorInput,
  BiometricMediaUploadResponse,
  AiExtractFeaturesResponse,
  AiVerifyDuplicateResponse,
  AiGateCheckinResponse,
} from '../types/biometrics.types';

const AI_BASE_URL = import.meta.env.VITE_AI_SERVICE_URL || 'http://localhost:8000';

/**
 * Thu nhỏ và nén ảnh ngay trên trình duyệt (Client-side Image Compression)
 * nếu kích thước vượt quá maxDimension hoặc dung lượng > 180KB,
 * giúp tốc độ tải ảnh từ Điện thoại/Webcam lên VPS nhanh gấp 5-10 lần.
 */
export async function compressImageBlob(
  fileOrBlob: File | Blob,
  maxDimension = 960,
  quality = 0.85
): Promise<Blob> {
  if (typeof document === 'undefined' || typeof createImageBitmap === 'undefined') {
    return fileOrBlob;
  }
  if (fileOrBlob.size <= 140 * 1024 && fileOrBlob.type === 'image/jpeg') {
    return fileOrBlob;
  }

  try {
    const bitmap = await createImageBitmap(fileOrBlob);
    const { width, height } = bitmap;
    const maxSide = Math.max(width, height);
    const scale = maxSide > maxDimension ? maxDimension / maxSide : 1;
    const targetW = Math.max(1, Math.round(width * scale));
    const targetH = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return fileOrBlob;
    }

    ctx.drawImage(bitmap, 0, 0, targetW, targetH);
    bitmap.close();

    return await new Promise<Blob>((resolve) => {
      canvas.toBlob(
        (blob) => resolve(blob || fileOrBlob),
        'image/jpeg',
        quality
      );
    });
  } catch {
    return fileOrBlob;
  }
}

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

export async function updateEmployee(
  token: string,
  id: string,
  input: import('../types/biometrics.types').UpdateEmployeeInput,
  signal?: AbortSignal
): Promise<Employee> {
  return apiRequest<Employee>(`/biometrics/employees/${encodeURIComponent(id)}`, {
    method: 'PUT',
    token,
    body: JSON.stringify(input),
    signal,
  });
}

export async function deleteEmployeePermanently(
  token: string,
  id: string,
  signal?: AbortSignal
): Promise<void> {
  return apiRequest<void>(`/biometrics/employees/${encodeURIComponent(id)}/permanent`, {
    method: 'DELETE',
    token,
    signal,
  });
}

export async function reactivateEmployee(
  token: string,
  id: string,
  signal?: AbortSignal
): Promise<void> {
  return apiRequest<void>(`/biometrics/employees/${encodeURIComponent(id)}/reactivate`, {
    method: 'POST',
    token,
    signal,
  });
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

export async function uploadEmployeeAvatar(
  token: string,
  employeeId: string,
  file: File | Blob,
  signal?: AbortSignal
): Promise<BiometricMediaUploadResponse> {
  const compressed = await compressImageBlob(file, 720, 0.85);
  const formData = new FormData();
  formData.append('file', compressed, 'avatar.jpg');

  const response = await apiFetch(
    `/biometrics/employees/${encodeURIComponent(employeeId)}/avatar`,
    {
      method: 'POST',
      token,
      body: formData,
      signal,
    }
  );

  return response.json() as Promise<BiometricMediaUploadResponse>;
}

export async function uploadBiometricSampleImage(
  token: string,
  employeeId: string,
  file: File | Blob,
  poseLabel: string = 'FRONTAL',
  signal?: AbortSignal
): Promise<BiometricMediaUploadResponse> {
  const compressed = await compressImageBlob(file, 960, 0.85);
  const formData = new FormData();
  formData.append('file', compressed, `${poseLabel.toLowerCase()}_sample.jpg`);

  const response = await apiFetch(
    `/biometrics/employees/${encodeURIComponent(employeeId)}/sample-image?poseLabel=${encodeURIComponent(poseLabel)}`,
    {
      method: 'POST',
      token,
      body: formData,
      signal,
    }
  );

  return response.json() as Promise<BiometricMediaUploadResponse>;
}

// ==========================================
// AI Service APIs (Port 8000)
// ==========================================

export async function extractFaceFeatures(
  file: File | Blob,
  signal?: AbortSignal
): Promise<AiExtractFeaturesResponse> {
  const compressed = await compressImageBlob(file, 960, 0.85);
  const formData = new FormData();
  formData.append('file', compressed, 'face.jpg');

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
    try {
      const errorJson = JSON.parse(errorText) as { detail?: AiExtractFeaturesResponse | string };
      if (errorJson.detail && typeof errorJson.detail === 'object') {
        return errorJson.detail;
      }
      throw new Error(typeof errorJson.detail === 'string' ? errorJson.detail : errorText);
    } catch (parseErr) {
      if (parseErr instanceof Error && parseErr.message !== errorText) {
        throw parseErr;
      }
      throw new Error(`AI Service error (${response.status}): ${errorText}`);
    }
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
  const compressed = await compressImageBlob(file, 720, 0.82);
  const formData = new FormData();
  formData.append('file', compressed, 'checkin.jpg');
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
