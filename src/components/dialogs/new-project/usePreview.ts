/**
 * What a template would generate at the current input: the file paths and the
 * setup tasks. `files()` may be asynchronous (fetching a file) and may throw
 * half-way through typing, so it runs debounced, the newest run wins, and a
 * failure is reported rather than thrown.
 */

import { useEffect, useMemo, useState } from 'react'
import { templateContext } from '@/core/project/scaffold'
import type { FormValues, ProjectTask, ProjectTemplate } from '@/core/types'

const DEBOUNCE_MS = 220

export interface Preview {
  files: string[] | null
  loading: boolean
  error: string | null
  setup: ProjectTask[]
  dir: string
}

export function usePreview(
  template: ProjectTemplate | undefined, parent: string, name: string, values: FormValues, active: boolean,
): Preview {
  const [files, setFiles] = useState<string[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const valuesKey = JSON.stringify(values)

  const ctx = useMemo(() => {
    if (!template) return null
    try {
      return templateContext(template, parent || '~', name, values)
    } catch {
      return null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- values compared by content
  }, [template, parent, name, valuesKey])

  const setup = useMemo(() => {
    if (!template?.setup || !ctx) return []
    try {
      return template.setup(ctx)
    } catch {
      return []
    }
  }, [template, ctx])

  useEffect(() => {
    if (!active || !template || !ctx) return
    let stale = false
    setLoading(true)
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const generated = await template.files(ctx)
          if (stale) return
          setFiles(Object.keys(generated).sort())
          setError(null)
        } catch (err) {
          if (stale) return
          setError(err instanceof Error ? err.message : String(err))
        } finally {
          if (!stale) setLoading(false)
        }
      })()
    }, DEBOUNCE_MS)
    return () => {
      stale = true
      window.clearTimeout(timer)
    }
  }, [active, template, ctx])

  // A new template starts from an empty preview, not the last one's files.
  useEffect(() => {
    setFiles(null)
    setError(null)
  }, [template?.id])

  return { files, loading, error, setup, dir: ctx?.dir ?? '' }
}
