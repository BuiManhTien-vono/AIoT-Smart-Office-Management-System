import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../common/Icon';
import type { Session } from '../../types/auth.types';
import type {
  AttendanceAdjustmentAudit,
  AttendanceRecord,
  AttendanceStatus,
  CancelAttendanceMode,
  Shift,
} from '../../types/attendance.types';
import {
  attendanceStatusLabels,
  auditActionLabels,
} from '../../types/attendance.types';
import type { Employee } from '../../types/biometrics.types';
import {
  adjustAttendanceLog,
  cancelAttendanceLog,
  createManualAttendanceLog,
  evaluateAttendanceEditPermission,
  getVietnamTodayIso,
  listAttendanceAudits,
} from '../../services/attendanceService';

interface AttendanceAdjustmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: Session;
  employees: Employee[];
  shifts: Shift[];
  record?: AttendanceRecord | null;
  defaultDate?: string;
  defaultEmployeeId?: string;
  sourceScreen: 'DAILY_LOG' | 'REPORTING_HUB';
  onSuccess: (notice?: string) => void;
}

function isoToVietnamTimeInput(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const hh = parts.find((p) => p.type === 'hour')?.value ?? '';
  const mm = parts.find((p) => p.type === 'minute')?.value ?? '';
  if (!hh || !mm) return '';
  return `${hh === '24' ? '00' : hh}:${mm}`;
}

function buildVietnamIsoTimestamp(workDate: string, timeHHmm: string): string | null {
  const cleanDate = workDate.trim();
  const cleanTime = timeHHmm.trim();
  if (!cleanDate || !cleanTime) return null;
  const normalizedTime = cleanTime.length === 5 ? `${cleanTime}:00` : cleanTime;
  return `${cleanDate}T${normalizedTime}+07:00`;
}

function formatViDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(d);
}

