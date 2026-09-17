/**
 * A small Markdown converter for the project pages.
 *
 * Deliberately small: the server should run without dependencies, and the
 * project pages need headings, paragraphs, lists, code, links and emphasis —
 * no more than that. Anything unknown stays as text.
 *
 * Security: the Markdown comes from whoever publishes, so from another hand.
 * Everything is therefore escaped **first** and only then is the markup
 * allowed put in. Raw HTML in the Markdown is never passed through; `<script>`
 * lands as visible text on the page rather than in the browser.
 */

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

export function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (char) => ESCAPES[char])
}

/** Only addresses harmless in a browser — no `javascript:`. */
function safeUrl(url) {
  const trimmed = url.trim()
  if (/^(https?:|mailto:|#|\/)/i.test(trimmed)) return trimmed
  return '#'
}

/** Markup within a line, on text already escaped. */
function inline(escaped) {
  return escaped
    // Code first: whatever stands inside should not be marked up further.
    .replace(/`([^`]+)`/g, (_all, code) => `<code>${code}</code>`)
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_all, alt, src) => `<img src="${escapeHtml(safeUrl(src))}" alt="${alt}">`)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_all, label, href) => `<a href="${escapeHtml(safeUrl(href))}" rel="noopener noreferrer">${label}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|\W)_([^_]+)_(?=\W|$)/g, '$1<em>$2</em>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
}

/**
 * Markdown to HTML.
 *
 * Line by line, with a glance at the state before — that is enough for code
 * blocks, lists and tables without a real parser.
 */
export function renderMarkdown(source) {
  const lines = String(source ?? '').split(/\r?\n/)
  const out = []
  let inCode = false
  let inList = null
  let paragraph = []

  const closeParagraph = () => {
    if (!paragraph.length) return
    out.push(`<p>${inline(paragraph.join(' '))}</p>`)
    paragraph = []
  }
  const closeList = () => {
    if (!inList) return
    out.push(`</${inList}>`)
    inList = null
  }
  const closeAll = () => { closeParagraph(); closeList() }

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '')

    const fence = /^```(\w*)\s*$/.exec(line)
    if (fence) {
      if (inCode) {
        out.push('</code></pre>')
        inCode = false
        continue
      }
      closeAll()
      out.push(`<pre><code${fence[1] ? ` class="language-${escapeHtml(fence[1])}"` : ''}>`)
      inCode = true
      continue
    }
    if (inCode) {
      out.push(escapeHtml(raw))
      continue
    }

    if (!line.trim()) {
      closeAll()
      continue
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading) {
      closeAll()
      const level = heading[1].length
      out.push(`<h${level}>${inline(escapeHtml(heading[2]))}</h${level}>`)
      continue
    }

    if (/^(?:---|\*\*\*|___)\s*$/.test(line)) {
      closeAll()
      out.push('<hr>')
      continue
    }

    const quote = /^>\s?(.*)$/.exec(line)
    if (quote) {
      closeAll()
      out.push(`<blockquote>${inline(escapeHtml(quote[1]))}</blockquote>`)
      continue
    }

    const bullet = /^[-*+]\s+(.*)$/.exec(line)
    const numbered = /^\d+[.)]\s+(.*)$/.exec(line)
    const item = bullet ?? numbered
    if (item) {
      closeParagraph()
      const wanted = bullet ? 'ul' : 'ol'
      if (inList && inList !== wanted) closeList()
      if (!inList) {
        out.push(`<${wanted}>`)
        inList = wanted
      }
      out.push(`<li>${inline(escapeHtml(item[1]))}</li>`)
      continue
    }
    closeList()
    paragraph.push(escapeHtml(line.trim()))
  }

  if (inCode) out.push('</code></pre>')
  closeAll()
  return out.join('\n')
}
