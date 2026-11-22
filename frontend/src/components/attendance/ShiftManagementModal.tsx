import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '../common/Icon';
import type { Shift, CreateShiftInput } from '../../types/attendance.types';
import { listShifts, createShift, updateShift, deleteShift } from '../../services/attendanceService';

function toTimeInput(value?: string): string {
  if (!value) return '';
  return value.length >= 5 ? value.slice(0, 5) : value;
}

interface ShiftManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: string;
}

export function ShiftManagementModal({ isOpen, onClose, token }: ShiftManagementModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [showCreateForm, setShowCreateForm] = useState<boolean>(false);
  const [editingShiftId, setEditingShiftId] = useState<string | null>(null);
  const [shiftCode, setShiftCode] = useState<string>('CA_HC');
  const [shiftName, setShiftName] = useState<string>('Hành chính 8h-17h');
  const [startTime, setStartTime] = useState<string>('08:00');
  const [endTime, setEndTime] = useState<string>('17:00');
  const [graceMinutes, setGraceMinutes] = useState<number>(15);
  const [hasBreak, setHasBreak] = useState<boolean>(false);
  const [lunchStart, setLunchStart] = useState<string>('');
  const [lunchEnd, setLunchEnd] = useState<string>('');
  const [isDefault, setIsDefault] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [deletingShiftId, setDeletingShiftId] = useState<string | null>(null);

  const loadShifts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listShifts(token);
      setShifts(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Không thể tải danh sách ca làm');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      if (!dialog.open) {
        dialog.showModal();
      }
      void loadShifts();
      setShowCreateForm(false);
      setEditingShiftId(null);
    } else {
      if (dialog.open) {
        dialog.close();
      }
    }
  }, [isOpen, loadShifts]);

  const openCreateForm = () => {
    setEditingShiftId(null);
    setShiftCode('CA_HC');
    setShiftName('Hành chính 8h-17h');
    setStartTime('08:00');
    setEndTime('17:00');
    setGraceMinutes(15);
    setHasBreak(false);
    setLunchStart('');
    setLunchEnd('');
    setIsDefault(false);
    setError(null);
    setShowCreateForm(true);
  };

  const openEditForm = (shift: Shift) => {
    const startBreak = toTimeInput(shift.lunchStart);
    const endBreak = toTimeInput(shift.lunchEnd);
    setEditingShiftId(shift.id);
    setShiftCode(shift.shiftCode);
    setShiftName(shift.shiftName);
    setStartTime(toTimeInput(shift.startTime));
    setEndTime(toTimeInput(shift.endTime));
    setGraceMinutes(shift.graceMinutes);
    setHasBreak(Boolean(startBreak && endBreak));
    setLunchStart(startBreak);
    setLunchEnd(endBreak);
    setIsDefault(shift.isDefault);
    setError(null);
    setShowCreateForm(true);
  };

  const closeForm = () => {
    setShowCreateForm(false);
    setEditingShiftId(null);
  };

  const handleDeleteShift = async (shift: Shift) => {
    if (!window.confirm(`Xác nhận xóa ca làm việc "${shift.shiftCode} - ${shift.shiftName}"?`)) {
      return;
    }

    setDeletingShiftId(shift.id);
    setError(null);
    try {
      await deleteShift(token, shift.id);
      if (editingShiftId === shift.id) {
        closeForm();
      }
      void loadShifts();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Không thể xóa ca làm việc');
    } finally {
      setDeletingShiftId(null);
    }
  };

  const handleCreateShift = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const payload: CreateShiftInput = {
        shiftCode: shiftCode.trim().toUpperCase(),
        shiftName: shiftName.trim(),
        startTime: `${startTime}:00`,
        endTime: `${endTime}:00`,
        graceMinutes,
        lunchStart: hasBreak && lunchStart ? `${lunchStart}:00` : undefined,
        lunchEnd: hasBreak && lunchEnd ? `${lunchEnd}:00` : undefined,
        isDefault,
      };

      if (editingShiftId) {
        await updateShift(token, editingShiftId, payload);
      } else {
        await createShift(token, payload);
      }
      closeForm();
      void loadShifts();
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : editingShiftId
            ? 'Lỗi khi cập nhật ca làm việc'
            : 'Lỗi khi tạo ca làm việc'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <dialog
      ref={dialogRef}
      className="app-dialog app-dialog-lg"
      aria-labelledby="shift-modal-title"
      onClose={onClose}
    >
      <div className="app-dialog-heading">
        <div>
          <p className="eyebrow">CHẤM CÔNG & CA LÀM</p>
          <h2 id="shift-modal-title">Cấu hình Ca làm việc</h2>
          <p className="muted">Thiết lập khung giờ chấm công, ân hạn đi muộn và thời gian nghỉ trưa.</p>
        </div>
        <button
          type="button"
          className="button button-secondary app-dialog-close"
          aria-label="Đóng"
          onClick={onClose}
        >
          <Icon name="close" size={18} />
        </button>
      </div>

      <div>
        {error && (
          <div className="alert alert-error" role="alert">
            <Icon name="warning" size={18} />
            <span>{error}</span>
          </div>
        )}

        <div style={{ marginBottom: '16px' }}>
          <button
            type="button"
            className="button button-primary"
            onClick={() => (showCreateForm ? closeForm() : openCreateForm())}
          >
            <Icon name={showCreateForm ? 'close' : 'userPlus'} size={16} />
            {showCreateForm
              ? editingShiftId
                ? 'Đóng biểu mẫu chỉnh sửa'
                : 'Đóng biểu mẫu tạo ca'
              : 'Thêm ca làm việc mới'}
          </button>
        </div>

        {showCreateForm && (
          <form onSubmit={handleCreateShift} className="panel" style={{ marginBottom: '20px', padding: '16px' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: '1rem', fontWeight: 600 }}>
              {editingShiftId ? `Chỉnh sửa ca làm việc (${shiftCode})` : 'Tạo ca làm việc mới'}
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
              <label className="field">
                <span>Mã ca *</span>
                <input
                  type="text"
                  required
                  placeholder="CA_SANG, CA_TOI"
                  value={shiftCode}
                  onChange={(e) => setShiftCode(e.target.value)}
                />
              </label>

              <label className="field">
                <span>Tên ca *</span>
                <input
                  type="text"
                  required
                  placeholder="Ca sáng (08:00 - 12:00)"
                  value={shiftName}
                  onChange={(e) => setShiftName(e.target.value)}
                />
              </label>

              <label className="field">
                <span>Giờ bắt đầu *</span>
                <input
                  type="time"
                  required
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </label>

              <label className="field">
                <span>Giờ kết thúc *</span>
                <input
                  type="time"
                  required
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                />
              </label>

              <label className="field">
                <span>Thời gian ân hạn (Phút)</span>
                <input
                  type="number"
                  min="0"
                  max="60"
                  value={graceMinutes}
                  onChange={(e) => setGraceMinutes(Number(e.target.value))}
                />
              </label>

              <label className="field" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '8px', paddingTop: '24px' }}>
                <input
                  type="checkbox"
                  style={{ width: '18px', height: '18px', margin: 0 }}
                  checked={isDefault}
                  onChange={(e) => setIsDefault(e.target.checked)}
                />
                <span>Ca mặc định toàn công ty</span>
              </label>

              <label className="field" style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '8px', paddingTop: '4px' }}>
                <input
                  type="checkbox"
                  style={{ width: '18px', height: '18px', margin: 0 }}
                  checked={hasBreak}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setHasBreak(checked);
                    if (!checked) {
                      setLunchStart('');
                      setLunchEnd('');
                    }
                  }}
                />
                <span>Có nghỉ</span>
              </label>

              <label className="field">
                <span>Bắt đầu nghỉ</span>
                <input
                  type="time"
                  disabled={!hasBreak}
                  required={hasBreak}
                  value={hasBreak ? lunchStart : ''}
                  onChange={(e) => setLunchStart(e.target.value)}
                />
              </label>

              <label className="field">
                <span>Kết thúc nghỉ</span>
                <input
                  type="time"
                  disabled={!hasBreak}
                  required={hasBreak}
                  value={hasBreak ? lunchEnd : ''}
                  onChange={(e) => setLunchEnd(e.target.value)}
                />
              </label>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
              <button
                type="button"
                className="button button-secondary"
                onClick={closeForm}
              >
                Hủy
              </button>
              <button
                type="submit"
                className="button button-primary"
                disabled={isSubmitting}
              >
                {isSubmitting
                  ? editingShiftId
                    ? 'Đang cập nhật...'
                    : 'Đang tạo...'
                  : editingShiftId
                    ? 'Cập nhật ca làm việc'
                    : 'Lưu ca làm việc'}
              </button>
            </div>
          </form>
        )}

        {/* Existing shifts list */}
        <div className="table-wrap">
          {loading ? (
            <div className="empty-state">
              <p>Đang tải danh sách ca...</p>
            </div>
          ) : shifts.length === 0 ? (
            <div className="empty-state">
              <p>Chưa có ca làm việc nào được định nghĩa.</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Mã ca</th>
                  <th>Tên ca</th>
                  <th>Khung giờ</th>
                  <th>Nghỉ trưa</th>
                  <th>Ân hạn</th>
                  <th>Mặc định</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {shifts.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <button
                        type="button"
                        onClick={() => openEditForm(s)}
                        title="Nhấn để chỉnh sửa ca làm việc"
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          color: 'var(--primary, #2563eb)',
                          fontWeight: 700,
                          cursor: 'pointer',
                          textDecoration: 'underline',
                        }}
                      >
                        {s.shiftCode}
                      </button>
                    </td>
                    <td>{s.shiftName}</td>
                    <td>
                      <span className="badge badge-info">
                        {s.startTime} - {s.endTime}
                      </span>
                    </td>
                    <td>
                      {s.lunchStart && s.lunchEnd
                        ? `${s.lunchStart} - ${s.lunchEnd}`
                        : 'Không'}
                    </td>
                    <td>{s.graceMinutes} phút</td>
                    <td>
                      {s.isDefault ? (
                        <span className="badge badge-success">Mặc định</span>
                      ) : (
                        <span className="muted">---</span>
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="button button-secondary"
                        style={{ padding: '4px 10px', fontSize: '0.82rem', color: 'var(--danger, #dc2626)' }}
                        disabled={deletingShiftId === s.id || s.isDefault}
                        title={s.isDefault ? 'Không thể xóa ca mặc định' : 'Xóa ca làm việc'}
                        onClick={() => void handleDeleteShift(s)}
                      >
                        {deletingShiftId === s.id ? 'Đang xóa...' : 'Xóa'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="app-dialog-actions">
        <button type="button" className="button button-secondary" onClick={onClose}>
          Đóng
        </button>
      </div>
    </dialog>
  );
}
