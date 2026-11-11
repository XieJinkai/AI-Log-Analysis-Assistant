import { useEffect, useRef, useState } from 'react'
import { Activity, AlertCircle, ArrowDownToLine, ArrowRight, CheckCheck, ChevronRight, CircleHelp, FileCode2, FileSearch, Files, GitBranch, History, List, LoaderCircle, MessageSquare, PanelLeftClose, Play, Settings2, ShieldCheck, Square, Workflow, X } from 'lucide-react'
import { api, setToken } from './api'
import { canAnalyze, coverageMatches, extractSequence, isRunning, selectionFor, statusNames } from './domain'
import type { Config, Document, Evidence, Finding, Job, LinePage, Preview, Role } from './types'
import { Diagram } from './components/Diagram'
import { EvidencePanel } from './components/EvidencePanel'
import { FilesPanel } from './components/FilesPanel'
import { FindingsPanel } from './components/FindingsPanel'
import { Settings } from './components/Settings'
import { SendPreview } from './components/SendPreview'
import { Dialog } from './components/Dialog'
import { ChatPanel } from './components/ChatPanel'

export default function App() {
  const [config, setConfig] = useState<Config | null>(null)
  const [documents, setDocuments] = useState<Document[]>([])
  const [selected, setSelected] = useState(new Set<string>())
  const [ranges, setRanges] = useState<Record<string, { start: number; end: number }>>({})
  const [instructions, setInstructions] = useState('')
  const [custom, setCustom] = useState('')
  const [jobId, setJobId] = useState('')
  const [job, setJob] = useState<Job | null>(null)
  const [taskId, setTaskId] = useState('')
  const [findingId, setFindingId] = useState('')
  const [highlighted, setHighlighted] = useState('')
  const [view, setView] = useState<'diagram' | 'events'>('diagram')
  const [graphMode, setGraphMode] = useState<'actual' | 'reference'>('actual')
  const [reference, setReference] = useState('')
  const [referenceName, setReferenceName] = useState('')
  const [settings, setSettings] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [chatBusy, setChatBusy] = useState(false)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [help, setHelp] = useState(false)
  const [history, setHistory] = useState<{ id: string; state: string }[] | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [filesOpen, setFilesOpen] = useState(true)
  const [inputVersion, setInputVersion] = useState(0)
  const [analyzedVersion, setAnalyzedVersion] = useState(0)
  const [linePage, setLinePage] = useState<LinePage | null>(null)
  const [evidence, setEvidence] = useState<Evidence | null>(null)
  const [evidenceFile, setEvidenceFile] = useState('')
  const [evidenceJob, setEvidenceJob] = useState('')
  const [raw, setRaw] = useState(true)
  const [linesLoading, setLinesLoading] = useState(false)
  const [eventsPage, setEventsPage] = useState(0)
  const pendingBody = useRef<object | null>(null)
  const lineRequest = useRef(0)
  const busy = !!job && isRunning(job.state)
  const result = job?.result ?? null
  const report = result?.report ?? null
  const activeDocuments = documents.filter(doc => selected.has(doc.id))
  const taskEvents = report?.events.filter(event => event.task_id === taskId) ?? []
  const diagram = graphMode === 'reference' ? reference || result?.reference_diagram || '' : result?.diagrams[taskId] ?? ''
  const changed = !!result && (job?.stale_config || inputVersion !== analyzedVersion || !coverageMatches(activeDocuments, ranges, result.coverage))

  useEffect(() => {
    let mounted = true
    async function load() {
      try {
        const conf = await api<Config>('/config')
        setToken(conf.workspace_token)
        const [files, jobs] = await Promise.all([api<Document[]>('/files'), api<{ id: string }[]>('/analyses')])
        if (mounted) { setConfig(conf); setDocuments(files); setSelected(new Set(files.map(doc => doc.id))); if (jobs[0]) setJobId(jobs[0].id) }
      } catch (e) { if (mounted) setError((e as Error).message) }
    }
    load()
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    if (!jobId) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    async function poll() {
      try {
        const next = await api<Job>(`/analyses/${jobId}`)
        if (cancelled) return
        setJob(next)
        if (next.result) setTaskId(current => next.result!.report.tasks.some(task => task.id === current) ? current : next.result!.report.tasks[0]?.id ?? '')
        if (isRunning(next.state)) timer = setTimeout(poll, 1200)
      } catch (e) { if (!cancelled) setError((e as Error).message) }
    }
    poll()
    return () => { cancelled = true; clearTimeout(timer) }
  }, [jobId])

  function touch() { setInputVersion(value => value + 1) }

  async function loadLines(fileId: string, start = 1, original = true, analysisId = '') {
    const request = ++lineRequest.current
    setLinesLoading(true)
    try {
      const path = analysisId
        ? `/analyses/${analysisId}/evidence?file_id=${encodeURIComponent(fileId)}&start=${start}&limit=100&original=${original}`
        : `/files/${fileId}/lines?start=${start}&limit=100`
      const page = await api<LinePage>(path)
      if (request === lineRequest.current) { setLinePage(page); setEvidenceFile(fileId); setEvidenceJob(analysisId); setRaw(original) }
    } catch (e) { if (request === lineRequest.current) setError((e as Error).message) }
    finally { if (request === lineRequest.current) setLinesLoading(false) }
  }

  function showEvidence(value: Evidence) {
    setEvidence(value)
    loadLines(value.file_id, Math.max(1, value.start_line - 3), false, jobId)
  }

  async function viewFile(doc: Document) {
    setEvidence(null); loadLines(doc.id)
    if (doc.role === 'reference') {
      try {
        const data = await api<{ text: string }>(`/files/${doc.id}/reference`)
        const code = extractSequence(data.text)
        setReference(code); setReferenceName(doc.name); setGraphMode('reference'); setView('diagram')
        if (!code) setError('该文件是时序说明文本，暂不能直接预览；分析时将由 AI 理解并转换。')
      } catch (e) { setError((e as Error).message) }
    }
  }

  async function upload(files: File[], role: Role) {
    if (!files.length) return
    setLoading(true); setError('')
    const failures = []
    try {
      for (const file of files) {
        const body = new FormData(); body.append('file', file); body.append('role', role)
        try {
          const doc = await api<Document>('/files', { method: 'POST', body })
          setDocuments(current => [...current, doc]); setSelected(current => new Set(current).add(doc.id)); touch()
          if (role === 'reference') await viewFile(doc)
        } catch (e) { failures.push(`${file.name}：${(e as Error).message}`) }
      }
      if (failures.length) setError(failures.join('\n'))
    } finally { setLoading(false) }
  }

  async function remove(id: string) {
    try {
      await api(`/files/${id}`, { method: 'DELETE' })
      const doc = documents.find(item => item.id === id)
      setDocuments(current => current.filter(doc => doc.id !== id)); setSelected(current => { const next = new Set(current); next.delete(id); return next }); touch()
      if (doc?.role === 'reference') { setReference(''); setReferenceName('') }
      if (evidenceFile === id && !evidenceJob) { setLinePage(null); setEvidenceFile('') }
    } catch (e) { setError((e as Error).message) }
  }

  async function changeEncoding(id: string, encoding: string) {
    try {
      const doc = await api<Document>(`/files/${id}/encoding`, { method: 'PUT', body: JSON.stringify({ encoding }) })
      setDocuments(current => current.map(item => item.id === id ? doc : item)); setRanges(current => { const next = { ...current }; delete next[id]; return next }); touch(); await viewFile(doc)
    } catch (e) { setError((e as Error).message) }
  }

  async function prepareSend() {
    if (!config?.key_configured) { setSettings(true); return }
    setLoading(true); setError('')
    const body = { selections: activeDocuments.map(doc => selectionFor(doc, ranges[doc.id])), custom_secrets: custom.split(/\r?\n/).filter(Boolean), instructions }
    try { const next = await api<Preview>('/preview', { method: 'POST', body: JSON.stringify(body) }); pendingBody.current = body; setPreview(next) }
    catch (e) { setError((e as Error).message) }
    finally { setLoading(false) }
  }

  async function start() {
    setPreview(null); setLoading(true); setError('')
    try {
      const next = await api<{ id: string }>('/analyses', { method: 'POST', body: JSON.stringify({ ...pendingBody.current, consent: true }) })
      setChatOpen(false); setChatBusy(false)
      setJob({ id: next.id, state: 'preparing', revision: config!.revision, stale_config: false, result: null, error: null })
      setJobId(next.id); setTaskId(''); setFindingId(''); setHighlighted(''); setEvidence(null); setLinePage(null); setGraphMode('actual'); setAnalyzedVersion(inputVersion); setView('diagram'); setEventsPage(0)
    } catch (e) { setError((e as Error).message) }
    finally { setLoading(false) }
  }

  async function cancel() {
    if (!jobId) return
    try { await api(`/analyses/${jobId}/cancel`, { method: 'POST' }); setJob(current => current ? { ...current, state: 'cancelled' } : null) }
    catch (e) { setError((e as Error).message) }
  }

  function selectFinding(finding: Finding) {
    setFindingId(finding.id); setTaskId(finding.task_id); setHighlighted(finding.event_ids[0] ?? ''); setGraphMode('actual')
    if (finding.evidence[0]) showEvidence(finding.evidence[0])
  }

  function download() {
    if (!result) return
    const blob = new Blob(['\ufeff', result.markdown], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob); const link = document.createElement('a')
    link.href = url; link.download = `日志时序分析-${jobId.slice(0, 8)}.md`; link.click(); URL.revokeObjectURL(url)
  }

  async function showHistory() {
    try { setHistory(await api<{ id: string; state: string }[]>('/analyses')) }
    catch (e) { setError((e as Error).message) }
  }

  return <div className="application">
    <header className="app-header"><div className="brand"><span className="brand-icon"><Activity size={23} /></span><strong>日志智能识别系统</strong><span className="version">MVP</span></div><div className="header-status"><span className={`dot ${config?.key_configured ? 'green' : ''}`} /><span>{config?.model ?? '连接本地服务'}</span><span className="local-badge">本地工作区</span></div><button className="icon-button" title="模型配置" onClick={() => setSettings(true)}><Settings2 size={20} /></button></header>
    <div className="app-layout"><nav className="nav-rail"><div><button className="rail-button active" title="分析工作区" onClick={() => setFilesOpen(true)}><Workflow size={22} /></button><button className={`rail-button ${!filesOpen ? '' : 'muted-active'}`} title="分析资料" onClick={() => setFilesOpen(!filesOpen)}><Files size={21} /></button><button className="rail-button" title="本次会话分析记录" onClick={showHistory}><History size={21} /></button></div><div><button className="rail-button" title="分析边界" onClick={() => setHelp(true)}><CircleHelp size={20} /></button><button className="rail-button" title="模型配置" onClick={() => setSettings(true)}><Settings2 size={20} /></button></div></nav>
    {filesOpen && <FilesPanel documents={documents} selected={selected} ranges={ranges} busy={busy || loading} onUpload={upload} onSelect={id => { setSelected(current => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next }); touch() }} onRange={(id, start, end) => { setRanges(current => ({ ...current, [id]: { start, end } })); touch() }} onView={viewFile} onDelete={remove} onEncoding={changeEncoding} instructions={instructions} onInstructions={value => { setInstructions(value); touch() }} custom={custom} onCustom={value => { setCustom(value); touch() }} />}
    <main className="main-workspace"><div className="workspace-heading"><div><div className="breadcrumb">工作区<ChevronRight size={12} />日志分析</div><h1>任务时序分析</h1></div><div className="main-actions"><button className="secondary-button" disabled={!result || busy} onClick={() => setChatOpen(true)}><MessageSquare size={16} />分析追问</button><button className="secondary-button export-button" disabled={!result} onClick={download}><ArrowDownToLine size={16} />导出 .md</button>{busy ? <button className="cancel-button" onClick={cancel}><Square size={14} />取消分析</button> : <button className="primary-button" onClick={prepareSend} disabled={!config || loading || chatBusy || !canAnalyze(activeDocuments)}>{loading ? <LoaderCircle size={16} className="spin" /> : <Play size={15} fill="currentColor" />}开始分析</button>}</div></div>
    <div className="workspace-stats"><div><Files size={16} /><span>已选资料</span><strong>{activeDocuments.length}</strong></div><div><GitBranch size={16} /><span>关联任务</span><strong>{report?.tasks.length ?? '—'}</strong></div><div><AlertCircle size={16} /><span>异常 / 疑点</span><strong className={report?.findings.length ? 'red-text' : ''}>{report ? `${report.findings.filter(f => f.severity === 'confirmed').length} / ${report.findings.filter(f => f.severity === 'suspected').length}` : '—'}</strong></div><div className="analysis-status"><span className={`dot ${busy ? 'amber' : result ? 'green' : ''}`} />{job ? statusNames[job.state] : '尚未开始分析'}</div></div>
    {error && <div className="message-banner error"><AlertCircle size={17} /><span>{error}</span><button className="icon-button tiny" title="关闭提示" onClick={() => setError('')}><X size={16} /></button></div>}
    {job?.error && <div className="message-banner error"><AlertCircle size={17} /><span>{job.error}</span></div>}
    {changed && <div className="message-banner warning"><AlertCircle size={16} /><span>资料或配置已变更，当前仍为上次分析结果。</span></div>}
    {result?.issues.length ? <div className="message-banner warning"><AlertCircle size={16} /><span>{result.issues.length} 项校验问题，已隔离无效条目；当前结果不完整。</span></div> : null}
    {report && <div className={`report-summary ${report.status}`}><ShieldCheck size={17} /><strong>{statusNames[report.status]}</strong><span>{report.summary}</span></div>}
    <div className="analysis-body"><section className="timeline-panel"><div className="timeline-heading"><div className="view-tabs"><button className={view === 'diagram' ? 'active' : ''} onClick={() => setView('diagram')}><Workflow size={16} />时序图</button><button className={view === 'events' ? 'active' : ''} onClick={() => setView('events')}><List size={16} />事件记录{report && <span>{taskEvents.length}</span>}</button></div><button className="icon-button" title={filesOpen ? '收起资料栏' : '展开资料栏'} onClick={() => setFilesOpen(!filesOpen)}><PanelLeftClose size={16} /></button></div>
      <div className="timeline-filter"><div className="segmented"><button className={graphMode === 'actual' ? 'active' : ''} onClick={() => setGraphMode('actual')}>实际时序</button><button className={graphMode === 'reference' ? 'active' : ''} onClick={() => setGraphMode('reference')}>参考时序</button></div>{report?.tasks.length ? <select aria-label="选择任务" value={taskId} onChange={e => { setTaskId(e.target.value); setEventsPage(0); setFindingId(''); setHighlighted('') }}>{report.tasks.map(task => <option key={task.id} value={task.id}>{task.title}</option>)}</select> : <span className="muted">{graphMode === 'reference' ? referenceName || '未导入标准时序图' : '尚无关联任务'}</span>}</div>
      <div className="timeline-content">{view === 'diagram' ? diagram ? <Diagram source={diagram} highlighted={highlighted} /> : <div className="diagram-empty"><div className="empty-sequence"><div className="empty-actor"><FileCode2 size={19} /><span>正常参考</span></div><div className="empty-actor"><Files size={19} /><span>运行日志</span></div><div className="empty-actor"><GitBranch size={19} /><span>任务时序</span></div><div className="empty-flow first"><span /><ArrowRight size={16} /></div><div className="empty-flow second"><span /><ArrowRight size={16} /></div></div>{busy ? <><LoaderCircle className="spin" size={23} /><h3>{statusNames[job!.state]}</h3><p>等待模型返回完整结果</p></> : <><h3>{graphMode === 'reference' ? '暂无可预览的参考时序图' : '尚未生成任务时序图'}</h3><p>{graphMode === 'reference' ? '正常日志仍可作为分析参考' : '正常参考与待检测日志尚待分析'}</p></>}</div> : <div className="events-view">{taskEvents.length ? <><div className="events-table"><div className="events-table-head"><span>事件 / 时间</span><span>交互与描述</span><span>证据</span></div>{taskEvents.slice(eventsPage * 50, (eventsPage + 1) * 50).map(event => <button className={`event-row ${highlighted === event.id ? 'selected' : ''}`} key={event.id} onClick={() => { setHighlighted(event.id); if (event.evidence[0]) showEvidence(event.evidence[0]) }}><span><b>{event.id}</b><small>{event.timestamp || '时间未明'}</small></span><span><strong>{event.source} → {event.target}</strong><span>{event.description}</span>{event.kind !== 'observed' && <em>{event.kind === 'expected' ? '预期未观察到' : '推测关联'}</em>}</span><span>{event.evidence.length}<FileSearch size={14} /></span></button>)}</div><div className="events-pagination"><button className="secondary-button" disabled={eventsPage === 0} onClick={() => setEventsPage(v => v - 1)}>上一页</button><span>{eventsPage + 1} / {Math.ceil(taskEvents.length / 50)}</span><button className="secondary-button" disabled={(eventsPage + 1) * 50 >= taskEvents.length} onClick={() => setEventsPage(v => v + 1)}>下一页</button></div></> : <div className="simple-empty"><List size={26} /><span>暂无事件记录</span></div>}</div>}</div>
      <div className="timeline-footer"><span><span className="legend-line" />日志观察</span><span><span className="legend-box" />预期 / 推测注释</span><span className="event-count">{graphMode === 'actual' ? `${taskEvents.length} 个事件` : '参考资料'}</span></div>
    </section><FindingsPanel report={report} taskId={taskId} selected={findingId} onSelect={selectFinding} onEvidence={showEvidence} /></div>
    <EvidencePanel page={linePage} evidence={evidence} raw={raw} canToggle={!!evidenceJob} loading={linesLoading} onRaw={value => loadLines(evidenceFile, linePage?.lines[0]?.number ?? 1, value, evidenceJob)} onPage={value => loadLines(evidenceFile, value, raw, evidenceJob)} />
    <footer className="workspace-footer"><span><CheckCheck size={13} />DeepSeek 语义分析 · 引用完整性校验</span><span>{result ? `${result.config.model} · ${result.usage.total_tokens?.toLocaleString() ?? '—'} tokens` : '仅在确认发送后调用云端'}</span></footer>
    </main></div>
    {settings && config && <Settings config={config} onSave={next => { setConfig(next); if (job) setJob({ ...job, stale_config: job.revision !== next.revision }) }} onClose={() => setSettings(false)} />}
    {preview && config && <SendPreview preview={preview} model={config.model} onClose={() => setPreview(null)} onSend={start} />}
    {result && <ChatPanel key={jobId} jobId={jobId} open={chatOpen} onClose={() => setChatOpen(false)} onBusyChange={setChatBusy} onEvidence={showEvidence} />}
    {help && <Dialog title="分析边界" onClose={() => setHelp(false)}><div className="dialog-body boundary-copy"><p>没有事件记录，不等于事件没有发生；时序偏离，也不等于已经找到根因。</p><p>疑似异常会保留并标注不确定性。缺少依据时，报告应明确无法推断原因。</p><p>本地只校验结构与引文，不能保证 AI 的语义判断正确。报告需要人工复核。</p><p>分析只覆盖实际发送的所选行范围。超出上下文会明确报错，不会自动截断。</p><p>文件、原始日志快照、最近五次报告和当前追问自动保存在本地未加密缓存中，刷新与重启不清空。只有确认并成功启动新分析后才清空此前追问，取消预览或启动失败不会清空。</p></div></Dialog>}
    {history && <Dialog title="本次会话分析记录" onClose={() => setHistory(null)}><div className="dialog-body history-list">{history.length ? history.map(item => <button key={item.id} onClick={() => { setJobId(item.id); setHistory(null); setFindingId(''); setHighlighted(''); setEvidence(null); setLinePage(null); setGraphMode('actual') }}><History size={17} /><span>{item.id.slice(0, 12)}</span><strong>{statusNames[item.state]}</strong><ChevronRight size={15} /></button>) : <div className="simple-empty"><History size={25} />当前会话暂无分析记录</div>}</div></Dialog>}
  </div>
}
