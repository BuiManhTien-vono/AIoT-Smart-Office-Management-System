import { useCallback, useEffect, useRef, useState } from 'react'

interface QueryState<T> {
  data: T | undefined
  loading: boolean
  error: string
  updatedAt: Date | null
  source: (signal: AbortSignal) => Promise<T>
}

export function useQuery<T>(load: (signal: AbortSignal) => Promise<T>, intervalMs = 0) {
  const [state, setState] = useState<QueryState<T>>({ data: undefined, loading: true, error: '', updatedAt: null, source: load })
  const refreshRef = useRef<() => void>(() => {})
  const requestRef = useRef<AbortController | null>(null)
  const refresh = useCallback(() => refreshRef.current(), [])

  useEffect(() => {
    const lifetime = new AbortController()
    async function run() {
      requestRef.current?.abort()
      const controller = new AbortController()
      requestRef.current = controller
      setState(previous => previous.source === load
        ? { ...previous, loading: true, error: '' }
        : { data: undefined, loading: true, error: '', updatedAt: null, source: load })
      try {
        const data = await load(controller.signal)
        if (!lifetime.signal.aborted && !controller.signal.aborted) {
          setState({ data, loading: false, error: '', updatedAt: new Date(), source: load })
        }
      } catch (error) {
        if (!lifetime.signal.aborted && !controller.signal.aborted) {
          setState(previous => ({ ...previous, loading: false, error: error instanceof Error ? error.message : 'Không tải được dữ liệu.' }))
        }
      }
    }
    refreshRef.current = () => { void run() }
    queueMicrotask(() => { if (!lifetime.signal.aborted) void run() })
    const timer = intervalMs > 0 ? window.setInterval(() => {
      if (!document.hidden) void run()
    }, intervalMs) : undefined
    return () => {
      lifetime.abort()
      requestRef.current?.abort()
      if (timer) window.clearInterval(timer)
    }
  }, [load, intervalMs])

  // Hide the old scope immediately, including the render before the next effect.
  if (state.source !== load) return { data: undefined, loading: true, error: '', updatedAt: null, refresh }
  return { data: state.data, loading: state.loading, error: state.error, updatedAt: state.updatedAt, refresh }
}