function formatViTimeOnly(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

function formatViDate(isoDate?: string | null): string {
  if (!isoDate) return '—';
  const [y, m, d] = isoDate.slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : isoDate;
}

export function AttendanceAdjustmentModal({
  isOpen,
  onClose,
  session,
  employees,
  shifts,
  record = null,
  defaultDate,
  defaultEmployeeId,
  sourceScreen,
  onSuccess,
}: AttendanceAdjustmentModalProps) {
  const isEditing = Boolean(record);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const [activeTab, setActiveTab] = useState<'edit' | 'history'>('edit');
  const [employeeId, setEmployeeId] = useState<string>(
    () => record?.employeeId ?? defaultEmployeeId ?? ''
  );
  const [workDate, setWorkDate] = useState<string>(
    () => record?.workDate?.slice(0, 10) ?? defaultDate ?? getVietnamTodayIso()
  );
  const [shiftId, setShiftId] = useState<string>(
    () => record?.shiftId ?? shifts.find((s) => s.isDefault)?.id ?? shifts[0]?.id ?? ''
  );
  const [checkInTime, setCheckInTime] = useState<string>(() =>
    isoToVietnamTimeInput(record?.checkInTime)
  );
  const [checkOutTime, setCheckOutTime] = useState<string>(() =>
    isoToVietnamTimeInput(record?.checkOutTime)
  );
  const [isStatusOverridden, setIsStatusOverridden] = useState<boolean>(false);
  const [overrideStatus, setOverrideStatus] = useState<AttendanceStatus>(
    () => (record?.status as AttendanceStatus) || 'ON_TIME'
  );
  const [overrideLateMinutes, setOverrideLateMinutes] = useState<string>(() =>
    String(record?.lateMinutes ?? 0)
  );
  const [overrideEarlyLeaveMinutes, setOverrideEarlyLeaveMinutes] = useState<string>(() =>
    String(record?.earlyLeaveMinutes ?? 0)
  );
  const [reason, setReason] = useState<string>('');

  // Danger Zone: Hủy công 2 chế độ
  const [showCancelPanel, setShowCancelPanel] = useState<boolean>(false);
  const [cancelMode, setCancelMode] = useState<CancelAttendanceMode>('VOID_ERRONEOUS');
  const [cancelReason, setCancelReason] = useState<string>('');

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Lịch sử chỉnh sửa (Audit)
  const [audits, setAudits] = useState<AttendanceAdjustmentAudit[]>([]);
  const [auditsLoading, setAuditsLoading] = useState<boolean>(false);
  const [auditsError, setAuditsError] = useState<string | null>(null);

  const scopedEmployees = useMemo(() => {
    const isLead = session.user.role === 'DEPT_LEAD';
    return employees.filter((e) => {
      if (isLead && session.user.departmentId && e.departmentId !== session.user.departmentId) {
        return false;
      }
      return e.isActive || e.id === employeeId;
    });
  }, [employees, session.user.role, session.user.departmentId, employeeId]);

  const selectedEmployee = useMemo(
    () => employees.find((e) => e.id === employeeId) ?? null,
    [employees, employeeId]
  );

  const targetDepartmentId = record?.departmentId ?? selectedEmployee?.departmentId ?? null;
  const permission = useMemo(
    () => evaluateAttendanceEditPermission(session, workDate, targetDepartmentId),
    [session, workDate, targetDepartmentId]
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      if (!dialog.open) {
        dialog.showModal();
      }
      setError(null);
    } else if (dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !employeeId || !workDate) {
      setAudits([]);
      return;
    }

    const controller = new AbortController();
    setAuditsLoading(true);
    setAuditsError(null);

    listAttendanceAudits(
      session.accessToken,
      { employeeId, fromDate: workDate, toDate: workDate },
      controller.signal
    )
      .then((items) => setAudits(items))
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setAuditsError(err instanceof Error ? err.message : 'Không thể tải lịch sử điều chỉnh.');
      })
      .finally(() => setAuditsLoading(false));

    return () => controller.abort();
  }, [isOpen, session.accessToken, employeeId, workDate]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!permission.allowed) {
      setError(permission.reason ?? 'Bạn không có quyền chỉnh sửa ngày công này.');
      return;
    }

    if (!isEditing && !employeeId) {
      setError('Vui lòng chọn nhân viên cần bổ sung công.');
      return;
    }

    if (!workDate) {
      setError('Vui lòng chọn ngày công.');
      return;
    }

    const cleanReason = reason.trim();
    if (cleanReason.length < 5) {
      setError('Vui lòng nhập lý do điều chỉnh công (tối thiểu 5 ký tự).');
      return;
    }

    const checkInIso = buildVietnamIsoTimestamp(workDate, checkInTime);
    const checkOutIso = buildVietnamIsoTimestamp(workDate, checkOutTime);

    if (checkInIso && checkOutIso && new Date(checkOutIso) <= new Date(checkInIso)) {
      setError('Giờ ra (Check-out) phải lớn hơn giờ vào (Check-in).');
      return;
    }

    if (!isStatusOverridden && !checkInIso && checkOutIso) {
      setError('Vui lòng nhập giờ vào (Check-in) khi đã có giờ ra (Check-out).');
      return;
    }

    const parsedLate = Number.parseInt(overrideLateMinutes, 10);
    const parsedEarly = Number.parseInt(overrideEarlyLeaveMinutes, 10);

    setIsSubmitting(true);
    try {
      if (isEditing && record) {
        await adjustAttendanceLog(session.accessToken, record.id, {
          checkInTime: checkInIso,
          checkOutTime: checkOutIso,
          shiftId: shiftId || null,
          isStatusOverridden,
          overrideStatus: isStatusOverridden ? overrideStatus : null,
          overrideLateMinutes:
            isStatusOverridden && Number.isFinite(parsedLate) ? Math.max(0, parsedLate) : null,
          overrideEarlyLeaveMinutes:
            isStatusOverridden && Number.isFinite(parsedEarly) ? Math.max(0, parsedEarly) : null,
          reason: cleanReason,
          sourceScreen,
        });
        onSuccess(`Đã cập nhật thông tin công ngày ${formatViDate(workDate)} của ${record.employeeCode}.`);
      } else {
        await createManualAttendanceLog(session.accessToken, {
          employeeId,
          workDate,
          checkInTime: checkInIso,
          checkOutTime: checkOutIso,
          shiftId: shiftId || null,
          isStatusOverridden,
          overrideStatus: isStatusOverridden ? overrideStatus : null,
          overrideLateMinutes:
            isStatusOverridden && Number.isFinite(parsedLate) ? Math.max(0, parsedLate) : null,
          overrideEarlyLeaveMinutes:
            isStatusOverridden && Number.isFinite(parsedEarly) ? Math.max(0, parsedEarly) : null,
          reason: cleanReason,
          sourceScreen,
        });
        const label = selectedEmployee
          ? `${selectedEmployee.employeeCode} (${selectedEmployee.fullName})`
          : 'nhân viên';
        onSuccess(`Đã bổ sung công ngày ${formatViDate(workDate)} cho ${label}.`);
      }
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Không thể lưu điều chỉnh công.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmCancel = async () => {
    if (!record) return;
    setError(null);

    if (!permission.allowed) {
      setError(permission.reason ?? 'Bạn không có quyền hủy công cho ngày này.');
      return;
    }

    const cleanReason = cancelReason.trim();
    if (cleanReason.length < 5) {
      setError('Vui lòng nhập lý do hủy công cụ thể (tối thiểu 5 ký tự).');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await cancelAttendanceLog(session.accessToken, record.id, {
        cancelMode,
        reason: cleanReason,
        sourceScreen,
      });
      onSuccess(res.message);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Không thể hủy bản ghi công.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const currentStatusMeta = record
    ? attendanceStatusLabels[record.status] ?? { label: record.status, class: 'badge-neutral' }
    : null;

  return (
    <dialog
      ref={dialogRef}
      className="app-dialog"
      style={{ maxWidth: '680px', width: '94vw' }}
      aria-labelledby="attendance-adjust-modal-title"
      onClose={onClose}
      onCancel={(e) => {
        if (isSubmitting) e.preventDefault();
      }}
    >
      <div className="app-dialog-heading">
        <div>
          <p className="eyebrow">ĐIỀU CHỈNH &amp; KIỂM TOÁN NGÀY CÔNG</p>
          <h2 id="attendance-adjust-modal-title">
            {isEditing
              ? `Điều chỉnh công · ${record?.employeeCode} (${record?.employeeFullName})`
              : 'Bổ sung công thủ công'}
          </h2>
          <p className="muted">
            Mọi thay đổi đều được lưu vào bảng lịch sử kiểm toán và đồng bộ ngay sang Báo cáo tổng hợp.
          </p>
        </div>
        <button
          type="button"
          className="button button-secondary app-dialog-close"
          aria-label="Đóng"
          disabled={isSubmitting}
          onClick={onClose}
        >
          <Icon name="close" size={18} />
        </button>
      </div>

      {/* Sub-tabs trong modal */}
      <div className="subnav-tabs" style={{ marginBottom: '16px' }}>
        <button
          type="button"
          className={`subnav-tab ${activeTab === 'edit' ? 'active' : ''}`}
          onClick={() => setActiveTab('edit')}
        >
          <Icon name="clock" size={16} />
          {isEditing ? 'Thông tin & Hủy công' : 'Nhập thông tin công'}
        </button>
        <button
          type="button"
          className={`subnav-tab ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          <Icon name="calendar" size={16} />
          Lịch sử điều chỉnh ({audits.length})
        </button>
      </div>

      {error && (
        <div className="alert alert-error" role="alert" style={{ marginBottom: '14px' }}>
          <Icon name="warning" size={18} />
          <span>{error}</span>
        </div>
      )}

      {!permission.allowed && (
        <div className="alert alert-error" role="status" style={{ marginBottom: '14px' }}>
          <Icon name="warning" size={18} />
          <span>{permission.reason}</span>
        </div>
      )}

      {activeTab === 'edit' ? (
        <div>
          {isEditing && record && (
            <div
              className="panel"
              style={{
                padding: '12px 14px',
                marginBottom: '14px',
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '10px',
                background: 'var(--color-background)',
              }}
            >
              <div>
                <div style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                  Ngày công: <strong>{formatViDate(record.workDate)}</strong>
                </div>
                <div className="muted" style={{ fontSize: '0.8125rem', marginTop: '2px' }}>
                  Hiện tại: Vào <strong>{formatViTimeOnly(record.checkInTime)}</strong> · Ra{' '}
                  <strong>{formatViTimeOnly(record.checkOutTime)}</strong>
                  {record.lateMinutes > 0 ? ` · Muộn ${record.lateMinutes}p` : ''}
                  {record.earlyLeaveMinutes > 0 ? ` · Sớm ${record.earlyLeaveMinutes}p` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                {currentStatusMeta && (
                  <span className={`badge ${currentStatusMeta.class}`}>
                    {currentStatusMeta.label}
                  </span>
                )}
                {record.isManuallyAdjusted && (
                  <span className="badge badge-info">Đã điều chỉnh tay</span>
                )}
              </div>
            </div>
          )}

          <form onSubmit={handleSave} noValidate>
            <div style={{ display: 'grid', gap: '14px' }}>
              {!isEditing && (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: '12px',
                  }}
                >
                  <label className="field">
                    <span>Nhân viên *</span>
                    <select
                      required
                      disabled={isSubmitting}
                      value={employeeId}
                      onChange={(e) => setEmployeeId(e.target.value)}
                    >
                      <option value="">-- Chọn nhân viên --</option>
                      {scopedEmployees.map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.employeeCode} · {emp.fullName} ({emp.departmentCode})
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="field">
                    <span>Ngày làm việc *</span>
                    <input
                      type="date"
                      required
                      max={getVietnamTodayIso()}
                      disabled={isSubmitting}
                      value={workDate}
                      onChange={(e) => setWorkDate(e.target.value)}
                    />
                  </label>
                </div>
              )}

              <label className="field">
                <span>Ca làm việc áp dụng</span>
                <select
                  disabled={isSubmitting || !permission.allowed}
                  value={shiftId}
                  onChange={(e) => setShiftId(e.target.value)}
                >
                  {shifts.map((sh) => (
                    <option key={sh.id} value={sh.id}>
                      {sh.shiftName} ({sh.shiftCode}: {sh.startTime.slice(0, 5)} –{' '}
                      {sh.endTime.slice(0, 5)}, ân hạn {sh.graceMinutes}p)
                    </option>
                  ))}
                </select>
              </label>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '12px',
                }}
              >
                <label className="field">
                  <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Giờ vào (Check-in · UTC+7)</span>
                    {checkInTime && permission.allowed && (
                      <button
                        type="button"
                        className="button button-ghost"
                        style={{ padding: '2px 6px', fontSize: '0.75rem', height: 'auto' }}
                        onClick={() => setCheckInTime('')}
                      >
                        Xóa giờ
                      </button>
                    )}
                  </span>
                  <input
                    type="time"
                    disabled={isSubmitting || !permission.allowed}
                    value={checkInTime}
                    onChange={(e) => setCheckInTime(e.target.value)}
                  />
                </label>

                <label className="field">
                  <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Giờ ra (Check-out · UTC+7)</span>
                    {checkOutTime && permission.allowed && (
                      <button
                        type="button"
                        className="button button-ghost"
                        style={{ padding: '2px 6px', fontSize: '0.75rem', height: 'auto' }}
                        onClick={() => setCheckOutTime('')}
                      >
                        Xóa giờ
                      </button>
                    )}
                  </span>
                  <input
                    type="time"
                    disabled={isSubmitting || !permission.allowed}
                    value={checkOutTime}
                    onChange={(e) => setCheckOutTime(e.target.value)}
                  />
                </label>
              </div>

              {/* Chế độ tính trạng thái */}
              <div
                className="panel"
                style={{
                  padding: '12px 14px',
                  background: 'var(--color-background)',
                  display: 'grid',
                  gap: '10px',
                }}
              >
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    cursor: permission.allowed ? 'pointer' : 'not-allowed',
                    fontWeight: 600,
                    fontSize: '0.875rem',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isStatusOverridden}
                    disabled={isSubmitting || !permission.allowed}
                    onChange={(e) => setIsStatusOverridden(e.target.checked)}
                    style={{ width: '16px', height: '16px' }}
                  />
                  <span>Ghi đè trạng thái thủ công (không tự tính theo ca)</span>
                </label>

                {!isStatusOverridden ? (
                  <p className="muted" style={{ margin: 0, fontSize: '0.8125rem' }}>
                    Chế độ mặc định: Hệ thống sẽ tự động tính lại trạng thái (Đúng giờ / Đi muộn /
                    Về sớm / Vắng mặt) cùng số phút đi muộn và về sớm dựa trên ca làm việc và đơn
                    nghỉ phép đã duyệt trong ngày.
                  </p>
                ) : (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                      gap: '10px',
                    }}
                  >
                    <label className="field">
                      <span>Trạng thái ghi đè *</span>
                      <select
                        disabled={isSubmitting || !permission.allowed}
                        value={overrideStatus}
                        onChange={(e) => setOverrideStatus(e.target.value as AttendanceStatus)}
                      >
                        {Object.entries(attendanceStatusLabels).map(([key, meta]) => (
                          <option key={key} value={key}>
                            {meta.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    {(overrideStatus === 'LATE' || overrideStatus === 'EARLY_LEAVE') && (
                      <>
                        <label className="field">
                          <span>Phút đi muộn</span>
                          <input
                            type="number"
                            min={0}
                            disabled={isSubmitting || !permission.allowed}
                            value={overrideLateMinutes}
                            onChange={(e) => setOverrideLateMinutes(e.target.value)}
                          />
                        </label>
                        <label className="field">
                          <span>Phút về sớm</span>
                          <input
                            type="number"
                            min={0}
                            disabled={isSubmitting || !permission.allowed}
                            value={overrideEarlyLeaveMinutes}
                            onChange={(e) => setOverrideEarlyLeaveMinutes(e.target.value)}
                          />
                        </label>
                      </>
                    )}
                  </div>
                )}
              </div>

              <label className="field">
                <span>Lý do điều chỉnh * (tối thiểu 5 ký tự)</span>
                <textarea
                  rows={2}
                  required
                  disabled={isSubmitting || !permission.allowed}
                  placeholder="VD: Camera cổng mất kết nối buổi sáng, đã đối chiếu xác nhận từ trưởng bộ phận..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
            </div>

            <div className="app-dialog-actions" style={{ marginTop: '16px' }}>
              <button
                type="button"
                className="button button-secondary"
                disabled={isSubmitting}
                onClick={onClose}
              >
                Đóng
              </button>
              <button
                type="submit"
                className="button button-primary"
                disabled={isSubmitting || !permission.allowed}
              >
                {isSubmitting
                  ? 'Đang lưu...'
                  : isEditing
                  ? 'Lưu điều chỉnh công'
                  : 'Xác nhận bổ sung công'}
              </button>
            </div>
          </form>

          {/* Danger Zone: 2 chế độ Hủy công */}
          {isEditing && record && permission.allowed && (
            <div
              style={{
                marginTop: '18px',
                paddingTop: '16px',
                borderTop: '1px dashed var(--color-border)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  flexWrap: 'wrap',
                }}
              >
                <div>
                  <strong style={{ color: 'var(--status-danger-text, #991b1b)', fontSize: '0.875rem' }}>
                    Hủy công ngày {formatViDate(record.workDate)}
                  </strong>
                  <p className="muted" style={{ margin: '2px 0 0', fontSize: '0.8rem' }}>
                    Dùng khi hệ thống ghi nhầm công hoặc cần phạt trừ toàn bộ lương ngày công.
                  </p>
                </div>
                <button
                  type="button"
                  className="button button-secondary"
                  style={{
                    color: 'var(--status-danger-text, #991b1b)',
                    borderColor: 'var(--status-danger, #dc2626)',
                  }}
                  disabled={isSubmitting}
                  onClick={() => setShowCancelPanel((prev) => !prev)}
                >
                  {showCancelPanel ? 'Ẩn tùy chọn hủy' : 'Mở tùy chọn hủy công'}
                </button>
              </div>

              {showCancelPanel && (
                <div
                  style={{
                    marginTop: '12px',
                    padding: '14px',
                    borderRadius: '10px',
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    display: 'grid',
                    gap: '12px',
                  }}
                >
                  <div style={{ display: 'grid', gap: '8px' }}>
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '10px',
                        padding: '10px',
                        borderRadius: '8px',
                        background: cancelMode === 'VOID_ERRONEOUS' ? '#ffffff' : 'transparent',
                        border:
                          cancelMode === 'VOID_ERRONEOUS'
                            ? '1px solid #dc2626'
                            : '1px solid transparent',
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="radio"
                        name="cancelMode"
                        value="VOID_ERRONEOUS"
                        checked={cancelMode === 'VOID_ERRONEOUS'}
                        onChange={() => setCancelMode('VOID_ERRONEOUS')}
                        style={{ marginTop: '3px' }}
                      />
                      <div>
                        <strong style={{ fontSize: '0.875rem', color: '#0f172a' }}>
                          1. Gỡ bản ghi do ghi nhầm / Lỗi hệ thống / Trùng ngày nghỉ phép
                        </strong>
                        <p className="muted" style={{ margin: '2px 0 0', fontSize: '0.8rem' }}>
                          Gỡ bản ghi khỏi bảng công để không tính công và không đánh vắng không phép;
                          toàn bộ dữ liệu gốc vẫn được lưu vĩnh viễn trong bảng lịch sử Audit.
                        </p>
                      </div>
                    </label>

                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '10px',
                        padding: '10px',
                        borderRadius: '8px',
                        background: cancelMode === 'REVOKE_PENALTY' ? '#ffffff' : 'transparent',
                        border:
                          cancelMode === 'REVOKE_PENALTY'
                            ? '1px solid #dc2626'
                            : '1px solid transparent',
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="radio"
                        name="cancelMode"
                        value="REVOKE_PENALTY"
                        checked={cancelMode === 'REVOKE_PENALTY'}
                        onChange={() => setCancelMode('REVOKE_PENALTY')}
                        style={{ marginTop: '3px' }}
                      />
                      <div>
                        <strong style={{ fontSize: '0.875rem', color: '#991b1b' }}>
                          2. Phạt hủy công / Trừ toàn bộ lương ngày công (REVOKED)
                        </strong>
                        <p className="muted" style={{ margin: '2px 0 0', fontSize: '0.8rem' }}>
                          Giữ nguyên giờ vào/ra và ảnh đối chứng, chuyển trạng thái sang Hủy công
                          (0 ngày công, 0 giờ lương), tăng cột Hủy công trên Báo cáo tổng hợp và
                          chặn camera ghi đè tự động.
                        </p>
                      </div>
                    </label>
                  </div>

                  <label className="field">
                    <span style={{ color: '#991b1b', fontWeight: 600 }}>
                      Lý do hủy công * (tối thiểu 5 ký tự)
                    </span>
                    <textarea
                      rows={2}
                      disabled={isSubmitting}
                      placeholder={
                        cancelMode === 'VOID_ERRONEOUS'
                          ? 'VD: Lỗi AI nhận diện nhầm trong ngày nhân viên đang nghỉ phép năm...'
                          : 'VD: Biên bản kỷ luật số .../QĐ-KL trừ toàn bộ ngày công do vi phạm quy định...'
                      }
                      value={cancelReason}
                      onChange={(e) => setCancelReason(e.target.value)}
                    />
                  </label>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                    <button
                      type="button"
                      className="button button-secondary"
                      disabled={isSubmitting}
                      onClick={() => setShowCancelPanel(false)}
                    >
                      Hủy thao tác
                    </button>
                    <button
                      type="button"
                      className="button"
                      style={{
                        background: '#dc2626',
                        borderColor: '#dc2626',
                        color: '#ffffff',
                      }}
                      disabled={isSubmitting}
                      onClick={() => void handleConfirmCancel()}
                    >
                      {isSubmitting
                        ? 'Đang xử lý...'
                        : cancelMode === 'VOID_ERRONEOUS'
                        ? 'Xác nhận gỡ bản ghi nhầm'
                        : 'Xác nhận phạt hủy công (Trừ lương)'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '12px' }}>
          {auditsLoading ? (
            <p className="muted">Đang tải lịch sử điều chỉnh công...</p>
          ) : auditsError ? (
            <div className="alert alert-error" role="alert">
              <Icon name="warning" size={18} />
              <span>{auditsError}</span>
            </div>
          ) : audits.length === 0 ? (
            <div className="empty-state" style={{ padding: '24px 12px' }}>
              <p className="muted">Chưa có lịch sử điều chỉnh hoặc hủy công nào cho ngày này.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '10px', maxHeight: '380px', overflowY: 'auto' }}>
              {audits.map((audit) => {
                const actionMeta = auditActionLabels[audit.actionType] ?? {
                  label: audit.actionType,
                  class: 'badge-neutral',
                };
                const prevStatusLabel = audit.previousStatus
                  ? attendanceStatusLabels[audit.previousStatus]?.label ?? audit.previousStatus
                  : 'Chưa có';
                const newStatusLabel = audit.newStatus
                  ? attendanceStatusLabels[audit.newStatus]?.label ?? audit.newStatus
                  : 'Đã gỡ bản ghi';
                return (
                  <div
                    key={audit.id}
                    className="panel"
                    style={{ padding: '12px 14px', background: 'var(--color-background)' }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '8px',
                        flexWrap: 'wrap',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span className={`badge ${actionMeta.class}`}>{actionMeta.label}</span>
                        {audit.isStatusOverridden && (
                          <span className="badge badge-special">Ghi đè thủ công</span>
                        )}
                      </div>
                      <small className="muted">{formatViDateTime(audit.createdAt)}</small>
                    </div>

                    <div style={{ marginTop: '8px', fontSize: '0.84rem', display: 'grid', gap: '4px' }}>
                      <div>
                        Trạng thái: <strong>{prevStatusLabel}</strong> →{' '}
                        <strong>{newStatusLabel}</strong>
                      </div>
                      <div className="muted">
                        Giờ vào/ra: {formatViTimeOnly(audit.previousCheckInTime)} –{' '}
                        {formatViTimeOnly(audit.previousCheckOutTime)} →{' '}
                        <strong>
                          {formatViTimeOnly(audit.newCheckInTime)} –{' '}
                          {formatViTimeOnly(audit.newCheckOutTime)}
                        </strong>
                      </div>
                      <div>
                        Lý do: <span>{audit.reason}</span>
                      </div>
                      <small className="muted">
                        Thực hiện bởi: <strong>{audit.adjustedByName}</strong> ({audit.adjustedByRole})
                        {audit.sourceScreen ? ` · Nguồn: ${audit.sourceScreen}` : ''}
                      </small>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="app-dialog-actions">
            <button type="button" className="button button-secondary" onClick={onClose}>
              Đóng
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}

