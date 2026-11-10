import { apiRequest } from './apiClient';
import type {
  Shift,
  CreateShiftInput,
  AttendanceRecord,
  LeaveRequest,
  CreateLeaveInput,
  DailyAbsentResponse,
} from '../types/attendance.types';

export async function listShifts(token: string, signal?: AbortSignal): Promise<Shift[]> {
  return apiRequest<Shift[]>('/attendance/shifts', {
    method: 'GET',
    token,
    signal,
  });
}

export async function createShift(
  token: string,
  input: CreateShiftInput,
  signal?: AbortSignal
): Promise<Shift> {
  return apiRequest<Shift>('/attendance/shifts', {
    method: 'POST',
    token,
    body: JSON.stringify(input),
    signal,
  });
}

export async function listAttendanceLogs(
  token: string,
  date?: string,
  signal?: AbortSignal
): Promise<AttendanceRecord[]> {
  const query = date ? `?date=${encodeURIComponent(date)}` : '';
  return apiRequest<AttendanceRecord[]>(`/attendance/logs${query}`, {
    method: 'GET',
    token,
    signal,
  });
}

export async function listLeaves(
  token: string,
  date?: string,
  signal?: AbortSignal
): Promise<LeaveRequest[]> {
  const query = date ? `?date=${encodeURIComponent(date)}` : '';
  return apiRequest<LeaveRequest[]>(`/attendance/leaves${query}`, {
    method: 'GET',
    token,
    signal,
  });
}

export async function createLeave(
  token: string,
  input: CreateLeaveInput,
  signal?: AbortSignal
): Promise<LeaveRequest> {
  return apiRequest<LeaveRequest>('/attendance/leaves', {
    method: 'POST',
    token,
    body: JSON.stringify(input),
    signal,
  });
}

export async function markDailyAbsent(
  token: string,
  date?: string,
  signal?: AbortSignal
): Promise<DailyAbsentResponse> {
  const query = date ? `?date=${encodeURIComponent(date)}` : '';
  return apiRequest<DailyAbsentResponse>(`/attendance/mark-absent${query}`, {
    method: 'POST',
    token,
    signal,
  });
}
