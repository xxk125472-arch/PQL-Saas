// Switch between the local sample-data mock and the real FastAPI backend.
// Default comes from VITE_DATA_SOURCE (mock | api); the in-app toggle overrides it per browser.

export type DataSource = 'mock' | 'api'

const KEY = 'pql.dataSource'
const ENV_DEFAULT: DataSource = import.meta.env.VITE_DATA_SOURCE === 'api' ? 'api' : 'mock'

export function getDataSource(): DataSource {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'mock' || v === 'api') return v
  } catch {
    // ignore
  }
  return ENV_DEFAULT
}

/** Tokens differ per source, so switching signs out and reloads into a clean state. */
export function setDataSource(next: DataSource) {
  try {
    localStorage.setItem(KEY, next)
    localStorage.removeItem('pql.token')
  } catch {
    // ignore
  }
  window.location.assign('/login')
}
