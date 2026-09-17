/**
 * The project kinds and templates for JavaScript and TypeScript: npm, pnpm,
 * Yarn, Bun (package.json) and Deno.
 */

import type {
  DependencySupport, FormValues, ProjectContext, ProjectKind, ProjectTask, ProjectTemplate,
} from '@/core/types'
import { GITIGNORE } from '@/core/project/scaffold'
import {
  commonFields, compact, json, NODE_PM, nodePackageManagerField, toggle, type NodePm,
} from './fields'

interface PackageJson {
  name?: string
  version?: string
  description?: string
  type?: string
  packageManager?: string
  workspaces?: string[] | { packages?: string[] }
  scripts?: Record<string, string>
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  engines?: Record<string, string>
}

async function readPackage(ctx: ProjectContext): Promise<PackageJson | null> {
  const raw = await ctx.readFile('package.json')
  if (!raw) return null
  try {
    return JSON.parse(raw) as PackageJson
  } catch {
    return null
  }
}

/** Work out the package manager: the `packageManager` field, then the lockfile, otherwise npm. */
export async function detectPackageManager(ctx: ProjectContext, pkg: PackageJson | null): Promise<NodePm> {
  const declared = pkg?.packageManager?.split('@')[0]
  if (declared && declared in NODE_PM) return declared as NodePm
  if (await ctx.exists('bun.lock') || await ctx.exists('bun.lockb')) return 'bun'
  if (await ctx.exists('pnpm-lock.yaml')) return 'pnpm'
  if (await ctx.exists('yarn.lock')) return 'yarn'
  return 'npm'
}

function scriptGroup(name: string): ProjectTask['group'] {
  if (/^(dev|start|serve|preview|watch)$/.test(name)) return 'run'
  if (/^(build|compile|bundle|dist)(:|$)/.test(name)) return 'build'
  if (/^(test|check|lint|typecheck|e2e)/.test(name)) return 'test'
  if (/^clean/.test(name)) return 'clean'
  return 'other'
}

const nodeDependencies: DependencySupport = {
  manager: 'npm / pnpm / Yarn / Bun',
  placeholder: 'zod',
  hint: 'templates.node.npmHint',
  scopes: [
    { value: 'dependencies', label: 'dependencies' },
    { value: 'devDependencies', label: 'devDependencies' },
    { value: 'peerDependencies', label: 'peerDependencies' },
    { value: 'optionalDependencies', label: 'optionalDependencies' },
  ],
  async add(ctx, dep) {
    const pkg = await readPackage(ctx)
    const pm = await detectPackageManager(ctx, pkg)
    const spec = dep.version ? `${dep.name}@${dep.version}` : dep.name
    const flags: Record<string, Record<NodePm, string[]>> = {
      dependencies: { npm: ['install'], pnpm: ['add'], yarn: ['add'], bun: ['add'] },
      devDependencies: { npm: ['install', '-D'], pnpm: ['add', '-D'], yarn: ['add', '-D'], bun: ['add', '-d'] },
      peerDependencies: { npm: ['install', '--save-peer'], pnpm: ['add', '--save-peer'], yarn: ['add', '-P'], bun: ['add', '--peer'] },
      optionalDependencies: { npm: ['install', '-O'], pnpm: ['add', '-O'], yarn: ['add', '-O'], bun: ['add', '--optional'] },
    }
    const args = flags[dep.scope ?? 'dependencies']?.[pm] ?? flags.dependencies[pm]
    return { type: 'task', task: { id: 'npm:add', label: `${pm} add ${spec}`, command: pm, args: [...args, spec] } }
  },
}

