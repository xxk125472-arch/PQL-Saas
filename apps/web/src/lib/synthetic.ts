import { request } from './api'
import type { SyntheticResult } from './types'

export function generateSynthetic() {
  return request<SyntheticResult>('/data/synthetic', { method: 'POST' })
}
