/**
 * The building blocks of the Minecraft templates: fields, Gradle and Maven
 * helpers, escaping, the wrapper, .gitignore and the README.
 */

import type { FormField, FormValues, ProjectTask, ProjectTemplate, TemplateContext } from '@/core/types'
import { identifier, pascalCase, snakeCase } from '@/core/project/scaffold'
import { GITIGNORE } from '@/core/project/scaffold'
import { getLanguage, t } from '@/i18n'
import { catalogRevision, javaFor } from './versions'

export { isOn, json, packagePath } from '../fields'

/* ------------------------------------------------------------------ *
 * Texts
 * ------------------------------------------------------------------ */

/** The section headings of the template fields. */
export const section = {
  project: () => t('minecraft.section.project'),
  coordinates: () => t('minecraft.section.coordinates'),
  minecraft: () => t('minecraft.section.minecraft'),
  build: () => t('minecraft.section.build'),
  options: () => t('minecraft.section.options'),
}

/* ------------------------------------------------------------------ *
 * Escaping
 * ------------------------------------------------------------------ */

/** A double-quoted string — valid in JSON, YAML, TOML and Java. */
export const quoted = (text: string) => JSON.stringify(text)

/** The contents of a Java string without the quotes. */
export const javaText = (text: string) => JSON.stringify(text).slice(1, -1)

export function escapeXml(text: string) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** A list of authors from “A, B”. */
export function authorsOf(values: FormValues): string[] {
  return (values.authors ?? '').split(',').map((a) => a.trim()).filter(Boolean)
}

/* ------------------------------------------------------------------ *
 * Fields
 * ------------------------------------------------------------------ */

export type BuildTool = 'gradle-kts' | 'gradle-groovy' | 'maven'

const JAVA_PACKAGE = String.raw`[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)*`

/** The mod id from the project name: lower case, digits, underscores, 2–64 characters. */
export function modIdFrom(slug: string | undefined): string {
  const base = snakeCase(slug || 'mod').replace(/^[^a-z]+/, '')
  const id = base || 'mod'
  const padded = id.length < 2 ? `${id}_mod` : id
  return padded.slice(0, 64)
}

export function mcVersionField(versions: () => string[]): FormField {
  return {
    id: 'mc',
    label: t('minecraft.field.mc'),
    type: 'select',
    choices: versions().map((v) => ({ value: v, label: `Minecraft ${v}`, hint: `Java ${javaFor(v)}` })),
    section: section.minecraft(),
    mono: true,
  }
}

export function javaField(): FormField {
  return {
    id: 'java',
    label: t('minecraft.field.java'),
    type: 'select',
    default: (v) => javaFor(v.mc ?? ''),
    choices: [
      { value: '25', label: 'Java 25 (LTS)' },
      { value: '21', label: 'Java 21 (LTS)' },
      { value: '17', label: 'Java 17 (LTS)' },
    ],
    hint: t('minecraft.hint.java'),
    section: section.minecraft(),
  }
}

export function buildToolField(tools: BuildTool[]): FormField {
  const labels: Record<BuildTool, string> = {
    'gradle-kts': 'Gradle (Kotlin-DSL)',
    'gradle-groovy': 'Gradle (Groovy-DSL)',
    maven: 'Maven',
  }
  return {
    id: 'build',
    label: t('minecraft.field.build'),
    type: 'select',
    choices: tools.map((value) => ({ value, label: labels[value] })),
    section: section.build(),
  }
}