export const npmKind: ProjectKind = {
  id: 'npm',
  name: 'Node.js',
  icon: 'np',
  color: '#cb3837',
  markers: ['package.json'],
  priority: 8,
  languageIds: ['javascript', 'typescript'],
  dependencies: nodeDependencies,
  async tasks(ctx) {
    const pkg = await readPackage(ctx)
    const pm = await detectPackageManager(ctx, pkg)
    const frozen: Record<NodePm, string[]> = {
      npm: ['ci'], pnpm: ['install', '--frozen-lockfile'], yarn: ['install', '--immutable'], bun: ['install', '--frozen-lockfile'],
    }
    const update: Record<NodePm, string[]> = { npm: ['update'], pnpm: ['update'], yarn: ['up'], bun: ['update'] }
    const tasks: ProjectTask[] = [
      { id: 'npm:install', label: 'templates.tasks.installDeps', command: pm, args: ['install'], group: 'build', detail: `${pm} install` },
      { id: 'npm:ci', label: 'templates.node.cleanInstall', command: pm, args: frozen[pm], group: 'build', detail: `${pm} ${frozen[pm].join(' ')}` },
    ]
    for (const [script, cmd] of Object.entries(pkg?.scripts ?? {})) {
      if (/^(pre|post)[a-z]/.test(script)) continue
      tasks.push({
        id: `npm:${script}`,
        label: script,
        command: pm,
        args: NODE_PM[pm].run(script),
        group: scriptGroup(script),
        detail: cmd.slice(0, 80),
      })
    }
    tasks.push(
      { id: 'npm:update', label: 'templates.tasks.updateDeps', command: pm, args: update[pm], group: 'other' },
      { id: 'npm:outdated', label: 'templates.tasks.outdated', command: pm, args: ['outdated'], group: 'other' },
    )
    if (pm !== 'bun') tasks.push({ id: 'npm:audit', label: 'templates.node.audit', command: pm, args: pm === 'yarn' ? ['npm', 'audit'] : ['audit'], group: 'other' })
    if (pm === 'npm' || pm === 'pnpm') tasks.push({ id: 'npm:dedupe', label: 'templates.node.dedupe', command: pm, args: ['dedupe'], group: 'other' })
    return tasks
  },
  async inspect(ctx) {
    const pkg = await readPackage(ctx)
    const pm = await detectPackageManager(ctx, pkg)
    const facts: Record<string, string> = { 'templates.fields.packageManager': pkg?.packageManager ?? pm }
    if (pkg?.type) facts['templates.facts.moduleSystem'] = pkg.type
    if (pkg?.engines?.node) facts.Node = pkg.engines.node
    if (await ctx.exists('tsconfig.json')) facts.TypeScript = 'tsconfig.json'
    const workspaces = Array.isArray(pkg?.workspaces) ? pkg.workspaces : pkg?.workspaces?.packages
    if (workspaces?.length) facts.Workspaces = workspaces.join(', ')
    if (await ctx.exists('pnpm-workspace.yaml')) facts.Workspaces = 'pnpm-workspace.yaml'
    const framework = detectFramework(pkg)
    if (framework) facts.Framework = framework
    const dependencies = [
      ...Object.entries(pkg?.dependencies ?? {}).map(([name, version]) => ({ name, version, scope: 'dependency' })),
      ...Object.entries(pkg?.devDependencies ?? {}).map(([name, version]) => ({ name, version, scope: 'dev' })),
      ...Object.entries(pkg?.peerDependencies ?? {}).map(([name, version]) => ({ name, version, scope: 'peer' })),
    ]
    return {
      name: pkg?.name,
      version: pkg?.version,
      description: pkg?.description,
      facts,
      dependencies,
      sourceRoots: ['src'],
      buildFile: 'package.json',
    }
  },
}

function detectFramework(pkg: PackageJson | null): string | undefined {
  const all = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) }
  const known: [string, string][] = [
    ['@angular/core', 'Angular'], ['astro', 'Astro'], ['next', 'Next.js'], ['nuxt', 'Nuxt'],
    ['@sveltejs/kit', 'SvelteKit'], ['vue', 'Vue'], ['react', 'React'], ['svelte', 'Svelte'],
    ['vite', 'Vite'], ['express', 'Express'], ['fastify', 'Fastify'], ['electron', 'Electron'],
  ]
  return known.find(([dep]) => dep in all)?.[1]
}

