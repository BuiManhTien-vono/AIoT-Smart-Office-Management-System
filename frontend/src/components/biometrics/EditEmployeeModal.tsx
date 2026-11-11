import { useEffect, useRef, useState } from 'react';
import { Icon } from '../common/Icon';
import type { Department, Employee, UpdateEmployeeInput } from '../../types/biometrics.types';
import { updateEmployee } from '../../services/biometricsService';

interface EditEmployeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  employee: Employee | null;
  departments: Department[];
  token: string;
  onSuccess: () => void;
}

export function EditEmployeeModal({
  isOpen,
  onClose,
  employee,
  departments,
  token,
  onSuccess,
}: EditEmployeeModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  const [fullName, setFullName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [deptId, setDeptId] = useState<string>('');
  const [isActive, setIsActive] = useState<boolean>(true);

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Sync initial state when employee prop changes
  useEffect(() => {
    if (employee) {
      setFullName(employee.fullName || '');
      setEmail(employee.email || '');
      setPhone(employee.phoneNumber || '');
      setDeptId(employee.departmentId || '');
      setIsActive(employee.isActive);
      setError(null);
    }
  }, [employee]);

  // Modal open/close sync
  useEffect(() => {
    const el = dialogRef.current;
    if (isOpen) {
      if (!el?.open) el?.showModal();
    } else {
      if (el?.open) el?.close();
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employee) return;

    if (!fullName.trim()) {
      setError('Họ và tên không được để trống.');
      return;
    }

    if (!deptId) {
      setError('Vui lòng chọn phòng ban.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const payload: UpdateEmployeeInput = {
        fullName: fullName.trim(),
        email: email.trim().toLowerCase() || undefined,
        phoneNumber: phone.trim() || undefined,
        departmentId: deptId,
        isActive,
      };

      await updateEmployee(token, employee.id, payload);
      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Lỗi khi cập nhật thông tin nhân viên');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !employee) return null;

  return (
    <dialog
      ref={dialogRef}
      className="app-dialog"
      aria-labelledby="edit-emp-title"
      onClose={onClose}
    >
      <div className="app-dialog-heading">
        <div>
          <p className="eyebrow">HỒ SƠ NHÂN SỰ</p>
          <h2 id="edit-emp-title">Chỉnh sửa thông tin nhân viên</h2>
          <p className="muted">Cập nhật họ tên, phòng ban, thông tin liên hệ và trạng thái hoạt động.</p>
        </div>
        <button
          type="button"
          className="button button-secondary app-dialog-close"
          onClick={onClose}
          aria-label="Đóng"
        >
          <Icon name="close" size={18} />
        </button>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '16px' }}>
        {error && (
          <div className="alert alert-error">
            <Icon name="warning" size={18} />
            <span>{error}</span>
          </div>
        )}

        {/* Mã nhân viên (Readonly) */}
        <label className="field">
          <span>Mã nhân viên (Định danh hệ thống)</span>
          <input
            type="text"
            value={employee.employeeCode}
            disabled
            readOnly
            style={{ backgroundColor: 'var(--color-surface-subtle, #f3f4f6)', cursor: 'not-allowed' }}
          />
        </label>

        {/* Họ và tên */}
        <label className="field">
          <span>Họ và tên *</span>
          <input
            type="text"
            required
            placeholder="Ví dụ: Nguyễn Văn A"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </label>

        {/* Phòng ban */}
        <label className="field">
          <span>Phòng ban *</span>
          <select
            required
            value={deptId}
            onChange={(e) => setDeptId(e.target.value)}
          >
            <option value="">-- Chọn phòng ban --</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.departmentName} ({d.departmentCode})
              </option>
            ))}
          </select>
        </label>

        {/* Email & Số điện thoại */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              placeholder="ten@smartoffice.vn"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>

          <label className="field">
            <span>Số điện thoại</span>
            <input
              type="tel"
              placeholder="0912345678"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </label>
        </div>

        {/* Trạng thái hoạt động */}
        <div className="field">
          <span style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '6px', display: 'block' }}>
            Trạng thái hoạt động
          </span>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginTop: '4px' }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="radio"
                name="empStatus"
                checked={isActive}
                onChange={() => setIsActive(true)}
              />
              <span className="badge badge-success" style={{ fontWeight: 500 }}>
                Đang làm việc (Hoạt động)
              </span>
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="radio"
                name="empStatus"
                checked={!isActive}
                onChange={() => setIsActive(false)}
              />
              <span className="badge badge-danger" style={{ fontWeight: 500 }}>
                Ngưng hoạt động (Tạm khóa)
              </span>
            </label>
          </div>
          <p className="muted" style={{ fontSize: '0.75rem', marginTop: '6px' }}>
            * Nhân viên ngưng hoạt động sẽ không thể điểm danh tại cổng quét mặt và sơ đồ chỗ ngồi.
          </p>
        </div>

        <div className="app-dialog-actions" style={{ marginTop: '8px' }}>
          <button
            type="button"
            className="button button-secondary"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Hủy bỏ
          </button>
          <button
            type="submit"
            className="button button-primary"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Đang lưu...' : 'Lưu thay đổi'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
