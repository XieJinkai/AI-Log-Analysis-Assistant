import { useEffect, useId, useRef, useState } from 'react'
import DOMPurify from 'dompurify'
import { createPortal } from 'react-dom'
import { AlertCircle, Code2, LoaderCircle, Maximize2, Minimize2, Minus, Plus, RotateCcw } from 'lucide-react'
import { hasEventId } from '../domain'
import { Dialog } from './Dialog'

let renderQueue = Promise.resolve()

export function Diagram({ source, highlighted = '' }: { source: string; highlighted?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const id = 'diagram' + useId().replace(/[^a-zA-Z0-9]/g, '')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [code, setCode] = useState(false)
  const [scale, setScale] = useState(1)
  const [fullscreen, setFullscreen] = useState(false)
  useEffect(() => {
    let cancelled = false
    if (!source || !ref.current) return
    setLoading(true); setError(''); ref.current.innerHTML = ''
    renderQueue = renderQueue.catch(() => {}).then(async () => {
      try {
        if (!/^sequenceDiagram\b/.test(source.trim()) || /%%\{|^\s*(?:click|link|links|href)\b/m.test(source)) throw new Error('仅支持不含外部链接或配置指令的时序图。')
        const mermaid = (await import('mermaid')).default
        mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'base', maxTextSize: 200000,
          fontFamily: 'Inter, Microsoft YaHei, sans-serif', themeVariables: {
            primaryColor: '#eef7f2', primaryTextColor: '#283a33', primaryBorderColor: '#a5b9af',
            lineColor: '#779386', signalColor: '#456255', signalTextColor: '#354b40',
            actorBkg: '#f6faf8', actorBorder: '#a8bdb1', actorTextColor: '#243c30',
            noteBkgColor: '#f4f5f8', noteBorderColor: '#ced3dc', noteTextColor: '#4a5261',
            sequenceNumberColor: '#fff', fontSize: '13px',
        }, sequence: { useMaxWidth: false, actorMargin: 55, messageMargin: 35, mirrorActors: false, wrap: true, width: 180 },
        })
        const { svg } = await mermaid.render(id, source)
        if (!cancelled && ref.current) ref.current.innerHTML = DOMPurify.sanitize(svg, {
          USE_PROFILES: { svg: true, svgFilters: true }, FORBID_TAGS: ['foreignObject', 'a', 'image'], FORBID_ATTR: ['href', 'xlink:href'],
        })
      } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : '时序图语法错误。') }
      finally { if (!cancelled) setLoading(false) }
    })
    return () => { cancelled = true }
  }, [source, id, fullscreen])
  useEffect(() => {
    ref.current?.querySelectorAll('text').forEach(el => {
      const active = hasEventId(el.textContent || '', highlighted)
      el.classList.toggle('highlighted-event', active)
      if (active) el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
    })
  }, [highlighted, loading])
  const content = <div className="diagram-shell">
    <div className="diagram-tools">
      <button className={`icon-button ${code ? 'active' : ''}`} title="时序图源码" onClick={() => setCode(!code)}><Code2 size={16} /></button>
      <span className="tool-divider" />
      <button className="icon-button" title="缩小" disabled={scale <= 0.4} onClick={() => setScale(v => Math.max(0.4, v - 0.1))}><Minus size={16} /></button>
      <span className="zoom-label">{Math.round(scale * 100)}%</span>
      <button className="icon-button" title="放大" disabled={scale >= 2} onClick={() => setScale(v => Math.min(2, v + 0.1))}><Plus size={16} /></button>
      <button className="icon-button" title="重置缩放" onClick={() => setScale(1)}><RotateCcw size={15} /></button>
      <span className="tool-divider" />
      <button className="icon-button" title={fullscreen ? '退出全屏' : '全屏时序图'} onClick={() => setFullscreen(!fullscreen)}>{fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button>
    </div>
    {loading && <div className="diagram-loading"><LoaderCircle className="spin" size={22} /><span>渲染时序图</span></div>}
    {error && <div className="inline-error"><AlertCircle size={17} /><span>{error}</span></div>}
    <div className="diagram-scroll" hidden={code || !!error}><div ref={ref} className="diagram-svg" style={{ zoom: scale }} /></div>
    {(code || error) && <pre className="source-code">{source}</pre>}
  </div>
  return fullscreen ? createPortal(<Dialog title="时序图" fullscreen onClose={() => setFullscreen(false)}>{content}</Dialog>, document.body) : content
}
