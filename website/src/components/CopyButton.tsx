import { useEffect, useState } from 'react'

/** Copies `text`; says so for a moment. Falls back to a prompt where the clipboard is refused. */
export function CopyButton({ text, label = 'Copy link', className = '' }: { text: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1400)
    return () => clearTimeout(timer)
  }, [copied])

  const copy = () => {
    if (!navigator.clipboard?.writeText) {
      window.prompt(label, text)
      return
    }
    navigator.clipboard.writeText(text).then(() => setCopied(true), () => window.prompt(label, text))
  }

  return (
    <button
      type="button"
      onClick={copy}
      className={`cursor-pointer rounded-md border px-2 py-0.5 font-mono text-[10.5px] ${className}`}
    >
      {copied ? 'Copied' : label}
    </button>
  )
}
