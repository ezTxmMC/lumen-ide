import type { Addon, LanguageSpec } from '@/core/types'
import { cssLibraryTemplate } from '../lib/web-project'
import { cssTokenizer } from '../lib/css-tokenizer'
import { LSP_PACKAGES } from '../lib/lsp-packages'

const PROPERTIES = [
  'display', 'position', 'top', 'right', 'bottom', 'left', 'inset', 'width',
  'height', 'min-width', 'max-width', 'min-height', 'max-height', 'margin',
  'padding', 'border', 'border-radius', 'background', 'background-color',
  'background-image', 'color', 'font', 'font-family', 'font-size', 'font-weight',
  'line-height', 'letter-spacing', 'text-align', 'text-decoration',
  'text-transform', 'opacity', 'overflow', 'z-index', 'flex', 'flex-direction',
  'flex-wrap', 'justify-content', 'align-items', 'align-content', 'align-self',
  'gap', 'row-gap', 'column-gap', 'grid', 'grid-template-columns',
  'grid-template-rows', 'grid-area', 'grid-column', 'grid-row', 'transition',
  'transform', 'animation', 'box-shadow', 'filter', 'backdrop-filter', 'cursor',
  'pointer-events', 'user-select', 'visibility', 'content', 'aspect-ratio',
  'object-fit', 'will-change', 'container-type', 'accent-color', 'color-scheme',
]

const VALUES = [
  'flex', 'grid', 'block', 'inline', 'inline-block', 'inline-flex', 'none',
  'absolute', 'relative', 'fixed', 'sticky', 'static', 'auto', 'hidden',
  'visible', 'scroll', 'center', 'start', 'end', 'space-between', 'space-around',
  'space-evenly', 'stretch', 'baseline', 'pointer', 'default', 'transparent',
  'currentColor', 'inherit', 'initial', 'unset', 'revert', 'bold', 'normal',
  'italic', 'uppercase', 'lowercase', 'capitalize', 'ease', 'ease-in', 'ease-out',
  'ease-in-out', 'linear', 'infinite', 'forwards', 'both',
]

const AT_RULES = [
  '@media', '@supports', '@container', '@layer', '@keyframes', '@font-face',
  '@import', '@charset', '@property', '@scope', '@starting-style',
]

export const cssSpec: LanguageSpec = {
  id: 'css',
  name: 'CSS',
  extensions: ['.css', '.scss', '.sass', '.less', '.pcss'],
  icon: '#',
  color: '#2965f1',
  comments: { line: '//', block: ['/*', '*/'] },
  tokenizer: cssTokenizer as never,
  completions: [...PROPERTIES, ...VALUES, ...AT_RULES],
  snippets: [
    { label: 'media', detail: 'Media Query', body: '@media (min-width: ${768px}) {\n  $0\n}' },
    { label: 'kf', detail: 'Keyframes', body: '@keyframes ${name} {\n  from { $0 }\n  to { }\n}' },
    { label: 'grid', detail: 'Grid-Layout', body: 'display: grid;\ngrid-template-columns: ${repeat(3, 1fr)};\ngap: ${1rem};' },
    { label: 'center', detail: 'Flex zentrieren', body: 'display: flex;\nalign-items: center;\njustify-content: center;$0' },
    { label: 'stack', detail: 'Vertikaler Stapel', body: 'display: flex;\nflex-direction: column;\ngap: ${0.5rem};$0' },
    { label: 'container', detail: 'Container-Query', body: '@container (min-width: ${30rem}) {\n  $0\n}' },
    { label: 'dark', detail: 'Dunkles Farbschema', body: '@media (prefers-color-scheme: dark) {\n  :root {\n    $0\n  }\n}' },
    { label: 'supports', detail: 'Feature-Abfrage', body: '@supports (${backdrop-filter: blur(1px)}) {\n  $0\n}' },
    { label: 'layer', detail: 'Cascade Layer', body: '@layer ${components} {\n  $0\n}' },
    { label: 'font', detail: '@font-face', body: "@font-face {\n  font-family: '${Name}';\n  src: url('${schrift.woff2}') format('woff2');\n  font-display: swap;\n}$0" },
    { label: 'var', detail: 'Custom Property', body: '--${name}: ${wert};$0' },
    { label: 'prop', detail: '@property', body: '@property --${name} {\n  syntax: \'${<color>}\';\n  inherits: false;\n  initial-value: ${#000};\n}$0' },
    { label: 'trans', detail: 'Übergang', body: 'transition: ${all} ${0.2s} ${ease};$0' },
    { label: 'anim', detail: 'Animation', body: 'animation: ${name} ${0.4s} ${ease-out} both;$0' },
    { label: 'shadow', detail: 'Schatten', body: 'box-shadow: 0 ${1px} ${2px} rgb(0 0 0 / ${20%});$0' },
    { label: 'grad', detail: 'Verlauf', body: 'background: linear-gradient(${135deg}, ${#7c8cff}, ${#22d3ee});$0' },
    { label: 'truncate', detail: 'Text abschneiden', body: 'overflow: hidden;\ntext-overflow: ellipsis;\nwhite-space: nowrap;$0' },
    { label: 'reduce', detail: 'Bewegung reduzieren', body: '@media (prefers-reduced-motion: reduce) {\n  *, *::before, *::after {\n    animation-duration: 0.01ms !important;\n    transition-duration: 0.01ms !important;\n  }\n}$0' },
  ],
  lsp: [
    {
      label: 'vscode-css-language-server',
      command: 'vscode-css-language-server',
      args: ['--stdio'],
      languageId: 'css',
      rootMarkers: ['package.json', '.git'],
      settings: {
        css: { validate: true, lint: { unknownAtRules: 'ignore' } },
        scss: { validate: true },
        less: { validate: true },
      },
      install: 'npm i -g vscode-langservers-extracted',
      package: LSP_PACKAGES.langserversExtracted,
    },
    {
      label: 'some-sass-language-server',
      command: 'some-sass-language-server',
      args: ['--stdio'],
      languageId: 'scss',
      install: 'npm i -g some-sass-language-server',
      package: LSP_PACKAGES.someSass,
    },
  ],
}

export const cssAddon: Addon = {
  id: 'lang.css',
  name: 'CSS',
  version: '1.0.0',
  description: 'CSS, SCSS und Less mit getrennter Einfärbung von Selektor, Eigenschaft und Wert.',
  icon: '#',
  builtin: true,
  category: 'language',
  languages: [cssSpec],
  projectTemplates: [cssLibraryTemplate],
}
