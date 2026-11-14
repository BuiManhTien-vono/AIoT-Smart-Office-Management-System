import { 
  ArrowClockwise, 
  CalendarBlank, 
  CheckCircle, 
  Clock, 
  Eye, 
  MagnifyingGlassPlus, 
  PaperPlaneTilt, 
  Plus, 
  ShieldCheck, 
  ShieldWarning, 
  WarningCircle, 
  X 
} from '@phosphor-icons/react'
import { useCallback, useEffect, useState } from 'react'
import { listEmployees } from '../../services/biometricsService'
import type { Employee } from '../../types/biometrics.types'
import { 
  createOtRegistration, 
  formatMediaUrl, 
  getNightGuardStatus, 
  listOtRegistrations, 
  listSecurityIncidents, 
  resolveSecurityIncident, 
  updateOtApprovalStatus 
} from '../../services/securityService'
import type { Session } from '../../types/auth.types'
import type { 
  AlertLevel, 
  NightGuardStatus, 
  OtRegistration, 
  SecurityIncident 
} from '../../types/security.types'
import './security-soc.css'

export function SecuritySocPage({ session }: { session: Session }) {
  const [activeTab, setActiveTab] = useState<'incidents' | 'ot'>('incidents')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Dữ liệu
  const [nightGuard, setNightGuard] = useState<NightGuardStatus | null>(null)
  const [incidents, setIncidents] = useState<SecurityIncident[]>([])
  const [otList, setOtList] = useState<OtRegistration[]>([])
  const [employees, setEmployees] = useState<Array<{ id: string; fullName: string; employeeCode: string }>>([])

  // Bộ lọc Sự cố
  const [ticketStatusFilter, setTicketStatusFilter] = useState<string>('ALL')
  const [alertLevelFilter, setAlertLevelFilter] = useState<string>('ALL')

  // Bộ lọc OT
  const todayStr = new Date().toISOString().slice(0, 10)
  const [otDateFilter, setOtDateFilter] = useState<string>(todayStr)

  // Dialog Xử lý Ticket
  const [resolvingIncident, setResolvingIncident] = useState<SecurityIncident | null>(null)
  const [resolveType, setResolveType] = useState<'ACKNOWLEDGED' | 'FALSE_ALARM'>('ACKNOWLEDGED')
  const [resolutionNote, setResolutionNote] = useState('')
  const [submittingResolve, setSubmittingResolve] = useState(false)

  // Lightbox xem ảnh Snapshot
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)

  // Dialog Đăng ký OT
  const [showOtModal, setShowOtModal] = useState(false)
  const [otEmployeeId, setOtEmployeeId] = useState('')
  const [otDate, setOtDate] = useState(todayStr)
  const [otStartTime, setOtStartTime] = useState('18:00')
  const [otEndTime, setOtEndTime] = useState('22:00')
  const [otReason, setOtReason] = useState('')
  const [submittingOt, setSubmittingOt] = useState(false)

  const token = session.accessToken

  // Tải trạng thái trực đêm
  const loadNightGuard = useCallback(async () => {
    try {
      const res = await getNightGuardStatus(token)
      setNightGuard(res)
    } catch (err: unknown) {
      console.warn('Không thể lấy trạng thái Night Guard:', err)
    }
  }, [token])

  // Tải danh sách sự cố
  const loadIncidents = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await listSecurityIncidents(token, {
        ticketStatus: ticketStatusFilter,
        alertLevel: alertLevelFilter,
      })
      setIncidents(data)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Lỗi nạp danh sách sự cố an ninh.')
    } finally {
      setLoading(false)
    }
  }, [token, ticketStatusFilter, alertLevelFilter])

  // Tải danh sách OT
  const loadOtRegistrations = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await listOtRegistrations(token, { date: otDateFilter || undefined })
      setOtList(data)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Lỗi nạp danh sách đăng ký OT.')
    } finally {
      setLoading(false)
    }
  }, [token, otDateFilter])

  // Tải danh sách nhân sự (để chọn khi đăng ký OT)
  const loadEmployeeList = useCallback(async () => {
    try {
      const emps = await listEmployees(token)
      setEmployees(emps.map((e: Employee) => ({ id: e.id, fullName: e.fullName, employeeCode: e.employeeCode })))
      if (emps.length > 0 && !otEmployeeId) {
        setOtEmployeeId(emps[0]!.id)
      }
    } catch (err: unknown) {
      console.warn('Lỗi nạp danh sách nhân sự:', err)
    }
  }, [token, otEmployeeId])

  useEffect(() => {
    loadNightGuard()
    loadEmployeeList()
  }, [loadNightGuard, loadEmployeeList])

  useEffect(() => {
    if (activeTab === 'incidents') {
      loadIncidents()
    } else {
      loadOtRegistrations()
    }
  }, [activeTab, loadIncidents, loadOtRegistrations])

  // Xử lý xác nhận/báo động nhầm ticket
  const handleOpenResolve = (incident: SecurityIncident, type: 'ACKNOWLEDGED' | 'FALSE_ALARM') => {
    setResolvingIncident(incident)
    setResolveType(type)
    setResolutionNote(
      type === 'ACKNOWLEDGED' 
        ? 'Đã kiểm tra hiện trường: Nhân sự hợp lệ hoặc sự vụ đã được an ninh lập biên bản.' 
        : 'Báo động nhầm: Hình ảnh nhận diện sai hoặc góc quét camera nhiễu ngoài giờ.'
    )
  }

  const handleSubmitResolve = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!resolvingIncident) return
    setSubmittingResolve(true)
    try {
      await resolveSecurityIncident(token, resolvingIncident.id, {
        ticketStatus: resolveType,
        resolutionNote: resolutionNote.trim(),
        resolvedByUserId: session.user.id,
      })
      setResolvingIncident(null)
      await loadIncidents()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Lỗi khi cập nhật trạng thái sự cố.')
    } finally {
      setSubmittingResolve(false)
    }
  }

  // Xử lý tạo đơn OT mới
  const handleCreateOt = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!otEmployeeId) return
    setSubmittingOt(true)
    try {
      await createOtRegistration(token, {
        employeeId: otEmployeeId,
        otDate,
        startTime: otStartTime,
        endTime: otEndTime,
        reason: otReason.trim() || undefined,
        approvalStatus: 'APPROVED',
        approvedByUserId: session.user.id,
      })
      setShowOtModal(false)
      setOtReason('')
      await loadOtRegistrations()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Lỗi khi tạo đăng ký OT.')
    } finally {
      setSubmittingOt(false)
    }
  }

  // Duyệt/từ chối đơn OT
  const handleToggleOtApproval = async (ot: OtRegistration, newStatus: 'APPROVED' | 'REJECTED') => {
    try {
      await updateOtApprovalStatus(token, ot.id, {
        approvalStatus: newStatus,
        approvedByUserId: session.user.id,
        reason: newStatus === 'APPROVED' ? 'Đã duyệt qua SOC' : 'Từ chối bởi ban quản trị',
      })
      await loadOtRegistrations()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Lỗi khi cập nhật trạng thái OT.')
    }
  }

  // Thống kê nhanh Sự cố
  const totalIncidents = incidents.length
  const openIncidents = incidents.filter(i => i.ticketStatus === 'OPEN').length
  const ackIncidents = incidents.filter(i => i.ticketStatus === 'ACKNOWLEDGED').length
  const falseAlarmIncidents = incidents.filter(i => i.ticketStatus === 'FALSE_ALARM').length

  const getAlertBadge = (level: AlertLevel | string) => {
    switch (level) {
      case 'LEVEL_3_SECURITY_BREACH':
        return <span className="badge badge-level-3">🚨 Mức 3: Người lạ đột nhập</span>
      case 'SPOOFING_ATTEMPT':
        return <span className="badge badge-spoofing">🛡️ Giả mạo sinh trắc học</span>
      case 'LEVEL_2_UNAUTHORIZED_PRESENCE':
        return <span className="badge badge-level-2">⚠️ Mức 2: Ngoài giờ chưa OT</span>
      case 'LEVEL_1_APPROVED_OT':
        return <span className="badge badge-level-1">✅ Mức 1: Có lịch OT hợp lệ</span>
      default:
        return <span className="badge badge-neutral">{level}</span>
    }
  }

  const getStripClass = (level: AlertLevel | string) => {
    switch (level) {
      case 'LEVEL_3_SECURITY_BREACH': return 'strip-level-3'
      case 'SPOOFING_ATTEMPT': return 'strip-spoofing'
      case 'LEVEL_2_UNAUTHORIZED_PRESENCE': return 'strip-level-2'
      case 'LEVEL_1_APPROVED_OT': return 'strip-level-1'
      default: return ''
    }
  }

  return (
    <div className="security-soc-page">
      {/* 1. Header Trang & Trạng thái Trực đêm */}
      <header className="page-heading soc-header">
        <div className="soc-title-wrap">
          <p className="eyebrow">TRUNG TÂM VẬN HÀNH AN NINH (SOC)</p>
          <h1>Kiểm soát Ngoài giờ &amp; Giám sát Sự cố</h1>
        </div>

        <div className="soc-header-actions">
          <button
            type="button"
            className="button button-secondary"
            onClick={() => {
              loadNightGuard()
              if (activeTab === 'incidents') loadIncidents()
              else loadOtRegistrations()
            }}
            disabled={loading}
          >
            <ArrowClockwise size={18} className={loading ? 'spin' : ''} />
            <span>Làm mới</span>
          </button>
        </div>
      </header>

      {/* 2. Dải trạng thái Chế độ Trực đêm (Night Guard) */}
      <section className="night-guard-banner" aria-label="Chế độ trực đêm">
        <div className="night-guard-info">
          <span 
            className={`guard-pulse-dot ${nightGuard?.isNightGuardActive ? 'active' : 'inactive'}`} 
            title={nightGuard?.isNightGuardActive ? 'Đang kích hoạt' : 'Chưa kích hoạt'} 
          />
          <div className="night-guard-text">
            <strong>
              {nightGuard?.isNightGuardActive 
                ? 'Chế độ Trực đêm (Night Guard) ĐANG HOẠT ĐỘNG' 
                : 'Chế độ Trực đêm: Đang trong giờ làm việc thông thường'}
            </strong>
            <span>{nightGuard?.reason || 'Hệ thống tự động kích hoạt ngoài giờ 19:00 - 06:00 & ngày nghỉ cuối tuần.'}</span>
          </div>
        </div>
        <span className="badge badge-neutral">Múi giờ UTC+7</span>
      </section>

      {/* 3. Thanh Tabs Phân Hệ: Sự cố An ninh | Đăng ký OT */}
      <nav className="soc-tabs-bar" aria-label="Phân hệ an ninh">
        <button
          type="button"
          className={`soc-tab-btn ${activeTab === 'incidents' ? 'active' : ''}`}
          onClick={() => setActiveTab('incidents')}
        >
          <ShieldWarning size={18} weight="bold" />
          <span>Sự cố &amp; Báo động an ninh ({incidents.length})</span>
        </button>

        <button
          type="button"
          className={`soc-tab-btn ${activeTab === 'ot' ? 'active' : ''}`}
          onClick={() => setActiveTab('ot')}
        >
          <Clock size={18} weight="bold" />
          <span>Đăng ký làm thêm ngoài giờ (OT)</span>
        </button>
      </nav>

      {error && (
        <div className="alert alert-error">
          <WarningCircle size={20} weight="bold" />
          <span>{error}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 1: DANH SÁCH SỰ CỐ & BÁO ĐỘNG AN NINH */}
      {/* ========================================================================= */}
      {activeTab === 'incidents' && (
        <>
          {/* Lưới KPI Sự cố */}
          <div className="soc-kpi-grid">
            <div className="soc-kpi-card">
              <div className="soc-kpi-icon icon-info">
                <ShieldCheck size={22} weight="bold" />
              </div>
              <div className="soc-kpi-info">
                <span className="soc-kpi-label">Tổng sự cố ghi nhận</span>
                <span className="soc-kpi-value">{totalIncidents}</span>
              </div>
            </div>

            <div className="soc-kpi-card">
              <div className="soc-kpi-icon icon-danger">
                <ShieldWarning size={22} weight="bold" />
              </div>
              <div className="soc-kpi-info">
                <span className="soc-kpi-label">Chưa xử lý (OPEN)</span>
                <span className="soc-kpi-value text-danger">{openIncidents}</span>
              </div>
            </div>

            <div className="soc-kpi-card">
              <div className="soc-kpi-icon icon-success">
                <CheckCircle size={22} weight="bold" />
              </div>
              <div className="soc-kpi-info">
                <span className="soc-kpi-label">Đã xử lý (ACK)</span>
                <span className="soc-kpi-value text-success">{ackIncidents}</span>
              </div>
            </div>

            <div className="soc-kpi-card">
              <div className="soc-kpi-icon icon-warning">
                <WarningCircle size={22} weight="bold" />
              </div>
              <div className="soc-kpi-info">
                <span className="soc-kpi-label">Báo động nhầm</span>
                <span className="soc-kpi-value text-warning">{falseAlarmIncidents}</span>
              </div>
            </div>
          </div>

          {/* Thanh Bộ Lọc Sự Cố */}
          <div className="soc-filter-bar">
            <div className="filter-left-group">
              <span className="muted" style={{ fontSize: '13px' }}>Trạng thái ticket:</span>
              <div className="filter-chip-group">
                {['ALL', 'OPEN', 'ACKNOWLEDGED', 'FALSE_ALARM'].map(st => (
                  <button
                    key={st}
                    type="button"
                    className={`filter-chip ${ticketStatusFilter === st ? 'active' : ''}`}
                    onClick={() => setTicketStatusFilter(st)}
                  >
                    {st === 'ALL' ? 'Tất cả' : st === 'OPEN' ? 'Đang mở (Cần xử lý)' : st === 'ACKNOWLEDGED' ? 'Đã xác nhận' : 'Báo động nhầm'}
                  </button>
                ))}
              </div>
            </div>

            <div className="filter-left-group">
              <span className="muted" style={{ fontSize: '13px' }}>Mức cảnh báo:</span>
              <select
                value={alertLevelFilter}
                onChange={e => setAlertLevelFilter(e.target.value)}
                style={{ minHeight: '34px', padding: '0 10px', fontSize: '13px', borderRadius: '6px' }}
              >
                <option value="ALL">Tất cả mức độ</option>
                <option value="LEVEL_3_SECURITY_BREACH">🚨 Mức 3: Người lạ đột nhập</option>
                <option value="SPOOFING_ATTEMPT">🛡️ Giả mạo sinh trắc học</option>
                <option value="LEVEL_2_UNAUTHORIZED_PRESENCE">⚠️ Mức 2: Ngoài giờ chưa OT</option>
                <option value="LEVEL_1_APPROVED_OT">✅ Mức 1: Có OT hợp lệ</option>
              </select>
            </div>
          </div>

          {/* Danh Sách Thẻ Sự Cố */}
          <div className="incident-list-container">
            {incidents.length === 0 ? (
              <div className="panel empty-state">
                <ShieldCheck size={48} className="muted" />
                <h3>Không có sự cố nào cần xử lý</h3>
                <p className="muted">Toàn bộ khu vực văn phòng đang đảm bảo an ninh hoặc bộ lọc không có dữ liệu.</p>
              </div>
            ) : (
              incidents.map(inc => {
                const imgUrl = formatMediaUrl(inc.snapshotPresignedUrl)
                const isOpen = inc.ticketStatus === 'OPEN'

                return (
                  <article className="incident-card" key={inc.id}>
                    <div className={`incident-level-strip ${getStripClass(inc.alertLevel)}`} />

                    <div className="incident-card-content">
                      {/* Thumbnail Snapshot */}
                      <div 
                        className="incident-snapshot-wrap" 
                        onClick={() => imgUrl && setLightboxUrl(imgUrl)}
                        title={imgUrl ? 'Bấm để phóng to ảnh bằng chứng' : 'Không có ảnh chụp'}
                      >
                        {imgUrl ? (
                          <>
                            <img src={imgUrl} alt="Bằng chứng hiện trường" className="incident-snapshot-img" />
                            <div className="snapshot-zoom-hint">
                              <MagnifyingGlassPlus size={20} weight="bold" />
                            </div>
                          </>
                        ) : (
                          <div className="no-snapshot-placeholder">
                            <Eye size={20} />
                            <span>Chưa có ảnh</span>
                          </div>
                        )}
                      </div>

                      {/* Chi tiết sự cố */}
                      <div className="incident-details">
                        <div className="incident-header-row">
                          {getAlertBadge(inc.alertLevel)}
                          <span className={`badge ${isOpen ? 'badge-danger' : 'badge-neutral'}`}>
                            {isOpen ? '🔴 ĐANG MỞ' : inc.ticketStatus === 'ACKNOWLEDGED' ? '🟢 ĐÃ XỬ LÝ' : '⚪ BÁO ĐỘNG NHẦM'}
                          </span>
                          {inc.telegramSent && (
                            <span className="badge badge-info" title="Hệ thống đã phát tín hiệu gửi Telegram">
                              <PaperPlaneTilt size={13} weight="bold" /> Đã báo Telegram
                            </span>
                          )}
                        </div>

                        <div className="incident-meta-row">
                          <span className="incident-meta-item">
                            <Clock size={15} />
                            <strong>{new Date(inc.detectedAt).toLocaleString('vi-VN')}</strong>
                          </span>
                          {inc.detectedEmployeeName ? (
                            <span className="incident-meta-item">
                              👤 <strong>{inc.detectedEmployeeName}</strong> ({inc.detectedEmployeeCode})
                            </span>
                          ) : (
                            <span className="incident-meta-item text-danger">
                              👤 <em>Người lạ (UNKNOWN)</em>
                            </span>
                          )}
                          <span className="incident-meta-item">
                            📷 Camera: <code>{inc.cameraId.slice(0, 8)}…</code>
                          </span>
                        </div>

                        {inc.actionSummary && (
                          <p className="incident-action-summary">{inc.actionSummary}</p>
                        )}

                        {inc.resolutionNote && (
                          <p className="incident-resolution-info">
                            <strong>Biên bản xử lý:</strong> {inc.resolutionNote} 
                            {inc.resolvedAt && ` (${new Date(inc.resolvedAt).toLocaleTimeString('vi-VN')})`}
                          </p>
                        )}
                      </div>

                      {/* Nút Hành Động */}
                      {isOpen && (
                        <div className="incident-actions">
                          <button
                            type="button"
                            className="button button-small button-ack"
                            onClick={() => handleOpenResolve(inc, 'ACKNOWLEDGED')}
                          >
                            <CheckCircle size={15} weight="bold" /> Xác nhận xử lý
                          </button>
                          <button
                            type="button"
                            className="button button-small button-false-alarm"
                            onClick={() => handleOpenResolve(inc, 'FALSE_ALARM')}
                          >
                            <X size={15} weight="bold" /> Báo động nhầm
                          </button>
                        </div>
                      )}
                    </div>
                  </article>
                )
              })
            )}
          </div>
        </>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: ĐĂNG KÝ LÀM THÊM NGOÀI GIỜ (OT) */}
      {/* ========================================================================= */}
      {activeTab === 'ot' && (
        <>
          {/* Thanh công cụ OT */}
          <div className="ot-toolbar">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <label className="field" style={{ margin: 0, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '13px', fontWeight: 600 }}>Xem theo ngày:</span>
                <input
                  type="date"
                  value={otDateFilter}
                  onChange={e => setOtDateFilter(e.target.value)}
                  style={{ minHeight: '34px', padding: '0 8px' }}
                />
              </label>
              <button
                type="button"
                className="button button-ghost"
                onClick={() => setOtDateFilter(todayStr)}
              >
                Hôm nay
              </button>
            </div>

            <button
              type="button"
              className="button button-primary"
              onClick={() => setShowOtModal(true)}
            >
              <Plus size={18} weight="bold" />
              <span>Đăng ký ca làm OT mới</span>
            </button>
          </div>

          {/* Bảng Danh sách OT */}
          <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
            {otList.length === 0 ? (
              <div className="empty-state">
                <CalendarBlank size={48} className="muted" />
                <h3>Chưa có ca đăng ký OT nào cho ngày {otDateFilter.split('-').reverse().join('/')}</h3>
                <p className="muted">Nhân viên ở lại sau giờ làm việc khi chưa đăng ký sẽ bị kích hoạt cảnh báo an ninh Mức 2.</p>
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Nhân viên</th>
                      <th>Mã NV</th>
                      <th>Ngày OT</th>
                      <th>Khung giờ làm thêm</th>
                      <th>Qua đêm</th>
                      <th>Lý do làm thêm</th>
                      <th>Trạng thái</th>
                      <th style={{ textAlign: 'right' }}>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {otList.map(ot => (
                      <tr key={ot.id}>
                        <td><strong>{ot.employeeFullName}</strong></td>
                        <td><code>{ot.employeeCode}</code></td>
                        <td>{ot.otDate.split('-').reverse().join('/')}</td>
                        <td>
                          <strong>{ot.startTime} – {ot.endTime}</strong>
                        </td>
                        <td>
                          {ot.isOvernight ? (
                            <span className="badge badge-warning">🌙 Qua đêm</span>
                          ) : (
                            <span className="muted">Trong ca</span>
                          )}
                        </td>
                        <td style={{ maxWidth: '240px' }}>{ot.reason || '—'}</td>
                        <td>
                          <span className={`badge ${ot.approvalStatus === 'APPROVED' ? 'ot-badge-approved' : ot.approvalStatus === 'PENDING' ? 'ot-badge-pending' : 'ot-badge-rejected'}`}>
                            {ot.approvalStatus === 'APPROVED' ? 'Đã phê duyệt' : ot.approvalStatus === 'PENDING' ? 'Chờ duyệt' : 'Từ chối'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {ot.approvalStatus === 'PENDING' && (
                            <div style={{ display: 'inline-flex', gap: 6 }}>
                              <button
                                type="button"
                                className="button button-small button-primary"
                                onClick={() => handleToggleOtApproval(ot, 'APPROVED')}
                              >
                                Duyệt
                              </button>
                              <button
                                type="button"
                                className="button button-small button-secondary"
                                onClick={() => handleToggleOtApproval(ot, 'REJECTED')}
                              >
                                Từ chối
                              </button>
                            </div>
                          )}
                          {ot.approvalStatus === 'APPROVED' && (
                            <button
                              type="button"
                              className="button button-ghost button-small"
                              onClick={() => handleToggleOtApproval(ot, 'REJECTED')}
                              title="Hủy duyệt ca này"
                            >
                              Hủy duyệt
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: XỬ LÝ TICKET SỰ CỐ */}
      {/* ========================================================================= */}
      {resolvingIncident && (
        <div className="soc-modal-backdrop" onClick={() => !submittingResolve && setResolvingIncident(null)}>
          <div className="soc-modal-dialog" onClick={e => e.stopPropagation()}>
            <form onSubmit={handleSubmitResolve}>
              <div className="soc-modal-header">
                <h3>{resolveType === 'ACKNOWLEDGED' ? 'Xác nhận xử lý sự cố an ninh' : 'Đánh dấu báo động nhầm'}</h3>
                <button
                  type="button"
                  className="button-icon"
                  onClick={() => setResolvingIncident(null)}
                  disabled={submittingResolve}
                >
                  <X size={18} />
                </button>
              </div>

              <div className="soc-modal-body">
                <div>
                  <span className="muted" style={{ fontSize: '13px' }}>Sự cố:</span>
                  <p style={{ margin: '4px 0 0', fontWeight: 600 }}>{resolvingIncident.actionSummary}</p>
                </div>

                <label className="field">
                  <span>Nội dung ghi chú biên bản xử lý</span>
                  <textarea
                    rows={3}
                    value={resolutionNote}
                    onChange={e => setResolutionNote(e.target.value)}
                    placeholder="Nhập chi tiết xử lý của đội an ninh..."
                    required
                  />
                </label>
              </div>

              <div className="soc-modal-footer">
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => setResolvingIncident(null)}
                  disabled={submittingResolve}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className={`button ${resolveType === 'ACKNOWLEDGED' ? 'button-ack' : 'button-false-alarm'}`}
                  disabled={submittingResolve}
                >
                  {submittingResolve ? 'Đang lưu…' : 'Xác nhận đóng sự cố'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: LIGHTBOX PHÓNG TO ẢNH SNAPSHOT */}
      {/* ========================================================================= */}
      {lightboxUrl && (
        <div className="soc-modal-backdrop" onClick={() => setLightboxUrl(null)}>
          <div className="soc-modal-dialog snapshot-lightbox" onClick={e => e.stopPropagation()}>
            <div className="soc-modal-header">
              <h3>Bằng chứng hiện trường (Snapshot camera AI)</h3>
              <button type="button" className="button-icon" onClick={() => setLightboxUrl(null)}>
                <X size={20} color="#ffffff" />
              </button>
            </div>
            <div className="soc-modal-body" style={{ padding: 12 }}>
              <img src={lightboxUrl} alt="Bằng chứng phóng to" className="lightbox-image" />
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: ĐĂNG KÝ CA LÀM THÊM GIỜ (OT) */}
      {/* ========================================================================= */}
      {showOtModal && (
        <div className="soc-modal-backdrop" onClick={() => !submittingOt && setShowOtModal(false)}>
          <div className="soc-modal-dialog" onClick={e => e.stopPropagation()}>
            <form onSubmit={handleCreateOt}>
              <div className="soc-modal-header">
                <h3>Đăng ký ca làm thêm ngoài giờ (OT)</h3>
                <button
                  type="button"
                  className="button-icon"
                  onClick={() => setShowOtModal(false)}
                  disabled={submittingOt}
                >
                  <X size={18} />
                </button>
              </div>

              <div className="soc-modal-body">
                <label className="field">
                  <span>Nhân viên làm thêm</span>
                  <select
                    value={otEmployeeId}
                    onChange={e => setOtEmployeeId(e.target.value)}
                    required
                  >
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>
                        {emp.fullName} ({emp.employeeCode})
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>Ngày làm thêm</span>
                  <input
                    type="date"
                    value={otDate}
                    onChange={e => setOtDate(e.target.value)}
                    required
                  />
                </label>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <label className="field">
                    <span>Giờ bắt đầu OT</span>
                    <input
                      type="time"
                      value={otStartTime}
                      onChange={e => setOtStartTime(e.target.value)}
                      required
                    />
                  </label>

                  <label className="field">
                    <span>Giờ kết thúc OT</span>
                    <input
                      type="time"
                      value={otEndTime}
                      onChange={e => setOtEndTime(e.target.value)}
                      required
                    />
                  </label>
                </div>

                <label className="field">
                  <span>Lý do / Công việc làm thêm</span>
                  <textarea
                    rows={2}
                    value={otReason}
                    onChange={e => setOtReason(e.target.value)}
                    placeholder="Ví dụ: Triển khai dự án gấp, trực ca kỹ thuật..."
                  />
                </label>
              </div>

              <div className="soc-modal-footer">
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => setShowOtModal(false)}
                  disabled={submittingOt}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="button button-primary"
                  disabled={submittingOt}
                >
                  {submittingOt ? 'Đang lưu…' : 'Lưu đăng ký OT'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
