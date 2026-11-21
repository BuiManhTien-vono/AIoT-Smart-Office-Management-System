import { useCallback, useEffect, useMemo, useState } from 'react';
import { Icon } from '../../components/common/Icon';
import type { Session } from '../../types/auth.types';
import type {
  AttendanceAdjustmentAudit,
  AttendanceRecord,
  LeaveRequest,
  AttendanceStatus,
  Shift,
} from '../../types/attendance.types';
import {
  attendanceStatusLabels,
  auditActionLabels,
  leaveTypeLabels,
} from '../../types/attendance.types';
import type { Employee } from '../../types/biometrics.types';
import {
  cancelLeave,
  evaluateAttendanceEditPermission,
  getVietnamTodayIso,
  listAttendanceAudits,
  listAttendanceLogs,
  listLeaves,
  listShifts,
  markDailyAbsent,
} from '../../services/attendanceService';
import { listEmployees } from '../../services/biometricsService';
import { signalrService } from '../../services/signalrService';
import { ShiftManagementModal } from '../../components/attendance/ShiftManagementModal';
import { LeaveRequestModal } from '../../components/attendance/LeaveRequestModal';
import { AttendanceAdjustmentModal } from '../../components/attendance/AttendanceAdjustmentModal';
import './attendance.css';

interface DailyAttendancePageProps {
  session: Session;
}

