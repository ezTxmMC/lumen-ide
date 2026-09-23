/**
 * The templates for web projects that ship with Lumen: a static page and a CSS
 * package. The project kind is `npm` — the tasks and the dependencies come from
 * the package manager detected.
 *
 * Tailwind, React, Vue, Angular, Astro and MDX used to stand here; they are
 * extensions now (`extensions/react`, `extensions/vue`, …).
 */

import type { FormValues, ProjectTemplate } from '@/core/types'
import { GITIGNORE } from '@/core/project/scaffold'
import { commonFields, json, toggle } from './fields'
import { htmlShell, installSetup, nodeFields, packageJson } from './node-project'

function readme(values: FormValues, scripts: string[]) {
  const pm = values.pm || 'npm'
  return `# ${values.name}\n\n${values.description ? `${values.description}\n\n` : ''}\`\`\`bash\n${pm} install\n${scripts.map((s) => `${pm} run ${s}`).join('\n')}\n\`\`\`\n`
}

/* ------------------------------------------------------------------ *
 * HTML & CSS
 * ------------------------------------------------------------------ */

export const htmlSiteTemplate: ProjectTemplate = {
  id: 'html-site',
  name: 'templates.web.htmlSiteName',
  description: 'templates.web.htmlSiteDescription',
  languageId: 'html',
  icon: '<>',
  color: '#e34c26',
  fields: [
    commonFields[1],
    { id: 'lang', label: 'templates.web.pageLanguage', default: 'de', pattern: '[a-z]{2}(-[A-Z]{2})?', mono: true, section: 'templates.sections.project' },
    toggle('about', 'templates.web.aboutPage', true, 'templates.sections.content'),
    toggle('server', 'templates.web.liveServer', false, 'templates.sections.content', 'templates.web.liveServerHint'),
  ],
  kindId: (v) => (v.server === 'true' ? 'npm' : undefined),
  open: 'index.html',
  files({ name, values, slug }) {
    const nav = `<nav>\n        <a href="index.html">Start</a>${values.about === 'true' ? '\n        <a href="about.html">Über uns</a>' : ''}\n      </nav>`
    const page = (title: string, content: string) => `<!doctype html>
<html lang="${values.lang}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="${values.description ?? ''}" />
    <title>${title} · ${name}</title>
    <link rel="stylesheet" href="css/style.css" />
    <script src="js/main.js" defer></script>
  </head>
  <body>
    <header>
      <strong>${name}</strong>
      ${nav}
    </header>
    <main>
${content}
    </main>
    <footer>© ${new Date().getFullYear()} ${name}</footer>
  </body>
</html>
`
    const files: Record<string, string> = {
      'index.html': page('Start', `      <h1>Willkommen</h1>\n      <p>${values.description || 'Hier entsteht etwas Neues.'}</p>`),
      'css/style.css': `:root {\n  --accent: #7c8cff;\n  font-family: system-ui, sans-serif;\n  color-scheme: light dark;\n}\n\nbody {\n  margin: 0 auto;\n  max-width: 60rem;\n  padding: 1.5rem;\n}\n\nheader {\n  display: flex;\n  justify-content: space-between;\n  align-items: center;\n}\n\nnav a {\n  margin-left: 1rem;\n  color: var(--accent);\n}\n`,
      'js/main.js': "document.documentElement.classList.add('js')\n",
      'images/.gitkeep': '',
      '.gitignore': 'node_modules/\n',
    }
    if (values.about === 'true') files['about.html'] = page('Über uns', '      <h1>Über uns</h1>\n      <p>…</p>')
    if (values.server === 'true') {
      files['package.json'] = json({ name: slug, private: true, scripts: { dev: 'serve .', build: 'echo "Kein Build nötig"' }, devDependencies: { serve: '^14.2.4' } })
    }
    return files
  },
}

export const cssLibraryTemplate: ProjectTemplate = {
  id: 'css-library',
  name: 'templates.web.cssLibraryName',
  description: 'templates.web.cssLibraryDescription',
  languageId: 'css',
  kindId: 'npm',
  icon: '#',
  color: '#264de4',
  fields: nodeFields,
  open: 'src/index.css',
  setup: ({ values }) => installSetup(values),
  files({ values }) {
    return {
      'package.json': packageJson(values, {
        private: undefined,
        files: ['dist'],
        style: 'dist/index.css',
        exports: { '.': './dist/index.css' },
        scripts: {
          build: 'lightningcss --bundle --minify --targets ">= 0.5%" src/index.css -o dist/index.css',
          dev: 'lightningcss --bundle --targets ">= 0.5%" src/index.css -o dist/index.css',
        },
        devDependencies: { 'lightningcss-cli': '^1.28.2' },
      }),
      'src/index.css': "@import './tokens.css';\n@import './base.css';\n@import './components/button.css';\n",
      'src/tokens.css': ':root {\n  --color-accent: oklch(65% 0.15 270);\n  --radius: 0.5rem;\n  --space: 0.75rem;\n}\n',
      'src/base.css': '*, *::before, *::after {\n  box-sizing: border-box;\n}\n\nbody {\n  margin: 0;\n  font-family: system-ui, sans-serif;\n}\n',
      'src/components/button.css': '.btn {\n  padding: var(--space) calc(var(--space) * 2);\n  border: none;\n  border-radius: var(--radius);\n  background: var(--color-accent);\n  color: white;\n\n  &:hover {\n    filter: brightness(1.1);\n  }\n}\n',
      'demo.html': htmlShell(values.name, '<button class="btn">Knopf</button>', undefined, 'dist/index.css'),
      '.gitignore': GITIGNORE.node,
      'README.md': readme(values, ['build']),
    }
  },
}