/** The shared fields: the coordinates, the id, the main class, the metadata. */
export function identityFields(kind: 'mod' | 'plugin' | 'velocity'): FormField[] {
  const idField: Record<typeof kind, FormField> = {
    mod: {
      id: 'modId',
      label: t('minecraft.field.modId'),
      default: (v) => modIdFrom(v.slug),
      pattern: '[a-z][a-z0-9_]{1,63}',
      patternHint: t('minecraft.hint.modId'),
      mono: true,
      section: section.coordinates(),
    },
    plugin: {
      id: 'pluginName',
      label: t('minecraft.field.pluginName'),
      default: (v) => pascalCase(v.slug ?? 'plugin'),
      pattern: '[A-Za-z0-9_.-]+',
      patternHint: t('minecraft.hint.pluginName'),
      mono: true,
      section: section.coordinates(),
    },
    velocity: {
      id: 'pluginId',
      label: t('minecraft.field.pluginId'),
      default: (v) => modIdFrom(v.slug).replace(/_/g, '-'),
      pattern: '[a-z][a-z0-9_-]{0,63}',
      patternHint: t('minecraft.hint.pluginId'),
      mono: true,
      section: section.coordinates(),
    },
  }
  const idOf = (v: FormValues) => v.modId || v.pluginId || v.pluginName || v.slug || 'app'
  const suffix = kind === 'mod' ? '' : 'Plugin'

  return [
    {
      id: 'groupId',
      label: t('minecraft.field.groupId'),
      default: 'de.beispiel',
      pattern: JAVA_PACKAGE,
      patternHint: t('minecraft.hint.package'),
      mono: true,
      section: section.coordinates(),
    },
    idField[kind],
    {
      id: 'artifactId',
      label: t('minecraft.field.artifactId'),
      default: (v) => (v.slug ?? 'app'),
      pattern: '[a-z0-9][a-z0-9._-]*',
      patternHint: t('minecraft.hint.artifactId'),
      mono: true,
      section: section.coordinates(),
    },
    {
      id: 'version',
      label: t('minecraft.field.version'),
      default: '1.0.0',
      pattern: String.raw`\d+(\.\d+)*(-[A-Za-z0-9.]+)?`,
      patternHint: t('minecraft.hint.version'),
      mono: true,
      section: section.coordinates(),
    },
    {
      id: 'package',
      label: t('minecraft.field.package'),
      default: (v) => `${v.groupId || 'de.beispiel'}.${identifier(idOf(v))}`,
      pattern: JAVA_PACKAGE,
      patternHint: t('minecraft.hint.package'),
      mono: true,
      section: section.coordinates(),
    },
    {
      id: 'mainClass',
      label: t('minecraft.field.mainClass'),
      default: (v) => `${pascalCase(v.slug ?? 'app')}${suffix}`,
      pattern: '[A-Z][A-Za-z0-9_]*',
      patternHint: t('minecraft.hint.mainClass'),
      mono: true,
      section: section.coordinates(),
    },
    {
      id: 'description',
      label: t('minecraft.field.description'),
      required: false,
      section: section.project(),
    },
    {
      id: 'authors',
      label: t('minecraft.field.authors'),
      placeholder: 'Steve, Alex',
      required: false,
      section: section.project(),
    },
    {
      id: 'website',
      label: t('minecraft.field.website'),
      placeholder: 'https://…',
      pattern: String.raw`https?://\S+`,
      patternHint: t('minecraft.hint.website'),
      required: false,
      mono: true,
      section: section.project(),
    },
    {
      id: 'license',
      label: t('minecraft.field.license'),
      type: 'select',
      choices: [
        { value: 'MIT', label: 'MIT' },
        { value: 'Apache-2.0', label: 'Apache 2.0' },
        { value: 'GPL-3.0-or-later', label: 'GPL 3.0' },
        { value: 'LGPL-3.0-or-later', label: 'LGPL 3.0' },
        { value: 'MPL-2.0', label: 'MPL 2.0' },
        { value: 'CC0-1.0', label: 'CC0 1.0' },
        { value: 'All-Rights-Reserved', label: t('minecraft.license.arr') },
      ],
      section: section.project(),
    },
  ]
}

/** A version field (loader, API) whose default comes from the catalogue. */
export function versionField(id: string, label: string, fallback: (v: FormValues) => string, when?: (v: FormValues) => boolean): FormField {
  return {
    id,
    label,
    default: fallback,
    pattern: String.raw`[0-9A-Za-z][0-9A-Za-z.+_-]*`,
    patternHint: t('minecraft.hint.versionValue'),
    mono: true,
    section: section.minecraft(),
    when,
  }
}

export const toggle = (id: string, label: string, fallback: boolean, when?: (v: FormValues) => boolean, hint?: string): FormField => ({
  id, label, type: 'toggle', default: String(fallback), section: section.options(), when, hint,
})

/* ------------------------------------------------------------------ *
 * Templates with translated, cached fields
 * ------------------------------------------------------------------ */

export interface TemplateSpec extends Omit<ProjectTemplate, 'name' | 'description' | 'fields' | 'next'> {
  nameKey: string
  descriptionKey: string
  buildFields(): FormField[]
  next?: (ctx: TemplateContext) => string
}

