import { useCallback, useEffect, useState } from 'react'

const KEY = 'lumen-site-theme'
const media = () => window.matchMedia('(prefers-color-scheme: dark)')

function isDark() {
  const choice = document.documentElement.getAttribute('data-theme')
  if (choice === 'dark') return true
  if (choice === 'light') return false
  return media().matches
}

/** The page theme: the system's until the visitor picks one, which is remembered. */
export function useSiteTheme() {
  const [dark, setDark] = useState(isDark)

  useEffect(() => {
    const query = media()
    const sync = () => setDark(isDark())
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])

  const toggle = useCallback(() => {
    const next = isDark() ? 'light' : 'dark'
    document.documentElement.setAttribute('data-theme', next)
    try {
      localStorage.setItem(KEY, next)
    } catch {
      // Private window — the choice lasts until the page closes.
    }
    setDark(next === 'dark')
  }, [])

  return { dark, toggle }
}
