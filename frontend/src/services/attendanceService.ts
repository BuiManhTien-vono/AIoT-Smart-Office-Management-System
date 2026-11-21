import { apiRequest } from './apiClient';
import type { Session } from '../types/auth.types';
import type {
  Shift,
  CreateShiftInput,
  AttendanceRecord,
  AdjustAttendanceInput,
  ManualAttendanceInput,
  CancelAttendanceInput,
  CancelAttendanceResponse,
  AttendanceAdjustmentAudit,
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
  signal?: AbortSignal,
  range?: { fromDate: string; toDate: string }
): Promise<AttendanceRecord[]> {
  const params = new URLSearchParams();
  if (range) {
    params.set('fromDate', range.fromDate);
    params.set('toDate', range.toDate);
  } else if (date) {
    params.set('date', date);
  }
  const query = params.toString() ? `?${params.toString()}` : '';
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

export async function cancelLeave(
  token: string,
  leaveId: string,
  signal?: AbortSignal
): Promise<LeaveRequest> {
  return apiRequest<LeaveRequest>(`/attendance/leaves/${encodeURIComponent(leaveId)}/cancel`, {
    method: 'PATCH',
    token,
    signal,
  });
}

export async function replaceLeave(
  token: string,
  leaveId: string,
  input: CreateLeaveInput,
  signal?: AbortSignal
): Promise<LeaveRequest> {
  return apiRequest<LeaveRequest>(`/attendance/leaves/${encodeURIComponent(leaveId)}/replace`, {
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

export async function adjustAttendanceLog(
  token: string,
  logId: string,
  input: AdjustAttendanceInput,
  signal?: AbortSignal
): Promise<AttendanceRecord> {
  return apiRequest<AttendanceRecord>(`/attendance/logs/${encodeURIComponent(logId)}`, {
    method: 'PUT',
    token,
    body: JSON.stringify(input),
    signal,
  });
}

export async function createManualAttendanceLog(
  token: string,
  input: ManualAttendanceInput,
  signal?: AbortSignal
): Promise<AttendanceRecord> {
  return apiRequest<AttendanceRecord>('/attendance/logs/manual', {
    method: 'POST',
    token,
    body: JSON.stringify(input),
    signal,
  });
}

export async function cancelAttendanceLog(
  token: string,
  logId: string,
  input: CancelAttendanceInput,
  signal?: AbortSignal
): Promise<CancelAttendanceResponse> {
  return apiRequest<CancelAttendanceResponse>(`/attendance/logs/${encodeURIComponent(logId)}/cancel`, {
    method: 'POST',
    token,
    body: JSON.stringify(input),
    signal,
  });
}

export async function listAttendanceAudits(
  token: string,
  params?: { employeeId?: string; fromDate?: string; toDate?: string },
  signal?: AbortSignal
): Promise<AttendanceAdjustmentAudit[]> {
  const qs = new URLSearchParams();
  if (params?.employeeId) qs.set('employeeId', params.employeeId);
  if (params?.fromDate) qs.set('fromDate', params.fromDate);
  if (params?.toDate) qs.set('toDate', params.toDate);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return apiRequest<AttendanceAdjustmentAudit[]>(`/attendance/audits${suffix}`, {
    method: 'GET',
    token,
    signal,
  });
}

export function getVietnamTodayIso(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const pick = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${pick('year')}-${pick('month')}-${pick('day')}`;
}

export function getCurrentWeekStartIso(todayIso = getVietnamTodayIso()): string {
  const [y, m, d] = todayIso.split('-').map(Number);
  const dt = new Date(Date.UTC(y || 2026, (m || 1) - 1, d || 1));
  const dow = dt.getUTCDay();
  const daysFromMonday = dow === 0 ? 6 : dow - 1;
  dt.setUTCDate(dt.getUTCDate() - daysFromMonday);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export interface AttendanceEditPermission {
  allowed: boolean;
  reason?: string;
}

export function evaluateAttendanceEditPermission(
  session: Session,
  workDate: string,
  targetDepartmentId?: string | null
): AttendanceEditPermission {
  const role = (session.user.role || '').toUpperCase();
  if (role !== 'ADMIN' && role !== 'HR' && role !== 'DEPT_LEAD') {
    return {
      allowed: false,
      reason: 'Chỉ Quản trị viên (ADMIN), Nhân sự (HR) hoặc Trưởng phòng (DEPT_LEAD) mới có quyền điều chỉnh công.',
    };
  }

  if (role === 'DEPT_LEAD') {
    if (!session.user.departmentId) {
      return {
        allowed: false,
        reason: 'Tài khoản Trưởng phòng chưa được gán phòng ban.',
      };
    }
    if (targetDepartmentId && targetDepartmentId !== session.user.departmentId) {
      return {
        allowed: false,
        reason: 'Trưởng phòng chỉ được chỉnh sửa hoặc hủy công cho nhân sự thuộc phòng ban của mình.',
      };
    }
  }

  const today = getVietnamTodayIso();
  if (workDate && workDate > today) {
    return {
      allowed: false,
      reason: 'Không thể điều chỉnh hoặc bổ sung công cho ngày trong tương lai.',
    };
  }

  const weekStart = getCurrentWeekStartIso(today);
  if (workDate && workDate < weekStart && role !== 'ADMIN') {
    const [wy, wm, wd] = weekStart.split('-');
    return {
      allowed: false,
      reason: `Dữ liệu công từ tuần trước trở về trước (trước ${wd}/${wm}/${wy}) chỉ Quản trị viên (ADMIN) mới được chỉnh sửa hoặc hủy.`,
    };
  }

  return { allowed: true };
}
