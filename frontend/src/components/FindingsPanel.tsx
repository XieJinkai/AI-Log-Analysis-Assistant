import { useState } from 'react'
import { AlertTriangle, ArrowUpRight, CheckCircle2, ChevronRight, CircleHelp, FileText, PanelsTopLeft, ShieldAlert } from 'lucide-react'
import type { Evidence, Finding, Report } from '../types'
import { Dialog } from './Dialog'

export function FindingsPanel({ report, taskId, selected, onSelect, onEvidence }: { report: Report | null; taskId: string; selected: string; onSelect: (finding: Finding) => void; onEvidence: (evidence: Evidence) => void }) {
  const [overview, setOverview] = useState(false)
  const findings = report?.findings.filter(item => !taskId || item.task_id === taskId) ?? []
  return <aside className="findings-panel">
    <div className="panel-heading"><ShieldAlert size={17} /><h2>异常与疑点</h2><span className="count">{findings.length}</span><button className="icon-button" title="集中查看异常与疑点" disabled={!report} onClick={() => setOverview(true)}><PanelsTopLeft size={18} /></button></div>
    <div className="findings-scroll">
      {!report && <div className="findings-empty"><CircleHelp size={27} /><strong>等待分析结果</strong><span>异常位置与日志证据将在此呈现</span></div>}
      {report && findings.length === 0 && <div className="findings-empty"><CheckCircle2 size={27} /><strong>{report.status === 'insufficient' ? '现有证据不足' : '暂无可确认异常'}</strong><span>结论仅适用于本次分析覆盖范围</span></div>}
      {findings.map(finding => <article key={finding.id} className={`finding-item ${selected === finding.id ? 'active' : ''}`}>
        <button className="finding-heading" onClick={() => onSelect(finding)}><span className={`finding-symbol ${finding.severity}`}>{finding.severity === 'confirmed' ? <ShieldAlert size={16} /> : <AlertTriangle size={16} />}</span><span><small>{finding.id} · {finding.severity === 'confirmed' ? '已观察异常' : '疑似异常'}</small><strong>{finding.title}</strong></span><ChevronRight size={15} /></button>
        {selected === finding.id && <FindingDetail finding={finding} onEvidence={onEvidence} />}
      </article>)}
      {report && <section className="report-limitations"><h3>分析边界</h3>{report.limitations.map((item, i) => <p key={i}>{item}</p>)}{report.reference_conflicts.length > 0 && <><h3>参考冲突</h3>{report.reference_conflicts.map((item, i) => <p key={i}>{item}</p>)}</>}{report.unmatched_records.length > 0 && <><h3>未关联记录</h3>{report.unmatched_records.map((item, i) => <p key={i}>{item}</p>)}</>}</section>}
    </div>
    <div className="findings-footer"><LockIcon />证据可回查，不等于根因已证实</div>
    {overview && report && <FindingsOverview report={report} onClose={() => setOverview(false)} onSelect={finding => { onSelect(finding); setOverview(false) }} onEvidence={evidence => { onEvidence(evidence); setOverview(false) }} />}
  </aside>
}

function LockIcon() { return <CircleHelp size={13} /> }

function FindingDetail({ finding, onEvidence }: { finding: Finding; onEvidence: (evidence: Evidence) => void }) {
  return <div className="finding-detail"><dl><dt>观察事实</dt><dd>{finding.observation}</dd><dt>预期行为</dt><dd>{finding.expected}<small>{finding.expected_basis}</small></dd><dt>原因推测</dt><dd>{finding.cause}{finding.cause_basis && <small>{finding.cause_basis}</small>}</dd><dt>不确定性</dt><dd className="uncertainty">{finding.uncertainty || '日志未给出更多上下文。'}</dd></dl>
    <div className="finding-evidence">{finding.evidence.map((evidence, index) => <button key={index} onClick={() => onEvidence(evidence)}><FileText size={13} /><span>{evidence.file_id} · L{evidence.start_line}{evidence.end_line !== evidence.start_line ? `–${evidence.end_line}` : ''}</span><ArrowUpRight size={13} /></button>)}</div>
    {finding.checks.length > 0 && <div className="check-list"><h4>建议核查</h4>{finding.checks.map((check, index) => <p key={index}><span>{index + 1}</span>{check}</p>)}</div>}
  </div>
}

function FindingsOverview({ report, onClose, onSelect, onEvidence }: { report: Report; onClose: () => void; onSelect: (finding: Finding) => void; onEvidence: (evidence: Evidence) => void }) {
  const [task, setTask] = useState('')
  const [severity, setSeverity] = useState('')
  const [expanded, setExpanded] = useState(new Set(report.findings.map(finding => finding.id)))
  const findings = report.findings.filter(finding => (!task || finding.task_id === task) && (!severity || finding.severity === severity))
  return <Dialog title="异常与疑点 · 集中查看" wide onClose={onClose}><div className="findings-overview">
    <div className="findings-filters"><select aria-label="筛选异常任务" value={task} onChange={e => setTask(e.target.value)}><option value="">全部任务</option>{report.tasks.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select><div className="segmented">{[['', '全部'], ['confirmed', '已观察异常'], ['suspected', '疑似异常']].map(([value, label]) => <button key={value} className={severity === value ? 'active' : ''} onClick={() => setSeverity(value)}>{label}</button>)}</div><span>{findings.length} / {report.findings.length} 项</span></div>
    <div className="overview-list">{findings.length === 0 && <div className="simple-empty">没有符合筛选条件的异常或疑点</div>}{findings.map(finding => <article className={`finding-item ${expanded.has(finding.id) ? 'active' : ''}`} key={finding.id}>
      <button className="finding-heading" aria-expanded={expanded.has(finding.id)} onClick={() => setExpanded(current => { const next = new Set(current); next.has(finding.id) ? next.delete(finding.id) : next.add(finding.id); return next })}><span className={`finding-symbol ${finding.severity}`}>{finding.severity === 'confirmed' ? <ShieldAlert size={18} /> : <AlertTriangle size={18} />}</span><span><small>{finding.id} · {finding.severity === 'confirmed' ? '已观察异常' : '疑似异常'} · {report.tasks.find(item => item.id === finding.task_id)?.title ?? finding.task_id}</small><strong>{finding.title}</strong></span><ChevronRight size={18} /></button>
      {expanded.has(finding.id) && <><FindingDetail finding={finding} onEvidence={onEvidence} /><button className="secondary-button locate-finding" onClick={() => onSelect(finding)}><ArrowUpRight size={16} />定位时序</button></>}
    </article>)}</div><div className="findings-footer">未记录不代表未发生；时序偏离不代表根因已证实</div>
  </div></Dialog>
}
