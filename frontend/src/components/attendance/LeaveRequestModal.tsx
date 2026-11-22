import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../common/Icon';
import type { CreateLeaveInput, LeaveRequest } from '../../types/attendance.types';
import { leaveTypeLabels } from '../../types/attendance.types';
import { createLeave, replaceLeave } from '../../services/attendanceService';
import type { Employee } from '../../types/biometrics.types';

function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

function formatEmployeeLabel(emp: Employee): string {
  return `${emp.fullName} (${emp.employeeCode})${emp.departmentCode ? ` - ${emp.departmentCode}` : ''}`;
}

interface LeaveRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: string;
  employees: Employee[];
  editingLeave?: LeaveRequest | null;
  onSuccess: () => void;
}

export function LeaveRequestModal({
  isOpen,
  onClose,
  token,
  employees,
  editingLeave = null,
  onSuccess,
}: LeaveRequestModalProps) {
  const isEditing = Boolean(editingLeave);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const employeeDropdownRef = useRef<HTMLDivElement>(null);
  const [employeeId, setEmployeeId] = useState<string>(() => editingLeave?.employeeId ?? '');
  const [employeeSearch, setEmployeeSearch] = useState<string>(() => {
    if (!editingLeave?.employeeId) return '';
    const found = employees.find((emp) => emp.id === editingLeave.employeeId);
    return found ? formatEmployeeLabel(found) : '';
  });
  const [isEmployeeDropdownOpen, setIsEmployeeDropdownOpen] = useState<boolean>(false);
  const [leaveType, setLeaveType] = useState<string>(() => editingLeave?.leaveType ?? 'ANNUAL_LEAVE');
  const [startDate, setStartDate] = useState<string>(
    () => editingLeave?.startDate?.slice(0, 10) ?? new Date().toISOString().split('T')[0]
  );
  const [endDate, setEndDate] = useState<string>(
    () => editingLeave?.endDate?.slice(0, 10) ?? new Date().toISOString().split('T')[0]
  );
  const [startTime, setStartTime] = useState<string>(
    () => (editingLeave?.startTime ? editingLeave.startTime.slice(0, 5) : '')
  );
  const [endTime, setEndTime] = useState<string>(
    () => (editingLeave?.endTime ? editingLeave.endTime.slice(0, 5) : '')
  );
  const [reason, setReason] = useState<string>(() => editingLeave?.reason ?? '');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const isPaidLeaveType =
    leaveType !== 'UNPAID_LEAVE' && leaveType !== 'SUDDENLY_ALLOWED_LEAVE';

  const selectableEmployees = useMemo(
    () => employees.filter((emp) => emp.isActive || emp.id === employeeId),
    [employees, employeeId]
  );

  const filteredEmployees = useMemo(() => {
    const query = normalizeSearchText(employeeSearch);
    if (!query) return selectableEmployees;
    return selectableEmployees.filter((emp) => {
      const searchable = normalizeSearchText(
        `${emp.fullName} ${emp.employeeCode} ${emp.departmentCode ?? ''}`
      );
      return searchable.includes(query);
    });
  }, [selectableEmployees, employeeSearch]);

  useEffect(() => {
    if (!isEmployeeDropdownOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (
        employeeDropdownRef.current &&
        !employeeDropdownRef.current.contains(event.target as Node)
      ) {
        setIsEmployeeDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isEmployeeDropdownOpen]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      if (!dialog.open) {
        dialog.showModal();
      }
      setError(null);
    } else {
      if (dialog.open) {
        dialog.close();
      }
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeId || !startDate || !endDate) {
      setError('Vui lòng chọn nhân viên và khoảng thời gian nghỉ.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const formatTimeOnly = (val: string) =>
        val ? (val.length === 5 ? `${val}:00` : val) : undefined;

      const payload: CreateLeaveInput = {
        employeeId,
        leaveType,
        startDate,
        endDate,
        startTime: formatTimeOnly(startTime),
        endTime: formatTimeOnly(endTime),
        isPaid: isPaidLeaveType,
        reason: reason.trim() || undefined,
      };

      if (editingLeave) {
        await replaceLeave(token, editingLeave.id, payload);
      } else {
        await createLeave(token, payload);
      }
      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Không thể gửi đơn xin nghỉ');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <dialog
      ref={dialogRef}
      className="app-dialog"
      aria-labelledby="leave-modal-title"
      onClose={onClose}
      onCancel={(e) => {
        if (isSubmitting) e.preventDefault();
      }}
    >
      <div className="app-dialog-heading">
        <div>
          <p className="eyebrow">CHẤM CÔNG & NGHỈ PHÉP</p>
          <h2 id="leave-modal-title">
            {isEditing ? 'Điều chỉnh & thay thế đơn nghỉ phép' : 'Tạo đơn xin nghỉ phép'}
          </h2>
          <p className="muted">
            {isEditing
              ? 'Đơn cũ sẽ chuyển sang trạng thái Đã hủy và được thay thế bằng đơn mới này.'
              : 'Ghi nhận nghỉ phép có lương, công vụ, nghỉ đột xuất hoặc việc riêng.'}
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

      <form onSubmit={handleSubmit} noValidate>
        {error && (
          <div className="alert alert-error" role="alert">
            <Icon name="warning" size={18} />
            <span>{error}</span>
          </div>
        )}

        <div style={{ display: 'grid', gap: '16px' }}>
          <div className="field" ref={employeeDropdownRef} style={{ position: 'relative' }}>
            <span>Chọn nhân viên *</span>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                type="text"
                role="combobox"
                aria-expanded={isEmployeeDropdownOpen}
                aria-autocomplete="list"
                placeholder="Nhập tên, mã nhân viên hoặc nhấn để chọn..."
                disabled={isSubmitting || isEditing}
                value={employeeSearch}
                onFocus={() => {
                  if (!isSubmitting && !isEditing) {
                    setIsEmployeeDropdownOpen(true);
                  }
                }}
                onChange={(e) => {
                  setEmployeeSearch(e.target.value);
                  setEmployeeId('');
                  setIsEmployeeDropdownOpen(true);
                }}
                style={{ width: '100%', paddingRight: '60px' }}
              />
              {!isSubmitting && !isEditing && employeeSearch && (
                <button
                  type="button"
                  aria-label="Xóa lựa chọn nhân viên"
                  onClick={() => {
                    setEmployeeSearch('');
                    setEmployeeId('');
                    setIsEmployeeDropdownOpen(true);
                  }}
                  style={{
                    position: 'absolute',
                    right: '32px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '4px',
                    color: 'var(--text-muted, #64748b)',
                    lineHeight: 1,
                  }}
                >
                  ×
                </button>
              )}
              <button
                type="button"
                aria-label="Mở danh sách nhân viên"
                disabled={isSubmitting || isEditing}
                onClick={() => setIsEmployeeDropdownOpen((prev) => !prev)}
                style={{
                  position: 'absolute',
                  right: '8px',
                  background: 'none',
                  border: 'none',
                  cursor: isSubmitting || isEditing ? 'default' : 'pointer',
                  padding: '4px',
                  color: 'var(--text-muted, #64748b)',
                  lineHeight: 1,
                }}
              >
                ▾
              </button>
            </div>

            {isEmployeeDropdownOpen && !isSubmitting && !isEditing && (
              <div
                role="listbox"
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  zIndex: 30,
                  marginTop: '4px',
                  maxHeight: '220px',
                  overflowY: 'auto',
                  background: 'var(--surface, #ffffff)',
                  border: '1px solid var(--border, #cbd5e1)',
                  borderRadius: '8px',
                  boxShadow: '0 8px 20px rgba(15, 23, 42, 0.14)',
                }}
              >
                {filteredEmployees.length === 0 ? (
                  <div style={{ padding: '10px 12px', color: 'var(--text-muted, #64748b)', fontSize: '0.9rem' }}>
                    Không tìm thấy nhân viên phù hợp.
                  </div>
                ) : (
                  filteredEmployees.map((emp) => {
                    const isSelected = emp.id === employeeId;
                    return (
                      <button
                        key={emp.id}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => {
                          setEmployeeId(emp.id);
                          setEmployeeSearch(formatEmployeeLabel(emp));
                          setIsEmployeeDropdownOpen(false);
                        }}
                        style={{
                          display: 'block',
                          width: '100%',
                          textAlign: 'left',
                          padding: '9px 12px',
                          border: 'none',
                          background: isSelected ? 'var(--primary-soft, #eff6ff)' : 'transparent',
                          color: 'inherit',
                          cursor: 'pointer',
                          fontWeight: isSelected ? 600 : 400,
                        }}
                      >
                        {formatEmployeeLabel(emp)}
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>

          <label className="field">
            <span>Loại nghỉ phép / vắng mặt *</span>
            <select
              value={leaveType}
              disabled={isSubmitting}
              onChange={(e) => setLeaveType(e.target.value)}
            >
              {Object.entries(leaveTypeLabels).map(([k, label]) => (
                <option key={k} value={k}>
                  {String(label)}
                </option>
              ))}
            </select>
            <small className="muted" style={{ marginTop: '4px' }}>
              Chế độ tính lương:{' '}
              <strong>
                {isPaidLeaveType ? 'Có tính lương (IsPaid = true)' : 'Không tính lương (IsPaid = false)'}
              </strong>
            </small>
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
            <label className="field">
              <span>Từ ngày *</span>
              <input
                type="date"
                required
                disabled={isSubmitting}
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </label>

            <label className="field">
              <span>Đến ngày *</span>
              <input
                type="date"
                required
                disabled={isSubmitting}
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
            <label className="field">
              <span>Từ giờ (Để trống = Đầu ca)</span>
              <input
                type="time"
                disabled={isSubmitting}
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </label>

            <label className="field">
              <span>Đến giờ (Để trống = Cuối ca)</span>
              <input
                type="time"
                disabled={isSubmitting}
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </label>
          </div>

          <label className="field">
            <span>Lý do nghỉ</span>
            <textarea
              rows={3}
              disabled={isSubmitting}
              placeholder="VD: Nghỉ phép năm gia đình có việc..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
        </div>

        <div className="app-dialog-actions">
          <button
            type="button"
            className="button button-secondary"
            disabled={isSubmitting}
            onClick={onClose}
          >
            Hủy
          </button>
          <button
            type="submit"
            className="button button-primary"
            disabled={isSubmitting}
          >
            {isSubmitting
              ? 'Đang lưu...'
              : isEditing
              ? 'Hủy đơn cũ & Lưu đơn mới'
              : 'Tạo đơn nghỉ phép'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
