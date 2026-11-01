import { request } from './api'
import type { SyntheticDeleteResult, SyntheticResult } from './types'

export function generateSynthetic() {
  return request<SyntheticResult>('/data/synthetic', { method: 'POST' })
}

/** Removes only source=synthetic customers (and their events/scores). */
export function deleteSynthetic() {
  return request<SyntheticDeleteResult>('/data/synthetic', { method: 'DELETE' })
}
