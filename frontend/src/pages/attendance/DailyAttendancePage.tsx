import { useCallback, useEffect, useMemo, useState } from 'react';
import { Icon } from '../../components/common/Icon';
import type { Session } from '../../types/auth.types';
import type {
  AttendanceRecord,
  LeaveRequest,
  AttendanceStatus,
} from '../../types/attendance.types';
import {
  attendanceStatusLabels,
  leaveTypeLabels,
} from '../../types/attendance.types';
import type { Employee } from '../../types/biometrics.types';
import {
  listAttendanceLogs,
  listLeaves,
  markDailyAbsent,
} from '../../services/attendanceService';
import { listEmployees } from '../../services/biometricsService';
import { signalrService } from '../../services/signalrService';
import { ShiftManagementModal } from '../../components/attendance/ShiftManagementModal';
import { LeaveRequestModal } from '../../components/attendance/LeaveRequestModal';
import './attendance.css';

interface DailyAttendancePageProps {
  session: Session;
}

export function DailyAttendancePage({ session }: DailyAttendancePageProps) {
  const [selectedDate, setSelectedDate] = useState<string>(
    () => new Date().toISOString().split('T')[0]
  );
  const [activeTab, setActiveTab] = useState<'attendance' | 'leaves'>('attendance');
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Status Filter for Attendance
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modals
  const [showShiftModal, setShowShiftModal] = useState<boolean>(false);
  const [showLeaveModal, setShowLeaveModal] = useState<boolean>(false);
  const [isMarkingAbsent, setIsMarkingAbsent] = useState<boolean>(false);

  // Fetch data
  const fetchData = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const [logsData, leavesData, empsData] = await Promise.all([
          listAttendanceLogs(session.accessToken, selectedDate, signal).catch(
            () => [] as AttendanceRecord[]
          ),
          listLeaves(session.accessToken, selectedDate, signal).catch(
            () => [] as LeaveRequest[]
          ),
          listEmployees(session.accessToken, undefined, signal).catch(
            () => [] as Employee[]
          ),
        ]);
        setRecords(logsData);
        setLeaves(leavesData);
        setEmployees(empsData);
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        const msg = err instanceof Error ? err.message : 'Không thể tải dữ liệu điểm danh';
        setError(msg);
      } finally {
        setLoading(false);
      }
    },
    [session.accessToken, selectedDate]
  );

  useEffect(() => {
    const controller = new AbortController();
    void fetchData(controller.signal);
    return () => controller.abort();
  }, [fetchData]);

  // Lắng nghe sự kiện điểm danh thời gian thực qua SignalR
  useEffect(() => {
    const unsub = signalrService.onAttendanceRecorded(() => {
      void fetchData();
    });
    return unsub;
  }, [fetchData]);

  // KPIs
  const kpis = useMemo(() => {
    let total = records.length;
    let onTime = 0;
    let late = 0;
    let earlyLeave = 0;
    let absent = 0;

    for (const r of records) {
      if (r.status === 'ON_TIME') onTime++;
      else if (r.status === 'LATE') late++;
      else if (r.status === 'EARLY_LEAVE') earlyLeave++;
      else if (r.status === 'ABSENT') absent++;
    }

    return { total, onTime, late, earlyLeave, absent };
  }, [records]);

  // Filtered records
  const filteredRecords = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return records.filter((r) => {
      const matchStatus = statusFilter === 'ALL' || r.status === statusFilter;
      const matchSearch =
        !query ||
        r.employeeFullName?.toLowerCase().includes(query) ||
        r.employeeCode?.toLowerCase().includes(query);
      return matchStatus && matchSearch;
    });
  }, [records, statusFilter, searchQuery]);

  // Mark absent action
  const handleMarkAbsent = async () => {
    if (
      !window.confirm(
        `Xác nhận chốt vắng mặt cho ngày ${selectedDate}? Các nhân viên chưa có chấm công sẽ được ghi nhận là Vắng mặt.`
      )
    ) {
      return;
    }

    setIsMarkingAbsent(true);
    try {
      const res = await markDailyAbsent(session.accessToken, selectedDate);
      alert(
        `Đã chốt vắng mặt thành công! Số nhân viên mới ghi nhận vắng mặt: ${res.newlyMarkedAbsentCount ?? 0}`
      );
      void fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Lỗi khi chốt vắng mặt');
    } finally {
      setIsMarkingAbsent(false);
    }
  };

  const formatTime = (isoString?: string | null) => {
    if (!isoString) return '---';
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="attendance-page">
      {/* Page Header */}
      <header className="page-heading">
        <div>
          <p className="eyebrow">CHẤM CÔNG & VẬN HÀNH</p>
          <h1>Quản lý Chấm công & Ca làm</h1>
          <p className="muted">Theo dõi nhật ký ra vào theo ca, thống kê đi muộn/về sớm và xét duyệt đơn xin nghỉ.</p>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => setShowShiftModal(true)}
          >
            <Icon name="clock" size={17} /> Cấu hình ca
          </button>
          <button
            type="button"
            className="button button-primary"
            onClick={() => setShowLeaveModal(true)}
          >
            <Icon name="calendar" size={17} /> Tạo đơn nghỉ phép
          </button>
        </div>
      </header>

      {/* Date selector & absent trigger bar */}
      <div className="panel attendance-toolbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <label className="field" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '8px', margin: 0 }}>
            <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--color-muted-foreground)' }}>NGÀY THEO DÕI:</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              style={{ width: 'auto', minWidth: '160px' }}
            />
          </label>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            type="button"
            className="button"
            style={{
              background: 'var(--status-warning)',
              borderColor: 'var(--status-warning)',
              color: '#ffffff',
            }}
            onClick={handleMarkAbsent}
            disabled={isMarkingAbsent}
            title="Đánh dấu vắng mặt cho các nhân viên không có bản ghi hôm nay"
          >
            <Icon name="clock" size={16} />
            {isMarkingAbsent ? 'Đang chốt…' : 'Chốt vắng mặt cuối ngày'}
          </button>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => void fetchData()}
            title="Làm mới dữ liệu"
          >
            <Icon name="refresh" size={16} /> Làm mới
          </button>
        </div>
      </div>

      {/* KPI Cards Row */}
      <div className="kpi-grid">
        <div className="panel kpi-card">
          <div className="kpi-icon-wrap bg-blue">
            <Icon name="overview" size={20} />
          </div>
          <div className="kpi-content">
            <span className="kpi-label">Tổng lượt ghi nhận</span>
            <span className="kpi-number">{kpis.total}</span>
          </div>
        </div>

        <div className="panel kpi-card">
          <div className="kpi-icon-wrap bg-green">
            <Icon name="check" size={20} />
          </div>
          <div className="kpi-content">
            <span className="kpi-label">Đúng giờ</span>
            <span className="kpi-number text-success">{kpis.onTime}</span>
          </div>
        </div>

        <div className="panel kpi-card">
          <div className="kpi-icon-wrap bg-yellow">
            <Icon name="clock" size={20} />
          </div>
          <div className="kpi-content">
            <span className="kpi-label">Đi muộn</span>
            <span className="kpi-number text-warning">{kpis.late}</span>
          </div>
        </div>

        <div className="panel kpi-card">
          <div className="kpi-icon-wrap bg-purple">
            <Icon name="arrow" size={20} />
          </div>
          <div className="kpi-content">
            <span className="kpi-label">Về sớm</span>
            <span className="kpi-number text-special">{kpis.earlyLeave}</span>
          </div>
        </div>

        <div className="panel kpi-card">
          <div className="kpi-icon-wrap bg-red">
            <Icon name="warning" size={20} />
          </div>
          <div className="kpi-content">
            <span className="kpi-label">Vắng mặt</span>
            <span className="kpi-number text-danger">{kpis.absent}</span>
          </div>
        </div>
      </div>

      {/* Subnav Tabs */}
      <div className="subnav-tabs">
        <button
          type="button"
          className={`subnav-tab ${activeTab === 'attendance' ? 'active' : ''}`}
          onClick={() => setActiveTab('attendance')}
        >
          <Icon name="calendar" size={18} /> Nhật ký chấm công ngày ({filteredRecords.length})
        </button>
        <button
          type="button"
          className={`subnav-tab ${activeTab === 'leaves' ? 'active' : ''}`}
          onClick={() => setActiveTab('leaves')}
        >
          <Icon name="clock" size={18} /> Đơn xin nghỉ phép ({leaves.length})
        </button>
      </div>

      {error && (
        <div className="alert alert-error" style={{ marginBottom: '16px' }}>
          <Icon name="warning" size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* Tab 1: Attendance Logs */}
      {activeTab === 'attendance' && (
        <>
          <div className="panel attendance-filter-toolbar">
            <label className="field" style={{ minWidth: '180px' }}>
              <span className="field-caption">TRẠNG THÁI</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="ALL">Tất cả trạng thái</option>
                {Object.entries(attendanceStatusLabels).map(([k, meta]) => (
                  <option key={k} value={k}>
                    {meta.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field" style={{ flex: 1, minWidth: '260px' }}>
              <span className="field-caption">TÌM KIẾM</span>
              <input
                type="search"
                placeholder="Nhập tên nhân viên, mã nhân viên..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </label>
          </div>

          <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="table-wrap">
              {loading ? (
                <div className="empty-state">
                  <p>Đang tải dữ liệu chấm công...</p>
                </div>
              ) : filteredRecords.length === 0 ? (
                <div className="empty-state">
                  <Icon name="calendar" size={48} style={{ opacity: 0.4, margin: '0 auto 8px' }} />
                  <p>Không có lượt chấm công nào trong ngày này.</p>
                </div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Mã NV</th>
                      <th>Họ và tên</th>
                      <th>Giờ vào (Check-in)</th>
                      <th>Giờ ra (Check-out)</th>
                      <th>Đi muộn / Về sớm</th>
                      <th>Trạng thái</th>
                      <th>Ghi chú</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRecords.map((r) => {
                      const statusKey = r.status as AttendanceStatus;
                      const meta = attendanceStatusLabels[statusKey] || {
                        label: r.status,
                        class: 'badge-info',
                      };
                      return (
                        <tr key={r.id}>
                          <td>
                            <strong>{r.employeeCode || '---'}</strong>
                          </td>
                          <td>
                            <div className="emp-name-cell">
                              <span className="emp-avatar">
                                {(r.employeeFullName || 'N').charAt(0).toUpperCase()}
                              </span>
                              <span>{r.employeeFullName || 'Nhân viên'}</span>
                            </div>
                          </td>
                          <td>
                            <span className="time-mono">
                              {formatTime(r.checkInTime)}
                            </span>
                          </td>
                          <td>
                            <span className="time-mono">
                              {formatTime(r.checkOutTime)}
                            </span>
                          </td>
                          <td>
                            {r.lateMinutes > 0 && (
                              <span className="badge badge-warning" style={{ marginRight: '6px' }}>
                                Muộn {r.lateMinutes}p
                              </span>
                            )}
                            {r.earlyLeaveMinutes > 0 && (
                              <span className="badge badge-special">
                                Sớm {r.earlyLeaveMinutes}p
                              </span>
                            )}
                            {r.lateMinutes === 0 && r.earlyLeaveMinutes === 0 && (
                              <span className="muted">---</span>
                            )}
                          </td>
                          <td>
                            <span className={`badge ${meta.class}`}>{meta.label}</span>
                          </td>
                          <td>
                            <span className="muted" style={{ fontSize: '0.8125rem' }}>
                              {r.message || (r.isDebounced ? 'Đã debounce' : '---')}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}

      {/* Tab 2: Leaves List */}
      {activeTab === 'leaves' && (
        <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="table-wrap">
            {loading ? (
              <div className="empty-state">
                <p>Đang tải danh sách đơn nghỉ phép...</p>
              </div>
            ) : leaves.length === 0 ? (
              <div className="empty-state">
                <Icon name="calendar" size={48} style={{ opacity: 0.4, margin: '0 auto 8px' }} />
                <p>Không có đơn xin nghỉ phép nào cho khoảng thời gian này.</p>
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Mã NV</th>
                    <th>Họ và tên</th>
                    <th>Loại nghỉ phép</th>
                    <th>Thời gian nghỉ</th>
                    <th>Lý do</th>
                    <th>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {leaves.map((lv) => (
                    <tr key={lv.id}>
                      <td>
                        <strong>{lv.employeeCode || '---'}</strong>
                      </td>
                      <td>{lv.employeeName || 'Nhân viên'}</td>
                      <td>
                        <span className="badge badge-info">
                          {leaveTypeLabels[lv.leaveType] || lv.leaveType}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontSize: '0.875rem' }}>
                          {new Date(lv.startDate).toLocaleDateString('vi-VN')} -{' '}
                          {new Date(lv.endDate).toLocaleDateString('vi-VN')}
                        </span>
                      </td>
                      <td>
                        <span className="muted" style={{ fontSize: '0.875rem' }}>{lv.reason || '---'}</span>
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            lv.approvalStatus === 'APPROVED'
                              ? 'badge-success'
                              : lv.approvalStatus === 'REJECTED'
                              ? 'badge-danger'
                              : 'badge-warning'
                          }`}
                        >
                          {lv.approvalStatus === 'APPROVED'
                            ? 'Đã duyệt'
                            : lv.approvalStatus === 'REJECTED'
                            ? 'Từ chối'
                            : 'Chờ duyệt'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Shift Management Modal */}
      <ShiftManagementModal
        isOpen={showShiftModal}
        onClose={() => setShowShiftModal(false)}
        token={session.accessToken}
      />

      {/* Leave Request Modal */}
      <LeaveRequestModal
        isOpen={showLeaveModal}
        onClose={() => setShowLeaveModal(false)}
        token={session.accessToken}
        employees={employees}
        onSuccess={() => void fetchData()}
      />
    </div>
  );
}
