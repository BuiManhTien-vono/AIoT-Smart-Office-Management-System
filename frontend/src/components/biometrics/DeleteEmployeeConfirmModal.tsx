import { useEffect, useRef, useState } from 'react';
import { Icon } from '../common/Icon';
import type { Employee } from '../../types/biometrics.types';
import {
  deactivateEmployee,
  deleteEmployeePermanently,
  reactivateEmployee,
} from '../../services/biometricsService';

interface DeleteEmployeeConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  employee: Employee | null;
  token: string;
  onSuccess: () => void;
}

export function DeleteEmployeeConfirmModal({
  isOpen,
  onClose,
  employee,
  token,
  onSuccess,
}: DeleteEmployeeConfirmModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [deleteMode, setDeleteMode] = useState<'deactivate' | 'permanent'>('deactivate');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (employee) {
      // Nếu nhân viên đã ngưng hoạt động, mặc định mode là permanent
      setDeleteMode(employee.isActive ? 'deactivate' : 'permanent');
      setError(null);
    }
  }, [employee]);

  useEffect(() => {
    const el = dialogRef.current;
    if (isOpen) {
      if (!el?.open) el?.showModal();
    } else {
      if (el?.open) el?.close();
    }
  }, [isOpen]);

  const handleConfirm = async () => {
    if (!employee) return;
    setIsSubmitting(true);
    setError(null);

    try {
      if (deleteMode === 'permanent') {
        await deleteEmployeePermanently(token, employee.id);
      } else {
        await deactivateEmployee(token, employee.id);
      }
      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Lỗi khi xử lý thao tác xóa');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReactivateQuick = async () => {
    if (!employee) return;
    setIsSubmitting(true);
    setError(null);

    try {
      await reactivateEmployee(token, employee.id);
      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Lỗi khi kích hoạt lại nhân viên');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !employee) return null;

  return (
    <dialog
      ref={dialogRef}
      className="app-dialog"
      aria-labelledby="delete-emp-title"
      onClose={onClose}
    >
      <div className="app-dialog-heading">
        <div>
          <p className="eyebrow" style={{ color: 'var(--status-danger-text)' }}>
            QUẢN TRỊ NHÂN SỰ
          </p>
          <h2 id="delete-emp-title">
            {employee.isActive ? 'Xác nhận xử lý nhân viên' : 'Xác nhận xóa vĩnh viễn nhân viên'}
          </h2>
          <p className="muted">
            Nhân viên: <strong>{employee.fullName}</strong> ({employee.employeeCode})
          </p>
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

      <div style={{ display: 'grid', gap: '16px' }}>
        {error && (
          <div className="alert alert-error">
            <Icon name="warning" size={18} />
            <span>{error}</span>
          </div>
        )}

        <div
          style={{
            padding: '12px 16px',
            backgroundColor: 'var(--color-surface-subtle, #f9fafb)',
            borderRadius: 'var(--radius-md, 8px)',
            border: '1px solid var(--color-border, #e5e7eb)',
            fontSize: '0.875rem',
            lineHeight: 1.5,
          }}
        >
          <div>
            <strong>Họ tên:</strong> {employee.fullName}
          </div>
          <div>
            <strong>Mã nhân viên:</strong> {employee.employeeCode}
          </div>
          <div>
            <strong>Trạng thái hiện tại:</strong>{' '}
            <span className={`badge ${employee.isActive ? 'badge-success' : 'badge-danger'}`}>
              {employee.isActive ? 'Đang làm việc' : 'Ngưng hoạt động'}
            </span>
          </div>
          <div>
            <strong>Dữ liệu sinh trắc:</strong> {employee.registeredVectorCount || 0} góc khuôn mặt đã lưu trong DB
          </div>
        </div>

        {employee.isActive ? (
          <div className="field">
            <span style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '8px', display: 'block' }}>
              Chọn phương thức xử lý:
            </span>
            <div style={{ display: 'grid', gap: '10px' }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                  padding: '10px 12px',
                  borderRadius: '6px',
                  border: `1px solid ${deleteMode === 'deactivate' ? 'var(--color-primary, #2563eb)' : 'var(--color-border, #e5e7eb)'}`,
                  backgroundColor: deleteMode === 'deactivate' ? 'rgba(37, 99, 235, 0.05)' : 'transparent',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="radio"
                  name="deleteMode"
                  checked={deleteMode === 'deactivate'}
                  onChange={() => setDeleteMode('deactivate')}
                  style={{ marginTop: '3px' }}
                />
                <div>
                  <div style={{ fontWeight: 600 }}>Ngưng hoạt động (Khuyến nghị)</div>
                  <div className="muted" style={{ fontSize: '0.75rem' }}>
                    Vô hiệu hóa quyền chấm công và nhận diện, nhưng vẫn giữ lại hồ sơ, ảnh và các vector khuôn mặt để có thể khôi phục lại bất kỳ lúc nào.
                  </div>
                </div>
              </label>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                  padding: '10px 12px',
                  borderRadius: '6px',
                  border: `1px solid ${deleteMode === 'permanent' ? 'var(--status-danger-border, #f87171)' : 'var(--color-border, #e5e7eb)'}`,
                  backgroundColor: deleteMode === 'permanent' ? 'rgba(239, 68, 68, 0.05)' : 'transparent',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="radio"
                  name="deleteMode"
                  checked={deleteMode === 'permanent'}
                  onChange={() => setDeleteMode('permanent')}
                  style={{ marginTop: '3px' }}
                />
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--status-danger-text)' }}>
                    Xóa vĩnh viễn khỏi CSDL
                  </div>
                  <div className="muted" style={{ fontSize: '0.75rem' }}>
                    Xóa hoàn toàn nhân viên và tất cả vector khuôn mặt liên quan khỏi cơ sở dữ liệu. Thao tác không thể hoàn tác!
                  </div>
                </div>
              </label>
            </div>
          </div>
        ) : (
          <div
            className="alert alert-error"
            style={{
              padding: '12px',
              backgroundColor: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid var(--status-danger-border, #fca5a5)',
            }}
          >
            <Icon name="warning" size={20} />
            <div style={{ fontSize: '0.8125rem' }}>
              <strong>Cảnh báo mất dữ liệu vĩnh viễn:</strong>
              <div>
                Hành động này sẽ xóa hoàn toàn nhân viên <strong>{employee.fullName}</strong> và toàn bộ {employee.registeredVectorCount || 0} vector khuôn mặt khỏi CSDL. Thao tác này không thể hoàn tác!
              </div>
            </div>
          </div>
        )}

        <div className="app-dialog-actions" style={{ justifyContent: 'space-between' }}>
          <div>
            {!employee.isActive && (
              <button
                type="button"
                className="button button-secondary"
                onClick={() => void handleReactivateQuick()}
                disabled={isSubmitting}
                style={{ color: 'var(--status-success-text, #10b981)' }}
              >
                <Icon name="check" size={16} /> Kích hoạt lại thay vì xóa
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              className="button button-secondary"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Hủy bỏ
            </button>
            <button
              type="button"
              className={`button ${deleteMode === 'permanent' ? 'button-danger' : 'button-primary'}`}
              style={deleteMode === 'permanent' ? { backgroundColor: '#dc2626', borderColor: '#dc2626', color: '#fff' } : undefined}
              onClick={() => void handleConfirm()}
              disabled={isSubmitting}
            >
              {isSubmitting
                ? 'Đang xử lý...'
                : deleteMode === 'permanent'
                ? 'Xác nhận xóa vĩnh viễn'
                : 'Ngưng hoạt động'}
            </button>
          </div>
        </div>
      </div>
    </dialog>
  );
}
