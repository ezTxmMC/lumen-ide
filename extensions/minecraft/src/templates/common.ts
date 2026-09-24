/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

/**
 * The building blocks of the Minecraft templates: text helpers, the fields
 * every template shares, the Gradle files and the README.
 */

import type { FieldChoice, FormField, FormValues, ProjectTask, ProjectTemplate, TemplateContext } from '../../../../src/core/types';
import { foojayFor } from '../eras';
import { lumen, t } from '../lumen';

/* ------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------ */

export const isOn = (values: FormValues, id: string) => values[id] === 'true';

/** `de.firma.app` → `de/firma/app` */
export const packagePath = (pkg: string) => pkg.replace(/\./g, '/');

/** JSON with two spaces and a line break at the end. */
export const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

/** A double-quoted string — valid in JSON, YAML, TOML and Java. */
export const quoted = (text: string) => JSON.stringify(text);

/** The contents of a Java string without the quotes. */
export const javaText = (text: string) => JSON.stringify(text).slice(1, -1);

export function escapeXml(text: string) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** A list of authors from “A, B”. */
export function authorsOf(values: FormValues): string[] {
  return (values.authors ?? '').split(',').map((a) => a.trim()).filter(Boolean);
}

/** The header with the package and the imports, sorted and unique. */
export function javaHeader(pkg: string, imports: string[]): string {
  const unique = [...new Set(imports)].sort();
  if (!unique.length) { return `package ${pkg};\n\n`; }
  return `package ${pkg};\n\n${unique.map((i) => `import ${i};`).join('\n')}\n\n`;
}

/* ------------------------------------------------------------------ *
 * Sections
 * ------------------------------------------------------------------ */

export const section = {
  project: () => t('section.project'),
  coordinates: () => t('section.coordinates'),
  minecraft: () => t('section.minecraft'),
  build: () => t('section.build'),
  options: () => t('section.options'),
};

/* ------------------------------------------------------------------ *
 * Identity fields
 * ------------------------------------------------------------------ */

export type BuildTool = 'gradle-kts' | 'gradle-groovy' | 'maven';

const JAVA_PACKAGE = String.raw`[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)*`;

/** The mod id from the project name: lower case, digits, underscores, 2–64 characters. */
export function modIdFrom(slug: string | undefined): string {
  const base = lumen().project.snakeCase(slug || 'mod').replace(/^[^a-z]+/, '');
  const id = base || 'mod';
  const padded = id.length < 2 ? `${id}_mod` : id;
  return padded.slice(0, 64);
}

/** The one field that differs by project kind: the mod id, plugin name or plugin id. */
function idFieldFor(kind: 'mod' | 'plugin' | 'velocity'): FormField {
  const { pascalCase } = lumen().project;
  const idField: Record<typeof kind, FormField> = {
    mod: {
      id: 'modId',
      label: t('field.modId'),
      default: (v) => modIdFrom(v.slug),
      pattern: '[a-z][a-z0-9_]{1,63}',
      patternHint: t('hint.modId'),
      mono: true,
      section: section.coordinates(),
    },
    plugin: {
      id: 'pluginName',
      label: t('field.pluginName'),
      default: (v) => pascalCase(v.slug ?? 'plugin'),
      pattern: '[A-Za-z0-9_.-]+',
      patternHint: t('hint.pluginName'),
      mono: true,
      section: section.coordinates(),
    },
    velocity: {
      id: 'pluginId',
      label: t('field.pluginId'),
      default: (v) => modIdFrom(v.slug).replace(/_/g, '-'),
      pattern: '[a-z][a-z0-9_-]{0,63}',
      patternHint: t('hint.pluginId'),
      mono: true,
      section: section.coordinates(),
    },
  };
  return idField[kind];
}