export const denoKind: ProjectKind = {
  id: 'deno',
  name: 'Deno',
  icon: 'De',
  color: '#70ffaf',
  markers: ['deno.json', 'deno.jsonc'],
  priority: 9,
  languageIds: ['javascript', 'typescript'],
  dependencies: {
    manager: 'Deno (JSR/npm)',
    placeholder: 'jsr:@std/path',
    hint: 'templates.node.denoHint',
    scopes: [{ value: 'imports', label: 'imports' }, { value: 'dev', label: 'dev' }],
    add: (_ctx, dep) => ({
      type: 'task',
      task: {
        id: 'deno:add', label: `deno add ${dep.name}`, command: 'deno',
        args: ['add', ...(dep.scope === 'dev' ? ['--dev'] : []), dep.version ? `${dep.name}@${dep.version}` : dep.name],
      },
    }),
  },
  async tasks(ctx) {
    const raw = (await ctx.readFile('deno.json')) ?? (await ctx.readFile('deno.jsonc'))
    let config: { tasks?: Record<string, string | { command: string }> } = {}
    try { config = raw ? JSON.parse(raw.replace(/^\s*\/\/.*$/gm, '')) : {} } catch { config = {} }
    const tasks: ProjectTask[] = Object.entries(config.tasks ?? {}).map(([name, cmd]) => ({
      id: `deno:${name}`,
      label: `deno task ${name}`,
      command: 'deno',
      args: ['task', name],
      group: scriptGroup(name),
      detail: typeof cmd === 'string' ? cmd : cmd.command,
    }))
    tasks.push(
      { id: 'deno:install', label: 'templates.tasks.fetchDeps', command: 'deno', args: ['install'], group: 'build' },
      { id: 'deno:check', label: 'templates.tasks.typecheck', command: 'deno', args: ['check', '.'], group: 'test' },
      { id: 'deno:test', label: 'templates.tasks.tests', command: 'deno', args: ['test', '-A'], group: 'test' },
      { id: 'deno:lint', label: 'Lint', command: 'deno', args: ['lint'], group: 'test' },
      { id: 'deno:fmt', label: 'templates.tasks.format', command: 'deno', args: ['fmt'], group: 'other' },
      { id: 'deno:outdated', label: 'templates.tasks.outdated', command: 'deno', args: ['outdated'], group: 'other' },
    )
    return tasks
  },
  async inspect(ctx) {
    const raw = (await ctx.readFile('deno.json')) ?? (await ctx.readFile('deno.jsonc'))
    let config: { name?: string; version?: string; imports?: Record<string, string> } = {}
    try { config = raw ? JSON.parse(raw.replace(/^\s*\/\/.*$/gm, '')) : {} } catch { config = {} }
    return {
      name: config.name,
      version: config.version,
      buildFile: 'deno.json',
      facts: { 'templates.fields.runtime': 'Deno' },
      dependencies: Object.entries(config.imports ?? {}).map(([name, spec]) => ({ name, version: spec, scope: 'import' })),
    }
  },
}

/* ------------------------------------------------------------------ *
 * Building blocks for the templates
 * ------------------------------------------------------------------ */

/** A package.json from the shared fields. */
export function packageJson(values: FormValues, extra: Record<string, unknown>): string {
  return json(compact({
    name: values.slug,
    version: values.version,
    description: values.description,
    author: values.author,
    license: values.license,
    private: true,
    type: 'module',
    ...extra,
  }))
}

/** The install task once the project has been created. */
export function installSetup(values: FormValues): ProjectTask[] {
  const pm = (values.pm || 'npm') as NodePm
  return [{ id: 'setup:install', label: 'templates.tasks.installDeps', command: pm, args: ['install'] }]
}

export const nodeFields = [...commonFields, nodePackageManagerField]

