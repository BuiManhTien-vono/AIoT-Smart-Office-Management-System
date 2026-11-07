export const roles = ['ADMIN', 'HR', 'DEPT_LEAD', 'SECURITY'] as const
export type Role = typeof roles[number]

export const roleLabels: Record<Role, string> = {
  ADMIN: 'Quản trị viên',
  HR: 'Nhân sự',
  DEPT_LEAD: 'Trưởng phòng',
  SECURITY: 'An ninh',
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
