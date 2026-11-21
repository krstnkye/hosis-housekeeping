import { useState } from 'react'

// Client-side pagination for already-filtered page data. resetKey identifies
// the active search/filter selection; changing it starts the view at page 1
// without an effect that would cause an extra render.
export function usePagination(rows, pageSize = 10, resetKey = '') {
  const [state, setState] = useState({ key: resetKey, page: 1 })
  const requestedPage = state.key === resetKey ? state.page : 1
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize))
  const page = Math.min(requestedPage, pageCount)
  const firstIndex = (page - 1) * pageSize

  return {
    rows: rows.slice(firstIndex, firstIndex + pageSize),
    pagination: {
      page,
      pageSize,
      total: rows.length,
      onPageChange: (nextPage) => setState({ key: resetKey, page: nextPage }),
    },
  }
}
