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
  getIncidentSnapshotFallbackUrl,
  getNightGuardStatus, 
  listOtRegistrations, 
  listSecurityIncidents, 
  resolveSecurityIncident, 
  updateOtApprovalStatus 
} from '../../services/securityService'
import { signalrService } from '../../services/signalrService'
import type { Session } from '../../types/auth.types'
import type { 
  AlertLevel, 
  IncidentSeverity,
  NightGuardStatus, 
  OtRegistration, 
  SecurityIncident 
} from '../../types/security.types'
import './security-soc.css'

export function SecuritySocPage({ session }: { session: Session }) {
  const [activeTab, setActiveTab] = useState<'incidents' | 'ot'>('incidents')
  const [tabSlideDir, setTabSlideDir] = useState<'subtab-slide-right' | 'subtab-slide-left'>('subtab-slide-right')

  const handleTabChange = (nextTab: 'incidents' | 'ot') => {
    if (nextTab === activeTab) return
    setTabSlideDir(nextTab === 'ot' ? 'subtab-slide-right' : 'subtab-slide-left')
    setActiveTab(nextTab)
  }
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
  const [incidentTypeFilter, setIncidentTypeFilter] = useState<string>('ALL')

  // Real-time Toast cảnh báo (Trực quan, không âm thanh)
  const [realtimeToast, setRealtimeToast] = useState<{
    id: string
    message: string
    timestamp: Date
    incidentType?: string
    seatCode?: string
  } | null>(null)

  // Bộ lọc OT
  const todayStr = new Date().toISOString().slice(0, 10)
  const [otDateFilter, setOtDateFilter] = useState<string>(todayStr)
  const [otStatusFilter, setOtStatusFilter] = useState<string>('ALL')

  // Dialog Xử lý Ticket (Chỉ lập biên bản hoặc báo động giả, không khóa quyền chấm công)
  const [resolvingIncident, setResolvingIncident] = useState<SecurityIncident | null>(null)
  const [resolveType, setResolveType] = useState<'ACKNOWLEDGED' | 'FALSE_ALARM'>('ACKNOWLEDGED')
  const [resolutionNote, setResolutionNote] = useState('')
  const [submittingResolve, setSubmittingResolve] = useState(false)

  // Lightbox xem ảnh Snapshot
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [lightboxIncidentId, setLightboxIncidentId] = useState<string | null>(null)

  const openLightbox = (url: string, incidentId: string) => {
    setLightboxUrl(url)
    setLightboxIncidentId(incidentId)
  }

  const closeLightbox = () => {
    setLightboxUrl(null)
    setLightboxIncidentId(null)
  }

  // Dialog Đăng ký OT
  const [showOtModal, setShowOtModal] = useState(false)
  const [otEmployeeId, setOtEmployeeId] = useState('')
  const [otDate, setOtDate] = useState(todayStr)
  const [otStartTime, setOtStartTime] = useState('18:00')
  const [otEndTime, setOtEndTime] = useState('21:30')
  const [otProjectName, setOtProjectName] = useState('')
  const [otReason, setOtReason] = useState('')
  const [submittingOt, setSubmittingOt] = useState(false)

  const token = session.accessToken

  // Tính số giờ làm thêm dự kiến
  const calculatedHours = (() => {
    const [sh, sm] = otStartTime.split(':').map(Number)
    const [eh, em] = otEndTime.split(':').map(Number)
    if (sh === undefined || sm === undefined || eh === undefined || em === undefined) return 0
    let diff = (eh * 60 + em) - (sh * 60 + sm)
    if (diff <= 0) diff += 24 * 60
    return Math.round((diff / 60) * 10) / 10
  })()

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
        incidentType: incidentTypeFilter,
      })
      setIncidents(data)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Lỗi nạp danh sách sự cố an ninh.')
    } finally {
      setLoading(false)
    }
  }, [token, ticketStatusFilter, alertLevelFilter, incidentTypeFilter])

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
      if (emps.length > 0) {
        setOtEmployeeId(prev => prev || emps[0]!.id)
      }
    } catch (err: unknown) {
      console.warn('Lỗi nạp danh sách nhân sự:', err)
    }
  }, [token])

  useEffect(() => {
    void loadNightGuard()
    void loadEmployeeList()
  }, [loadNightGuard, loadEmployeeList])

  useEffect(() => {
    if (showOtModal) {
      void loadEmployeeList()
    }
  }, [showOtModal, loadEmployeeList])

  useEffect(() => {
    if (activeTab === 'incidents') {
      void loadIncidents()
    } else {
      void loadOtRegistrations()
    }
  }, [activeTab, loadIncidents, loadOtRegistrations])

  // Lắng nghe sự kiện SignalR thời gian thực (Cảnh báo trực quan, không dùng âm thanh)
  useEffect(() => {
    const unsub = signalrService.onSecurityAlert(event => {
      setRealtimeToast({
        id: event.eventId || String(Date.now()),
        message: event.actionSummary || `Phát hiện sự cố an ninh: ${event.incidentType || event.alertLevel}`,
        timestamp: new Date(),
        incidentType: event.incidentType,
        seatCode: event.seatCode,
      })
      // Tự động tải lại danh sách sự cố để cập nhật ngay lập tức
      void loadIncidents()
    })

    return () => {
      unsub()
    }
  }, [loadIncidents])

  // Xử lý xác nhận/báo động nhầm ticket
  const handleOpenResolve = (incident: SecurityIncident, type: 'ACKNOWLEDGED' | 'FALSE_ALARM') => {
    setResolvingIncident(incident)
    setResolveType(type)
    setResolutionNote(
      type === 'ACKNOWLEDGED' 
        ? 'Đã kiểm tra hiện trường: Nhân sự hợp lệ hoặc sự vụ đã được đội an ninh lập biên bản xác minh.' 
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

  // Xử lý tạo đơn OT mới (Trạng thái mặc định: PENDING - Phải được phê duyệt)
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
        projectName: otProjectName.trim() || undefined,
        reason: otReason.trim() || undefined,
        approvalStatus: 'PENDING', // Đơn OT bắt buộc được phê duyệt
      })
      setShowOtModal(false)
      setOtReason('')
      setOtProjectName('')
      await loadOtRegistrations()
      await loadIncidents()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Lỗi khi tạo đăng ký OT.')
    } finally {
      setSubmittingOt(false)
    }
  }

  // Duyệt hoặc Từ chối đơn OT (1-Click cho Quản lý / HR)
  const handleToggleOtApproval = async (ot: OtRegistration, newStatus: 'APPROVED' | 'REJECTED') => {
    try {
      await updateOtApprovalStatus(token, ot.id, {
        approvalStatus: newStatus,
        approvedByUserId: session.user.id,
        reason: newStatus === 'APPROVED' ? 'Đã phê duyệt ca làm thêm' : 'Từ chối bởi ban quản lý',
      })
      await loadOtRegistrations()
      await loadIncidents()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Lỗi khi cập nhật trạng thái OT.')
    }
  }

  // Thống kê nhanh Sự cố
  const totalIncidents = incidents.length
  const openIncidents = incidents.filter(i => i.ticketStatus === 'OPEN').length
  const ackIncidents = incidents.filter(i => i.ticketStatus === 'ACKNOWLEDGED').length
  const falseAlarmIncidents = incidents.filter(i => i.ticketStatus === 'FALSE_ALARM').length

  // Lọc OT theo tab trạng thái
  const filteredOtList = otList.filter(ot => {
    if (otStatusFilter === 'ALL') return true
    return ot.approvalStatus === otStatusFilter
  })

  const getAlertBadge = (level: AlertLevel | string) => {
    switch (level) {
      case 'LEVEL_3_SECURITY_BREACH':
        return <span className="badge badge-level-3">🚨 Mức 3: Người lạ / Vi phạm nghiêm trọng</span>
      case 'SPOOFING_ATTEMPT':
        return <span className="badge badge-spoofing">🛡️ Giả mạo sinh trắc học</span>
      case 'LEVEL_2_UNAUTHORIZED_PRESENCE':
        return <span className="badge badge-level-2">⚠️ Mức 2: Ngoài giờ chưa có OT</span>
      case 'LEVEL_1_APPROVED_OT':
        return <span className="badge badge-level-1">✅ Mức 1: Có lịch OT hợp lệ</span>
      default:
        return <span className="badge badge-neutral">{level}</span>
    }
  }

  const getIncidentTypeBadge = (type?: string, seatCode?: string | null) => {
    switch (type) {
      case 'STRANGER_AT_UNCHECKED_DESK':
        return <span className="badge badge-type-stranger-desk">🚨 Người lạ tại bàn {seatCode ? `(${seatCode})` : ''} - Chưa Check-in</span>
      case 'UNREGISTERED_AFTER_HOURS_PRESENCE':
        return <span className="badge badge-type-unregistered">⚠️ Hiện diện ngoài giờ chưa đăng ký OT {seatCode ? `(${seatCode})` : ''}</span>
      case 'PROLONGED_ABSENCE':
        return <span className="badge badge-type-prolonged">⏳ Ra khỏi chỗ quá thời gian {seatCode ? `(${seatCode})` : ''}</span>
      case 'SPOOFING_ATTEMPT':
        return <span className="badge badge-type-spoofing">🛡️ Giả mạo khuôn mặt tại Kiosk (Ảnh/ĐT)</span>
      case 'STRANGER_GATE_CHECKIN':
        return <span className="badge badge-type-stranger-kiosk">👤 Người lạ thử chấm công tại Kiosk</span>
      default:
        return null
    }
  }

  const getSeverityBadge = (sev?: IncidentSeverity | string) => {
    switch (sev) {
      case 'CRITICAL':
        return <span className="badge badge-crit">NGHIÊM TRỌNG</span>
      case 'HIGH':
        return <span className="badge badge-crit">CAO</span>
      case 'MEDIUM':
        return <span className="badge badge-warn">TRUNG BÌNH</span>
      case 'LOW':
        return <span className="badge badge-low">THẤP</span>
      default:
        return null
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
              void loadNightGuard()
              if (activeTab === 'incidents') void loadIncidents()
              else void loadOtRegistrations()
            }}
            disabled={loading}
          >
            <ArrowClockwise size={18} className={loading ? 'spin' : ''} />
            <span>Làm mới</span>
          </button>
        </div>
      </header>

      {/* BANNER REAL-TIME TOAST KHI CÓ SỰ CỐ MỚI (Trực quan, không phát âm thanh) */}
      {realtimeToast && (
        <section className="soc-realtime-toast" role="alert">
          <div className="soc-realtime-toast-content">
            <ShieldWarning size={22} weight="bold" />
            <div>
              <strong>CẢNH BÁO AN NINH MỚI ({realtimeToast.timestamp.toLocaleTimeString('vi-VN')}):</strong>{' '}
              <span>{realtimeToast.message}</span>
            </div>
          </div>
          <button
            type="button"
            className="button-icon"
            onClick={() => setRealtimeToast(null)}
            title="Đóng thông báo"
          >
            <X size={16} />
          </button>
        </section>
      )}

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
            <span>{nightGuard?.reason || 'Hệ thống tự động kích hoạt ngoài giờ 19:00 - 06:30 & ngày nghỉ cuối tuần.'}</span>
          </div>
        </div>
        <span className="badge badge-neutral">Múi giờ UTC+7</span>
      </section>

      {/* 3. Thanh Tabs Phân Hệ: Sự cố An ninh | Đăng ký OT */}
      <nav className="soc-tabs-bar" aria-label="Phân hệ an ninh">
        <button
          type="button"
          className={`soc-tab-btn ${activeTab === 'incidents' ? 'active' : ''}`}
          onClick={() => handleTabChange('incidents')}
        >
          <ShieldWarning size={18} weight="bold" />
          <span>Sự cố &amp; Báo động an ninh ({incidents.length})</span>
        </button>

        <button
          type="button"
          className={`soc-tab-btn ${activeTab === 'ot' ? 'active' : ''}`}
          onClick={() => handleTabChange('ot')}
        >
          <Clock size={18} weight="bold" />
          <span>Đăng ký &amp; Phê duyệt ca làm thêm (OT) ({otList.length})</span>
        </button>
      </nav>

      {error && (
        <div className="alert alert-error">
          <WarningCircle size={20} weight="bold" />
          <span>{error}</span>
        </div>
      )}

      {/* Nội dung Tab có hiệu ứng chuyển cảnh theo hướng */}
      <div
        key={`${activeTab}-${ticketStatusFilter}-${alertLevelFilter}-${otDateFilter}`}
        className={`subtab-stage ${tabSlideDir}`}
      >

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
                <span className="soc-kpi-label">Đã xác nhận (ACK)</span>
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

          {/* Thanh Bộ Lọc Sự Cố Đa Chiều */}
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
              <span className="muted" style={{ fontSize: '13px' }}>Loại sự cố:</span>
              <select
                value={incidentTypeFilter}
                onChange={e => setIncidentTypeFilter(e.target.value)}
                style={{ minHeight: '34px', padding: '0 10px', fontSize: '13px', borderRadius: '6px' }}
              >
                <option value="ALL">Tất cả loại sự cố</option>
                <option value="STRANGER_AT_UNCHECKED_DESK">🚨 Người lạ tại bàn (chưa check-in)</option>
                <option value="UNREGISTERED_AFTER_HOURS_PRESENCE">⚠️ Ngoài giờ chưa đăng ký OT</option>
                <option value="PROLONGED_ABSENCE">⏳ Ra khỏi chỗ quá thời gian</option>
                <option value="SPOOFING_ATTEMPT">🛡️ Giả mạo sinh trắc học Kiosk</option>
                <option value="STRANGER_GATE_CHECKIN">👤 Người lạ tại Kiosk</option>
              </select>
            </div>

            <div className="filter-left-group">
              <span className="muted" style={{ fontSize: '13px' }}>Mức cảnh báo:</span>
              <select
                value={alertLevelFilter}
                onChange={e => setAlertLevelFilter(e.target.value)}
                style={{ minHeight: '34px', padding: '0 10px', fontSize: '13px', borderRadius: '6px' }}
              >
                <option value="ALL">Tất cả mức độ</option>
                <option value="LEVEL_3_SECURITY_BREACH">🚨 Mức 3: Người lạ / Nghiêm trọng</option>
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
                <p className="muted">Toàn bộ khu vực văn phòng và cổng chấm công đang đảm bảo an ninh.</p>
              </div>
            ) : (
              incidents.map(inc => {
                const imgUrl = formatMediaUrl(inc.snapshotPresignedUrl, inc.id)
                const isOpen = inc.ticketStatus === 'OPEN'

                return (
                  <article className="incident-card" key={inc.id}>
                    <div className={`incident-level-strip ${getStripClass(inc.alertLevel)}`} />

                    <div className="incident-card-content">
                      {/* Thumbnail Snapshot */}
                      <div 
                        className="incident-snapshot-wrap" 
                        onClick={() => imgUrl && openLightbox(imgUrl, inc.id)}
                        title={imgUrl ? 'Bấm để phóng to ảnh bằng chứng hiện trường' : 'Chưa có ảnh'}
                      >
                        {imgUrl ? (
                          <>
                            <img 
                              src={imgUrl} 
                              alt="Bằng chứng hiện trường" 
                              className="incident-snapshot-img"
                              onError={(e) => {
                                const fallback = getIncidentSnapshotFallbackUrl(inc.id)
                                if (e.currentTarget.src !== fallback) {
                                  e.currentTarget.src = fallback
                                }
                              }}
                            />
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
                          {getIncidentTypeBadge(inc.incidentType, inc.seatCode)}
                          {getSeverityBadge(inc.severity)}
                          <span className={`badge ${isOpen ? 'badge-danger' : 'badge-neutral'}`}>
                            {isOpen ? '🔴 ĐANG MỞ' : inc.ticketStatus === 'ACKNOWLEDGED' ? '🟢 ĐÃ XỬ LÝ' : '⚪ BÁO ĐỘNG NHẦM'}
                          </span>
                          {inc.telegramSent && (
                            <span className="badge badge-info" title="Hệ thống đã gửi cảnh báo tự động qua Email (Gmail)">
                              <PaperPlaneTilt size={13} weight="bold" /> Đã báo Email
                            </span>
                          )}
                        </div>

                        <div className="incident-meta-row">
                          <span className="incident-meta-item">
                            <Clock size={15} />
                            <strong>{new Date(inc.detectedAt).toLocaleString('vi-VN')}</strong>
                          </span>
                          {inc.seatCode && (
                            <span className="incident-meta-item">
                              🪑 Vị trí bàn: <strong>{inc.seatCode}</strong>
                            </span>
                          )}
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
                            <strong>Biên bản xử lý hiện trường:</strong> {inc.resolutionNote} 
                            {inc.resolvedAt && ` (${new Date(inc.resolvedAt).toLocaleTimeString('vi-VN')})`}
                          </p>
                        )}
                      </div>

                      {/* Nút Hành Động Xử Lý Hiện Trường (Không có khóa quyền chấm công) */}
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
      {/* TAB 2: ĐĂNG KÝ & PHÊ DUYỆT CA LÀM THÊM NGOÀI GIỜ (OT) */}
      {/* ========================================================================= */}
      {activeTab === 'ot' && (
        <>
          {/* Thanh công cụ OT */}
          <div className="ot-toolbar">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
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

              <div className="filter-chip-group" style={{ marginLeft: 8 }}>
                {['ALL', 'PENDING', 'APPROVED', 'REJECTED'].map(st => (
                  <button
                    key={st}
                    type="button"
                    className={`filter-chip ${otStatusFilter === st ? 'active' : ''}`}
                    onClick={() => setOtStatusFilter(st)}
                  >
                    {st === 'ALL' ? 'Tất cả trạng thái' : st === 'PENDING' ? '⏳ Chờ phê duyệt' : st === 'APPROVED' ? '✅ Đã duyệt' : '❌ Đã từ chối'}
                  </button>
                ))}
              </div>
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
            {filteredOtList.length === 0 ? (
              <div className="empty-state">
                <CalendarBlank size={48} className="muted" />
                <h3>Chưa có ca đăng ký OT nào phù hợp</h3>
                <p className="muted">Đơn OT phải được phê duyệt trước khi nhân viên ở lại làm việc ngoài giờ hành chính (+20 phút ân hạn).</p>
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
                      <th>Thời lượng</th>
                      <th>Dự án / Công việc</th>
                      <th>Lý do làm thêm</th>
                      <th>Trạng thái</th>
                      <th style={{ textAlign: 'right' }}>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOtList.map(ot => (
                      <tr key={ot.id}>
                        <td><strong>{ot.employeeFullName}</strong></td>
                        <td><code>{ot.employeeCode}</code></td>
                        <td>{ot.otDate.split('-').reverse().join('/')}</td>
                        <td>
                          <strong>{ot.startTime} – {ot.endTime}</strong>
                          {ot.isOvernight && <span className="badge badge-warning" style={{ marginLeft: 6 }}>🌙 Qua đêm</span>}
                        </td>
                        <td>
                          <span className="badge badge-neutral">{ot.estimatedHours ? `${ot.estimatedHours}h` : '—'}</span>
                        </td>
                        <td><strong>{ot.projectName || '—'}</strong></td>
                        <td style={{ maxWidth: '200px' }}>{ot.reason || '—'}</td>
                        <td>
                          <span className={`badge ${ot.approvalStatus === 'APPROVED' ? 'ot-badge-approved' : ot.approvalStatus === 'PENDING' ? 'ot-badge-pending' : 'ot-badge-rejected'}`}>
                            {ot.approvalStatus === 'APPROVED' ? '✅ Đã phê duyệt' : ot.approvalStatus === 'PENDING' ? '⏳ Chờ duyệt' : '❌ Từ chối'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {ot.approvalStatus === 'PENDING' && (
                            <div style={{ display: 'inline-flex', gap: 6 }}>
                              <button
                                type="button"
                                className="button button-small button-primary"
                                onClick={() => void handleToggleOtApproval(ot, 'APPROVED')}
                                title="Phê duyệt ca làm thêm này"
                              >
                                Duyệt
                              </button>
                              <button
                                type="button"
                                className="button button-small button-secondary"
                                onClick={() => void handleToggleOtApproval(ot, 'REJECTED')}
                                title="Từ chối ca làm thêm"
                              >
                                Từ chối
                              </button>
                            </div>
                          )}
                          {ot.approvalStatus === 'APPROVED' && (
                            <button
                              type="button"
                              className="button button-ghost button-small"
                              onClick={() => void handleToggleOtApproval(ot, 'REJECTED')}
                              title="Hủy duyệt ca này"
                            >
                              Hủy duyệt
                            </button>
                          )}
                          {ot.approvalStatus === 'REJECTED' && (
                            <button
                              type="button"
                              className="button button-ghost button-small"
                              onClick={() => void handleToggleOtApproval(ot, 'APPROVED')}
                              title="Duyệt lại ca này"
                            >
                              Duyệt lại
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
      </div>

      {/* ========================================================================= */}
      {/* MODAL 1: XỬ LÝ TICKET SỰ CỐ */}
      {/* ========================================================================= */}
      {resolvingIncident && (() => {
        const resolveImgUrl = formatMediaUrl(resolvingIncident.snapshotPresignedUrl, resolvingIncident.id)
        const incidentTitle = resolvingIncident.actionSummary || (
          resolvingIncident.incidentType === 'SPOOFING_ATTEMPT' ? 'Giả mạo khuôn mặt tại Kiosk (Ảnh/ĐT)' :
          resolvingIncident.incidentType === 'STRANGER_GATE_CHECKIN' ? 'Người lạ không thuộc công ty chấm công tại Kiosk' :
          resolvingIncident.incidentType === 'STRANGER_AT_UNCHECKED_DESK' ? 'Người lạ ngồi tại bàn chưa check-in công ty' :
          resolvingIncident.incidentType === 'UNREGISTERED_AFTER_HOURS_PRESENCE' ? 'Hiện diện tại bàn làm việc ngoài giờ không phép' :
          resolvingIncident.incidentType === 'PROLONGED_ABSENCE' ? 'Ra khỏi chỗ quá thời gian quy định (>10s)' :
          resolvingIncident.alertLevel || 'Sự cố an ninh'
        )

        return (
          <div className="soc-modal-backdrop" onClick={() => !submittingResolve && setResolvingIncident(null)}>
            <div className="soc-modal-dialog" onClick={e => e.stopPropagation()}>
              <form onSubmit={handleSubmitResolve}>
                <div className="soc-modal-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {resolveType === 'ACKNOWLEDGED' ? (
                      <CheckCircle size={22} weight="bold" color="#16a34a" />
                    ) : (
                      <WarningCircle size={22} weight="bold" color="#ea580c" />
                    )}
                    <h3>{resolveType === 'ACKNOWLEDGED' ? 'Xác nhận xử lý sự cố an ninh' : 'Đánh dấu báo động nhầm'}</h3>
                  </div>
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
                  {/* Thẻ tóm tắt thông tin sự cố */}
                  <div className="soc-resolve-context-card">
                    <div className="soc-resolve-context-header">
                      <div className="soc-resolve-tags">
                        {getAlertBadge(resolvingIncident.alertLevel)}
                        {getIncidentTypeBadge(resolvingIncident.incidentType, resolvingIncident.seatCode)}
                        {getSeverityBadge(resolvingIncident.severity)}
                      </div>
                      <span className="soc-resolve-time">
                        <Clock size={13} />
                        {new Date(resolvingIncident.detectedAt).toLocaleString('vi-VN')}
                      </span>
                    </div>

                    <div className="soc-resolve-context-content">
                      <div className="soc-resolve-info">
                        <div className="soc-resolve-title">{incidentTitle}</div>
                        <div className="soc-resolve-meta-grid">
                          <div>
                            <span className="meta-label">Vị trí:</span>
                            <span className="meta-val">
                              {resolvingIncident.seatCode ? `Bàn ${resolvingIncident.seatCode}` : `Camera ${resolvingIncident.cameraId.slice(0, 8)}...`}
                            </span>
                          </div>
                          <div>
                            <span className="meta-label">Đối tượng:</span>
                            <span className="meta-val">
                              {resolvingIncident.detectedEmployeeName ? (
                                <strong style={{ color: '#1d4ed8' }}>
                                  {resolvingIncident.detectedEmployeeName} ({resolvingIncident.detectedEmployeeCode})
                                </strong>
                              ) : (
                                <span style={{ color: '#b91c1c' }}>Người lạ (UNKNOWN)</span>
                              )}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Ảnh Snapshot thu nhỏ */}
                      <div 
                        className="soc-resolve-snapshot-thumb"
                        onClick={() => resolveImgUrl && openLightbox(resolveImgUrl, resolvingIncident.id)}
                        title={resolveImgUrl ? "Bấm xem ảnh phóng to" : "Chưa có ảnh bằng chứng"}
                      >
                        {resolveImgUrl ? (
                          <>
                            <img 
                              src={resolveImgUrl} 
                              alt="Bằng chứng hiện trường" 
                              onError={(e) => {
                                const fallback = getIncidentSnapshotFallbackUrl(resolvingIncident.id)
                                if (e.currentTarget.src !== fallback) {
                                  e.currentTarget.src = fallback
                                }
                              }}
                            />
                            <div className="snapshot-zoom-overlay">
                              <MagnifyingGlassPlus size={16} />
                            </div>
                          </>
                        ) : (
                          <div className="no-snap">
                            <Eye size={18} />
                            <span>Không có ảnh</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <label className="field">
                    <span>Nội dung ghi chú biên bản xử lý hiện trường</span>
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
                    {submittingResolve ? 'Đang lưu…' : resolveType === 'ACKNOWLEDGED' ? 'Xác nhận đóng sự cố' : 'Xác nhận báo động nhầm'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )
      })()}

      {/* ========================================================================= */}
      {/* MODAL 2: LIGHTBOX PHÓNG TO ẢNH SNAPSHOT */}
      {/* ========================================================================= */}
      {lightboxUrl && (
        <div className="soc-modal-backdrop" onClick={closeLightbox}>
          <div className="soc-modal-dialog snapshot-lightbox" onClick={e => e.stopPropagation()}>
            <div className="soc-modal-header">
              <h3>Bằng chứng hiện trường (Snapshot camera AI)</h3>
              <button type="button" className="button-icon" onClick={closeLightbox}>
                <X size={20} color="#ffffff" />
              </button>
            </div>
            <div className="soc-modal-body" style={{ padding: 12 }}>
              <img 
                src={lightboxUrl} 
                alt="Bằng chứng phóng to" 
                className="lightbox-image" 
                onError={(e) => {
                  if (lightboxIncidentId) {
                    const fallback = getIncidentSnapshotFallbackUrl(lightboxIncidentId)
                    if (e.currentTarget.src !== fallback) {
                      e.currentTarget.src = fallback
                    }
                  }
                }}
              />
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
                <div style={{ padding: '8px 12px', background: '#eff6ff', borderRadius: '6px', fontSize: '13px', color: '#1e40af' }}>
                  ℹ️ <strong>Quy định OT:</strong> Đơn đăng ký sẽ ở trạng thái <em>Chờ duyệt (Pending)</em> và cần Quản lý / HR phê duyệt trước khi nhân viên làm việc sau ca hành chính (+20 phút ân hạn).
                </div>

                <label className="field">
                  <span>Nhân viên làm thêm</span>
                  {employees.length === 0 ? (
                    <div style={{ padding: '8px 12px', background: '#fffbeb', border: '1px solid #fef3c7', borderRadius: '6px', fontSize: '13px', color: '#92400e' }}>
                      ⚠️ Chưa tìm thấy nhân viên trong danh sách. Vui lòng kiểm tra lại kết nối hoặc thêm nhân viên tại mục <strong>Danh bạ nhân viên</strong>.
                    </div>
                  ) : (
                    <select
                      value={otEmployeeId}
                      onChange={e => setOtEmployeeId(e.target.value)}
                      required
                    >
                      <option value="">-- Chọn nhân viên làm thêm ({employees.length} nhân sự) --</option>
                      {employees.map(emp => (
                        <option key={emp.id} value={emp.id}>
                          {emp.fullName} ({emp.employeeCode})
                        </option>
                      ))}
                    </select>
                  )}
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

                <div style={{ fontSize: '13px', color: '#0369a1', fontWeight: 600 }}>
                  ⏱️ Tổng thời lượng OT dự kiến: {calculatedHours} giờ
                </div>

                <label className="field">
                  <span>Dự án / Khối công việc</span>
                  <input
                    type="text"
                    value={otProjectName}
                    onChange={e => setOtProjectName(e.target.value)}
                    placeholder="Ví dụ: Dự án AIoT Smart Office..."
                  />
                </label>

                <label className="field">
                  <span>Lý do / Mô tả công việc chi tiết</span>
                  <textarea
                    rows={2}
                    value={otReason}
                    onChange={e => setOtReason(e.target.value)}
                    placeholder="Nhập lý do cần tăng ca ngoài giờ..."
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
                  {submittingOt ? 'Đang gửi…' : 'Gửi đơn đăng ký OT'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
