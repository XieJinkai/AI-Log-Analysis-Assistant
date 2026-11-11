import { ChevronLeft, ChevronRight, FileSearch, LockKeyhole } from 'lucide-react'
import type { Evidence, LinePage } from '../types'

export function EvidencePanel({ page, evidence, raw, canToggle, loading, onRaw, onPage }: {
  page: LinePage | null; evidence: Evidence | null; raw: boolean; canToggle: boolean; loading: boolean;
  onRaw: (raw: boolean) => void; onPage: (start: number) => void;
}) {
  const start = page?.lines[0]?.number ?? 1
  const first = page?.first_line ?? 1
  return <section className="evidence-panel">
    <div className="evidence-toolbar"><div className="evidence-title"><FileSearch size={16} /><h3>日志证据</h3>{page && <span title={page.name}>{page.name}</span>}</div>
      {page && <><span className="privacy-label"><LockKeyhole size={12} />{raw ? '原始日志 · 仅本地' : '已发送脱敏副本'}</span>{canToggle && <div className="segmented mini"><button className={!raw ? 'active' : ''} onClick={() => onRaw(false)}>脱敏</button><button className={raw ? 'active' : ''} onClick={() => onRaw(true)}>原文</button></div>}<button className="icon-button tiny" title="前 100 行" disabled={start <= first || loading} onClick={() => onPage(Math.max(first, start - 100))}><ChevronLeft size={16} /></button><button className="icon-button tiny" title="后 100 行" disabled={start + 100 > page.total_lines || loading} onClick={() => onPage(start + 100)}><ChevronRight size={16} /></button></>}
    </div>
    {page ? <div className={`log-lines evidence-lines ${loading ? 'loading' : ''}`}>{page.lines.map(line => <div key={line.number} className={`log-line ${evidence && line.number >= evidence.start_line && line.number <= evidence.end_line ? 'evidence-highlight' : ''}`}><span className="line-number">{line.number}</span><code>{line.text || ' '}</code></div>)}</div> : <div className="evidence-empty"><FileSearch size={23} /><span>暂无选中的日志证据</span></div>}
  </section>
}
