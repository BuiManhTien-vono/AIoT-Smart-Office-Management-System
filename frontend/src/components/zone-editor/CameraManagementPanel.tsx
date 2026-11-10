import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { ChangeEvent, FormEvent } from 'react'
import {
  Plus,
  UploadSimple,
  VideoCamera,
  CheckCircle,
  WarningCircle,
  DotsThreeVertical,
  PencilSimple,
  Trash,
  X,
  Warning,
} from '@phosphor-icons/react'
import type { Camera as CameraModel, CameraType } from '../../types/occupancy.types'
import { createCamera, updateCamera, deleteCamera, uploadCalibrationFrame } from '../../services/occupancyService'

interface Props {
  cameras: CameraModel[]
  selectedCameraId: string | null
  onSelectCamera: (camera: CameraModel) => void
  onCameraCreated: () => void
  onCameraUpdated: (camera: CameraModel) => void
  onCameraDeleted: (cameraId: string) => void
  onCalibrationUploaded: (camera: CameraModel, presignedUrl: string) => void
  token: string
  loading?: boolean
}

function normalizeCameraStreamSource(src: string): string {
  const s = src.trim()
  if (!s) return ''
  if (/^https?:\/\/[^/]+:8080\/?$/i.test(s)) return s.replace(/\/?$/, '/video')
  if (/^https?:\/\/[^/]+:4747\/?$/i.test(s)) return s.replace(/\/?$/, '/video')
  return s
}

