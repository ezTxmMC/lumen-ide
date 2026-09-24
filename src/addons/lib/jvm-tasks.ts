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
 * Custom tasks of JVM builds, read from the build files without running a
 * process: Gradle tasks registered in the scripts, Maven plugin goals and
 * profiles. Plus the parser for `gradle tasks --all`, whose output the project
 * panel fetches on request.
 *
 * Everything here works on text — pure functions, tested in
 * `scripts/check-project.ts`.
 */

import { parseXml, xmlChild, xmlText } from '@/core/project/detect';

/* ------------------------------------------------------------------ *
 * Gradle
 * ------------------------------------------------------------------ */

export interface GradleTaskInfo {
  name: string;
  group?: string;
  description?: string;
}

/** Strip `//` and `/* … *\/` comments so commented-out code is not read. */
export function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:"'])\/\/.*$/gm, '$1');
}

/** Position of the `}` that closes the brace opened just before `start`. */
export function closingBrace(text: string, start: number): number {
  let depth = 1;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') {
      depth++;
    }
    if (text[i] === '}') {
      depth--;
    }
    if (depth === 0) {
      return i;
    }
  }
  return -1;
}

/** The `{ … }` body that starts on the same line as `from`, or ''. */
function bodyAfter(text: string, from: number): string {
  const lineEnd = text.indexOf('\n', from);
  const open = text.indexOf('{', from);
  if (open === -1) {
    return '';
  }
  if (lineEnd !== -1 && open > lineEnd) {
    return '';
  }
  const close = closingBrace(text, open + 1);
  if (close === -1) {
    return '';
  }
  return text.slice(open + 1, close);
}

const quoted = (key: string) => new RegExp(`\\b${key}\\s*(?:=|\\.set\\()?\\s*["']([^"']+)["']`);

