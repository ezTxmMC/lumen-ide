import type { Snippet } from '@/core/types';

/** Elements with content: `h1` → `<h1></h1>` with the cursor inside. */
const PAIRED_TAGS = [
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'div', 'span', 'strong', 'em', 'b', 'i', 'u', 's', 'small',
  'mark', 'code', 'pre', 'kbd', 'samp', 'var', 'sub', 'sup', 'abbr', 'cite', 'q', 'blockquote', 'time',
  'del', 'ins', 'address', 'header', 'footer', 'main', 'nav', 'aside', 'article', 'figure', 'figcaption',
  'li', 'ol', 'dl', 'dt', 'dd', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup',
  'label', 'textarea', 'option', 'optgroup', 'fieldset', 'legend', 'datalist', 'output', 'progress',
  'meter', 'summary', 'template', 'slot', 'noscript', 'canvas', 'audio', 'iframe', 'object', 'style',
  'title', 'body', 'head', 'bdi', 'bdo', 'ruby', 'rt', 'rp', 'menu', 'search', 'hgroup',
];

/** Elements without content: `br` → `<br>`. */
const VOID_TAGS = ['br', 'hr', 'wbr', 'col', 'area', 'base', 'embed', 'track'];

/** Tags with attributes worth filling in. */
const SPECIAL: Snippet[] = [
  { label: 'a:blank', detail: 'Link (new tab)', body: '<a href="${url}" target="_blank" rel="noopener noreferrer">$0</a>' },
  { label: 'a:mail', detail: 'Mail link', body: '<a href="mailto:${mail}">$0</a>' },
  { label: 'input:text', detail: 'Text input', body: '<input type="text" name="${name}" placeholder="${text}">$0' },
  { label: 'input:email', detail: 'Email input', body: '<input type="email" name="${email}" required>$0' },
  { label: 'input:password', detail: 'Password input', body: '<input type="password" name="${password}" autocomplete="current-password">$0' },
  { label: 'input:number', detail: 'Number input', body: '<input type="number" name="${name}" min="${0}" max="${100}">$0' },
  { label: 'input:checkbox', detail: 'Checkbox', body: '<input type="checkbox" id="${id}" name="${name}">$0' },
  { label: 'input:radio', detail: 'Radio button', body: '<input type="radio" name="${group}" value="${value}">$0' },
  { label: 'input:file', detail: 'File input', body: '<input type="file" name="${file}">$0' },
  { label: 'input:date', detail: 'Date input', body: '<input type="date" name="${date}">$0' },
  { label: 'input:hidden', detail: 'Hidden input', body: '<input type="hidden" name="${name}" value="${value}">$0' },
  { label: 'input:submit', detail: 'Submit button', body: '<input type="submit" value="${Send}">$0' },
  { label: 'button:submit', detail: 'Submit button', body: '<button type="submit">$0</button>' },
  { label: 'script:src', detail: 'Script file', body: '<script src="${app.js}" defer></script>$0' },
  { label: 'script:inline', detail: 'Inline script', body: '<script>\n  $0\n</script>' },
  { label: 'style:inline', detail: 'Inline style', body: '<style>\n  $0\n</style>' },
  { label: 'link:css', detail: 'Stylesheet', body: '<link rel="stylesheet" href="${style.css}">$0' },
  { label: 'link:icon', detail: 'Favicon', body: '<link rel="icon" href="${favicon.svg}" type="image/svg+xml">$0' },
  { label: 'link:preload', detail: 'Preload', body: '<link rel="preload" href="${file}" as="${font}">$0' },
  { label: 'meta:utf8', detail: 'Charset', body: '<meta charset="UTF-8">$0' },
  { label: 'meta:vp', detail: 'Viewport', body: '<meta name="viewport" content="width=device-width, initial-scale=1.0">$0' },
  { label: 'meta:desc', detail: 'Description', body: '<meta name="description" content="${description}">$0' },
  { label: 'meta:theme', detail: 'Theme color', body: '<meta name="theme-color" content="${#000000}">$0' },
  { label: 'audio:src', detail: 'Audio player', body: '<audio src="${file.mp3}" controls></audio>$0' },
  { label: 'iframe:src', detail: 'Iframe', body: '<iframe src="${url}" title="${title}" loading="lazy"></iframe>$0' },
  { label: 'ol:li', detail: 'Ordered list', body: '<ol>\n  <li>$0</li>\n</ol>' },
  { label: 'dl:dt', detail: 'Definition list', body: '<dl>\n  <dt>${Term}</dt>\n  <dd>$0</dd>\n</dl>' },
  { label: 'nav:ul', detail: 'Navigation', body: '<nav aria-label="${Main}">\n  <ul>\n    <li><a href="${/}">$0</a></li>\n  </ul>\n</nav>' },
  { label: 'figure:img', detail: 'Figure with caption', body: '<figure>\n  <img src="${src}" alt="${alt}">\n  <figcaption>$0</figcaption>\n</figure>' },
  { label: 'label:input', detail: 'Labelled input', body: '<label>\n  ${Label}\n  <input name="${name}">\n</label>$0' },
  { label: 'textarea:rows', detail: 'Textarea', body: '<textarea name="${name}" rows="${4}"></textarea>$0' },
  { label: 'comment', detail: 'Comment', body: '<!-- $0 -->' },
  { label: 'div.class', detail: 'div with class', body: '<div class="${name}">\n  $0\n</div>' },
  { label: 'div#id', detail: 'div with id', body: '<div id="${name}">\n  $0\n</div>' },
  { label: 'span.class', detail: 'span with class', body: '<span class="${name}">$0</span>' },
  { label: 'data-attr', detail: 'data attribute', body: 'data-${name}="${value}"$0' },
  { label: 'aria-label', detail: 'aria-label attribute', body: 'aria-label="${label}"$0' },
];

/** HTML snippets for every element: the tag name expands to the complete tag. */
export function htmlTagSnippets(taken: ReadonlySet<string>): Snippet[] {
  const paired = PAIRED_TAGS
    .filter((tag) => !taken.has(tag))
    .map((tag): Snippet => ({ label: tag, detail: `<${tag}>`, body: `<${tag}>$0</${tag}>` }));
  const voids = VOID_TAGS
    .filter((tag) => !taken.has(tag))
    .map((tag): Snippet => ({ label: tag, detail: `<${tag}>`, body: `<${tag}>$0` }));
  return [...paired, ...voids, ...SPECIAL.filter((snippet) => !taken.has(snippet.label))];
}