/** The coordinate fields: group, artifact, version, package and main class. */
function coordinateFields(kind: 'mod' | 'plugin' | 'velocity'): { group: FormField; artifact: FormField; version: FormField; pkg: FormField; mainClass: FormField } {
  const { pascalCase, identifier } = lumen().project;
  const idOf = (v: FormValues) => v.modId || v.pluginId || v.pluginName || v.slug || 'app';
  const suffix = kind === 'mod' ? '' : 'Plugin';
  return {
    group: {
      id: 'groupId',
      label: t('field.groupId'),
      default: 'com.example',
      pattern: JAVA_PACKAGE,
      patternHint: t('hint.package'),
      mono: true,
      section: section.coordinates(),
    },
    artifact: {
      id: 'artifactId',
      label: t('field.artifactId'),
      default: (v) => (v.slug ?? 'app'),
      pattern: '[a-z0-9][a-z0-9._-]*',
      patternHint: t('hint.artifactId'),
      mono: true,
      section: section.coordinates(),
    },
    version: {
      id: 'version',
      label: t('field.version'),
      default: '1.0.0',
      pattern: String.raw`\d+(\.\d+)*(-[A-Za-z0-9.]+)?`,
      patternHint: t('hint.version'),
      mono: true,
      section: section.coordinates(),
    },
    pkg: {
      id: 'package',
      label: t('field.package'),
      default: (v) => `${v.groupId || 'com.example'}.${identifier(idOf(v))}`,
      pattern: JAVA_PACKAGE,
      patternHint: t('hint.package'),
      mono: true,
      section: section.coordinates(),
    },
    mainClass: {
      id: 'mainClass',
      label: t('field.mainClass'),
      default: (v) => `${pascalCase(v.slug ?? 'app')}${suffix}`,
      pattern: '[A-Z][A-Za-z0-9_]*',
      patternHint: t('hint.mainClass'),
      mono: true,
      section: section.coordinates(),
    },
  };
}

/** The descriptive fields: description, authors, website and license. */
function projectFields(): FormField[] {
  return [
    {
      id: 'description',
      label: t('field.description'),
      required: false,
      section: section.project(),
    },
    {
      id: 'authors',
      label: t('field.authors'),
      placeholder: 'Steve, Alex',
      required: false,
      section: section.project(),
    },
    {
      id: 'website',
      label: t('field.website'),
      placeholder: 'https://…',
      pattern: String.raw`https?://\S+`,
      patternHint: t('hint.website'),
      required: false,
      mono: true,
      section: section.project(),
    },
    {
      id: 'license',
      label: t('field.license'),
      type: 'select',
      default: 'MIT',
      choices: [
        { value: 'MIT', label: 'MIT' },
        { value: 'Apache-2.0', label: 'Apache 2.0' },
        { value: 'GPL-3.0-or-later', label: 'GPL 3.0' },
        { value: 'LGPL-3.0-or-later', label: 'LGPL 3.0' },
        { value: 'MPL-2.0', label: 'MPL 2.0' },
        { value: 'CC0-1.0', label: 'CC0 1.0' },
        { value: 'All-Rights-Reserved', label: t('license.arr') },
      ],
      section: section.project(),
    },
  ];
}

/** The shared fields: the coordinates, the id, the main class, the metadata. */
export function identityFields(kind: 'mod' | 'plugin' | 'velocity'): FormField[] {
  const { group, artifact, version, pkg, mainClass } = coordinateFields(kind);
  return [group, idFieldFor(kind), artifact, version, pkg, mainClass, ...projectFields()];
}

/* ------------------------------------------------------------------ *
 * Build fields
 * ------------------------------------------------------------------ */

const JAVA_RELEASES = [25, 21, 17, 16, 11, 8];

export function javaField(fallback: (values: FormValues) => number): FormField {
  return {
    id: 'java',
    label: t('field.java'),
    type: 'select',
    default: (v) => String(fallback(v)),
    choices: JAVA_RELEASES.map((release) => ({ value: String(release), label: `Java ${release}` })),
    hint: t('hint.java'),
    section: section.minecraft(),
  };
}

