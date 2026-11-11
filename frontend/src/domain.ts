import type { Coverage, Document } from './types'

export function canAnalyze(documents: Document[]) {
  return documents.some(doc => doc.role === 'suspect') && documents.some(doc => doc.role === 'normal' || doc.role === 'reference')
}

export function selectionFor(doc: Document, range?: { start: number; end: number }) {
  return { file_id: doc.id, start_line: range?.start ?? 1, end_line: range?.end ?? doc.line_count }
}

export function coverageMatches(documents: Document[], ranges: Record<string, { start: number; end: number }>, coverage: Coverage[]) {
  return documents.length === coverage.length && documents.every(doc => {
    const selected = selectionFor(doc, ranges[doc.id])
    const previous = coverage.find(item => item.file_id === doc.id)
    return !!previous && previous.start_line === selected.start_line && previous.end_line === selected.end_line
      && (!previous.encoding || previous.encoding === doc.encoding)
  })
}

export function extractSequence(value: string): string {
  const match = value.match(/```mermaid\s*\n([\s\S]*?)```/)
  const source = (match?.[1] ?? value).trim()
  return /^sequenceDiagram(?:\s|$)/.test(source) ? source : ''
}

export function isRunning(state: string) {
  return ['preparing', 'analyzing', 'repairing', 'validating'].includes(state)
}

export function hasEventId(text: string, id: string) {
  return !!id && text.split(/\s+/).includes(id)
}

export const statusNames: Record<string, string> = {
  preparing: '准备资料', analyzing: 'DeepSeek 分析中', repairing: '修复输出 · 最多一次', validating: '校验引用',
  completed: '分析完成', incomplete: '结果不完整', failed: '分析失败', cancelled: '已取消',
  confirmed: '发现异常', suspected: '发现疑点', no_confirmed: '未发现可确认异常', insufficient: '证据不足',
}

export function formatBytes(value: number) {
  return value < 1024 ? `${value} B` : value < 1024 ** 2 ? `${(value / 1024).toFixed(1)} KB` : `${(value / 1024 ** 2).toFixed(1)} MB`
}
