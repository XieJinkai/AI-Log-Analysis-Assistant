import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

export function Dialog({ title, onClose, children, wide = false, fullscreen = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean; fullscreen?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => { ref.current?.showModal(); return () => ref.current?.close() }, [])
  return <dialog ref={ref} aria-label={title} className={`dialog ${wide ? 'wide' : ''} ${fullscreen ? 'fullscreen' : ''}`} onCancel={onClose} onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); onClose() } }} onClick={e => { if (e.target === ref.current) onClose() }}>
    <div className="dialog-heading"><h2>{title}</h2><button className="icon-button" title="关闭" onClick={onClose}><X size={19} /></button></div>
    {children}
  </dialog>
}
