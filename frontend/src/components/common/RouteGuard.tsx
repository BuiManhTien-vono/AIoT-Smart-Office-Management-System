import type { ReactNode } from 'react'
import type { Role, Session } from '../../types/auth.types'

export function RouteGuard({ session, allowedRoles, children }: {
  session: Session
  allowedRoles: readonly Role[]
  children: ReactNode
}) {
  if (!allowedRoles.includes(session.user.role)) {
    return <section className="panel access-message" role="alert">
      <p className="eyebrow">QUYỀN TRUY CẬP</p>
      <h1>Bạn chưa được cấp quyền xem trang này</h1>
      <p className="muted">Liên hệ quản trị viên nếu bạn cần truy cập chức năng này.</p>
      <a className="button button-primary" href="#/dashboard">Về tổng quan</a>
    </section>
  }
  if (session.user.role === 'DEPT_LEAD' && !session.user.departmentId) {
    return <section className="panel access-message" role="alert">
      <p className="eyebrow">PHẠM VI DỮ LIỆU</p>
      <h1>Tài khoản chưa được gán phòng ban</h1>
      <p className="muted">Liên hệ quản trị viên để cấu hình phòng ban trước khi xem số liệu.</p>
    </section>
  }
  return children
}
