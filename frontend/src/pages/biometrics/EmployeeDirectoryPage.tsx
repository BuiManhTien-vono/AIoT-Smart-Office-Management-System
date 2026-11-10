import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../../components/common/Icon';
import type { Session } from '../../types/auth.types';
import type { Department, Employee } from '../../types/biometrics.types';
import {
  listDepartments,
  listEmployees,
  createDepartment,
  deactivateEmployee,
} from '../../services/biometricsService';
import { FaceEnrollmentModal } from '../../components/biometrics/FaceEnrollmentModal';
import { CreateEmployeeWithBiometricsModal } from '../../components/biometrics/CreateEmployeeWithBiometricsModal';
import { LiveGateCheckinCard } from '../../components/biometrics/LiveGateCheckinCard';
import './biometrics.css';

interface EmployeeDirectoryPageProps {
  session: Session;
}

export function EmployeeDirectoryPage({ session }: EmployeeDirectoryPageProps) {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedDeptId, setSelectedDeptId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Active view tab: 'directory' (Đăng ký & Quản lý nhân viên) or 'gate_test' (Quét mặt Chấm công)
  const [activeTab, setActiveTab] = useState<'directory' | 'gate_test'>('directory');

  // Modals state
  const [showAddDeptModal, setShowAddDeptModal] = useState<boolean>(false);
  const [showAddEmpModal, setShowAddEmpModal] = useState<boolean>(false);
  const [enrollingEmployee, setEnrollingEmployee] = useState<Employee | null>(null);

  const addDeptDialogRef = useRef<HTMLDialogElement>(null);

  // Add Department Form state
  const [newDeptCode, setNewDeptCode] = useState<string>('');
  const [newDeptName, setNewDeptName] = useState<string>('');
  const [newDeptDesc, setNewDeptDesc] = useState<string>('');
  const [isSubmittingDept, setIsSubmittingDept] = useState<boolean>(false);

  // Dialog open triggers
  useEffect(() => {
    const el = addDeptDialogRef.current;
    if (showAddDeptModal) {
      if (!el?.open) el?.showModal();
    } else {
      if (el?.open) el?.close();
    }
  }, [showAddDeptModal]);

  // Fetch initial data
  const fetchData = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const [deptsData, empsData] = await Promise.all([
          listDepartments(session.accessToken, signal).catch(() => [] as Department[]),
          listEmployees(session.accessToken, selectedDeptId || undefined, signal).catch(
            () => [] as Employee[]
          ),
        ]);
        setDepartments(deptsData);
        setEmployees(empsData);
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        const msg = err instanceof Error ? err.message : 'Lỗi khi tải danh sách nhân viên';
        setError(msg);
      } finally {
        setLoading(false);
      }
    },
    [session.accessToken, selectedDeptId]
  );

  useEffect(() => {
    const controller = new AbortController();
    void fetchData(controller.signal);
    return () => controller.abort();
  }, [fetchData]);

  // Filtered employees
  const filteredEmployees = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return employees.filter((emp) => {
      const matchDept = !selectedDeptId || emp.departmentId === selectedDeptId;
      const matchSearch =
        !query ||
        emp.fullName.toLowerCase().includes(query) ||
        emp.employeeCode.toLowerCase().includes(query) ||
        (emp.email && emp.email.toLowerCase().includes(query));
      return matchDept && matchSearch;
    });
  }, [employees, selectedDeptId, searchQuery]);

  // Handle Add Department
  const handleCreateDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDeptCode || !newDeptName) return;

    setIsSubmittingDept(true);
    try {
      await createDepartment(session.accessToken, {
        departmentCode: newDeptCode.trim().toUpperCase(),
        departmentName: newDeptName.trim(),
        description: newDeptDesc.trim() || undefined,
      });
      setShowAddDeptModal(false);
      setNewDeptCode('');
      setNewDeptName('');
      setNewDeptDesc('');
      void fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Không thể tạo phòng ban');
    } finally {
      setIsSubmittingDept(false);
    }
  };

  // Handle Deactivate Employee
  const handleDeactivate = async (emp: Employee) => {
    if (
      !window.confirm(
        `Bạn có chắc chắn muốn ngưng kích hoạt nhân viên ${emp.fullName} (${emp.employeeCode})?`
      )
    ) {
      return;
    }

    try {
      await deactivateEmployee(session.accessToken, emp.id);
      void fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Lỗi khi ngưng kích hoạt');
    }
  };

  return (
    <div className="biometrics-page">
      {/* Page Header */}
      <header className="page-heading">
        <div>
          <p className="eyebrow">SINH TRẮC HỌC & NHÂN SỰ</p>
          <h1>Quản lý Sinh trắc & Chấm công</h1>
          <p className="muted">
            Bao gồm 2 phân hệ cốt lõi: Đăng ký nhân viên tích hợp quét khuôn mặt AI lưu vào CSDL, và Cổng quét mặt chấm công trực tiếp.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => setShowAddDeptModal(true)}
          >
            <Icon name="office" size={17} /> Thêm phòng ban
          </button>
          <button
            type="button"
            className="button button-primary"
            onClick={() => setShowAddEmpModal(true)}
          >
            <Icon name="userPlus" size={17} /> Đăng ký nhân viên (Quét mặt AI)
          </button>
        </div>
      </header>

      {/* Tabs navigation: Rõ ràng 2 phần Đăng ký nhân viên & Quét mặt Chấm công */}
      <div className="subnav-tabs">
        <button
          type="button"
          className={`subnav-tab ${activeTab === 'directory' ? 'active' : ''}`}
          onClick={() => setActiveTab('directory')}
        >
          <Icon name="users" size={18} /> 1. Đăng ký & Danh bạ nhân viên ({filteredEmployees.length})
        </button>
        <button
          type="button"
          className={`subnav-tab ${activeTab === 'gate_test' ? 'active' : ''}`}
          onClick={() => setActiveTab('gate_test')}
        >
          <Icon name="camera" size={18} /> 2. Quét mặt Chấm công (Camera Kiosk)
        </button>
      </div>

      {/* Tab 2: Chấm công quét mặt */}
      {activeTab === 'gate_test' ? (
        <LiveGateCheckinCard />
      ) : (
        <>
          {/* Filters Bar */}
          <div className="panel biometrics-filter-toolbar">
            <label className="field" style={{ minWidth: '220px' }}>
              <span className="field-caption">PHÒNG BAN</span>
              <select
                value={selectedDeptId}
                onChange={(e) => setSelectedDeptId(e.target.value)}
              >
                <option value="">Tất cả phòng ban ({departments.length})</option>
                {departments.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.departmentName} ({dept.departmentCode})
                  </option>
                ))}
              </select>
            </label>

            <label className="field" style={{ flex: 1, minWidth: '260px' }}>
              <span className="field-caption">TÌM KIẾM NHÂN VIÊN</span>
              <input
                type="search"
                placeholder="Nhập tên, mã nhân viên, email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </label>

            <button
              type="button"
              className="button button-secondary"
              onClick={() => void fetchData()}
              title="Tải lại danh sách"
            >
              <Icon name="refresh" size={16} /> Làm mới
            </button>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="alert alert-error" style={{ marginBottom: '16px' }}>
              <Icon name="warning" size={18} />
              <span>{error}</span>
            </div>
          )}

          {/* Table Container */}
          <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="table-wrap">
              {loading ? (
                <div className="empty-state">
                  <p>Đang tải dữ liệu nhân viên...</p>
                </div>
              ) : filteredEmployees.length === 0 ? (
                <div className="empty-state">
                  <Icon name="users" size={48} style={{ opacity: 0.4, margin: '0 auto 8px' }} />
                  <p>Không tìm thấy nhân viên nào phù hợp tiêu chí lọc.</p>
                </div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Mã NV</th>
                      <th>Họ và tên</th>
                      <th>Phòng ban</th>
                      <th>Liên hệ</th>
                      <th>Dữ liệu Sinh trắc khuôn mặt</th>
                      <th>Trạng thái</th>
                      <th style={{ textAlign: 'right' }}>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEmployees.map((emp) => {
                      const deptObj = departments.find((d) => d.id === emp.departmentId);
                      const deptDisplay = deptObj
                        ? `${deptObj.departmentName} (${deptObj.departmentCode})`
                        : emp.departmentCode || '---';
                      const vectorCount = emp.registeredVectorCount || 0;

                      return (
                        <tr key={emp.id}>
                          <td>
                            <strong>{emp.employeeCode}</strong>
                          </td>
                          <td>
                            <div className="emp-name-cell">
                              <span className="emp-avatar">
                                {emp.fullName.charAt(0).toUpperCase()}
                              </span>
                              <span style={{ fontWeight: 600 }}>{emp.fullName}</span>
                            </div>
                          </td>
                          <td>{deptDisplay}</td>
                          <td>
                            <div style={{ fontSize: '0.875rem' }}>{emp.email || '---'}</div>
                            {emp.phoneNumber && (
                              <div className="muted" style={{ fontSize: '0.75rem' }}>{emp.phoneNumber}</div>
                            )}
                          </td>
                          <td>
                            {vectorCount > 0 ? (
                              <span className="badge badge-success">
                                <Icon name="check" size={14} /> {vectorCount} góc đã lưu trong DB
                              </span>
                            ) : (
                              <span className="badge badge-warning">Chưa nạp khuôn mặt</span>
                            )}
                          </td>
                          <td>
                            <span
                              className={`badge ${
                                emp.isActive ? 'badge-success' : 'badge-danger'
                              }`}
                            >
                              {emp.isActive ? 'Đang làm việc' : 'Ngưng hoạt động'}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                              <button
                                type="button"
                                className="button button-secondary"
                                style={{ minHeight: '32px', padding: '4px 10px', fontSize: '0.8125rem' }}
                                onClick={() => setEnrollingEmployee(emp)}
                                title="Quét thêm góc mặt (Chính diện / Trái / Phải)"
                              >
                                <Icon name="camera" size={14} /> Quét thêm góc
                              </button>
                              {emp.isActive && (
                                <button
                                  type="button"
                                  className="button button-secondary"
                                  style={{
                                    minHeight: '32px',
                                    padding: '4px 8px',
                                    color: 'var(--status-danger-text)',
                                  }}
                                  onClick={() => void handleDeactivate(emp)}
                                  title="Ngưng kích hoạt"
                                >
                                  <Icon name="trash" size={14} />
                                </button>
                              )}
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
        </>
      )}

      {/* Modal Đăng ký nhân viên 2 bước (Thông tin + Quét mặt AI lưu DB) */}
      <CreateEmployeeWithBiometricsModal
        isOpen={showAddEmpModal}
        onClose={() => setShowAddEmpModal(false)}
        token={session.accessToken}
        departments={departments}
        onSuccess={() => void fetchData()}
      />

      {/* Modal Quét thêm góc mặt cho nhân viên đã có */}
      {enrollingEmployee && (
        <FaceEnrollmentModal
          isOpen={Boolean(enrollingEmployee)}
          onClose={() => setEnrollingEmployee(null)}
          employee={enrollingEmployee}
          token={session.accessToken}
          onSuccess={() => void fetchData()}
        />
      )}

      {/* Add Department Modal */}
      <dialog
        ref={addDeptDialogRef}
        className="app-dialog"
        onClose={() => setShowAddDeptModal(false)}
      >
        <div className="app-dialog-heading">
          <div>
            <p className="eyebrow">CƠ CẤU TỔ CHỨC</p>
            <h2>Thêm phòng ban mới</h2>
            <p className="muted">Tạo mới đơn vị quản trị và phân quyền phòng ban.</p>
          </div>
          <button
            type="button"
            className="button button-secondary app-dialog-close"
            onClick={() => setShowAddDeptModal(false)}
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        <form onSubmit={handleCreateDepartment}>
          <div style={{ display: 'grid', gap: '14px' }}>
            <label className="field">
              <span>Mã phòng ban *</span>
              <input
                type="text"
                required
                placeholder="VD: IT, HR, MKT"
                value={newDeptCode}
                onChange={(e) => setNewDeptCode(e.target.value)}
              />
            </label>
            <label className="field">
              <span>Tên phòng ban *</span>
              <input
                type="text"
                required
                placeholder="VD: Phòng Công nghệ Thông tin"
                value={newDeptName}
                onChange={(e) => setNewDeptName(e.target.value)}
              />
            </label>
            <label className="field">
              <span>Mô tả</span>
              <textarea
                placeholder="Ghi chú về chức năng của phòng ban..."
                value={newDeptDesc}
                onChange={(e) => setNewDeptDesc(e.target.value)}
                rows={2}
              />
            </label>
          </div>
          <div className="app-dialog-actions">
            <button
              type="button"
              className="button button-secondary"
              onClick={() => setShowAddDeptModal(false)}
            >
              Hủy
            </button>
            <button
              type="submit"
              className="button button-primary"
              disabled={isSubmittingDept}
            >
              {isSubmittingDept ? 'Đang lưu...' : 'Tạo phòng ban'}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
