/**
 * Shapes Lucide does not have, drawn for Lumen on the same 24×24 grid with
 * the same 2px round-capped strokes, so they sit next to the Lucide shapes
 * without standing out.
 *
 * Two families:
 *   • Role folders — the Lucide folder outline with a small emblem in its
 *     body (a flask for tests, lines for docs, a globe for `public` …).
 *   • Marks for tools and formats — simplified outlines (Markdown, Vue,
 *     Angular, GraphQL, Tailwind, Kotlin, Git, GitHub …). Brand icons are not
 *     taken from Lucide on purpose: its 1.x line dropped them.
 */

import { createLucideIcon, type LucideIcon } from 'lucide-react'

type Element = [string, Record<string, string>]

const path = (d: string): Element => ['path', { d }]
const circle = (cx: number, cy: number, r: number): Element => ['circle', { cx: String(cx), cy: String(cy), r: String(r) }]
const ellipse = (cx: number, cy: number, rx: number, ry: number): Element =>
  ['ellipse', { cx: String(cx), cy: String(cy), rx: String(rx), ry: String(ry) }]

function shape(name: string, elements: Element[]): LucideIcon {
  const node = elements.map(([tag, attrs], index) => [tag, { ...attrs, key: `${name}-${index}` }])
  return createLucideIcon(name, node as Parameters<typeof createLucideIcon>[1])
}

/** Lucide's folder outline; the emblems live in its body (x 6–18, y 9.5–17.5). */
const FOLDER = 'M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z'

function folder(name: string, emblem: Element[]): LucideIcon {
  return shape(name, [path(FOLDER), ...emblem])
}

/* ------------------------------------------------------------------ *
 * Role folders
 * ------------------------------------------------------------------ */

