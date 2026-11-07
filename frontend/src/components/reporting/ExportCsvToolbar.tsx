import { DownloadSimple, FileCsv } from '@phosphor-icons/react'
import { useEffect, useRef, useState } from 'react'
import { downloadReportCsv } from '../../services/reportingService'
import type { Session } from '../../types/auth.types'
import type { ReportFilters } from '../../types/reporting.types'

interface Props {
  session: Session
  filters: ReportFilters
  periodLabel: string
  scopeLabel: string
  disabled: boolean
  onBusyChange: (busy: boolean) => void
}

export function ExportCsvToolbar({ session, filters, periodLabel, scopeLabel, disabled, onBusyChange }: Props) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const controller = useRef<AbortController | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => () => controller.current?.abort(), [])
  useEffect(() => {
    if (!open) return
    function closeOutside(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeOutside)
    return () => document.removeEventListener('pointerdown', closeOutside)
  }, [open])

  async function exportCsv() {
    if (controller.current || disabled) return
    const currentController = new AbortController()
    controller.current = currentController
    setBusy(true)
    onBusyChange(true)
    setError('')
    setNotice('')
    try {
      const filename = await downloadReportCsv(session, { ...filters }, currentController.signal)
      setNotice(`Đã chuẩn bị ${filename} để tải xuống.`)
      setOpen(false)
      triggerRef.current?.focus()
    } catch (cause) {
      if (!currentController.signal.aborted) setError(cause instanceof Error ? cause.message : 'Không thể xuất báo cáo. Hãy thử lại.')
    } finally {
      controller.current = null
      if (!currentController.signal.aborted) {
        setBusy(false)
        onBusyChange(false)
      }
    }
  }

  return (
    <div className="export-control">
      <div className="export-menu-anchor" ref={menuRef} onKeyDown={event => {
        if (event.key === 'Escape') { setOpen(false); triggerRef.current?.focus() }
      }}>
        <button ref={triggerRef} className="button button-primary" type="button" disabled={disabled || busy} aria-expanded={open} aria-controls="csv-export-panel" onClick={() => { setOpen(!open); setError(''); setNotice('') }}>
          <DownloadSimple size={18} aria-hidden="true" />{busy ? 'Đang xuất báo cáo…' : 'Xuất báo cáo'}
        </button>
        {open && (
          <div id="csv-export-panel" className="export-popover panel">
            <h3><FileCsv size={20} aria-hidden="true" /> CSV cho Microsoft Excel</h3>
            <dl><dt>Kỳ báo cáo</dt><dd>{periodLabel}</dd><dt>Phạm vi</dt><dd>{scopeLabel}</dd></dl>
            <p className="muted">Tệp UTF-8 BOM giữ nguyên tiếng Việt và cùng bộ lọc với báo cáo đang xem.</p>
            <button className="button button-primary" type="button" disabled={busy} onClick={() => void exportCsv()}>{busy ? 'Đang chuẩn bị tệp…' : 'Xác nhận tải CSV'}</button>
          </div>
        )}
      </div>
      {error && <p className="export-feedback export-error" role="alert">{error}</p>}
      {notice && <p className="export-feedback export-success" role="status">{notice}</p>}
    </div>
  )
}
