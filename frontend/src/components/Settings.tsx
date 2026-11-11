import { useState } from 'react'
import { CheckCircle2, KeyRound, LoaderCircle, PlugZap, Save } from 'lucide-react'
import { Dialog } from './Dialog'
import { api } from '../api'
import type { Config } from '../types'

export function Settings({ config, onSave, onClose }: { config: Config; onSave: (config: Config) => void; onClose: () => void }) {
  const [model, setModel] = useState(config.model)
  const [context, setContext] = useState(config.context_tokens)
  const [output, setOutput] = useState(config.output_tokens)
  const [key, setKey] = useState('')
  const [error, setError] = useState('')
  const [testing, setTesting] = useState(false)
  const [connection, setConnection] = useState('')
  const [saving, setSaving] = useState(false)
  async function save(close: boolean) {
    setError(''); setSaving(true)
    try {
      const next = await api<Config>('/config', { method: 'PUT', body: JSON.stringify({ model, context_tokens: context, output_tokens: output, ...(key ? { api_key: key } : {}) }) })
      setKey(''); onSave(next)
      if (close) onClose()
      return true
    } catch (e) { setError((e as Error).message); return false }
    finally { setSaving(false) }
  }
  async function test() {
    setTesting(true); setConnection('')
    try {
      if (!(await save(false))) return
      const result = await api<{ models: string[]; selected_available: boolean }>('/config/test', { method: 'POST' })
      setConnection(result.selected_available ? `连接成功 · ${result.models.join(' / ')}` : `连接成功，所选模型不可用 · ${result.models.join(' / ')}`)
    } catch (e) { setError((e as Error).message) }
    finally { setTesting(false) }
  }
  return <Dialog title="DeepSeek 配置" onClose={onClose}>
    <div className="dialog-body settings-form">
      <div className="connection-state"><KeyRound size={17} /><span>{config.key_configured ? '已配置本地密钥' : '尚未配置密钥'}</span><span className={`dot ${config.key_configured ? 'green' : ''}`} /></div>
      <label>API Key<input type="password" autoComplete="off" value={key} placeholder={config.key_configured ? '保持为空以沿用当前密钥' : '输入 DeepSeek API Key'} onChange={e => setKey(e.target.value)} /></label>
      <label>模型<input list="models" value={model} onChange={e => setModel(e.target.value)} /><datalist id="models"><option value="deepseek-flash" /><option value="deepseek-v4-pro" /></datalist></label>
      <div className="field-row"><label>上下文预算<input type="number" min={16000} max={2000000} value={context} onChange={e => setContext(Number(e.target.value))} /></label><label>输出预留<input type="number" min={1024} max={384000} value={output} onChange={e => setOutput(Number(e.target.value))} /></label></div>
      {error && <div className="inline-error">{error}</div>}
      {connection && <div className="inline-success"><CheckCircle2 size={17} />{connection}</div>}
    </div>
    <div className="dialog-footer"><button className="secondary-button" onClick={test} disabled={testing || saving}>{testing ? <LoaderCircle size={16} className="spin" /> : <PlugZap size={16} />}测试连接</button><button className="primary-button" onClick={() => save(true)} disabled={saving || testing}><Save size={16} />保存配置</button></div>
  </Dialog>
}
