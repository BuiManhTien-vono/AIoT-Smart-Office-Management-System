import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowClockwise, MagnifyingGlass, Plus, UsersThree, X } from '@phosphor-icons/react'
import { useQuery } from '../../components/common/useQuery'
import { createUser, listDepartments, listUsers } from '../../services/authService'
import { ApiError } from '../../services/apiClient'
import { roleLabels, roles } from '../../types/auth.types'
import type { Department, Role, Session } from '../../types/auth.types'
import './users.css'

type Fields = { fullName: string; username: string; password: string; role: Role; departmentId: string }
type FieldErrors = Partial<Record<keyof Fields, string>>

const emptyFields: Fields = { fullName: '', username: '', password: '', role: 'HR', departmentId: '' }
const fieldNames: Record<keyof Fields, string> = { fullName: 'Họ và tên', username: 'Tên đăng nhập', password: 'Mật khẩu', role: 'Vai trò', departmentId: 'Phòng ban' }

function searchable(value: string) {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase()
}

function CreateUserDialog({ token, departments, departmentError, onReloadDepartments, onClose, onCreated }: {
  token: string
  departments: Department[]
  departmentError: string
  onReloadDepartments: () => void
  onClose: () => void
  onCreated: (username: string) => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const summary = useRef<HTMLDivElement>(null)
  const [fields, setFields] = useState<Fields>(emptyFields)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [serverError, setServerError] = useState('')
  const [busy, setBusy] = useState(false)
  const sending = useRef(false)
  const controller = useRef<AbortController | null>(null)
  const needsDepartment = fields.role === 'HR' || fields.role === 'DEPT_LEAD'

  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => { controller.current?.abort(); element?.close() }
  }, [])

  function change<K extends keyof Fields>(key: K, value: Fields[K]) {
    setFields(current => ({ ...current, [key]: value, ...(key === 'role' ? { departmentId: '' } : {}) }))
    setErrors(current => ({
      ...current,
      [key]: undefined,
      ...(key === 'role' ? { departmentId: undefined } : {}),
    }))
    setServerError('')
  }

  function focusErrors() { requestAnimationFrame(() => summary.current?.focus()) }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (sending.current) return
    const nextErrors: FieldErrors = {}
    if (!fields.fullName.trim()) nextErrors.fullName = 'Nhập họ và tên của người dùng.'
    if (fields.username.trim().length < 3) nextErrors.username = 'Tên đăng nhập cần ít nhất 3 ký tự.'
    if (fields.password.trim().length === 0 || fields.password.length < 6) nextErrors.password = 'Mật khẩu cần ít nhất 6 ký tự và không được chỉ có khoảng trắng.'
    if (fields.role === 'DEPT_LEAD' && !fields.departmentId) nextErrors.departmentId = 'Chọn phòng ban mà Trưởng phòng phụ trách.'
    setErrors(nextErrors)
    setServerError('')
    if (Object.keys(nextErrors).length) { focusErrors(); return }

    sending.current = true
    setBusy(true)
    const request = new AbortController()
    controller.current = request
    try {
      const created = await createUser(token, {
        fullName: fields.fullName.trim(), username: fields.username.trim(), password: fields.password,
        role: fields.role, departmentId: needsDepartment ? fields.departmentId || null : null,
      }, request.signal)
      if (!request.signal.aborted) onCreated(created.username)
    } catch (cause) {
      if (!request.signal.aborted) {
        if (cause instanceof ApiError && cause.code === 'USERNAME_EXISTS') setErrors({ username: cause.message })
        else setServerError(cause instanceof Error ? cause.message : 'Không tạo được tài khoản. Vui lòng thử lại.')
        focusErrors()
      }
    } finally {
      if (!request.signal.aborted) { sending.current = false; setBusy(false) }
    }
  }

  return <dialog
    className="user-dialog"
    ref={dialog}
    aria-labelledby="create-user-title"
    aria-describedby="create-user-description"
    onClose={() => { if (!dialog.current?.open) onClose() }}
    onCancel={event => { if (sending.current) event.preventDefault() }}
  >
    <div className="user-dialog-heading">
      <div>
        <p className="eyebrow">QUẢN TRỊ TÀI KHOẢN</p>
        <h2 id="create-user-title">Tạo tài khoản mới</h2>
      </div>
      <button
        type="button"
        className="button button-secondary user-dialog-close"
        aria-label="Đóng tạo tài khoản"
        disabled={busy}
        onClick={() => dialog.current?.close()}
      ><X size={20} aria-hidden="true" /></button>
    </div>
    <p id="create-user-description" className="muted">Cấp quyền truy cập cho người vận hành. Các trường có dấu * là bắt buộc.</p>
    <form className="user-create-form" onSubmit={submit} noValidate aria-busy={busy}>
      {(Object.values(errors).some(Boolean) || serverError) && <div className="alert alert-error user-error-summary" role="alert" tabIndex={-1} ref={summary}>
        <strong>Chưa thể tạo tài khoản</strong>
        {serverError && <p>{serverError}</p>}
        <ul>{(Object.keys(errors) as (keyof Fields)[]).filter(key => errors[key]).map(key => <li key={key}>
          <a href={`#create-user-${key}`} onClick={event => {
            event.preventDefault()
            document.getElementById(`create-user-${key}`)?.focus()
          }}>{fieldNames[key]} — {errors[key]}</a>
        </li>)}</ul>
      </div>}
      <label className="field" htmlFor="create-user-fullName">Họ và tên *
        <input id="create-user-fullName" name="fullName" autoComplete="name" required value={fields.fullName} disabled={busy} aria-invalid={Boolean(errors.fullName)} aria-describedby={errors.fullName ? 'error-fullName' : undefined} onChange={event => change('fullName', event.target.value)} />
        {errors.fullName && <span className="field-error" id="error-fullName">{errors.fullName}</span>}
      </label>
      <label className="field" htmlFor="create-user-username">Tên đăng nhập *
        <input id="create-user-username" name="username" autoComplete="off" required minLength={3} value={fields.username} disabled={busy} aria-invalid={Boolean(errors.username)} aria-describedby={errors.username ? 'error-username' : 'username-hint'} onChange={event => change('username', event.target.value)} />
        {errors.username ? <span className="field-error" id="error-username">{errors.username}</span> : <span className="field-hint" id="username-hint">Tối thiểu 3 ký tự, không trùng tài khoản đã có.</span>}
      </label>
      <label className="field" htmlFor="create-user-password">Mật khẩu *
        <input id="create-user-password" name="password" type="password" autoComplete="new-password" required minLength={6} value={fields.password} disabled={busy} aria-invalid={Boolean(errors.password)} aria-describedby={errors.password ? 'error-password' : 'password-hint'} onChange={event => change('password', event.target.value)} />
        {errors.password ? <span className="field-error" id="error-password">{errors.password}</span> : <span className="field-hint" id="password-hint">Tối thiểu 6 ký tự.</span>}
      </label>
      <label className="field" htmlFor="create-user-role">Vai trò *
        <select id="create-user-role" name="role" value={fields.role} disabled={busy} onChange={event => change('role', event.target.value as Role)}>
          {roles.map(role => <option value={role} key={role}>{roleLabels[role]}</option>)}
        </select>
      </label>
      {needsDepartment && <label className="field" htmlFor="create-user-departmentId">Phòng ban {fields.role === 'DEPT_LEAD' ? '*' : '(không bắt buộc)'}
        <select id="create-user-departmentId" name="departmentId" value={fields.departmentId} required={fields.role === 'DEPT_LEAD'} disabled={busy}
          aria-invalid={Boolean(errors.departmentId)}
          aria-describedby={errors.departmentId ? 'error-departmentId' : 'department-hint'}
          onChange={event => change('departmentId', event.target.value)}>
          <option value="">{fields.role === 'DEPT_LEAD' ? 'Chọn phòng ban phụ trách' : 'Không gán phòng ban'}</option>
          {departments.map(department => <option value={department.id} key={department.id}>{department.departmentName}</option>)}
        </select>
        {errors.departmentId ? <span className="field-error" id="error-departmentId">{errors.departmentId}</span> : <span className="field-hint" id="department-hint">{fields.role === 'DEPT_LEAD' ? 'Tài khoản chỉ được xem dữ liệu trong phòng ban được gán.' : 'Phạm vi truy cập tuân theo quyền Nhân sự.'}</span>}
      </label>}
      {needsDepartment && departmentError && <div className="alert">
        <p>Không tải được danh mục phòng ban. {departmentError}</p>
        <button type="button" className="button button-secondary" disabled={busy} onClick={onReloadDepartments}>Tải lại phòng ban</button>
      </div>}
      {fields.role === 'DEPT_LEAD' && !departmentError && departments.length === 0 && <p className="user-inline-note">Chưa có phòng ban. Cần tạo phòng ban trước khi cấp tài khoản Trưởng phòng.</p>}
      <div className="user-dialog-actions">
        <button type="button" className="button button-secondary" disabled={busy} onClick={() => dialog.current?.close()}>Hủy</button>
        <button className="button button-primary" type="submit" disabled={busy}>{busy ? 'Đang tạo tài khoản…' : 'Tạo tài khoản'}</button>
      </div>
    </form>
  </dialog>
}

