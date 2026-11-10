export type ApiOptions = RequestInit & { token?: string }

const configuredBase = (import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:5155').replace(/\/+$/, '')
const backendBase = configuredBase.replace(/\/api\/v1$/i, '')
export const apiBase = `${backendBase}/api/v1`
export const backendHealthUrl = `${backendBase}/api/health`
export const aiHealthUrl = `${(import.meta.env.VITE_AI_SERVICE_URL || 'http://localhost:8000').replace(/\/+$/, '')}/health`
export const unauthorizedEvent = 'smart-office:unauthorized'

export class ApiError extends Error {
  readonly status: number
  readonly code?: string

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

export async function apiFetch(path: string, options: ApiOptions = {}): Promise<Response> {
  const { token, signal, ...requestOptions } = options
  const headers = new Headers(options.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (typeof options.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const timeout = AbortSignal.timeout(15_000)
  let response: Response
  try {
    response = await fetch(`${apiBase}/${path.replace(/^\/+/, '')}`, {
      ...requestOptions,
      headers,
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    })
  } catch (error) {
    if (signal?.aborted) throw error
    throw new ApiError(timeout.aborted
      ? 'Dịch vụ phản hồi quá lâu. Vui lòng thử lại.'
      : 'Không kết nối được dịch vụ. Kiểm tra kết nối rồi thử lại.', 0)
  }
  if (!response.ok) {
    const detail = await response.json().catch(() => null) as { message?: string; code?: string } | null
    signal?.throwIfAborted()
    if (response.status === 401 && token) {
      window.dispatchEvent(new CustomEvent(unauthorizedEvent, { detail: { token } }))
    }
    throw new ApiError(detail?.message || `Yêu cầu không thành công (mã ${response.status}).`, response.status, detail?.code)
  }
  return response
}

export async function apiRequest<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const response = await apiFetch(path, options)
  if (response.status === 204 || response.headers.get('content-length') === '0') {
    return undefined as unknown as T
  }
  return response.json() as Promise<T>
}
