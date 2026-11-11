import { FileCode2, FileText, FolderInput, Plus, Eye, X } from 'lucide-react'
import { formatBytes } from '../domain'
import type { Document, Role } from '../types'

const groups: { role: Role; title: string; detail: string }[] = [
  { role: 'reference', title: '正常时序说明', detail: '.md / .txt' },
  { role: 'normal', title: '正常运行日志', detail: '.log / .txt' },
  { role: 'suspect', title: '待检测日志', detail: '.log / .txt' },
]

export function FilesPanel({ documents, selected, ranges, busy, onUpload, onSelect, onRange, onView, onDelete, onEncoding, instructions, onInstructions, custom, onCustom }: {
  documents: Document[]; selected: Set<string>; ranges: Record<string, { start: number; end: number }>; busy: boolean;
  onUpload: (files: File[], role: Role) => void; onSelect: (id: string) => void;
  onRange: (id: string, start: number, end: number) => void; onView: (doc: Document) => void;
  onDelete: (id: string) => void; onEncoding: (id: string, encoding: string) => void;
  instructions: string; onInstructions: (value: string) => void; custom: string; onCustom: (value: string) => void;
}) {
  return <aside className="files-panel">
    <div className="panel-heading"><FolderInput size={17} /><h2>分析资料</h2><span className="count">{documents.length}</span></div>
    <div className="files-scroll">
      {groups.map(group => <section key={group.role} className={`file-group ${group.role}`} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (!busy) onUpload(Array.from(e.dataTransfer.files), group.role) }}>
        <div className="group-heading"><span className={`role-mark ${group.role}`} /><h3>{group.title}</h3><span className="file-extension">{group.detail}</span>
          <label className={`icon-button upload-trigger ${busy ? 'disabled' : ''}`} title={`添加${group.title}`}><Plus size={17} /><input type="file" aria-label={`添加${group.title}`} multiple={group.role !== 'reference'} disabled={busy} accept={group.role === 'reference' ? '.md,.txt' : '.log,.txt'} onChange={e => { onUpload(Array.from(e.target.files || []), group.role); e.target.value = '' }} /></label>
        </div>
        {documents.filter(doc => doc.role === group.role).map(doc => <div className={`file-item ${selected.has(doc.id) ? 'selected' : ''}`} key={doc.id}>
          <div className="file-first-row"><input type="checkbox" aria-label={`选择 ${doc.name}`} checked={selected.has(doc.id)} disabled={busy} onChange={() => onSelect(doc.id)} />{group.role === 'reference' ? <FileCode2 size={15} /> : <FileText size={15} />}<span className="file-name" title={doc.name}>{doc.name}</span><button className="icon-button tiny" title={`查看 ${doc.name}`} onClick={() => onView(doc)}><Eye size={14} /></button><button className="icon-button tiny" title={`移除 ${doc.name}`} disabled={busy} onClick={() => onDelete(doc.id)}><X size={14} /></button></div>
          <div className="file-meta">{formatBytes(doc.bytes)}<span>·</span>{doc.line_count.toLocaleString()} 行</div>
          <div className="file-controls"><select aria-label={`${doc.name} 编码`} value={doc.encoding} disabled={busy} onChange={e => onEncoding(doc.id, e.target.value)}><option value="utf-8-sig">UTF-8</option><option value="utf-8">UTF-8</option><option value="gb18030">GB18030</option></select><span>L</span><input aria-label={`${doc.name} 起始行`} type="number" min={1} max={doc.line_count} value={ranges[doc.id]?.start ?? 1} disabled={busy} onChange={e => onRange(doc.id, Number(e.target.value), ranges[doc.id]?.end ?? doc.line_count)} /><span>至</span><input aria-label={`${doc.name} 结束行`} type="number" min={1} max={doc.line_count} value={ranges[doc.id]?.end ?? doc.line_count} disabled={busy} onChange={e => onRange(doc.id, ranges[doc.id]?.start ?? 1, Number(e.target.value))} /></div>
        </div>)}
        {!documents.some(doc => doc.role === group.role) && <label className={`empty-upload ${busy ? 'disabled' : ''}`}><Plus size={16} /><span>导入{group.title}</span><input type="file" aria-label={`导入${group.title}`} multiple={group.role !== 'reference'} disabled={busy} accept={group.role === 'reference' ? '.md,.txt' : '.log,.txt'} onChange={e => { onUpload(Array.from(e.target.files || []), group.role); e.target.value = '' }} /></label>}
      </section>)}
      <section className="analysis-options"><h3>分析关注点 <span>可选</span></h3><textarea placeholder="例如：关注任务完成后，上报接口的重试与响应" value={instructions} maxLength={4000} disabled={busy} onChange={e => onInstructions(e.target.value)} rows={3} /></section>
      <details className="privacy-options"><summary>自定义脱敏项<span>可选</span></summary><textarea aria-label="自定义脱敏项" placeholder="每行一项待隐藏的文本" value={custom} disabled={busy} onChange={e => onCustom(e.target.value)} rows={3} /></details>
    </div>
    <div className="files-footer"><span className="dot green" />本地工作区<span>自动保存</span></div>
  </aside>
}
