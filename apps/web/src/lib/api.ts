// Thin fetch wrapper for the PQL Health API (docs/api/API-CONTRACT-v1.md).
// In mock mode the same calls are answered in-browser from data/sample.

import { getDataSource } from './dataSource'
import { MockHttpError, mockFetch } from './mock/server'

export const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? 'http://127.0.0.1:8000/api/v1'

const TOKEN_KEY = 'pql.token'

export const tokenStore = {
  get(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY)
    } catch {
      return null
    }
  },
  set(token: string) {
    try {
      localStorage.setItem(TOKEN_KEY, token)
    } catch {
      // ignore
    }
  },
  clear() {
    try {
      localStorage.removeItem(TOKEN_KEY)
    } catch {
      // ignore
    }
  },
}

export class ApiError extends Error {
  status: number
  code?: string

  constructor(status: number, message: string, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

export const UNAUTHORIZED_EVENT = 'pql:unauthorized'

// Known backend `detail` strings → Chinese copy. Unknown details pass through.
const DETAIL_ZH: Record<string, string> = {
  'invalid credentials': '账号或密码错误',
  'email already registered': '该邮箱已注册',
  'username already registered': '该用户名已注册',
  'identifier required': '请输入邮箱或用户名',
  'Not authenticated': '登录已过期，请重新登录',
  'Invalid token': '登录已过期，请重新登录',
  'User not found': '账号不存在，请重新登录',
  'customer not found': '客户不存在或已被删除',
  'feishu credentials missing': '尚未配置飞书凭证，请先在设置中填写 App ID 与 App Secret',
  'Feishu sync client not implemented yet': '飞书同步功能开发中，敬请期待',
  'file too large': '文件超过 2MB 上限',
  'Not Found': '接口不存在',
}

const STATUS_ZH: Record<number, string> = {
  400: '请求有误，请检查后重试',
  401: '登录已过期，请重新登录',
  403: '没有权限执行此操作',
  404: '请求的资源不存在',
  413: '文件超过 2MB 上限',
  422: '提交的内容格式不正确',
  501: '该功能尚未上线',
}

// UI-IA §7.6: never surface raw English backend text.
function detailToMessage(detail: unknown, status: number): string {
  if (typeof detail === 'string') {
    if (DETAIL_ZH[detail]) return DETAIL_ZH[detail]
    if (detail.startsWith('mapping missing')) return '飞书字段映射缺少必填项'
    if (/[一-鿿]/.test(detail)) return detail
  }
  // FastAPI validation errors: detail is [{loc, msg, ...}]
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0] as { loc?: unknown[] }
    const field = Array.isArray(first.loc) ? String(first.loc[first.loc.length - 1]) : ''
    if (field === 'password') return '密码至少 6 个字符'
    if (field === 'file') return '请选择要上传的文件'
    return STATUS_ZH[422]
  }
  if (status >= 500) return '服务暂时不可用，请稍后再试'
  return STATUS_ZH[status] ?? `请求失败（${status}）`
}

type RequestOptions = Omit<RequestInit, 'body'> & { body?: unknown; auth?: boolean }

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { body, auth = true, headers, ...rest } = opts
  const h = new Headers(headers)
  let payload: BodyInit | undefined
  if (body instanceof FormData) {
    payload = body
  } else if (body !== undefined) {
    h.set('Content-Type', 'application/json')
    payload = JSON.stringify(body)
  }
  const token = tokenStore.get()
  if (auth && token) h.set('Authorization', `Bearer ${token}`)

  if (getDataSource() === 'mock') {
    try {
      return (await mockFetch(path, (rest.method ?? 'GET').toUpperCase(), h, body)) as T
    } catch (err) {
      if (!(err instanceof MockHttpError)) throw err
      if (err.status === 401 && auth) {
        tokenStore.clear()
        window.dispatchEvent(new Event(UNAUTHORIZED_EVENT))
      }
      throw new ApiError(err.status, detailToMessage(err.detail, err.status))
    }
  }

  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, { ...rest, headers: h, body: payload })
  } catch {
    throw new ApiError(0, '无法连接服务，请确认 API 已在 127.0.0.1:8000 启动', 'network_error')
  }

  const text = await res.text()
  const data = text ? safeJson(text) : null

  if (!res.ok) {
    const err = (data ?? {}) as { detail?: unknown; code?: string }
    if (res.status === 401 && auth) {
      tokenStore.clear()
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT))
    }
    throw new ApiError(res.status, detailToMessage(err.detail, res.status), err.code)
  }
  return data as T
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message
  if (err instanceof Error) return err.message
  return '发生未知错误'
}
