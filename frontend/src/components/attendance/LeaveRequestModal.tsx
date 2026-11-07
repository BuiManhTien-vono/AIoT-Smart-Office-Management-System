import { useEffect, useRef, useState } from 'react';
import { Icon } from '../common/Icon';
import type { CreateLeaveInput } from '../../types/attendance.types';
import { leaveTypeLabels } from '../../types/attendance.types';
import { createLeave } from '../../services/attendanceService';
import type { Employee } from '../../types/biometrics.types';

interface LeaveRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: string;
  employees: Employee[];
  onSuccess: () => void;
}

export function LeaveRequestModal({
  isOpen,
  onClose,
  token,
  employees,
  onSuccess,
}: LeaveRequestModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [employeeId, setEmployeeId] = useState<string>('');
  const [leaveType, setLeaveType] = useState<string>('ANNUAL_LEAVE');
  const [startDate, setStartDate] = useState<string>(
    () => new Date().toISOString().split('T')[0]
  );
  const [endDate, setEndDate] = useState<string>(
    () => new Date().toISOString().split('T')[0]
  );
  const [reason, setReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

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
      const payload: CreateLeaveInput = {
        employeeId,
        leaveType,
        startDate: `${startDate}T00:00:00Z`,
        endDate: `${endDate}T23:59:59Z`,
        reason: reason.trim() || undefined,
      };

      await createLeave(token, payload);
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
          <h2 id="leave-modal-title">Tạo đơn xin nghỉ phép</h2>
          <p className="muted">Ghi nhận nghỉ phép có lương, ốm đau, thai sản hoặc việc riêng.</p>
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
          <label className="field">
            <span>Chọn nhân viên *</span>
            <select
              required
              value={employeeId}
              disabled={isSubmitting}
              onChange={(e) => setEmployeeId(e.target.value)}
            >
              <option value="">-- Chọn nhân viên nghỉ phép --</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.fullName} ({emp.employeeCode}) - {emp.departmentCode}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Loại nghỉ phép *</span>
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
            {isSubmitting ? 'Đang gửi...' : 'Tạo đơn nghỉ phép'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