const tsconfig = (extra: Record<string, unknown> = {}) => json({
  compilerOptions: {
    target: 'ES2022',
    module: 'ESNext',
    moduleResolution: 'bundler',
    lib: ['ES2023'],
    strict: true,
    noUncheckedIndexedAccess: true,
    verbatimModuleSyntax: true,
    skipLibCheck: true,
    esModuleInterop: true,
    ...extra,
  },
  include: ['src'],
})

const run = (values: FormValues, script: string) => `${values.pm || 'npm'} run ${script}`

function nodeReadme(values: FormValues, scripts: string[]) {
  return `# ${values.name}\n\n${values.description ? `${values.description}\n\n` : ''}\`\`\`bash\n${values.pm || 'npm'} install\n${scripts.map((s) => run(values, s)).join('\n')}\n\`\`\`\n`
}

/* ------------------------------------------------------------------ *
 * The templates
 * ------------------------------------------------------------------ */

export const tsNodeTemplate: ProjectTemplate = {
  id: 'ts-node',
  name: 'TypeScript (Node.js)',
  description: 'templates.node.tsNodeDescription',
  languageId: 'typescript',
  kindId: 'npm',
  icon: 'TS',
  color: '#3178c6',
  fields: [...nodeFields, toggle('eslint', 'templates.node.eslint', false, 'templates.sections.build')],
  open: 'src/index.ts',
  setup: ({ values }) => installSetup(values),
  next: 'templates.node.nextDev',
  files({ values }) {
    const eslint = values.eslint === 'true'
    const bun = values.pm === 'bun'
    const files: Record<string, string> = {
      'package.json': packageJson(values, {
        scripts: compact({
          dev: bun ? 'bun --watch src/index.ts' : 'tsx watch src/index.ts',
          start: 'node dist/index.js',
          build: 'tsc -p tsconfig.build.json',
          typecheck: 'tsc --noEmit',
          test: bun ? 'bun test' : 'node --import tsx --test "src/**/*.test.ts"',
          lint: eslint ? 'eslint .' : undefined,
        }),
        devDependencies: compact({
          '@types/node': '^22.10.5',
          tsx: bun ? undefined : '^4.19.2',
          typescript: '^5.7.3',
          eslint: eslint ? '^9.17.0' : undefined,
          'typescript-eslint': eslint ? '^8.19.0' : undefined,
          '@eslint/js': eslint ? '^9.17.0' : undefined,
        }),
      }),
      'tsconfig.json': tsconfig({ types: ['node'], noEmit: true, allowImportingTsExtensions: true }),
      'tsconfig.build.json': json({ extends: './tsconfig.json', compilerOptions: { noEmit: false, allowImportingTsExtensions: false, rewriteRelativeImportExtensions: true, outDir: 'dist', rootDir: 'src' }, exclude: ['src/**/*.test.ts'] }),
      'src/index.ts': `export function greet(who: string): string {\n  return \`Hallo aus \${who}!\`\n}\n\nconsole.log(greet('${values.name}'))\n`,
      'src/index.test.ts': bun
        ? `import { expect, test } from 'bun:test'\nimport { greet } from './index.ts'\n\ntest('greet', () => {\n  expect(greet('x')).toBe('Hallo aus x!')\n})\n`
        : `import { test } from 'node:test'\nimport assert from 'node:assert/strict'\nimport { greet } from './index.ts'\n\ntest('greet', () => {\n  assert.equal(greet('x'), 'Hallo aus x!')\n})\n`,
      '.gitignore': GITIGNORE.node,
      'README.md': nodeReadme(values, ['dev', 'test', 'build']),
    }
    if (eslint) {
      files['eslint.config.js'] = `import js from '@eslint/js'\nimport tseslint from 'typescript-eslint'\n\nexport default tseslint.config(\n  { ignores: ['dist'] },\n  js.configs.recommended,\n  ...tseslint.configs.recommended,\n)\n`
    }
    return files
  },
}

