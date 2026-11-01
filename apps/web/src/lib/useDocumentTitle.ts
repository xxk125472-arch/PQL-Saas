import { useEffect } from 'react'

/** Sets the tab title as "页面 · PQL Health". */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = `${title} · PQL Health`
  }, [title])
}
