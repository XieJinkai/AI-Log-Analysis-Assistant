import { useState } from 'react'
import { ArrowLeft, ArrowRight, CloudUpload, ShieldCheck } from 'lucide-react'
import { Dialog } from './Dialog'
import type { Preview } from '../types'

export function SendPreview({ preview, model, onClose, onSend }: { preview: Preview; model: string; onClose: () => void; onSend: () => void }) {
  const [fileId, setFileId] = useState(preview.coverage[0].file_id)
  const [page, setPage] = useState(0)
  const [consent, setConsent] = useState(false)
  const source = preview.sources[fileId]
  const rows = Object.entries(source.lines)
  return <Dialog title="发送前确认" wide onClose={onClose}>
    <div className="dialog-body preview-body">
      <div className="preview-metrics"><span><ShieldCheck size={18} />{preview.redaction_count} 项稳定脱敏</span><span>输入保守估算 <b>{preview.estimated_tokens.toLocaleString()}</b></span><span>输出预留 <b>{preview.output_tokens.toLocaleString()}</b></span></div>
      <div className="preview-coverage">{preview.coverage.map(item => <div key={item.file_id}><span className={`role-mark ${item.role}`} /><strong>{item.name}</strong><span>L{item.start_line}–{item.end_line}</span>{item.excluded_lines > 0 && <em>未发送 {item.excluded_lines} 行</em>}</div>)}</div>
      <div className="preview-toolbar"><select aria-label="脱敏预览文件" value={fileId} onChange={e => { setFileId(e.target.value); setPage(0) }}>{preview.coverage.map(item => <option value={item.file_id} key={item.file_id}>{item.name}</option>)}</select><span>{page * 100 + 1}–{Math.min(rows.length, (page + 1) * 100)} / {rows.length} 行</span><button className="icon-button" title="上一页" disabled={page === 0} onClick={() => setPage(v => v - 1)}><ArrowLeft size={16} /></button><button className="icon-button" title="下一页" disabled={(page + 1) * 100 >= rows.length} onClick={() => setPage(v => v + 1)}><ArrowRight size={16} /></button></div>
      <div className="log-lines preview-lines">{rows.slice(page * 100, (page + 1) * 100).map(([number, value]) => <div className="log-line" key={number}><span className="line-number">{number}</span><code>{value || ' '}</code></div>)}</div>
      <label className="consent"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} /><span>确认将所选脱敏资料发送至 DeepSeek 云端，使用 {model} 分析。</span></label>
      <div className="subtle-note">自动脱敏可能遗漏敏感信息。确认前请核对以上内容。</div>
      <div className="subtle-note">新分析成功受理后将清空此前追问；返回修改不会清空。</div>
    </div>
    <div className="dialog-footer"><button className="secondary-button" onClick={onClose}>返回修改</button><button className="primary-button" disabled={!consent} onClick={onSend}><CloudUpload size={16} />确认并开始分析</button></div>
  </Dialog>
}
