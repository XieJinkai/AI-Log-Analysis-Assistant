let token = ''
export function setToken(value: string) { token = value }

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers)
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json')
  if (token) headers.set('X-Workspace-Token', token)
  let response: Response
  try { response = await fetch(`/api${path}`, { ...options, headers }) }
  catch { throw new Error('无法连接本地服务。请确认服务正在运行。') }
  const data = await response.json()
  if (!response.ok) throw new Error(data.message || '请求参数无效，请检查输入。')
  return data as T
}
