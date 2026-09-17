import type { Addon, Theme } from '@/core/types'

export const lumenDark: Theme = {
  id: 'lumen-dark',
  name: 'Lumen Dark',
  type: 'dark',
  author: 'Lumen',
  ui: {
    bg: '#0e1013', bgElevated: '#14171c', bgOverlay: '#1a1e25', bgInput: '#1b1f26',
    bgHover: '#1e232b', bgActive: '#262c36', border: '#232830', borderStrong: '#333a45',
    text: '#e4e7ec', textMuted: '#9aa3b0', textSubtle: '#646d7a',
    accent: '#7c8cff', accentText: '#0b0d10',
    success: '#4ade80', warning: '#fbbf24', danger: '#f87171',
    selection: '#2d355080', lineHighlight: '#16191f', cursor: '#7c8cff',
    gutter: '#4a525e', scrollbar: '#333a45',
  },
  syntax: {
    keyword: { color: '#c4a6ff' }, control: { color: '#ff7ab6' },
    type: '#6fd3e8', builtin: '#7cc4ff', constant: '#ffb86c',
    string: '#98d982', escape: '#ffcc66', number: '#ffb86c',
    comment: { color: '#5e6673', italic: true },
    function: '#78b9ff', variable: '#dbe1ea', property: '#a5d6ff',
    operator: '#93a1b3', punctuation: '#7b8494',
    tag: '#ff7a93', attribute: '#ffc46b', meta: '#b3a1ff',
    regexp: '#8ee6c8', invalid: '#ff5c5c',
  },
}

export const lumenLight: Theme = {
  id: 'lumen-light',
  name: 'Lumen Light',
  type: 'light',
  author: 'Lumen',
  ui: {
    bg: '#fbfcfd', bgElevated: '#f3f5f8', bgOverlay: '#ffffff', bgInput: '#ffffff',
    bgHover: '#eceff4', bgActive: '#dfe4ec', border: '#e2e6ec', borderStrong: '#cfd5de',
    text: '#1d2128', textMuted: '#5c6572', textSubtle: '#8b939f',
    accent: '#4f5bd5', accentText: '#ffffff',
    success: '#16a34a', warning: '#b45309', danger: '#dc2626',
    selection: '#d6dcf7', lineHighlight: '#f2f4f8', cursor: '#4f5bd5',
    gutter: '#a8b0bb', scrollbar: '#cfd5de',
  },
  syntax: {
    keyword: '#8250df', control: '#cf222e', type: '#0550ae', builtin: '#0969da',
    constant: '#953800', string: '#0a7d32', escape: '#bc4c00', number: '#953800',
    comment: { color: '#7a828e', italic: true },
    function: '#1f6feb', variable: '#24292f', property: '#0550ae',
    operator: '#57606a', punctuation: '#6e7781',
    tag: '#b2114a', attribute: '#953800', meta: '#6639ba',
    regexp: '#0a7d32', invalid: '#cf222e',
  },
}

export const midnight: Theme = {
  id: 'midnight',
  name: 'Midnight',
  type: 'dark',
  author: 'Lumen',
  ui: {
    bg: '#070b14', bgElevated: '#0c1220', bgOverlay: '#101828', bgInput: '#0f1626',
    bgHover: '#141d30', bgActive: '#1b2740', border: '#1a2440', borderStrong: '#27324f',
    text: '#dce6f5', textMuted: '#8b9bb8', textSubtle: '#5b6a86',
    accent: '#22d3ee', accentText: '#041018',
    success: '#34d399', warning: '#fbbf24', danger: '#fb7185',
    selection: '#1e3a5f99', lineHighlight: '#0d1524', cursor: '#22d3ee',
    gutter: '#44536e', scrollbar: '#27324f',
  },
  syntax: {
    keyword: '#c084fc', control: '#f472b6', type: '#22d3ee', builtin: '#60a5fa',
    constant: '#fbbf24', string: '#86efac', escape: '#fbbf24', number: '#fbbf24',
    comment: { color: '#4f5d78', italic: true },
    function: '#7dd3fc', variable: '#cbd5e1', property: '#93c5fd',
    operator: '#8b9bb8', punctuation: '#64748b',
    tag: '#f472b6', attribute: '#fbbf24', meta: '#c084fc',
    regexp: '#5eead4', invalid: '#fb7185',
  },
}