export function DailyAttendancePage({ session }: DailyAttendancePageProps) {
  const [selectedDate, setSelectedDate] = useState<string>(() => getVietnamTodayIso());
  const [activeTab, setActiveTab] = useState<'attendance' | 'leaves' | 'audits'>('attendance');
  const [tabSlideDir, setTabSlideDir] = useState<'subtab-slide-right' | 'subtab-slide-left'>('subtab-slide-right');

  const tabOrder: Array<'attendance' | 'leaves' | 'audits'> = ['attendance', 'leaves', 'audits'];
  const handleTabChange = (nextTab: 'attendance' | 'leaves' | 'audits') => {
    if (nextTab === activeTab) return;
    setTabSlideDir(
      tabOrder.indexOf(nextTab) >= tabOrder.indexOf(activeTab)
        ? 'subtab-slide-right'
        : 'subtab-slide-left'
    );
    setActiveTab(nextTab);
  };

  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [audits, setAudits] = useState<AttendanceAdjustmentAudit[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  // Status Filter for Attendance
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modals
  const [showShiftModal, setShowShiftModal] = useState<boolean>(false);
  const [showLeaveModal, setShowLeaveModal] = useState<boolean>(false);
  const [editingLeave, setEditingLeave] = useState<LeaveRequest | null>(null);
  const [showAdjustModal, setShowAdjustModal] = useState<boolean>(false);
  const [adjustingRecord, setAdjustingRecord] = useState<AttendanceRecord | null>(null);
  const [cancellingLeaveId, setCancellingLeaveId] = useState<string | null>(null);
  const [isMarkingAbsent, setIsMarkingAbsent] = useState<boolean>(false);

  const isLead = session.user.role === 'DEPT_LEAD';
  const scopedDepartmentId = isLead ? session.user.departmentId ?? undefined : undefined;
  const canManageAdjustments =
    session.user.role === 'ADMIN' || session.user.role === 'HR' || session.user.role === 'DEPT_LEAD';

  const dateEditPermission = useMemo(
    () => evaluateAttendanceEditPermission(session, selectedDate, scopedDepartmentId),
    [session, selectedDate, scopedDepartmentId]
  );

  // Fetch data
  const fetchData = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const [logsData, leavesData, empsData, shiftsData, auditsData] = await Promise.all([
          listAttendanceLogs(session.accessToken, selectedDate, signal).catch(
            () => [] as AttendanceRecord[]
          ),
          listLeaves(session.accessToken, selectedDate, signal).catch(
            () => [] as LeaveRequest[]
          ),
          listEmployees(session.accessToken, scopedDepartmentId, signal).catch(
            () => [] as Employee[]
          ),
          listShifts(session.accessToken, signal).catch(() => [] as Shift[]),
          canManageAdjustments
            ? listAttendanceAudits(
                session.accessToken,
                { fromDate: selectedDate, toDate: selectedDate },
                signal
              ).catch(() => [] as AttendanceAdjustmentAudit[])
            : Promise.resolve([] as AttendanceAdjustmentAudit[]),
        ]);

        const scopedEmpIds = new Set(empsData.map((e) => e.id));
        const scopedLogs = scopedDepartmentId
          ? logsData.filter(
              (r) => r.departmentId === scopedDepartmentId || scopedEmpIds.has(r.employeeId)
            )
          : logsData;
        const scopedLeaves = scopedDepartmentId
          ? leavesData.filter((l) => scopedEmpIds.has(l.employeeId))
          : leavesData;

        setRecords(scopedLogs);
        setLeaves(scopedLeaves);
        setEmployees(empsData);
        setShifts(shiftsData);
        setAudits(auditsData);
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        const msg = err instanceof Error ? err.message : 'Không thể tải dữ liệu điểm danh';
        setError(msg);
      } finally {
        setLoading(false);
      }
    },
    [session.accessToken, selectedDate, scopedDepartmentId, canManageAdjustments]
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
    let revoked = 0;

    for (const r of records) {
      if (r.status === 'ON_TIME') onTime++;
      else if (r.status === 'LATE') late++;
      else if (r.status === 'EARLY_LEAVE') earlyLeave++;
      else if (r.status === 'ABSENT') absent++;
      else if (r.status === 'REVOKED') revoked++;
    }

    return { total, onTime, late, earlyLeave, absent, revoked };
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
      setActionNotice(
        `Đã chốt vắng mặt thành công! Số nhân viên mới ghi nhận vắng mặt: ${res.newlyMarkedAbsentCount ?? 0}`
      );
      void fetchData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Lỗi khi chốt vắng mặt');
    } finally {
      setIsMarkingAbsent(false);
    }
  };

  const handleCancelLeave = async (leave: LeaveRequest) => {
    const empLabel = leave.employeeName || leave.employeeCode || 'nhân viên';
    if (!window.confirm(`Xác nhận hủy đơn nghỉ phép của ${empLabel}?`)) {
      return;
    }

    setCancellingLeaveId(leave.id);
    try {
      await cancelLeave(session.accessToken, leave.id);
      void fetchData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Không thể hủy đơn nghỉ phép');
    } finally {
      setCancellingLeaveId(null);
    }
  };

  const handleOpenCreateLeave = () => {
    setEditingLeave(null);
    setShowLeaveModal(true);
  };

  const handleOpenReplaceLeave = (leave: LeaveRequest) => {
    setEditingLeave(leave);
    setShowLeaveModal(true);
  };

  const handleOpenManualAttendance = () => {
    setAdjustingRecord(null);
    setShowAdjustModal(true);
  };

  const handleOpenAdjustRecord = (record: AttendanceRecord) => {
    setAdjustingRecord(record);
    setShowAdjustModal(true);
  };

  const handleAdjustmentSuccess = (notice?: string) => {
    if (notice) {
      setActionNotice(notice);
    }
    void fetchData();
  };

  const formatTime = (isoString?: string | null) => {
    if (!isoString) return '---';
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  const formatDateTime = (isoString?: string | null) => {
    if (!isoString) return '---';
    try {
      return new Intl.DateTimeFormat('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
        dateStyle: 'short',
        timeStyle: 'medium',
      }).format(new Date(isoString));
    } catch {
      return isoString;
    }
  };

  return (
    <div className="attendance-page">
      {/* Page Header */}
      <header className="page-heading">
        <div>
          <p className="eyebrow">CHẤM CÔNG &amp; VẬN HÀNH</p>
          <h1>Quản lý Chấm công &amp; Ca làm</h1>
          <p className="muted">
            Theo dõi nhật ký ra vào theo ca, điều chỉnh/hủy công có lưu vết kiểm toán và xét duyệt đơn xin nghỉ.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {canManageAdjustments && (
            <button
              type="button"
              className="button button-secondary"
              disabled={!dateEditPermission.allowed}
              title={dateEditPermission.reason ?? 'Bổ sung bản ghi công thủ công cho ngày đang xem'}
              onClick={handleOpenManualAttendance}
            >
              <Icon name="check" size={17} /> Bổ sung công
            </button>
          )}
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
            onClick={handleOpenCreateLeave}
          >
            <Icon name="calendar" size={17} /> Tạo đơn nghỉ phép
          </button>
        </div>
      </header>

      {/* Date selector & absent trigger bar */}
      <div className="panel attendance-toolbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <label
            className="field"
            style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '8px', margin: 0 }}
          >
            <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--color-muted-foreground)' }}>
              NGÀY THEO DÕI:
            </span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              style={{ width: 'auto', minWidth: '160px' }}
            />
          </label>
          {isLead && (
            <span className="badge badge-info">Phạm vi: Phòng ban của bạn</span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
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

        <div className="panel kpi-card">
          <div className="kpi-icon-wrap bg-red">
            <Icon name="close" size={20} />
          </div>
          <div className="kpi-content">
            <span className="kpi-label">Hủy công</span>
            <span className="kpi-number text-danger">{kpis.revoked}</span>
          </div>
        </div>
      </div>

      {/* Subnav Tabs */}
      <div className="subnav-tabs">
        <button
          type="button"
          className={`subnav-tab ${activeTab === 'attendance' ? 'active' : ''}`}
          onClick={() => handleTabChange('attendance')}
        >
          <Icon name="calendar" size={18} /> Nhật ký chấm công ngày ({filteredRecords.length})
        </button>
        <button
          type="button"
          className={`subnav-tab ${activeTab === 'leaves' ? 'active' : ''}`}
          onClick={() => handleTabChange('leaves')}
        >
          <Icon name="clock" size={18} /> Đơn xin nghỉ phép ({leaves.length})
        </button>
        {canManageAdjustments && (
          <button
            type="button"
            className={`subnav-tab ${activeTab === 'audits' ? 'active' : ''}`}
            onClick={() => handleTabChange('audits')}
          >
            <Icon name="overview" size={18} /> Lịch sử điều chỉnh ({audits.length})
          </button>
        )}
      </div>

      {actionNotice && (
        <div
          className="alert alert-info"
          role="status"
          style={{
            marginBottom: '16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <span>{actionNotice}</span>
          <button
            type="button"
            className="button button-ghost"
            style={{ padding: '4px 8px', height: 'auto' }}
            onClick={() => setActionNotice(null)}
          >
            Đóng
          </button>
        </div>
      )}

      {!dateEditPermission.allowed && canManageAdjustments && (
        <div className="alert alert-info" role="status" style={{ marginBottom: '16px' }}>
          <Icon name="warning" size={18} />
          <span>{dateEditPermission.reason}</span>
        </div>
      )}

      {error && (
        <div className="alert alert-error" style={{ marginBottom: '16px' }}>
          <Icon name="warning" size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* Nội dung Tab có hiệu ứng chuyển cảnh theo hướng */}
      <div key={`${activeTab}-${selectedDate}-${statusFilter}`} className={`subtab-stage ${tabSlideDir}`}>
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
                        <th>Ghi chú / Điều chỉnh</th>
                        {canManageAdjustments && <th>Thao tác</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRecords.map((r) => {
                        const statusKey = r.status as AttendanceStatus;
                        const meta = attendanceStatusLabels[statusKey] || {
                          label: r.status,
                          class: 'badge-info',
                        };
                        const rowPerm = evaluateAttendanceEditPermission(
                          session,
                          r.workDate,
                          r.departmentId
                        );
                        return (
                          <tr key={r.id}>
                            <td>
                              <strong>{r.employeeCode || '---'}</strong>
                            </td>
                            <td>
                              <div className="emp-name-cell">
                                <span className="emp-avatar" style={{ overflow: 'hidden' }}>
                                  {r.checkinSnapshotPresignedUrl ? (
                                    <img
                                      src={r.checkinSnapshotPresignedUrl}
                                      alt={r.employeeFullName || 'Snapshot'}
                                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                    />
                                  ) : (
                                    (r.employeeFullName || 'N').charAt(0).toUpperCase()
                                  )}
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
                              <div style={{ display: 'grid', gap: '3px', fontSize: '0.8125rem' }}>
                                {r.isManuallyAdjusted && (
                                  <span
                                    className="badge badge-info"
                                    style={{ width: 'fit-content', fontSize: '0.72rem' }}
                                  >
                                    Đã điều chỉnh tay
                                  </span>
                                )}
                                <span className="muted">
                                  {r.adjustmentReason || r.message || (r.isDebounced ? 'Đã debounce' : '---')}
                                </span>
                                {r.adjustedByName && (
                                  <small className="muted" style={{ fontSize: '0.74rem' }}>
                                    Bởi {r.adjustedByName}
                                  </small>
                                )}
                              </div>
                            </td>
                            {canManageAdjustments && (
                              <td>
                                <button
                                  type="button"
                                  className="button button-secondary"
                                  style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                                  title={rowPerm.reason ?? 'Điều chỉnh giờ công, ghi đè trạng thái hoặc hủy công'}
                                  onClick={() => handleOpenAdjustRecord(r)}
                                >
                                  {rowPerm.allowed ? 'Sửa / Hủy' : 'Xem lịch sử'}
                                </button>
                              </td>
                            )}
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
                      <th>Tính lương</th>
                      <th>Thời gian nghỉ</th>
                      <th>Lý do</th>
                      <th>Trạng thái</th>
                      <th>Thao tác</th>
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
                          <span className={`badge ${lv.isPaid ? 'badge-success' : 'badge-warning'}`}>
                            {lv.isPaid ? 'Có lương' : 'Không lương'}
                          </span>
                        </td>
                        <td>
                          <span style={{ fontSize: '0.875rem' }}>
                            {new Date(lv.startDate).toLocaleDateString('vi-VN')} -{' '}
                            {new Date(lv.endDate).toLocaleDateString('vi-VN')}
                            {lv.startTime && lv.endTime && (
                              <span className="muted" style={{ display: 'block', fontSize: '0.75rem' }}>
                                Khung giờ: {lv.startTime.slice(0, 5)} - {lv.endTime.slice(0, 5)}
                              </span>
                            )}
                          </span>
                        </td>
                        <td>
                          <span className="muted" style={{ fontSize: '0.875rem' }}>
                            {lv.reason || '---'}
                          </span>
                        </td>
                        <td>
                          <span
                            className={`badge ${
                              lv.approvalStatus === 'APPROVED'
                                ? 'badge-success'
                                : lv.approvalStatus === 'REJECTED' || lv.approvalStatus === 'CANCELLED'
                                ? 'badge-danger'
                                : 'badge-warning'
                            }`}
                          >
                            {lv.approvalStatus === 'APPROVED'
                              ? 'Đã duyệt'
                              : lv.approvalStatus === 'REJECTED'
                              ? 'Từ chối'
                              : lv.approvalStatus === 'CANCELLED'
                              ? 'Đã hủy'
                              : 'Chờ duyệt'}
                          </span>
                        </td>
                        <td>
                          {lv.approvalStatus === 'APPROVED' ? (
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                              <button
                                type="button"
                                className="button button-secondary"
                                style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                                disabled={cancellingLeaveId === lv.id}
                                onClick={() => handleOpenReplaceLeave(lv)}
                              >
                                Điều chỉnh
                              </button>
                              <button
                                type="button"
                                className="button button-secondary"
                                style={{
                                  padding: '4px 10px',
                                  fontSize: '0.75rem',
                                  color: 'var(--status-danger, #dc2626)',
                                }}
                                disabled={cancellingLeaveId === lv.id}
                                onClick={() => void handleCancelLeave(lv)}
                              >
                                {cancellingLeaveId === lv.id ? 'Đang hủy...' : 'Hủy đơn'}
                              </button>
                            </div>
                          ) : (
                            <span className="muted" style={{ fontSize: '0.75rem' }}>---</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* Tab 3: Lịch sử điều chỉnh & hủy công (Audit Trail) */}
        {activeTab === 'audits' && canManageAdjustments && (
          <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="table-wrap">
              {loading ? (
                <div className="empty-state">
                  <p>Đang tải lịch sử điều chỉnh công...</p>
                </div>
              ) : audits.length === 0 ? (
                <div className="empty-state">
                  <Icon name="overview" size={48} style={{ opacity: 0.4, margin: '0 auto 8px' }} />
                  <p>Chưa có lượt chỉnh sửa hoặc hủy công nào cho ngày {selectedDate}.</p>
                </div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Thời điểm</th>
                      <th>Nhân viên</th>
                      <th>Hành động</th>
                      <th>Trạng thái (Cũ → Mới)</th>
                      <th>Giờ vào / ra mới</th>
                      <th>Lý do</th>
                      <th>Người thực hiện</th>
                    </tr>
                  </thead>
                  <tbody>
                    {audits.map((a) => {
                      const actionMeta = auditActionLabels[a.actionType] ?? {
                        label: a.actionType,
                        class: 'badge-neutral',
                      };
                      const prevLabel = a.previousStatus
                        ? attendanceStatusLabels[a.previousStatus]?.label ?? a.previousStatus
                        : 'Chưa có';
                      const nextLabel = a.newStatus
                        ? attendanceStatusLabels[a.newStatus]?.label ?? a.newStatus
                        : 'Đã gỡ bản ghi';
                      return (
                        <tr key={a.id}>
                          <td>
                            <span className="time-mono" style={{ fontSize: '0.8rem' }}>
                              {formatDateTime(a.createdAt)}
                            </span>
                          </td>
                          <td>
                            <strong>{a.employeeCode}</strong>
                            <div className="muted" style={{ fontSize: '0.78rem' }}>
                              {a.employeeFullName}
                            </div>
                          </td>
                          <td>
                            <span className={`badge ${actionMeta.class}`}>{actionMeta.label}</span>
                            {a.isStatusOverridden && (
                              <div style={{ marginTop: '4px' }}>
                                <span className="badge badge-special" style={{ fontSize: '0.7rem' }}>
                                  Ghi đè thủ công
                                </span>
                              </div>
                            )}
                          </td>
                          <td style={{ fontSize: '0.84rem' }}>
                            <span className="muted">{prevLabel}</span> → <strong>{nextLabel}</strong>
                          </td>
                          <td>
                            <span className="time-mono" style={{ fontSize: '0.8rem' }}>
                              {formatTime(a.newCheckInTime)} – {formatTime(a.newCheckOutTime)}
                            </span>
                          </td>
                          <td style={{ fontSize: '0.84rem', maxWidth: '280px' }}>{a.reason}</td>
                          <td style={{ fontSize: '0.82rem' }}>
                            <strong>{a.adjustedByName}</strong>
                            <div className="muted" style={{ fontSize: '0.74rem' }}>
                              {a.adjustedByRole}
                              {a.sourceScreen ? ` · ${a.sourceScreen}` : ''}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Shift Management Modal */}
      <ShiftManagementModal
        isOpen={showShiftModal}
        onClose={() => setShowShiftModal(false)}
        token={session.accessToken}
      />

      {/* Leave Request Modal */}
      <LeaveRequestModal
        key={`${showLeaveModal}-${editingLeave?.id ?? 'new'}`}
        isOpen={showLeaveModal}
        onClose={() => {
          setShowLeaveModal(false);
          setEditingLeave(null);
        }}
        token={session.accessToken}
        employees={employees}
        editingLeave={editingLeave}
        onSuccess={() => void fetchData()}
      />

      {/* Attendance Adjustment / Cancel / Audit Modal */}
      <AttendanceAdjustmentModal
        key={`${showAdjustModal}-${adjustingRecord?.id ?? 'new'}-${selectedDate}`}
        isOpen={showAdjustModal}
        onClose={() => {
          setShowAdjustModal(false);
          setAdjustingRecord(null);
        }}
        session={session}
        employees={employees}
        shifts={shifts}
        record={adjustingRecord}
        defaultDate={selectedDate}
        sourceScreen="DAILY_LOG"
        onSuccess={handleAdjustmentSuccess}
      />
    </div>
  );
}
