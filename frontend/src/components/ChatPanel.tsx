import { useEffect, useRef, useState } from 'react'
import { AlertCircle, ArrowUpRight, FileText, LoaderCircle, MessageSquare, Send, Square } from 'lucide-react'
import { api } from '../api'
import type { ChatState, Evidence } from '../types'
import { Dialog } from './Dialog'

export function ChatPanel({ jobId, open, onClose, onBusyChange, onEvidence }: { jobId: string; open: boolean; onClose: () => void; onBusyChange: (busy: boolean) => void; onEvidence: (evidence: Evidence) => void }) {
  const [chat, setChat] = useState<ChatState>({ state: 'loading', turns: [], error: null })
  const [question, setQuestion] = useState('')
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const end = useRef<HTMLDivElement>(null)
  const busy = chat.state === 'answering'
  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    async function load() {
      try {
        const next = await api<ChatState>(`/analyses/${jobId}/chat`)
        if (cancelled) return
        setChat(next); onBusyChange(next.state === 'answering')
        if (next.state === 'answering') timer = setTimeout(load, 1200)
      } catch (e) {
        if (!cancelled) { setError((e as Error).message); timer = setTimeout(load, 3000) }
      }
    }
    load()
    return () => { cancelled = true; clearTimeout(timer) }
  }, [jobId, refresh, onBusyChange])
  useEffect(() => { if (open) end.current?.scrollIntoView({ block: 'nearest' }) }, [chat, open])

  async function send() {
    if (sending || busy || !consent || !question.trim()) return
    setSending(true); setError('')
    try {
      const next = await api<ChatState>(`/analyses/${jobId}/chat`, { method: 'POST', body: JSON.stringify({ question, consent }) })
      setChat(next); setQuestion(''); onBusyChange(next.state === 'answering'); setRefresh(value => value + 1)
    } catch (e) { setError((e as Error).message) }
    finally { setSending(false) }
  }

  async function cancel() {
    try {
      const next = await api<ChatState>(`/analyses/${jobId}/chat/cancel`, { method: 'POST' })
      setChat(next); onBusyChange(false); setRefresh(value => value + 1)
    } catch (e) { setError((e as Error).message) }
  }

  if (!open) return null
  return <Dialog title="分析追问" wide onClose={onClose}><div className="chat-window">
    <div className="chat-context"><MessageSquare size={16} /><span>分析 {jobId.slice(0, 8)} · 原次日志与报告</span><span>本地自动保存</span></div>
    <div className="chat-transcript" aria-live="polite">
      {chat.turns.length === 0 && <div className="simple-empty"><MessageSquare size={25} />{chat.state === 'loading' ? '读取追问记录' : '暂无追问'}</div>}
      {chat.turns.map(turn => <article className="chat-turn" key={turn.id}><div className="chat-question"><strong>你</strong><p>{turn.question}</p></div><div className="chat-answer"><strong>DeepSeek <small>{turn.model}</small></strong>
        {turn.state === 'answering' && <p className="chat-pending"><LoaderCircle size={16} className="spin" />正在对照原次日志回答</p>}
        {turn.answer && <><span className={`answer-status ${turn.answer.status}`}>{turn.answer.status === 'supported' ? '附日志依据' : '依据不足'}</span><p>{turn.answer.answer}</p><div className="finding-evidence">{turn.answer.evidence.map((item, index) => <button key={index} onClick={() => { onClose(); onEvidence(item) }}><FileText size={14} />{item.file_id} · L{item.start_line}–{item.end_line}<ArrowUpRight size={13} /></button>)}</div><p className="chat-uncertainty">{turn.answer.uncertainty}</p>{turn.answer.checks.length > 0 && <div className="chat-checks"><h4>建议核查</h4>{turn.answer.checks.map((item, index) => <p key={index}>{index + 1}. {item}</p>)}</div>}</>}
        {(turn.state === 'failed' || turn.state === 'cancelled') && <div className="chat-interrupted"><span>{turn.error || '回答已停止，此前记录已保留。'}</span><button className="secondary-button" onClick={() => setQuestion(turn.question)}>重新提问</button></div>}
      </div></article>)}<div ref={end} />
    </div>
    {(error || chat.error) && <div className="inline-error"><AlertCircle size={16} />{error || chat.error}</div>}
    <form className="chat-composer" onSubmit={e => { e.preventDefault(); send() }}><textarea aria-label="追问内容" placeholder="继续询问异常、疑点或需要核查的日志" value={question} maxLength={8000} rows={3} onChange={e => setQuestion(e.target.value)} disabled={busy || sending || chat.state === 'loading'} /><label className="consent"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />同意发送原次脱敏资料、报告、完整对话与本次问题至 DeepSeek</label><div className="chat-send"><span>{question.length} / 8000</span>{busy ? <button type="button" className="cancel-button" onClick={cancel}><Square size={14} />停止回答</button> : <button className="primary-button" type="submit" disabled={!consent || !question.trim() || sending || chat.state === 'loading'}>{sending ? <LoaderCircle className="spin" size={16} /> : <Send size={16} />}发送追问</button>}</div></form>
  </div></Dialog>
}