export function UserManagementPage({ session }: { session: Session }) {
  const loadUsers = useCallback((signal: AbortSignal) => listUsers(session.accessToken, signal), [session.accessToken])
  const loadDepartments = useCallback((signal: AbortSignal) => listDepartments(session.accessToken, signal), [session.accessToken])
  const users = useQuery(loadUsers)
  const departments = useQuery(loadDepartments)
  const [search, setSearch] = useState('')
  const [role, setRole] = useState<Role | ''>('')
  const [departmentId, setDepartmentId] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [notice, setNotice] = useState('')
  const createButton = useRef<HTMLButtonElement>(null)
  const directory = new Map((departments.data ?? []).map(item => [item.id, item.departmentName]))
  const normalizedSearch = searchable(search.trim())
  const filtered = (users.data ?? []).filter(user => (!role || user.role === role)
    && (!departmentId || (departmentId === 'unassigned' ? !user.departmentId : user.departmentId === departmentId))
    && (!normalizedSearch || searchable(`${user.fullName} ${user.username}`).includes(normalizedSearch)))
  const hasFilters = Boolean(search || role || departmentId)

  function closeCreate() {
    setShowCreate(false)
    requestAnimationFrame(() => createButton.current?.focus())
  }

  function clearFilters() {
    setSearch('')
    setRole('')
    setDepartmentId('')
  }

  function accountCreated(username: string) {
    setNotice(`Tài khoản ${username} đã được thêm vào hệ thống.`)
    clearFilters()
    closeCreate()
    users.refresh()
  }

  return <>
    <header className="page-heading">
      <div>
        <h1>Quản lý tài khoản</h1>
        <p className="muted">Cấp quyền phù hợp cho từng người vận hành văn phòng.</p>
      </div>
      <button className="button button-primary" type="button" ref={createButton} onClick={() => { setNotice(''); setShowCreate(true) }}>
        <Plus size={18} aria-hidden="true" />Tạo tài khoản
      </button>
    </header>
    {notice && <div className="user-success" role="status"><strong>Tạo tài khoản thành công.</strong> {notice}</div>}
    <section className="panel user-directory" aria-labelledby="user-directory-title">
      <div className="user-directory-heading">
        <div>
          <h2 id="user-directory-title">Tài khoản hệ thống</h2>
          <p className="muted">{users.updatedAt ? `Kiểm tra lúc ${users.updatedAt.toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })} · Giờ Việt Nam` : 'Danh sách tài khoản được cấp quyền truy cập.'}</p>
        </div>
        <button className="button button-secondary" type="button" disabled={users.loading} onClick={users.refresh}>
          <ArrowClockwise size={17} aria-hidden="true" />{users.loading ? 'Đang tải…' : 'Làm mới'}
        </button>
      </div>
      <div className="toolbar user-filter-toolbar">
        <div className="field user-search">
          <label htmlFor="user-search">Tìm tài khoản</label>
          <div className="user-search-input">
            <MagnifyingGlass size={18} aria-hidden="true" />
            <input type="search" id="user-search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Họ tên hoặc tên đăng nhập" />
          </div>
        </div>
        <label className="field" htmlFor="user-role-filter">Vai trò
          <select id="user-role-filter" value={role} onChange={event => setRole(event.target.value as Role | '')}>
            <option value="">Tất cả vai trò</option>
            {roles.map(value => <option value={value} key={value}>{roleLabels[value]}</option>)}
          </select>
        </label>
        <label className="field" htmlFor="user-department-filter">Phòng ban
          <select id="user-department-filter" value={departmentId} onChange={event => setDepartmentId(event.target.value)}>
            <option value="">Tất cả phòng ban</option>
            <option value="unassigned">Chưa gán phòng ban</option>
            {(departments.data ?? []).map(department => <option value={department.id} key={department.id}>{department.departmentName}</option>)}
          </select>
        </label>
      </div>
      {departments.error && <div className="alert user-department-error" role="alert">
        <span>Không tải được phòng ban. {departments.error}</span>
        <button className="button button-secondary" type="button" disabled={departments.loading} onClick={departments.refresh}>Thử lại phòng ban</button>
      </div>}
      {users.error && <div className="empty-state" role="alert">
        <strong>Không thể tải danh sách tài khoản</strong>
        <p>{users.error}</p>
        <button className="button button-secondary" type="button" onClick={users.refresh}>Thử lại</button>
      </div>}
      {!users.error && users.loading && <div className="empty-state" role="status">
        <span className="user-loading-mark" aria-hidden="true" />
        <strong>Đang tải danh sách tài khoản…</strong>
      </div>}
      {!users.error && !users.loading && filtered.length === 0 && <div className="empty-state">
        <UsersThree size={36} aria-hidden="true" />
        <h3>{hasFilters ? 'Không tìm thấy tài khoản phù hợp' : 'Chưa có tài khoản'}</h3>
        <p>{hasFilters ? 'Thử thay đổi từ khóa hoặc xóa bộ lọc để xem thêm tài khoản.' : 'Tạo tài khoản đầu tiên để cấp quyền vận hành.'}</p>
        {hasFilters && <button className="button button-secondary" type="button" onClick={clearFilters}>Xóa bộ lọc</button>}
      </div>}
      {!users.error && !users.loading && filtered.length > 0 && <>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Danh sách tài khoản, cuộn ngang để xem đủ các cột">
          <table className="user-table">
            <caption className="sr-only">Danh sách tài khoản theo bộ lọc đã chọn</caption>
            <thead><tr>
              <th scope="col">Người dùng</th>
              <th scope="col">Tên đăng nhập</th>
              <th scope="col">Vai trò</th>
              <th scope="col">Phòng ban</th>
              <th scope="col">Trạng thái</th>
            </tr></thead>
            <tbody>{filtered.map(user => <tr key={user.id}>
              <td><span className="user-name-cell">
                <span className="user-initial" aria-hidden="true">{user.fullName.trim().charAt(0).toUpperCase() || user.username.charAt(0).toUpperCase()}</span>
                <strong>{user.fullName || user.username}</strong>
              </span></td>
              <td className="user-username">{user.username}</td>
              <td>{roleLabels[user.role]}</td>
              <td title={user.departmentId ?? undefined}>{user.departmentId ? directory.get(user.departmentId) ?? 'Phòng ban chưa có trong danh mục' : 'Chưa gán phòng ban'}</td>
              <td><span className={`badge ${user.isActive ? 'user-status-active' : 'user-status-inactive'}`}>
                <span aria-hidden="true" />{user.isActive ? 'Đang hoạt động' : 'Đã khóa'}
              </span></td>
            </tr>)}</tbody>
          </table>
        </div>
        <p className="user-results-count" role="status">Hiển thị {filtered.length} / {users.data?.length ?? 0} tài khoản</p>
      </>}
    </section>
    {showCreate && <CreateUserDialog
      token={session.accessToken}
      departments={departments.data ?? []}
      departmentError={departments.error}
      onReloadDepartments={departments.refresh}
      onClose={closeCreate}
      onCreated={accountCreated}
    />}
  </>
}