export function CameraManagementPanel({
  cameras,
  selectedCameraId,
  onSelectCamera,
  onCameraCreated,
  onCameraUpdated,
  onCameraDeleted,
  onCalibrationUploaded,
  token,
  loading = false,
}: Props) {
  // Modal states
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [editingCamera, setEditingCamera] = useState<CameraModel | null>(null)
  const [deletingCamera, setDeletingCamera] = useState<CameraModel | null>(null)
  const [openMenuCameraId, setOpenMenuCameraId] = useState<string | null>(null)

  // Upload state
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  // Form states
  const [formSubmitting, setFormSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Create form fields
  const [cameraCode, setCameraCode] = useState('')
  const [cameraName, setCameraName] = useState('')
  const [streamSource, setStreamSource] = useState('')
  const [cameraType, setCameraType] = useState<CameraType>('DESK')

  // Edit form fields
  const [editName, setEditName] = useState('')
  const [editStream, setEditStream] = useState('')
  const [editType, setEditType] = useState<CameraType>('DESK')
  const [editIsOnline, setEditIsOnline] = useState(true)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // Close 3-dots dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside() {
      setOpenMenuCameraId(null)
    }
    if (openMenuCameraId) {
      window.addEventListener('click', handleClickOutside)
      return () => window.removeEventListener('click', handleClickOutside)
    }
  }, [openMenuCameraId])

  const selectedCamera = cameras.find(c => c.id === selectedCameraId) ?? null

  // Open Edit Modal
  function handleOpenEdit(cam: CameraModel) {
    setEditingCamera(cam)
    setEditName(cam.cameraName)
    setEditStream(cam.streamSource)
    setEditType(cam.cameraType)
    setEditIsOnline(cam.isOnline)
    setFormError(null)
  }

  // Open Delete Dialog
  function handleOpenDelete(cam: CameraModel) {
    setDeletingCamera(cam)
    setFormError(null)
  }

  // Submit Create Camera
  async function handleCreateCamera(e: FormEvent) {
    e.preventDefault()
    if (!cameraCode.trim() || !cameraName.trim() || !streamSource.trim()) {
      setFormError('Vui lòng điền đầy đủ các trường bắt buộc.')
      return
    }

    setFormSubmitting(true)
    setFormError(null)

    try {
      await createCamera(token, {
        cameraCode: cameraCode.trim().toUpperCase(),
        cameraName: cameraName.trim(),
        streamSource: normalizeCameraStreamSource(streamSource),
        cameraType,
        isOnline: true,
      })
      setIsCreateModalOpen(false)
      setCameraCode('')
      setCameraName('')
      setStreamSource('')
      setCameraType('DESK')
      onCameraCreated()
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Không thể tạo camera mới.')
    } finally {
      setFormSubmitting(false)
    }
  }

  // Submit Update Camera
  async function handleUpdateCamera(e: FormEvent) {
    e.preventDefault()
    if (!editingCamera) return

    if (!editName.trim() || !editStream.trim()) {
      setFormError('Vui lòng điền tên camera và nguồn phát video.')
      return
    }

    setFormSubmitting(true)
    setFormError(null)

    try {
      const updated = await updateCamera(token, editingCamera.id, {
        cameraName: editName.trim(),
        streamSource: normalizeCameraStreamSource(editStream),
        cameraType: editType,
        isOnline: editIsOnline,
      })
      setEditingCamera(null)
      onCameraUpdated(updated)
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Không thể cập nhật camera.')
    } finally {
      setFormSubmitting(false)
    }
  }

  // Submit Delete Camera
  async function handleDeleteCamera() {
    if (!deletingCamera) return

    setFormSubmitting(true)
    setFormError(null)

    try {
      await deleteCamera(token, deletingCamera.id)
      const deletedId = deletingCamera.id
      setDeletingCamera(null)
      onCameraDeleted(deletedId)
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Không thể xóa camera.')
    } finally {
      setFormSubmitting(false)
    }
  }

  // Upload calibration frame
  async function handleFileUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !selectedCamera) return

    setIsUploading(true)
    setUploadError(null)

    // Set local preview immediately
    const localUrl = URL.createObjectURL(file)
    onCalibrationUploaded(selectedCamera, localUrl)

    try {
      const res = await uploadCalibrationFrame(token, selectedCamera.id, file)
      onCalibrationUploaded(selectedCamera, res.presignedUrl || localUrl)
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : 'Lỗi khi tải ảnh hiệu chuẩn.')
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <aside className="panel camera-panel" aria-label="Quản lý danh sách camera">
      <div className="camera-panel-heading">
        <div>
          <p className="eyebrow">NGUỒN HÌNH ẢNH</p>
          <h2>Danh sách Camera</h2>
        </div>
        <button
          type="button"
          className="button button-primary button-sm"
          onClick={() => setIsCreateModalOpen(true)}
          title="Thêm camera mới"
        >
          <Plus size={16} aria-hidden="true" />
          <span>Thêm</span>
        </button>
      </div>

      {loading && cameras.length === 0 ? (
        <p className="muted" style={{ padding: '12px 0' }}>Đang tải danh sách camera…</p>
      ) : cameras.length === 0 ? (
        <div className="empty-state">
          <VideoCamera size={32} className="muted" aria-hidden="true" />
          <p>Chưa có camera nào được thiết lập.</p>
        </div>
      ) : (
        <ul className="camera-list" role="listbox" aria-label="Chọn camera hiệu chuẩn">
          {cameras.map(cam => {
            const isSelected = cam.id === selectedCameraId
            return (
              <li
                key={cam.id}
                role="option"
                aria-selected={isSelected}
                tabIndex={0}
                className={`camera-item ${isSelected ? 'active' : ''}`}
                onClick={() => onSelectCamera(cam)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onSelectCamera(cam)
                  }
                }}
              >
                <div className="camera-item-main">
                  <div className="camera-item-title">
                    <span className="camera-code">{cam.cameraCode}</span>
                    
                    {/* Dấu 3 chấm ở góc phải mỗi camera */}
                    <div className="camera-menu-container">
                      <button
                        type="button"
                        className="camera-menu-trigger"
                        onClick={e => {
                          e.stopPropagation()
                          setOpenMenuCameraId(prev => (prev === cam.id ? null : cam.id))
                        }}
                        aria-label={`Tùy chọn cho camera ${cam.cameraCode}`}
                        title="Tùy chọn camera"
                      >
                        <DotsThreeVertical size={16} weight="bold" />
                      </button>

                      {openMenuCameraId === cam.id && (
                        <div
                          className="camera-menu-dropdown"
                          onClick={e => e.stopPropagation()}
                          role="menu"
                        >
                          <button
                            type="button"
                            className="camera-menu-item"
                            role="menuitem"
                            onClick={() => {
                              setOpenMenuCameraId(null)
                              handleOpenEdit(cam)
                            }}
                          >
                            <PencilSimple size={14} aria-hidden="true" />
                            <span>Chỉnh sửa</span>
                          </button>
                          <button
                            type="button"
                            className="camera-menu-item text-danger"
                            role="menuitem"
                            onClick={() => {
                              setOpenMenuCameraId(null)
                              handleOpenDelete(cam)
                            }}
                          >
                            <Trash size={14} aria-hidden="true" />
                            <span>Xóa camera</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <p className="camera-name muted">{cam.cameraName}</p>
                </div>

                {/* Phần loại camera chuyển sang bên cạnh chấm xanh */}
                <div className="camera-item-meta">
                  <div className="camera-status-cluster">
                    <span
                      className={`status-dot ${cam.isOnline ? 'online' : 'offline'}`}
                      title={cam.isOnline ? 'Trực tuyến' : 'Ngoại tuyến'}
                    />
                    <span className={`badge ${cam.cameraType === 'DESK' ? 'badge-info' : 'badge-special'}`}>
                      {cam.cameraType === 'DESK' ? 'Phòng làm việc' : 'Cửa sảnh'}
                    </span>
                    {cam.streamSource && (cam.streamSource.toLowerCase().endsWith('.mp4') || cam.streamSource.toLowerCase().includes('demo')) && (
                      <span className="badge badge-accent badge-subtle" title="Nguồn video file mẫu">
                        Video Demo
                      </span>
                    )}
                  </div>

                  {cam.calibrationFrameKey ? (
                    <span className="badge badge-success badge-subtle" title="Đã có khung hình hiệu chuẩn">
                      <CheckCircle size={12} aria-hidden="true" /> Ảnh nền
                    </span>
                  ) : (
                    <span className="badge badge-warning badge-subtle" title="Chưa có khung hình mẫu">
                      <WarningCircle size={12} aria-hidden="true" /> Chưa có ảnh
                    </span>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {selectedCamera && (
        <div className="camera-calibration-actions">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept="image/jpeg,image/png,image/webp"
            style={{ display: 'none' }}
          />
          <button
            type="button"
            className="button button-secondary button-block"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
          >
            <UploadSimple size={16} aria-hidden="true" />
            <span>{isUploading ? 'Đang tải ảnh lên…' : 'Cập nhật ảnh khung hình'}</span>
          </button>
          {uploadError && <p className="field-error" style={{ marginTop: '6px' }}>{uploadError}</p>}
        </div>
      )}

      {/* Modal 1: Thêm Camera Mới */}
      {isCreateModalOpen && createPortal(
        <div className="modal-backdrop" onClick={() => setIsCreateModalOpen(false)}>
          <div
            className="panel app-dialog"
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-camera-title"
          >
            <div className="app-dialog-heading">
              <div>
                <p className="eyebrow">THIẾT BỊ MỚI</p>
                <h2 id="create-camera-title">Thêm Camera Giám sát</h2>
              </div>
              <button
                type="button"
                className="button button-secondary app-dialog-close"
                onClick={() => setIsCreateModalOpen(false)}
                aria-label="Đóng"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>

            {formError && (
              <div className="alert alert-error" role="alert">
                <p>{formError}</p>
              </div>
            )}

            <form onSubmit={handleCreateCamera}>
              <div className="field">
                <label htmlFor="cam-code">Mã Camera *</label>
                <input
                  id="cam-code"
                  type="text"
                  placeholder="VD: CAM_DESK_02"
                  value={cameraCode}
                  onChange={e => setCameraCode(e.target.value)}
                  required
                />
                <small>Mã viết hoa, không dấu, viết liền.</small>
              </div>

              <div className="field" style={{ marginTop: '12px' }}>
                <label htmlFor="cam-name">Tên hiển thị *</label>
                <input
                  id="cam-name"
                  type="text"
                  placeholder="VD: Camera Phòng Kỹ Thuật Số 2"
                  value={cameraName}
                  onChange={e => setCameraName(e.target.value)}
                  required
                />
              </div>

              <div className="field" style={{ marginTop: '12px' }}>
                <label htmlFor="cam-type">Loại Camera *</label>
                <select
                  id="cam-type"
                  value={cameraType}
                  onChange={e => setCameraType(e.target.value as CameraType)}
                >
                  <option value="DESK">DESK — Camera Bàn làm việc</option>
                  <option value="GATE">GATE — Camera Cửa / Sảnh chấm công</option>
                </select>
              </div>

              <div className="field" style={{ marginTop: '12px' }}>
                <label htmlFor="cam-stream">Nguồn Luồng Video (RTSP / URL / 0) *</label>
                <input
                  id="cam-stream"
                  type="text"
                  placeholder="http://192.168.1.xxx:8080/video hoặc 0"
                  value={streamSource}
                  onChange={e => setStreamSource(e.target.value)}
                  required
                />
                <small className="muted" style={{ marginTop: '4px', lineHeight: '1.4' }}>
                  • Webcam: <code>0</code> | Video mẫu: <code>demo.mp4</code><br />
                  • Camera điện thoại: <code>http://192.168.x.x:8080/video</code> (IP Webcam) hoặc <code>http://192.168.x.x:4747/video</code> (DroidCam)
                </small>
              </div>

              <div className="app-dialog-actions">
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => setIsCreateModalOpen(false)}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="button button-primary"
                  disabled={formSubmitting}
                >
                  {formSubmitting ? 'Đang lưu…' : 'Thêm Camera'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Modal 2: Chỉnh Sửa Camera */}
      {editingCamera && createPortal(
        <div className="modal-backdrop" onClick={() => setEditingCamera(null)}>
          <div
            className="panel app-dialog"
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-camera-title"
          >
            <div className="app-dialog-heading">
              <div>
                <p className="eyebrow">CẬP NHẬT THIẾT BỊ</p>
                <h2 id="edit-camera-title">Chỉnh sửa Camera ({editingCamera.cameraCode})</h2>
              </div>
              <button
                type="button"
                className="button button-secondary app-dialog-close"
                onClick={() => setEditingCamera(null)}
                aria-label="Đóng"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>

            {formError && (
              <div className="alert alert-error" role="alert">
                <p>{formError}</p>
              </div>
            )}

            <form onSubmit={handleUpdateCamera}>
              <div className="field">
                <label htmlFor="edit-cam-code">Mã Camera</label>
                <input
                  id="edit-cam-code"
                  type="text"
                  value={editingCamera.cameraCode}
                  disabled
                  className="disabled-field"
                />
                <small>Mã camera cố định theo định danh hệ thống.</small>
              </div>

              <div className="field" style={{ marginTop: '12px' }}>
                <label htmlFor="edit-cam-name">Tên hiển thị *</label>
                <input
                  id="edit-cam-name"
                  type="text"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  required
                />
              </div>

              <div className="field" style={{ marginTop: '12px' }}>
                <label htmlFor="edit-cam-type">Loại Camera *</label>
                <select
                  id="edit-cam-type"
                  value={editType}
                  onChange={e => setEditType(e.target.value as CameraType)}
                >
                  <option value="DESK">DESK — Camera Bàn làm việc</option>
                  <option value="GATE">GATE — Camera Cửa / Sảnh chấm công</option>
                </select>
              </div>

              <div className="field" style={{ marginTop: '12px' }}>
                <label htmlFor="edit-cam-stream">Nguồn Luồng Video (RTSP / URL / 0) *</label>
                <input
                  id="edit-cam-stream"
                  type="text"
                  value={editStream}
                  onChange={e => setEditStream(e.target.value)}
                  required
                />
                <small className="muted" style={{ marginTop: '4px', lineHeight: '1.4' }}>
                  • Webcam: <code>0</code> | Video mẫu: <code>demo.mp4</code><br />
                  • Camera điện thoại: <code>http://192.168.x.x:8080/video</code> (IP Webcam) hoặc <code>http://192.168.x.x:4747/video</code> (DroidCam)
                </small>
              </div>

              <div className="field" style={{ marginTop: '12px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={editIsOnline}
                    onChange={e => setEditIsOnline(e.target.checked)}
                  />
                  <span>Kích hoạt trạng thái Trực tuyến (Online)</span>
                </label>
              </div>

              <div className="app-dialog-actions">
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => setEditingCamera(null)}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="button button-primary"
                  disabled={formSubmitting}
                >
                  {formSubmitting ? 'Đang cập nhật…' : 'Lưu thay đổi'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Modal 3: Xác Nhận Xóa Camera */}
      {deletingCamera && createPortal(
        <div className="modal-backdrop" onClick={() => setDeletingCamera(null)}>
          <div
            className="panel app-dialog app-dialog-confirm"
            onClick={e => e.stopPropagation()}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-camera-title"
          >
            <div className="confirm-delete-header">
              <div className="confirm-delete-icon-box">
                <Warning size={24} weight="fill" aria-hidden="true" />
              </div>
              <div className="confirm-delete-header-text" style={{ flex: 1 }}>
                <h2 id="delete-camera-title">Xác nhận xóa Camera</h2>
                <p>Thao tác này không thể hoàn tác</p>
              </div>
              <button
                type="button"
                className="button button-secondary app-dialog-close"
                onClick={() => setDeletingCamera(null)}
                aria-label="Đóng"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>

            {formError && (
              <div className="alert alert-error" role="alert">
                <p>{formError}</p>
              </div>
            )}

            <div style={{ margin: '14px 0', fontSize: '0.875rem', lineHeight: '1.5' }}>
              <p>
                Bạn có chắc chắn muốn xóa camera{' '}
                <strong>{deletingCamera.cameraCode}</strong> ({deletingCamera.cameraName})?
              </p>
              <div className="confirm-delete-callout">
                ⚠️ <strong>Cảnh báo mất dữ liệu:</strong> Toàn bộ các vùng bàn làm việc và dữ liệu lịch sử trạng thái liên quan đến camera này sẽ bị xóa vĩnh viễn khỏi hệ thống.
              </div>
            </div>

            <div className="app-dialog-actions">
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setDeletingCamera(null)}
                disabled={formSubmitting}
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                className="button button-danger"
                onClick={handleDeleteCamera}
                disabled={formSubmitting}
              >
                {formSubmitting ? 'Đang xóa…' : 'Xóa vĩnh viễn'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </aside>
  )
}
