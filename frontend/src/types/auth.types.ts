export const roles = ['ADMIN', 'HR', 'DEPT_LEAD', 'SECURITY'] as const
export type Role = typeof roles[number]

export const roleLabels: Record<Role, string> = {
  ADMIN: 'Quản trị viên',
  HR: 'Nhân sự',
  DEPT_LEAD: 'Trưởng phòng',
  SECURITY: 'An ninh',
}

export const roleDescriptions: Record<Role, string> = {
  ADMIN: 'Toàn quyền cấu hình Camera, vùng bàn và quản lý tài khoản.',
  HR: 'Hồ sơ nhân viên, sinh trắc khuôn mặt, chấm công và báo cáo.',
  DEPT_LEAD: 'Hiện diện, chấm công và sơ đồ chỗ ngồi của Phòng Kỹ thuật (IT).',
  SECURITY: 'Giám sát Camera thời gian thực, trực ban và cảnh báo đột nhập.',
}

export const roleBadges: Record<Role, string> = {
  ADMIN: 'Toàn quyền hệ thống',
  HR: 'Hồ sơ & Chấm công',
  DEPT_LEAD: 'Phòng Kỹ thuật (IT)',
  SECURITY: 'Giám sát & An ninh',
}

export interface AppUser {
  id: string
  username: string
  fullName: string
  role: Role
  departmentId: string | null
  isActive: boolean
  createdAt: string
}

export interface Session {
  accessToken: string
  user: AppUser
  expiresAt: number
}

export interface Department {
  id: string
  departmentCode: string
  departmentName: string
}

export interface CreateUserInput {
  username: string
  password: string
  fullName: string
  role: Role
  departmentId: string | null
}