export const forest: Theme = {
  id: 'forest',
  name: 'Forest',
  type: 'dark',
  author: 'Lumen',
  ui: {
    bg: '#0d1210', bgElevated: '#121916', bgOverlay: '#17201c', bgInput: '#161e1a',
    bgHover: '#1a231e', bgActive: '#222e28', border: '#1f2925', borderStrong: '#2d3a34',
    text: '#dfe8e2', textMuted: '#93a69b', textSubtle: '#61736a',
    accent: '#5ecf8f', accentText: '#08110c',
    success: '#5ecf8f', warning: '#e3b341', danger: '#f0796a',
    selection: '#254a3899', lineHighlight: '#141c18', cursor: '#5ecf8f',
    gutter: '#4c5c54', scrollbar: '#2d3a34',
  },
  syntax: {
    keyword: '#a5d6a7', control: '#f0946a', type: '#7fd6c1', builtin: '#8fd0e8',
    constant: '#e3b341', string: '#c3e88d', escape: '#e3b341', number: '#e3b341',
    comment: { color: '#586b61', italic: true },
    function: '#88d5b0', variable: '#d7e3da', property: '#a8ddd0',
    operator: '#8fa397', punctuation: '#6f8177',
    tag: '#f0946a', attribute: '#e3b341', meta: '#b6a5e8',
    regexp: '#7fd6c1', invalid: '#f0796a',
  },
}

export const solar: Theme = {
  id: 'solar',
  name: 'Solar',
  type: 'light',
  author: 'Lumen',
  ui: {
    bg: '#fdf9f2', bgElevated: '#f7f1e6', bgOverlay: '#fffdf8', bgInput: '#fffdf8',
    bgHover: '#f0e8da', bgActive: '#e6dccb', border: '#eae0cf', borderStrong: '#d6c9b2',
    text: '#3a3226', textMuted: '#6d6353', textSubtle: '#9a8f7c',
    accent: '#c2410c', accentText: '#fffdf8',
    success: '#4d7c0f', warning: '#a16207', danger: '#b91c1c',
    selection: '#f2e2c4', lineHighlight: '#f6efe3', cursor: '#c2410c',
    gutter: '#b3a892', scrollbar: '#d6c9b2',
  },
  syntax: {
    keyword: '#9333ea', control: '#c2410c', type: '#1d4ed8', builtin: '#0369a1',
    constant: '#a16207', string: '#4d7c0f', escape: '#c2410c', number: '#a16207',
    comment: { color: '#9a8f7c', italic: true },
    function: '#1d4ed8', variable: '#3a3226', property: '#0369a1',
    operator: '#6d6353', punctuation: '#8a7f6d',
    tag: '#b91c1c', attribute: '#a16207', meta: '#7c3aed',
    regexp: '#4d7c0f', invalid: '#b91c1c',
  },
}

export const graphite: Theme = {
  id: 'graphite',
  name: 'Graphite',
  type: 'dark',
  author: 'Lumen',
  ui: {
    bg: '#101012', bgElevated: '#161618', bgOverlay: '#1c1c1f', bgInput: '#1a1a1d',
    bgHover: '#202024', bgActive: '#292930', border: '#242428', borderStrong: '#35353c',
    text: '#e6e6e8', textMuted: '#96969e', textSubtle: '#63636b',
    accent: '#e6e6e8', accentText: '#101012',
    success: '#a3d9a5', warning: '#e0c584', danger: '#e59a9a',
    selection: '#33333c', lineHighlight: '#18181b', cursor: '#e6e6e8',
    gutter: '#4a4a52', scrollbar: '#35353c',
  },
  syntax: {
    keyword: { color: '#e6e6e8', bold: true }, control: { color: '#c9c9d0', bold: true },
    type: '#b9b9c2', builtin: '#a9a9b3', constant: '#c9c9d0',
    string: '#9fb59f', escape: '#c9c9d0', number: '#c0b39a',
    comment: { color: '#5a5a62', italic: true },
    function: '#d4d4da', variable: '#b3b3bb', property: '#a9a9b3',
    operator: '#83838c', punctuation: '#6d6d76',
    tag: '#d4d4da', attribute: '#a9a9b3', meta: '#8f8f99',
    regexp: '#9fb59f', invalid: '#e59a9a',
  },
}

export const themesAddon: Addon = {
  id: 'themes.lumen',
  name: 'Lumen Themes',
  version: '1.0.0',
  description: 'Sechs abgestimmte Themes — drei dunkle, zwei helle und ein monochromes.',
  icon: '◐',
  builtin: true,
  category: 'theme',
  themes: [lumenDark, midnight, forest, graphite, lumenLight, solar],
}

export const DEFAULT_THEME_ID = lumenDark.id
