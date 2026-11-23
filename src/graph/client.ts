import { getGraphToken } from '../auth/msal'

const GRAPH = 'https://graph.microsoft.com/v1.0'

export class GraphError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

/** Minimal authenticated fetch wrapper for Microsoft Graph. */
export async function graph<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (import.meta.env.VITE_DEMO === '1') {
    const { handle } = await import('../demo/fakeGraph')
    return (await handle(path, init)) as T
  }
  const token = await getGraphToken()
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${token}`)
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')

  const res = await fetch(path.startsWith('http') ? path : `${GRAPH}${path}`, { ...init, headers })
  if (!res.ok) {
    let code = 'unknown'
    let message = res.statusText
    try {
      const body = await res.json()
      code = body?.error?.code ?? code
      message = body?.error?.message ?? message
    } catch {
      /* non-JSON error body */
    }
    throw new GraphError(res.status, code, message)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}
