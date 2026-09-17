/**
 * The fields that recur in project templates: version, description, author,
 * licence, package manager — so that every template uses the same names and
 * the same checks.
 */

import type { FormField, FormValues } from '@/core/types'
import { identifier, isValidPackage } from '@/core/project/scaffold'

export const SEMVER = String.raw`\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?`

export function versionField(fallback = '0.1.0', pattern = SEMVER): FormField {
  return {
    id: 'version',
    label: 'templates.fields.version',
    default: fallback,
    pattern,
    patternHint: 'templates.fields.versionHint',
    mono: true,
    section: 'templates.sections.project',
  }
}

export const descriptionField: FormField = {
  id: 'description',
  label: 'templates.fields.description',
  placeholder: 'templates.fields.descriptionPlaceholder',
  required: false,
  section: 'templates.sections.project',
}

export const authorField: FormField = {
  id: 'author',
  label: 'templates.fields.author',
  placeholder: 'templates.fields.authorPlaceholder',
  required: false,
  section: 'templates.sections.project',
}

export const licenseField: FormField = {
  id: 'license',
  label: 'templates.fields.license',
  type: 'select',
  choices: [
    { value: 'MIT', label: 'MIT' },
    { value: 'Apache-2.0', label: 'Apache 2.0' },
    { value: 'GPL-3.0-or-later', label: 'GPL 3.0' },
    { value: 'BSD-3-Clause', label: 'BSD 3-Clause' },
    { value: 'UNLICENSED', label: 'templates.fields.licenseNone' },
  ],
  section: 'templates.sections.project',
}

export const commonFields = [versionField(), descriptionField, authorField, licenseField]

export const nodePackageManagerField: FormField = {
  id: 'pm',
  label: 'templates.fields.packageManager',
  type: 'select',
  choices: [
    { value: 'npm', label: 'npm' },
    { value: 'pnpm', label: 'pnpm' },
    { value: 'yarn', label: 'Yarn' },
    { value: 'bun', label: 'Bun' },
  ],
  section: 'templates.sections.build',
}

export const languageVariantField: FormField = {
  id: 'lang',
  label: 'templates.fields.language',
  type: 'select',
  choices: [
    { value: 'ts', label: 'TypeScript' },
    { value: 'js', label: 'JavaScript' },
  ],
  section: 'templates.sections.build',
}

/** The Maven and Gradle coordinates plus the Java package derived from them. */
export const jvmCoordinateFields: FormField[] = [
  {
    id: 'groupId',
    label: 'templates.fields.groupId',
    default: 'de.beispiel',
    pattern: String.raw`[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)*`,
    patternHint: 'templates.fields.groupIdHint',
    mono: true,
    section: 'templates.sections.coordinates',
  },
  {
    id: 'artifactId',
    label: 'templates.fields.artifactId',
    default: (v) => v.slug ?? 'app',
    pattern: String.raw`[a-z0-9][a-z0-9._-]*`,
    patternHint: 'templates.fields.artifactIdHint',
    mono: true,
    section: 'templates.sections.coordinates',
  },
  versionField('0.1.0-SNAPSHOT', String.raw`\d+(\.\d+)*(-[A-Za-z0-9.]+)?`),
  {
    id: 'package',
    label: 'templates.fields.package',
    default: (v) => `${v.groupId || 'de.beispiel'}.${identifier(v.artifactId || v.slug || 'app')}`,
    pattern: String.raw`[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)*`,
    patternHint: 'templates.fields.packageHint',
    mono: true,
    section: 'templates.sections.coordinates',
  },
  descriptionField,
]

export const javaVersionField: FormField = {
  id: 'java',
  label: 'templates.fields.javaVersion',
  type: 'select',
  // The first entry is the default (an LTS); the current non-LTS versions come after.
  choices: [
    { value: '21', label: 'Java 21 (LTS)' },
    { value: '25', label: 'Java 25 (LTS)' },
    { value: '17', label: 'Java 17 (LTS)' },
    { value: '11', label: 'Java 11 (LTS)' },
    { value: '8', label: 'Java 8 (LTS)' },
    { value: '26', label: 'Java 26' },
  ],
  section: 'templates.sections.build',
}

export const toggle = (id: string, label: string, fallback: boolean, section = 'templates.sections.options', hint?: string): FormField => ({
  id, label, type: 'toggle', default: String(fallback), section, hint,
})

export const isOn = (values: FormValues, id: string) => values[id] === 'true'

export { isValidPackage }

/** `de.firma.app` → `de/firma/app` */
export const packagePath = (pkg: string) => pkg.replace(/\./g, '/')

/** JSON with two spaces and a line break at the end. */
export const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`

/** Remove the empty entries (undefined, '') from an object — for package.json and its like. */
export function compact<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined && v !== ''),
  ) as Partial<T>
}

/** The package manager commands for Node projects. */
export const NODE_PM = {
  npm: { install: ['install'], add: ['install'], addDev: ['install', '-D'], run: (s: string) => ['run', s], exec: 'npx' },
  pnpm: { install: ['install'], add: ['add'], addDev: ['add', '-D'], run: (s: string) => ['run', s], exec: 'pnpm dlx' },
  yarn: { install: ['install'], add: ['add'], addDev: ['add', '-D'], run: (s: string) => ['run', s], exec: 'yarn dlx' },
  bun: { install: ['install'], add: ['add'], addDev: ['add', '-d'], run: (s: string) => ['run', s], exec: 'bunx' },
} as const

export type NodePm = keyof typeof NODE_PM