export const tsLibraryTemplate: ProjectTemplate = {
  id: 'ts-library',
  name: 'templates.node.tsLibraryName',
  description: 'templates.node.tsLibraryDescription',
  languageId: 'typescript',
  kindId: 'npm',
  icon: 'TS',
  color: '#3178c6',
  fields: [
    ...nodeFields,
    {
      id: 'packageName', label: 'templates.node.packageName', default: (v) => v.slug, section: 'templates.sections.project', mono: true,
      pattern: String.raw`(@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*`, patternHint: 'templates.node.packageNameHint',
    },
  ],
  open: 'src/index.ts',
  setup: ({ values }) => installSetup(values),
  files({ values }) {
    return {
      'package.json': packageJson(values, {
        name: values.packageName,
        private: undefined,
        files: ['dist'],
        exports: { '.': { types: './dist/index.d.ts', import: './dist/index.js' } },
        main: './dist/index.js',
        types: './dist/index.d.ts',
        scripts: { build: 'tsc -p tsconfig.build.json', test: 'vitest run', dev: 'vitest', typecheck: 'tsc --noEmit', prepublishOnly: 'npm run build' },
        devDependencies: { typescript: '^5.7.3', vitest: '^2.1.8' },
      }),
      'tsconfig.json': tsconfig({ declaration: true, noEmit: true }),
      'tsconfig.build.json': json({ extends: './tsconfig.json', compilerOptions: { noEmit: false, outDir: 'dist', rootDir: 'src', declarationMap: true }, exclude: ['src/**/*.test.ts'] }),
      'src/index.ts': `/** Addiert zwei Zahlen. */\nexport function add(a: number, b: number): number {\n  return a + b\n}\n`,
      'src/index.test.ts': `import { describe, expect, it } from 'vitest'\nimport { add } from './index'\n\ndescribe('add', () => {\n  it('addiert', () => {\n    expect(add(2, 3)).toBe(5)\n  })\n})\n`,
      '.gitignore': GITIGNORE.node,
      '.npmignore': 'src/\n*.test.ts\ntsconfig*.json\n',
      'README.md': nodeReadme(values, ['build', 'test']),
    }
  },
}

export const tsViteTemplate: ProjectTemplate = {
  id: 'ts-vite',
  name: 'TypeScript (Vite, Browser)',
  description: 'templates.node.tsViteDescription',
  languageId: 'typescript',
  kindId: 'npm',
  icon: 'TS',
  color: '#3178c6',
  fields: nodeFields,
  open: 'src/main.ts',
  setup: ({ values }) => installSetup(values),
  next: 'templates.node.nextDev',
  files({ values }) {
    return {
      'package.json': packageJson(values, {
        scripts: { dev: 'vite', build: 'tsc --noEmit && vite build', preview: 'vite preview' },
        devDependencies: { typescript: '^5.7.3', vite: '^6.0.7' },
      }),
      'tsconfig.json': tsconfig({ lib: ['ES2023', 'DOM', 'DOM.Iterable'], noEmit: true, types: ['vite/client'] }),
      'index.html': htmlShell(values.name, '<div id="app"></div>', '/src/main.ts'),
      'src/main.ts': `import './style.css'\n\nconst app = document.querySelector<HTMLDivElement>('#app')!\napp.innerHTML = \`<h1>${values.name}</h1><button id="zaehler">Klicks: 0</button>\`\n\nlet klicks = 0\ndocument.querySelector<HTMLButtonElement>('#zaehler')!.addEventListener('click', (e) => {\n  klicks++\n  ;(e.currentTarget as HTMLButtonElement).textContent = \`Klicks: \${klicks}\`\n})\n`,
      'src/style.css': BASE_CSS,
      '.gitignore': GITIGNORE.node,
      'README.md': nodeReadme(values, ['dev', 'build']),
    }
  },
}