/**
 * Turns a specification into a template whose name, description and fields fit
 * the current language and the version catalogue on every access. The fields
 * are cached per language and per state of the catalogue, so that the dialog
 * gets stable references.
 */
export function defineTemplate(spec: TemplateSpec): ProjectTemplate {
  let cacheKey = ''
  let cached: FormField[] = []
  const { nameKey, descriptionKey, buildFields, ...rest } = spec
  return {
    ...rest,
    get name() { return t(nameKey) },
    get description() { return t(descriptionKey) },
    get fields() {
      const key = `${getLanguage()}|${catalogRevision()}`
      if (key === cacheKey) return cached
      cached = buildFields()
      cacheKey = key
      return cached
    },
  }
}

/* ------------------------------------------------------------------ *
 * Gradle
 * ------------------------------------------------------------------ */

export const isKts = (values: FormValues) => values.build !== 'gradle-groovy'
export const isMaven = (values: FormValues) => values.build === 'maven'

export function wrapperProperties(gradle: string) {
  return [
    'distributionBase=GRADLE_USER_HOME',
    'distributionPath=wrapper/dists',
    `distributionUrl=https\\://services.gradle.org/distributions/gradle-${gradle}-bin.zip`,
    'networkTimeout=10000',
    'validateDistributionUrl=true',
    'zipStoreBase=GRADLE_USER_HOME',
    'zipStorePath=wrapper/dists',
    '',
  ].join('\n')
}

/** A Gradle string in the right DSL. */
export const gstr = (values: FormValues, text: string) => (isKts(values) ? `"${text.replace(/[\\"$]/g, '\\$&')}"` : `'${text.replace(/[\\']/g, '\\$&')}'`)

const FOOJAY = {
  kts: 'plugins {\n    id("org.gradle.toolchains.foojay-resolver-convention") version "1.0.0"\n}\n\n',
  groovy: "plugins {\n    id 'org.gradle.toolchains.foojay-resolver-convention' version '1.0.0'\n}\n\n",
}

/** Resolving the toolchain (loads the right JDK where needed). */
export const foojay = (values: FormValues) => (isKts(values) ? FOOJAY.kts : FOOJAY.groovy)

export function settingsFile(values: FormValues, name: string, pluginRepos: string[] = [], extra = ''): Record<string, string> {
  const kts = isKts(values)
  const repos = pluginRepos.map((url) => (kts ? `        maven("${url}")` : `        maven { url = '${url}' }`))
  const management = pluginRepos.length
    ? `pluginManagement {\n    repositories {\n${repos.join('\n')}\n        mavenCentral()\n        gradlePluginPortal()\n    }\n}\n\n`
    : ''
  const root = kts ? `rootProject.name = "${name}"` : `rootProject.name = '${name}'`
  return { [kts ? 'settings.gradle.kts' : 'settings.gradle']: `${management}${extra}${root}\n` }
}

export function gradleSetup(ctx: TemplateContext, gradle: string): ProjectTask[] {
  if (isMaven(ctx.values)) {
    return [{ id: 'setup:mvn', label: t('minecraft.setup.maven'), command: 'mvn', args: ['-q', 'dependency:resolve'] }]
  }
  return [{
    id: 'setup:gradle',
    label: t('minecraft.setup.wrapper'),
    command: 'gradle',
    args: ['wrapper', '--gradle-version', gradle, '--distribution-type', 'bin'],
  }]
}

export const gitignore = () => `${GITIGNORE.java}run/\nrun-data/\nruns/\nsrc/generated/resources/.cache/\n.architectury-transformer/\n`

export function readme(ctx: TemplateContext, platform: string, commands: string[]) {
  const { values } = ctx
  const facts = [platform, ...(values.mc ? [`Minecraft ${values.mc}`] : []), `Java ${values.java}`]
  const lines = [
    `# ${ctx.name}`,
    '',
    ...(values.description ? [values.description, ''] : []),
    facts.join(' · '),
    '',
    '```bash',
    ...commands,
    '```',
    '',
  ]
  return lines.join('\n')
}

/* ------------------------------------------------------------------ *
 * Java sources
 * ------------------------------------------------------------------ */

/** The header with the package and the imports, sorted and unique. */
export function javaHeader(pkg: string, imports: string[]): string {
  const unique = [...new Set(imports)].sort()
  if (!unique.length) return `package ${pkg};\n\n`
  return `package ${pkg};\n\n${unique.map((i) => `import ${i};`).join('\n')}\n\n`
}