export function buildToolField(tools: BuildTool[] | ((values: FormValues) => BuildTool[]), hint?: string): FormField {
  const labels: Record<BuildTool, string> = {
    'gradle-kts': 'Gradle (Kotlin DSL)',
    'gradle-groovy': 'Gradle (Groovy DSL)',
    maven: 'Maven',
  };
  const list = (v: FormValues) => (typeof tools === 'function' ? tools(v) : tools);
  const toChoices = (v: FormValues): FieldChoice[] => list(v).map((value) => ({ value, label: labels[value] }));
  return {
    id: 'build',
    label: t('field.build'),
    type: 'select',
    default: (v) => list(v)[0],
    choices: toChoices({}),
    choicesFor: toChoices,
    hint,
    section: section.build(),
  };
}

export const toggle = (id: string, label: string, fallback: boolean, when?: (v: FormValues) => boolean, hint?: string): FormField => ({
  id, label, type: 'toggle', default: String(fallback), section: section.options(), when, hint,
});

/* ------------------------------------------------------------------ *
 * Templates with translated fields
 * ------------------------------------------------------------------ */

export interface TemplateSpec extends Omit<ProjectTemplate, 'name' | 'description' | 'fields' | 'next' | 'category' | 'keywords'> {
  nameKey: string;
  descriptionKey: string;
  keywords: string[];
  buildFields(): FormField[];
  next?: (ctx: TemplateContext) => string;
}

/**
 * A template whose name, description and fields follow the interface
 * language. Fields are built once per language so the form keeps stable
 * references; the version lists inside load on their own.
 */
export function defineTemplate(spec: TemplateSpec): ProjectTemplate {
  let cacheKey = '';
  let cached: FormField[] = [];
  const { nameKey, descriptionKey, buildFields, keywords, ...rest } = spec;
  return {
    ...rest,
    category: 'Minecraft',
    keywords: ['minecraft', ...keywords],
    get name() { return t(nameKey); },
    get description() { return t(descriptionKey); },
    get fields() {
      const key = lumen().language();
      if (key === cacheKey) { return cached; }
      cached = buildFields();
      cacheKey = key;
      return cached;
    },
  };
}

/* ------------------------------------------------------------------ *
 * Gradle
 * ------------------------------------------------------------------ */

export const isKts = (values: FormValues) => values.build !== 'gradle-groovy' && values.build !== 'maven';
export const isMaven = (values: FormValues) => values.build === 'maven';

/**
 * The Gradle wrapper and the JDK Gradle itself runs on.
 *
 * Next to the wrapper's properties comes a tiny build of its own under
 * `gradle/wrapper-setup`: `gradle -p gradle/wrapper-setup wrapper
 * updateDaemonJvm` writes `gradlew`, the jar and `gradle-daemon-jvm.properties`
 * without ever configuring the project — the Gradle on the PATH may be of
 * another major than the project needs (ForgeGradle 6 refuses Gradle 9).
 *
 * The daemon criteria make Gradle start on a fitting JDK whatever JAVA_HOME
 * says (Fabric Loom needs 25, Gradle 8 no newer than 24); `updateDaemonJvm`
 * adds download links, so a missing JDK is fetched.
 */
export function wrapperFiles(gradle: string, daemonJava: number): Record<string, string> {
  return {
    'gradle/wrapper/gradle-wrapper.properties': wrapperProperties(gradle),
    'gradle/gradle-daemon-jvm.properties': `toolchainVersion=${daemonJava}\n`,
    'gradle/wrapper-setup/settings.gradle': `// Only for setting up the Gradle wrapper: gradle -p gradle/wrapper-setup wrapper updateDaemonJvm
plugins {
    id 'org.gradle.toolchains.foojay-resolver-convention' version '1.0.0'
}

rootProject.name = 'wrapper-setup'
`,
    'gradle/wrapper-setup/build.gradle': `tasks.named('wrapper', Wrapper) {
    gradleVersion = '${gradle}'
    distributionType = Wrapper.DistributionType.BIN
    scriptFile = file('../../gradlew')
    jarFile = file('../wrapper/gradle-wrapper.jar')
}

tasks.matching { it.name == 'updateDaemonJvm' }.configureEach {
    propertiesFile = file('../gradle-daemon-jvm.properties')
    if (it.hasProperty('languageVersion')) {
        languageVersion = JavaLanguageVersion.of(${daemonJava})
        return
    }
    jvmVersion = JavaLanguageVersion.of(${daemonJava})
}
`,
  };
}

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
  ].join('\n');
}