/** Patterns that declare a task; the first group is its name. */
const GRADLE_TASK_PATTERNS: RegExp[] = [
  // tasks.register("x"), tasks.register<Copy>("x"), tasks.create('x', Copy)
  /\btasks\s*\.\s*(?:register|create)\s*(?:<[\w.<>, ?]+>)?\s*\(\s*["']([\w.-]+)["']/g,
  // val x by tasks.registering(…) / tasks.creating
  /\bval\s+([A-Za-z_]\w*)\s+by\s+tasks\s*\.\s*(?:registering|creating)\b/g,
  // Groovy: task x, task x(type: Copy), task('x'), task "x"
  /^[ \t]*task\b\s*\(?\s*["']?([A-Za-z_][\w-]*)["']?/gm,
];

/** Custom tasks declared in a Gradle build script, with their group and description. */
export function parseGradleCustomTasks(source: string): GradleTaskInfo[] {
  const text = stripComments(source);
  const found = new Map<string, GradleTaskInfo>();
  for (const pattern of GRADLE_TASK_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      const name = match[1];
      if (found.has(name)) {
        continue;
      }
      const body = bodyAfter(text, (match.index ?? 0) + match[0].length);
      const group = quoted('group').exec(body)?.[1];
      const description = quoted('description').exec(body)?.[1];
      found.set(name, { name, ...(group ? { group } : {}), ...(description ? { description } : {}) });
    }
  }
  return [...found.values()];
}

/** A line of only dashes underlines a heading in the report. */
const RULE = /^-{3,}$/;
const TASK_LINE = /^([A-Za-z_][\w:.-]*)(?:\s+-\s+(.*))?$/;

/**
 * Parse the report of `gradle tasks --all`:
 *
 *   Build tasks
 *   -----------
 *   assemble - Assembles the outputs of this project.
 *   app:build - Assembles and tests this project.
 *
 * The heading's trailing “tasks” is dropped (`Build`). The banner (“Tasks
 * runnable from root project …”) and the “Rules” section are skipped.
 */
export function parseGradleTasksOutput(output: string): GradleTaskInfo[] {
  const lines = output.split(/\r?\n/).map((line) => line.trimEnd());
  const out: GradleTaskInfo[] = [];
  const seen = new Set<string>();
  let group: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const next = lines[i + 1] ?? '';
    if (RULE.test(line)) {
      continue;
    }
    if (line && RULE.test(next)) {
      group = headingGroup(line, lines[i - 1] ?? '');
      i++;
      continue;
    }
    if (!line) {
      group = null;
      continue;
    }
    if (!group) {
      continue;
    }
    const match = TASK_LINE.exec(line.trim());
    if (!match || seen.has(match[1])) {
      continue;
    }
    seen.add(match[1]);
    out.push({ name: match[1], group, ...(match[2] ? { description: match[2].trim() } : {}) });
  }
  return out;
}

/** The group a heading opens — `null` for the banner and for rules. */
function headingGroup(line: string, previous: string): string | null {
  if (RULE.test(previous)) {
    return null;
  }
  if (/^rules$/i.test(line.trim())) {
    return null;
  }
  return line.trim().replace(/\s+tasks$/i, '');
}

/* ------------------------------------------------------------------ *
 * Maven
 * ------------------------------------------------------------------ */

export interface MavenPluginInfo {
  groupId?: string;
  artifactId: string;
  /** The prefix used on the command line (`spring-boot`), or `null` when there is none. */
  prefix: string | null;
  /** Goals to offer, as typed after the prefix: `run`, `build@docker`. */
  goals: string[];
}

export interface MavenProfileInfo {
  id: string;
  activeByDefault: boolean;
}

/**
 * Goals worth offering for well-known plugins even when the pom binds none.
 * Goals needing required parameters (`versions:set`) are left out.
 */
const KNOWN_GOALS: Record<string, string[]> = {
  'spring-boot': ['run', 'build-image', 'repackage'],
  javafx: ['run', 'jlink'],
  quarkus: ['dev', 'build', 'test'],
  exec: ['java', 'exec'],
  jib: ['build', 'dockerBuild', 'buildTar'],
  flyway: ['migrate', 'info', 'validate', 'clean'],
  liquibase: ['update', 'status', 'rollback'],
  jetty: ['run'],
  tomcat7: ['run'],
  cargo: ['run'],
  versions: ['display-dependency-updates', 'display-plugin-updates', 'display-property-updates'],
  native: ['compile', 'test'],
  javadoc: ['javadoc'],
  checkstyle: ['check'],
  spotbugs: ['check', 'gui'],
  pmd: ['check'],
  spotless: ['apply', 'check'],
  jacoco: ['report'],
  dependency: ['tree', 'analyze'],
  enforcer: ['enforce'],
  'gwt': ['devmode'],
  micronaut: ['start'],
  helidon: ['run'],
  openapi: ['generate'],
  'openapi-generator': ['generate'],
  protobuf: ['compile'],
  'license': ['format', 'check'],
};

/** Plugins the lifecycle tasks already cover — their goals would only repeat them. */
const LIFECYCLE_PREFIXES = new Set([
  'compiler', 'surefire', 'failsafe', 'jar', 'resources', 'install', 'deploy', 'clean', 'site', 'war', 'source',
]);

/** Prefixes that do not follow the naming rule. */
const PREFIX_OVERRIDES: Record<string, string> = {
  'native-maven-plugin': 'native',
  'openapi-generator-maven-plugin': 'openapi-generator',
  'tomcat7-maven-plugin': 'tomcat7',
  'cargo-maven3-plugin': 'cargo',
  'cargo-maven2-plugin': 'cargo',
};

/** The command-line prefix of a plugin: `maven-xxx-plugin` and `xxx-maven-plugin` → `xxx`. */
export function mavenPrefix(artifactId: string): string | null {
  const override = PREFIX_OVERRIDES[artifactId];
  if (override) {
    return override;
  }
  const official = /^maven-(.+)-plugin$/.exec(artifactId);
  if (official) {
    return official[1];
  }
  const community = /^(.+)-maven-plugin$/.exec(artifactId);
  if (community) {
    return community[1];
  }
  return null;
}

/** An execution's id, when it is worth naming (`build@docker`); defaults are not. */
function executionSuffix(id: string | undefined): string {
  if (!id || id === 'default' || id.startsWith('default-')) {
    return '';
  }
  return `@${id}`;
}

function pluginInfo(plugin: Element): MavenPluginInfo | null {
  const artifactId = xmlText(plugin, 'artifactId');
  if (!artifactId) {
    return null;
  }
  const prefix = mavenPrefix(artifactId);
  const bound: string[] = [];
  for (const execution of Array.from(xmlChild(plugin, 'executions')?.children ?? [])) {
    if (execution.localName !== 'execution') {
      continue;
    }
    const suffix = executionSuffix(xmlText(execution, 'id'));
    for (const goal of Array.from(xmlChild(execution, 'goals')?.children ?? [])) {
      const name = goal.textContent?.trim();
      if (goal.localName === 'goal' && name) {
        bound.push(`${name}${suffix}`);
      }
    }
  }
  const known = prefix ? KNOWN_GOALS[prefix] ?? [] : [];
  const goals = [...new Set([...known, ...bound])];
  return { groupId: xmlText(plugin, 'groupId'), artifactId, prefix, goals };
}

/** The plugins under `<build><plugins>` with the goals to offer. */
export function parseMavenPlugins(pom: string): MavenPluginInfo[] {
  const root = parseXml(pom);
  const plugins = xmlChild(xmlChild(root, 'build'), 'plugins');
  return Array.from(plugins?.children ?? [])
    .filter((child) => child.localName === 'plugin')
    .map(pluginInfo)
    .filter((info): info is MavenPluginInfo => info !== null)
    .filter((info) => !info.prefix || !LIFECYCLE_PREFIXES.has(info.prefix))
    .filter((info) => info.goals.length > 0);
}

/** The profiles a pom declares. */
export function parseMavenProfiles(pom: string): MavenProfileInfo[] {
  const root = parseXml(pom);
  return Array.from(xmlChild(root, 'profiles')?.children ?? [])
    .filter((child) => child.localName === 'profile')
    .map((profile) => ({
      id: xmlText(profile, 'id') ?? '',
      activeByDefault: xmlText(xmlChild(profile, 'activation'), 'activeByDefault') === 'true',
    }))
    .filter((profile) => profile.id);
}

/** How a goal is typed: `prefix:goal`, or `groupId:artifactId:goal` for plugins without a prefix. */
export function mavenGoal(plugin: MavenPluginInfo, goal: string): string {
  if (plugin.prefix) {
    return `${plugin.prefix}:${goal}`;
  }
  return `${plugin.groupId ?? 'org.apache.maven.plugins'}:${plugin.artifactId}:${goal}`;
}
