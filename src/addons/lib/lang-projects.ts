/**
 * The project kind and the template for Novus, the language Lumen builds in.
 *
 * Python, Rust, Go, PHP, C#, Crystal and the container and documentation
 * projects used to stand here; they are extensions now (`extensions/go`,
 * `extensions/rust`, …).
 */

import type { ProjectKind, ProjectTemplate } from '@/core/types'
import { GITIGNORE } from '@/core/project/scaffold'
import { toggle, versionField } from './fields'

const firstMatch = (text: string, re: RegExp) => re.exec(text)?.[1]

/* ------------------------------------------------------------------ *
 * Novus
 * ------------------------------------------------------------------ */

export const novusKind: ProjectKind = {
  id: 'novus',
  name: 'Novus',
  icon: 'Nv',
  color: '#7c5cff',
  markers: ['project.nv'],
  priority: 15,
  languageIds: ['novus'],
  dependencies: {
    manager: 'novusc deps',
    placeholder: 'github.com/benutzer/modul',
    hint: 'templates.lang.novusHint',
    add: (_ctx, dep) => ({
      type: 'task',
      task: { id: 'novus:deps:add', label: `novusc deps add ${dep.name}`, command: 'novusc', args: ['deps', 'add', dep.name, ...(dep.version ? [dep.version] : [])] },
    }),
  },
  tasks: () => [
    { id: 'novus:run', label: 'templates.tasks.run', command: 'novusc', args: ['run'], group: 'run', detail: 'novusc run' },
    { id: 'novus:build', label: 'templates.tasks.build', command: 'novusc', args: ['build'], group: 'build', detail: 'novusc build' },
    { id: 'novus:check', label: 'templates.tasks.check', command: 'novusc', args: ['check'], group: 'test', detail: 'novusc check' },
    { id: 'novus:emit', label: 'templates.lang.emitC', command: 'novusc', args: ['emit'], group: 'other' },
    { id: 'novus:deps', label: 'templates.tasks.fetchDeps', command: 'novusc', args: ['deps'], group: 'build' },
    { id: 'novus:deps:update', label: 'templates.tasks.updateDeps', command: 'novusc', args: ['deps', 'update'], group: 'other' },
  ],
  async inspect(ctx) {
    const text = (await ctx.readFile('project.nv')) ?? ''
    return {
      name: firstMatch(text, /^project\s+"([^"]+)"/m),
      version: firstMatch(text, /^version\s+"([^"]+)"/m),
      facts: { ...(firstMatch(text, /^main\s+"([^"]+)"/m) ? { 'templates.facts.entry': firstMatch(text, /^main\s+"([^"]+)"/m)! } : {}) },
      dependencies: Array.from(text.matchAll(/^require\s+"([^"]+)"(?:\s+"([^"]+)")?/gm)).map((m) => ({ name: m[1], version: m[2] ?? 'latest', scope: 'require' })),
      buildFile: 'project.nv',
    }
  },
}

export const novusTemplate: ProjectTemplate = {
  id: 'novus-project',
  name: 'templates.lang.novusName',
  description: 'templates.lang.novusDescription',
  languageId: 'novus',
  kindId: 'novus',
  icon: 'Nv',
  color: '#7c5cff',
  fields: [
    { id: 'module', label: 'templates.fields.modulePath', default: (v) => `github.com/benutzer/${v.slug ?? 'app'}`, pattern: String.raw`[\w.\-/]+`, mono: true, section: 'templates.sections.project' },
    versionField(),
    { id: 'output', label: 'templates.lang.outputName', default: (v) => v.slug ?? 'app', pattern: String.raw`[\w.-]+`, mono: true, section: 'templates.sections.build' },
    toggle('lib', 'templates.lang.libEntry', false, 'templates.sections.build'),
  ],
  open: 'main.nv',
  files({ values, name }) {
    const lib = values.lib === 'true'
    return {
      'project.nv': [
        `project "${values.module}"`,
        `version "${values.version}"`,
        'main "main.nv"',
        ...(lib ? ['lib "lib.nv"'] : []),
        `output "${values.output}"`,
        '',
        '// require "github.com/benutzer/modul" "v1.0.0"',
        '',
      ].join('\n'),
      'main.nv': `package main\n\nmethod main {\n    println "Hallo aus ${name}!"\n}\n`,
      ...(lib ? { 'lib.nv': 'package lib\n\nmethod greet(string name): string {\n    return "Hallo, ${name}!"\n}\n' } : {}),
      '.gitignore': GITIGNORE.novus,
    }
  },
}
