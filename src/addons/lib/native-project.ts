/**
 * The Bazel project kind, which Java shares with the native languages.
 *
 * CMake, Ninja, Meson, xmake, Make, vcpkg and Conan, and the C and C++
 * templates built on them, used to stand here; they are extensions now
 * (`extensions/c`, `extensions/cpp`, `extensions/buildtools`).
 */

import type { DependencySupport, ProjectKind } from '@/core/types'
import { t } from '@/i18n'

const C_LANGS = ['c', 'cpp']

/* ------------------------------------------------------------------ *
 * Bazel (Bzlmod)
 * ------------------------------------------------------------------ */

const bazelDependencies: DependencySupport = {
  manager: 'Bazel Central Registry',
  placeholder: 'googletest',
  hint: 'templates.native.bazelHint',
  versionRequired: true,
  async add(ctx, dep) {
    const text = await ctx.readFile('MODULE.bazel')
    if (text === null) throw new Error('MODULE.bazel fehlt — Bzlmod wird vorausgesetzt')
    const line = `bazel_dep(name = "${dep.name}", version = "${dep.version}")`
    return { type: 'edit', file: 'MODULE.bazel', content: `${text.replace(/\s*$/, '')}\n${line}\n` }
  },
}

export const bazelKind: ProjectKind = {
  id: 'bazel',
  name: 'Bazel',
  icon: 'Bz',
  color: '#43a047',
  markers: ['MODULE.bazel', 'WORKSPACE', 'WORKSPACE.bazel'],
  priority: 9,
  languageIds: [...C_LANGS, 'java', 'kotlin'],
  dependencies: bazelDependencies,
  tasks: () => [
    { id: 'bazel:build', label: 'templates.tasks.build', command: 'bazel', args: ['build', '//...'], group: 'build' },
    { id: 'bazel:test', label: 'templates.tasks.tests', command: 'bazel', args: ['test', '//...', '--test_output=errors'], group: 'test' },
    { id: 'bazel:run', label: t('templates.tasks.runNamed', { name: '//:app' }), command: 'bazel', args: ['run', '//:app'], group: 'run' },
    { id: 'bazel:clean', label: 'templates.tasks.clean', command: 'bazel', args: ['clean'], group: 'clean' },
    { id: 'bazel:query', label: 'templates.tasks.listTargets', command: 'bazel', args: ['query', '//...'], group: 'other' },
    { id: 'bazel:mod', label: 'templates.native.moduleGraph', command: 'bazel', args: ['mod', 'graph'], group: 'other' },
  ],
  async inspect(ctx) {
    const text = (await ctx.readFile('MODULE.bazel')) ?? ''
    const module = /module\(\s*name\s*=\s*"([^"]+)"(?:\s*,\s*version\s*=\s*"([^"]+)")?/.exec(text)
    return {
      name: module?.[1],
      version: module?.[2],
      dependencies: Array.from(text.matchAll(/bazel_dep\(\s*name\s*=\s*"([^"]+)"\s*,\s*version\s*=\s*"([^"]+)"/g))
        .map((m) => ({ name: m[1], version: m[2], scope: 'bazel_dep' })),
      buildFile: text ? 'MODULE.bazel' : 'WORKSPACE',
    }
  },
}