export const ROLE_FOLDERS = {
  'folder-test': folder('folder-test', [
    path('M10.5 9.5v2.6l-2.3 3.9a.9.9 0 0 0 .8 1.4h6a.9.9 0 0 0 .8-1.4l-2.3-3.9V9.5'),
    path('M9.8 9.5h4.4'),
  ]),
  'folder-docs': folder('folder-docs', [path('M8 10.5h8'), path('M8 13.5h8'), path('M8 16.5h5')]),
  'folder-image': folder('folder-image', [path('m7.5 17 3-3.5 2 2 1.5-1.5 2.5 3'), circle(14.5, 11, 1)]),
  'folder-script': folder('folder-script', [path('m8 10.5 2.5 2.5L8 15.5'), path('M12.5 16h3.5')]),
  'folder-component': folder('folder-component', [path('M12 9.5 15.5 13 12 16.5 8.5 13Z')]),
  'folder-library': folder('folder-library', [path('M8.5 10v7'), path('M11.5 10v7'), path('m14 10.3 2.2 6.4')]),
  'folder-api': folder('folder-api', [
    path('M10 10c-.9 0-1.4.5-1.4 1.4v.4c0 .7-.4 1.2-1.1 1.2.7 0 1.1.5 1.1 1.2v.4c0 .9.5 1.4 1.4 1.4'),
    path('M14 10c.9 0 1.4.5 1.4 1.4v.4c0 .7.4 1.2 1.1 1.2-.7 0-1.1.5-1.1 1.2v.4c0 .9-.5 1.4-1.4 1.4'),
  ]),
  'folder-route': folder('folder-route', [path('M8.5 17v-2.5a2.5 2.5 0 0 1 2.5-2.5h5'), path('m14 10 2 2-2 2')]),
  'folder-style': folder('folder-style', [path('M12 9.5c-1.9 2.2-3 3.7-3 5a3 3 0 0 0 6 0c0-1.3-1.1-2.8-3-5Z')]),
  'folder-public': folder('folder-public', [
    circle(12, 13.5, 3.5),
    path('M8.5 13.5h7'),
    path('M12 10a5.4 5.4 0 0 1 0 7 5.4 5.4 0 0 1 0-7Z'),
  ]),
  'folder-dist': folder('folder-dist', [path('M12 9.5v4.5'), path('m9.5 12 2.5 2.5 2.5-2.5'), path('M8.5 17h7')]),
  'folder-package': folder('folder-package', [
    path('m12 9.5 3.5 1.8v4.1L12 17.2l-3.5-1.8v-4.1Z'),
    path('m8.5 11.3 3.5 1.8 3.5-1.8'),
    path('M12 13.1v4.1'),
  ]),
  'folder-i18n': folder('folder-i18n', [
    path('m7.5 17 2-5.5 2 5.5'),
    path('M8.2 15.3h2.6'),
    path('M13 11h4'),
    path('M15 10v1c0 2.4-1 4.4-2.5 5.7'),
    path('M14.3 13.8c.7 1.3 1.6 2.3 2.7 2.9'),
  ]),
  'folder-database': folder('folder-database', [
    ellipse(12, 10.8, 3.5, 1.3),
    path('M8.5 10.8v5c0 .7 1.6 1.3 3.5 1.3s3.5-.6 3.5-1.3v-5'),
    path('M8.5 13.3c0 .7 1.6 1.3 3.5 1.3s3.5-.6 3.5-1.3'),
  ]),
  'folder-model': folder('folder-model', [path('m12 9.8 4 2-4 2-4-2Z'), path('m8 14.3 4 2 4-2')]),
  'folder-service': folder('folder-service', [path('M13 9.5 9.5 14h3l-1 3.5 3.5-4.5h-3Z')]),
  'folder-plugin': folder('folder-plugin', [
    path('M10.5 9.5v2'),
    path('M13.5 9.5v2'),
    path('M8.8 11.5h6.4v1.3a3.2 3.2 0 0 1-6.4 0Z'),
    path('M12 16v1.5'),
  ]),
  'folder-util': folder('folder-util', [
    path('M14.8 10.3a2.2 2.2 0 0 0-2.9 2.8l-2.9 2.9a.9.9 0 0 0 1.3 1.3l2.9-2.9a2.2 2.2 0 0 0 2.8-2.9l-1.3 1.3-1.2-.2-.2-1.2Z'),
  ]),
  'folder-ci': folder('folder-ci', [
    path('M8 10h3v3H8Z'),
    path('M13 14h3v3h-3Z'),
    path('M9.5 13v1.5a1 1 0 0 0 1 1H13'),
  ]),
  'folder-docker': folder('folder-docker', [
    path('M8 12h2v2H8Z'),
    path('M10.5 12h2v2h-2Z'),
    path('M13 12h2v2h-2Z'),
    path('M10.5 9.5h2v2h-2Z'),
    path('M7 15c1.1 1.4 2.7 2 5 2 3.1 0 4.7-1.3 5.3-3'),
  ]),
  'folder-github': folder('folder-github', [
    path('M10.2 17.3v-1.2c-1.5-.1-2.4-1-2.4-2.4 0-.6.2-1.1.5-1.4-.1-.5-.1-1 .1-1.6.6 0 1.1.3 1.6.7a5 5 0 0 1 3.1 0c.5-.4 1-.7 1.6-.7.2.6.2 1.1.1 1.6.3.3.5.8.5 1.4 0 1.4-.9 2.3-2.4 2.4v1.2'),
  ]),
  'folder-editor': folder('folder-editor', [path('m14.3 9.8 1.9 1.9-5 5H9.3v-1.9Z')]),
  'folder-secure': folder('folder-secure', [path('M12 9.5 15 10.6v2.4c0 2-1.4 3.3-3 3.9-1.6-.6-3-1.9-3-3.9v-2.4Z')]),
  'folder-font': folder('folder-font', [path('m9 17 3-7 3 7'), path('M10.1 14.5h3.8')]),
  'folder-media': folder('folder-media', [path('M10.5 10.3v6.4l4.8-3.2Z')]),
  'folder-cloud': folder('folder-cloud', [path('M9.8 16.8h5.2a2 2 0 0 0 .3-4 3 3 0 0 0-5.6-.9 2.5 2.5 0 0 0 .1 4.9Z')]),
  'folder-mobile': folder('folder-mobile', [path('M10.2 9.5h3.6a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-3.6a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1Z'), path('M11.5 15.8h1')]),
  'folder-view': folder('folder-view', [path('M8 10.3h8v6.4H8Z'), path('M8 12.3h8'), path('M10.5 12.3v4.4')]),
  'folder-examples': folder('folder-examples', [path('m12 9.8.9 2.3 2.3.9-2.3.9-.9 2.3-.9-2.3-2.3-.9 2.3-.9Z')]),
  'folder-types': folder('folder-types', [path('M8.8 10.3h6.4'), path('M12 10.3v6.7')]),
  'folder-temp': folder('folder-temp', [circle(12, 13.5, 3.5), path('M12 11.8v1.9l1.2.8')]),
  'folder-content': folder('folder-content', [path('M9 10h6v7H9Z'), path('M10.7 12.3h2.6'), path('M10.7 14.6h2.6')]),
  'folder-mock': folder('folder-mock', [
    path('M8.5 11c0-.8.7-1.2 1.6-1.2h3.8c.9 0 1.6.4 1.6 1.2v2.5a3.5 3.5 0 0 1-7 0Z'),
    path('M10.3 12.3h.1'),
    path('M13.6 12.3h.1'),
    path('M10.8 14.7c.7.4 1.7.4 2.4 0'),
  ]),
  'folder-game': folder('folder-game', [
    path('M9.2 11h5.6a2.2 2.2 0 0 1 2.1 2.8l-.6 2.2a1.2 1.2 0 0 1-2 .5L13.2 15h-2.4l-1.1 1.5a1.2 1.2 0 0 1-2-.5l-.6-2.2A2.2 2.2 0 0 1 9.2 11Z'),
  ]),
  'folder-android': folder('folder-android', [
    path('M8.5 16.5v-2.3a3.5 3.5 0 0 1 7 0v2.3Z'),
    path('m9.3 10.8.9 1.2'),
    path('m14.7 10.8-.9 1.2'),
  ]),
  'folder-apple': folder('folder-apple', [
    path('M12 11.4c-.6-.4-1.2-.6-1.8-.5-1.3.2-2 1.3-2 2.7 0 1.9 1.2 3.7 2.4 3.7.5 0 .8-.3 1.4-.3s.9.3 1.4.3c1.2 0 2.4-1.8 2.4-3.7 0-1.4-.7-2.5-2-2.7-.6-.1-1.2.1-1.8.5Z'),
    path('M12 11.4c0-.8.4-1.5 1.2-1.9'),
  ]),
  'folder-java': folder('folder-java', [
    path('M8.5 12.5h6v2a3 3 0 0 1-6 0Z'),
    path('M14.5 13h.8a1.2 1.2 0 0 1 0 2.4h-1.1'),
    path('M10.5 9.5v1.2'),
    path('M12.5 9.5v1.2'),
  ]),
  'folder-src': folder('folder-src', [path('m10 10.5-2 2.5 2 2.5'), path('m14 10.5 2 2.5-2 2.5')]),
} as const