/** A Gradle string in the right DSL. */
export const gstr = (values: FormValues, text: string) => (isKts(values) ? `"${text.replace(/[\\"$]/g, '\\$&')}"` : `'${text.replace(/[\\']/g, '\\$&')}'`);

/** Resolving the toolchain (loads the right JDK where needed); the resolver version follows Gradle's major. */
export function foojay(values: FormValues, gradle: string): string {
  const version = foojayFor(gradle);
  if (isKts(values)) { return `plugins {\n    id("org.gradle.toolchains.foojay-resolver-convention") version "${version}"\n}\n\n`; }
  return `plugins {\n    id 'org.gradle.toolchains.foojay-resolver-convention' version '${version}'\n}\n\n`;
}

export interface PluginRepository { name: string; url: string; groups?: string[]; }

export function settingsFile(values: FormValues, name: string, gradle: string, pluginRepos: PluginRepository[] = []): Record<string, string> {
  const kts = isKts(values);
  const repos = pluginRepos.map((repo) => (kts
    ? `        maven("${repo.url}") {\n            name = "${repo.name}"\n        }`
    : `        maven {\n            name = '${repo.name}'\n            url = '${repo.url}'\n        }`));
  const management = `pluginManagement {\n    repositories {\n${[...repos, '        gradlePluginPortal()', '        mavenCentral()'].join('\n')}\n    }\n}\n\n`;
  const root = kts ? `rootProject.name = "${name}"` : `rootProject.name = '${name}'`;
  return { [kts ? 'settings.gradle.kts' : 'settings.gradle']: `${management}${foojay(values, gradle)}${root}\n` };
}

export function gradleProperties(entries: Record<string, string>, extra: string[] = []): string {
  const lines = [
    'org.gradle.jvmargs=-Xmx2G',
    'org.gradle.daemon=true',
    'org.gradle.parallel=true',
    'org.gradle.caching=true',
    ...extra,
    '',
    ...Object.entries(entries).map(([k, v]) => `${k}=${v}`),
    '',
  ];
  return lines.join('\n');
}

export function gradleSetup(ctx: TemplateContext): ProjectTask[] {
  if (isMaven(ctx.values)) {
    return [{ id: 'setup:mvn', label: t('setup.maven'), command: 'mvn', args: ['-q', 'dependency:resolve'] }];
  }
  return [{
    id: 'setup:gradle',
    label: t('setup.wrapper'),
    command: 'gradle',
    args: ['--console=plain', '-p', 'gradle/wrapper-setup', 'wrapper', 'updateDaemonJvm'],
  }];
}

export const gitignore = () => `${lumen().project.gitignore.java ?? ''}run/\nrun-data/\nruns/\nsrc/generated/resources/.cache/\n.architectury-transformer/\n`;

export function readme(ctx: TemplateContext, platform: string, commands: string[], notes: string[] = []): string {
  const { values } = ctx;
  const facts = [platform, ...(values.mc ? [`Minecraft ${values.mc}`] : []), `Java ${values.java}`, ...(values.gradleVersion && !isMaven(values) ? [`Gradle ${values.gradleVersion}`] : [])];
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
    ...notes.flatMap((note) => [note, '']),
  ];
  return lines.join('\n');
}

export const gradleCommands = (runs: string[]) => [
  './gradlew build        # build/libs/*.jar',
  ...runs.map((r) => `./gradlew ${r}`),
];