export const jsNodeTemplate: ProjectTemplate = {
  id: 'js-node',
  name: 'JavaScript (Node.js)',
  description: 'templates.node.jsNodeDescription',
  languageId: 'javascript',
  kindId: 'npm',
  icon: 'JS',
  color: '#f7df1e',
  fields: nodeFields,
  open: 'src/index.js',
  setup: ({ values }) => installSetup(values),
  files({ values }) {
    return {
      'package.json': packageJson(values, {
        main: 'src/index.js',
        scripts: { dev: 'node --watch src/index.js', start: 'node src/index.js', test: 'node --test' },
      }),
      'jsconfig.json': json({ compilerOptions: { module: 'ESNext', moduleResolution: 'bundler', target: 'ES2022', checkJs: true }, include: ['src'] }),
      'src/index.js': `/** @param {string} who */\nexport function greet(who) {\n  return \`Hallo aus \${who}!\`\n}\n\nconsole.log(greet('${values.name}'))\n`,
      'src/index.test.js': `import { test } from 'node:test'\nimport assert from 'node:assert/strict'\nimport { greet } from './index.js'\n\ntest('greet', () => {\n  assert.equal(greet('x'), 'Hallo aus x!')\n})\n`,
      '.gitignore': GITIGNORE.node,
      'README.md': nodeReadme(values, ['dev', 'test']),
    }
  },
}

export const jsBrowserTemplate: ProjectTemplate = {
  id: 'js-browser',
  name: 'templates.node.jsBrowserName',
  description: 'templates.node.jsBrowserDescription',
  languageId: 'javascript',
  icon: 'JS',
  color: '#f7df1e',
  fields: [descriptionOnly()],
  open: 'main.js',
  files({ name }) {
    return {
      'index.html': htmlShell(name, `<main>\n      <h1>${name}</h1>\n      <button id="zaehler">Klicks: 0</button>\n    </main>`, 'main.js', 'style.css'),
      'main.js': "let klicks = 0\nconst button = document.querySelector('#zaehler')\nbutton.addEventListener('click', () => {\n  klicks++\n  button.textContent = `Klicks: ${klicks}`\n})\n",
      'style.css': BASE_CSS,
      '.gitignore': '.lumen/\n',
    }
  },
}

export const denoTemplate: ProjectTemplate = {
  id: 'deno-app',
  name: 'templates.node.denoName',
  description: 'templates.node.denoDescription',
  languageId: 'typescript',
  kindId: 'deno',
  icon: 'De',
  color: '#70ffaf',
  fields: [commonFields[0], commonFields[1]],
  open: 'main.ts',
  setup: () => [{ id: 'setup:deno', label: 'templates.tasks.fetchDeps', command: 'deno', args: ['install'] }],
  files({ values, slug }) {
    return {
      'deno.json': json({
        name: `@app/${slug}`,
        version: values.version,
        tasks: { dev: 'deno run --watch main.ts', start: 'deno run main.ts', test: 'deno test' },
        imports: { '@std/assert': 'jsr:@std/assert@^1.0.10' },
      }),
      'main.ts': `export function add(a: number, b: number): number {\n  return a + b\n}\n\nif (import.meta.main) {\n  console.log('Hallo aus ${values.name}! 2 + 3 =', add(2, 3))\n}\n`,
      'main_test.ts': "import { assertEquals } from '@std/assert'\nimport { add } from './main.ts'\n\nDeno.test('add', () => {\n  assertEquals(add(2, 3), 5)\n})\n",
      '.gitignore': '.lumen/\n',
    }
  },
}

function descriptionOnly() {
  return { ...commonFields[1] }
}

/** The skeleton of an HTML page. */
export function htmlShell(title: string, body: string, script?: string, stylesheet?: string) {
  return `<!doctype html>
<html lang="de">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>${stylesheet ? `\n    <link rel="stylesheet" href="${stylesheet}" />` : ''}
  </head>
  <body>
    ${body}${script ? `\n    <script type="module" src="${script}"></script>` : ''}
  </body>
</html>
`
}

export const BASE_CSS = ':root {\n  font-family: system-ui, sans-serif;\n  color-scheme: light dark;\n}\n\nbody {\n  margin: 0;\n  display: grid;\n  place-items: center;\n  min-height: 100vh;\n}\n'
