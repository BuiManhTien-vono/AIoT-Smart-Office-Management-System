import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '../common/Icon';
import type { Shift, CreateShiftInput } from '../../types/attendance.types';
import { listShifts, createShift } from '../../services/attendanceService';

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
  const [shiftCode, setShiftCode] = useState<string>('CA_HC');
  const [shiftName, setShiftName] = useState<string>('Hành chính 8h-17h');
  const [startTime, setStartTime] = useState<string>('08:00');
  const [endTime, setEndTime] = useState<string>('17:00');
  const [graceMinutes, setGraceMinutes] = useState<number>(15);
  const [lunchStart, setLunchStart] = useState<string>('12:00');
  const [lunchEnd, setLunchEnd] = useState<string>('13:00');
  const [isDefault, setIsDefault] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

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
    } else {
      if (dialog.open) {
        dialog.close();
      }
    }
  }, [isOpen, loadShifts]);

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
        lunchStart: lunchStart ? `${lunchStart}:00` : undefined,
        lunchEnd: lunchEnd ? `${lunchEnd}:00` : undefined,
        isDefault,
      };

      await createShift(token, payload);
      setShowCreateForm(false);
      void loadShifts();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Lỗi khi tạo ca làm việc');
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
            onClick={() => setShowCreateForm(!showCreateForm)}
          >
            <Icon name={showCreateForm ? 'close' : 'userPlus'} size={16} />
            {showCreateForm ? 'Đóng biểu mẫu tạo ca' : 'Thêm ca làm việc mới'}
          </button>
        </div>

        {showCreateForm && (
          <form onSubmit={handleCreateShift} className="panel" style={{ marginBottom: '20px', padding: '16px' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: '1rem', fontWeight: 600 }}>Tạo ca làm việc mới</h3>
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

              <label className="field">
                <span>Bắt đầu nghỉ trưa</span>
                <input
                  type="time"
                  value={lunchStart}
                  onChange={(e) => setLunchStart(e.target.value)}
                />
              </label>

              <label className="field">
                <span>Kết thúc nghỉ trưa</span>
                <input
                  type="time"
                  value={lunchEnd}
                  onChange={(e) => setLunchEnd(e.target.value)}
                />
              </label>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setShowCreateForm(false)}
              >
                Hủy
              </button>
              <button
                type="submit"
                className="button button-primary"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Đang tạo...' : 'Lưu ca làm việc'}
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
                </tr>
              </thead>
              <tbody>
                {shifts.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <strong>{s.shiftCode}</strong>
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
