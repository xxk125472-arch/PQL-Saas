// Thin fetch wrapper for the PQL Health API (docs/api/API-CONTRACT-v1.md).
// Each path is sent to the real backend or the in-browser mock per ./backend.ts.

import { backendFor } from './backend'
import { MockHttpError, mockFetch } from './mock/server'

// Same-origin by default: the backend serves apps/web/dist on :8000, and `vite dev` proxies /api to it.
export const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) || '/api/v1'

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

/** Mirrors RegisterRequest.password min_length in apps/api/app/api/v1/schemas.py. */
export const PASSWORD_MIN_LENGTH = 6

const NETWORK_ERROR = '无法连接服务器，请检查网络或确认后端服务已启动'
const UNKNOWN_ERROR = '发生未知错误，请稍后重试'

// Known backend `detail` strings → Chinese copy. Unknown English details fall back by status.
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
  'not implemented': '该功能尚未上线',
  'Not Found': '接口不存在',
  'skill not allowed': '不支持该分析技能',
  'run not found': '分析记录不存在',
  'settings not found': '租户设置不存在，请重新登录',
  'settings missing': '租户设置缺失，请联系管理员',
  'health_weights must sum to 1.0': '健康分权重之和必须为 1.0',
  'pql_weights must sum to 1.0': 'PQL 权重之和必须为 1.0',
  'LLM not configured': '尚未配置 LLM 接口',
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
    if (field === 'password') return `密码至少 ${PASSWORD_MIN_LENGTH} 个字符`
    if (field === 'file') return '请选择要上传的文件'
    return STATUS_ZH[422]
  }
  if (status >= 500) return '服务暂时不可用，请稍后再试'
  return STATUS_ZH[status] ?? `请求失败（${status}）`
}

type RequestOptions = Omit<RequestInit, 'body'> & { body?: unknown; auth?: boolean }

function onUnauthorized(status: number, auth: boolean) {
  if (status === 401 && auth) {
    tokenStore.clear()
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT))
  }
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { body, auth = true, headers, ...rest } = opts
  const method = (rest.method ?? 'GET').toUpperCase()

  if (backendFor(path) === 'mock') {
    try {
      return (await mockFetch(path, method, body)) as T
    } catch (err) {
      if (!(err instanceof MockHttpError)) throw err
      throw new ApiError(err.status, detailToMessage(err.detail, err.status), err.code)
    }
  }

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

  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, { ...rest, method, headers: h, body: payload })
  } catch (err) {
    console.error('[api] network error', method, path, err)
    throw new ApiError(0, NETWORK_ERROR, 'network_error')
  }

  const text = await res.text()
  const data = text ? safeJson(text) : null

  if (!res.ok) {
    const err = (data ?? {}) as { detail?: unknown; code?: string }
    onUnauthorized(res.status, auth)
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

/** User-facing message: ApiError copy is already Chinese; anything else is logged and generalised. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message
  console.error(err)
  return UNKNOWN_ERROR
}