/* ------------------------------------------------------------------ *
 * Marks for tools and formats
 * ------------------------------------------------------------------ */

export const MARKS = {
  github: shape('github', [
    path('M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.4 5.4 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4'),
    path('M9 18c-4.51 2-5-2-7-2'),
  ]),
  gitlab: shape('gitlab', [
    path('m22 13.29-3.33-10a.42.42 0 0 0-.8 0l-2.26 6.67H8.39L6.13 3.26a.42.42 0 0 0-.8 0L2 13.29a.74.74 0 0 0 .27.83L12 21l9.69-6.88a.71.71 0 0 0 .31-.83Z'),
  ]),
  git: shape('git', [
    path('M10.6 2.6a2 2 0 0 1 2.8 0l8 8a2 2 0 0 1 0 2.8l-8 8a2 2 0 0 1-2.8 0l-8-8a2 2 0 0 1 0-2.8Z'),
    circle(12, 8.5, 1.2),
    circle(12, 15.5, 1.2),
    circle(15.5, 12, 1.2),
    path('M12 9.7v4.6'),
    path('m12.9 9.4 1.8 1.8'),
  ]),
  markdown: shape('markdown', [
    path('M3 6.5A1.5 1.5 0 0 1 4.5 5h15A1.5 1.5 0 0 1 21 6.5v11a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5Z'),
    path('M6.5 15V9l2.5 3 2.5-3v6'),
    path('M16.5 9v6'),
    path('m14.5 13 2 2 2-2'),
  ]),
  vue: shape('vue', [path('M2 4h4l6 10 6-10h4L12 21Z'), path('M6.5 4 12 13l5.5-9')]),
  angular: shape('angular', [
    path('M12 2 3 5.5l1.4 11.9L12 22l7.6-4.6L21 5.5Z'),
    path('m8.5 16 3.5-9 3.5 9'),
    path('M9.8 13h4.4'),
  ]),
  svelte: shape('svelte', [
    path('M16.5 3.8a5 5 0 0 0-6.9 1.4L6.3 10a4.4 4.4 0 0 0-.5 3.9 4.6 4.6 0 0 0 .9 5.1 5 5 0 0 0 6.9-.2'),
    path('M7.5 20.2a5 5 0 0 0 6.9-1.4l3.3-4.8a4.4 4.4 0 0 0 .5-3.9 4.6 4.6 0 0 0-.9-5.1 5 5 0 0 0-6.9.2'),
    path('m14.5 8.5-5 7'),
  ]),
  graphql: shape('graphql', [path('M12 3 19.8 7.5v9L12 21l-7.8-4.5v-9Z'), path('M12 3 4.2 16.5h15.6Z')]),
  tailwind: shape('tailwind', [
    path('M7 10c1-3 3-4.5 6-4 1.7.3 2.5 2 4 2.2 1.3.2 2.4-.3 3-1.2-1 3-3 4.5-6 4-1.7-.3-2.5-2-4-2.2-1.3-.2-2.4.3-3 1.2Z'),
    path('M3 16c1-3 3-4.5 6-4 1.7.3 2.5 2 4 2.2 1.3.2 2.4-.3 3-1.2-1 3-3 4.5-6 4-1.7-.3-2.5-2-4-2.2-1.3-.2-2.4.3-3 1.2Z'),
  ]),
  kotlin: shape('kotlin', [path('M4 4h16l-8 8 8 8H4Z')]),
  bun: shape('bun', [
    path('M4 13.5C4 9.4 7.6 6 12 6s8 3.4 8 7.5S16.4 19 12 19s-8-1.4-8-5.5Z'),
    path('M9.5 12.5v.5'),
    path('M14.5 12.5v.5'),
    path('M11 14.8c.6.5 1.4.5 2 0'),
  ]),
  prisma: shape('prisma', [path('M4.5 17.5 12.5 3l7 15.5-10 3Z'), path('M12.5 3 9.5 21.5')]),
  python: shape('python', [
    path('M12 3c-3 0-4.5 1-4.5 3v2H12v1H6c-2 0-3 1.5-3 3.8S4 17 6 17h1.5v-2.5c0-1.5 1-2.5 2.5-2.5h4c1.5 0 2.5-1 2.5-2.5V6c0-2-1.5-3-4.5-3Z'),
    path('M12 21c3 0 4.5-1 4.5-3v-2H12v-1h6c2 0 3-1.5 3-3.8S20 7 18 7h-1.5'),
    path('M10 5.5h.01'),
    path('M14 18.5h.01'),
  ]),
  rust: shape('rust', [
    circle(12, 12, 6.5),
    path('M12 2v3'),
    path('M12 19v3'),
    path('m4.9 4.9 2.1 2.1'),
    path('m17 17 2.1 2.1'),
    path('M2 12h3'),
    path('M19 12h3'),
    path('m4.9 19.1 2.1-2.1'),
    path('m17 7 2.1-2.1'),
    path('M9.5 15.5v-7h3a2 2 0 0 1 0 4h-3'),
    path('m12.5 12.5 2 3'),
  ]),
  docker: shape('docker', [
    path('M4 11h3v3H4Z'),
    path('M7.5 11h3v3h-3Z'),
    path('M11 11h3v3h-3Z'),
    path('M7.5 7.5h3v3h-3Z'),
    path('M11 7.5h3v3h-3Z'),
    path('M11 4h3v3h-3Z'),
    path('M2 15c1.7 3.4 4.8 5 9 5 5.2 0 8.5-2.8 9.6-6.5.7 0 1.3-.4 1.4-1.2-.7-.5-1.6-.6-2.3-.3-.2-1-.8-1.7-1.6-2.2-.6.9-.8 2-.4 3.2H2Z'),
  ]),
  npm: shape('npm', [path('M3 7h18v8h-9v2H8v-2H3Z'), path('M7 11v4'), path('M12 11v6'), path('M17 11v4')]),
  yaml: shape('yaml', [
    path('m3 6 3 5 3-5'),
    path('M6 11v5'),
    path('m12 16 2.5-10 2.5 10'),
    path('M13 12.5h3'),
    path('M19 6v10h3'),
  ]),
  toml: shape('toml', [path('M8 4H4v16h4'), path('M16 4h4v16h-4'), path('M8.5 8.5h7'), path('M12 8.5V16')]),
  ruby: shape('ruby', [path('M6 3h12l4 6-10 12L2 9Z'), path('M2 9h20'), path('m12 21-4-12 4-6 4 6Z')]),
  cmake: shape('cmake', [path('M12 3 21.5 20h-19Z'), path('M12 3v11l9.5 6'), path('M12 14 2.5 20')]),
  shell: shape('shell', [
    path('M3 5.5A1.5 1.5 0 0 1 4.5 4h15A1.5 1.5 0 0 1 21 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5Z'),
    path('m7 9 3 3-3 3'),
    path('M12 15h5'),
  ]),
  certificate: shape('certificate', [
    path('M14 18H4.5A1.5 1.5 0 0 1 3 16.5v-11A1.5 1.5 0 0 1 4.5 4h15A1.5 1.5 0 0 1 21 5.5V9'),
    path('M7 8h8'),
    path('M7 11.5h4'),
    circle(18, 14, 3),
    path('m16.5 16.6-.5 4.4 2-1 2 1-.5-4.4'),
  ]),
  lumen: shape('lumen', [
    path('M12 2.5 14 10l7.5 2-7.5 2-2 7.5-2-7.5-7.5-2 7.5-2Z'),
    circle(12, 12, 1.2),
  ]),
} as const
