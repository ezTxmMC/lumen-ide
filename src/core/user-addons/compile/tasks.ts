/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import type { ProjectContext, ProjectTask } from '@/core/types';
import { tr } from '@/i18n';
import type { UserKindTask, UserProjectKind } from '../schema';

export async function ruleHolds(ctx: ProjectContext, rule: { file: string; pattern?: string; }): Promise<boolean> {
  const text = await ctx.readFile(rule.file);
  if (text === null) {
    return false;
  }
  if (!rule.pattern) {
    return true;
  }
  const regex = safeRegex(rule.pattern, 'm');
  return Boolean(regex?.test(text));
}

export function safeRegex(source: string, flags = ''): RegExp | null {
  try {
    return new RegExp(source, flags);
  } catch {
    return null;
  }
}

async function taskCommand(ctx: ProjectContext, command: string, wrapper: string | undefined): Promise<string> {
  if (!wrapper) {
    return command;
  }
  const name = ctx.platform === 'win32' ? `${wrapper}.bat` : wrapper;
  if (!(await ctx.exists(name))) {
    return command;
  }
  if (ctx.platform === 'win32') {
    return name;
  }
  return `./${name}`;
}

/** Extra arguments, chosen by the first of these files the project has. */
async function extraArgs(ctx: ProjectContext, task: UserKindTask): Promise<string[]> {
  for (const rule of task.argsWhenFile ?? []) {
    const files = Array.isArray(rule.file) ? rule.file : [rule.file];
    for (const file of files) {
      if (await ctx.exists(file).catch(() => false)) {
        return rule.args;
      }
    }
  }
  return [];
}

/** Does the task disappear when its pattern yields nothing? */
function omitsWhenEmpty(task: UserKindTask): boolean {
  return Boolean(task.forEachDir?.omitWhenEmpty || task.forEachMatch?.omitWhenEmpty);
}

/** Pull a fact out of the file — through a JSON path or a pattern. */
export function factValue(text: string, fact: { pattern?: string; json?: string; section?: string; }): string | undefined {
  if (fact.json !== undefined) {
    const node = jsonAt(text, fact.json);
    if (node === null || typeof node === 'object') {
      return undefined;
    }
    return String(node).trim() || undefined;
  }
  if (!fact.pattern?.trim()) {
    return undefined;
  }
  const haystack = fact.section ? section(text, fact.section) : text;
  if (!haystack) {
    return undefined;
  }
  return safeRegex(fact.pattern, 'm')?.exec(haystack)?.[1]?.trim() || undefined;
}

/** Value under a dotted path in a JSON text — `null` when anything is missing. */
export function jsonAt(text: string, path: string): unknown {
  let node: unknown;
  try {
    node = JSON.parse(text);
  } catch {
    return null;
  }
  for (const step of path.split('.').filter(Boolean)) {
    if (!node || typeof node !== 'object') {
      return null;
    }
    node = (node as Record<string, unknown>)[step];
  }
  return node ?? null;
}

/**
 * A section of a TOML/INI file — from its heading to the next one.
 *
 * Same rule as `core/project/detect.ts`; repeated here because `compile` has
 * to run without the rest of the application, as the check scripts do.
 */
export function section(text: string, name: string): string {
  const escaped = name.replace(/[.[\]\\]/g, '\\$&');
  const head = new RegExp(`^\\[${escaped}\\]\\s*$`, 'm').exec(text);
  if (!head) {
    return '';
  }
  const rest = text.slice(head.index + head[0].length);
  const next = /^\[/m.exec(rest);
  return next ? rest.slice(0, next.index) : rest;
}

/**
 * An indented block under a heading — `targets:` in a `shard.yml`.
 *
 * Starts with the line after the heading and ends as soon as a line sits at
 * the left margin again.
 */
export function block(text: string, name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped}:\\s*\\n((?:[ \\t]+.*\\n?)*)`, 'm').exec(text)?.[1] ?? '';
}

/**
 * Unfold one task per subfolder.
 *
 * An empty list means there is nothing to unfold — the caller then uses the
 * task carrying `forEachDir` as the fallback.
 */
async function expandPerDir(
  ctx: ProjectContext, task: UserKindTask,
): Promise<ExpandedTask[]> {
  const spec = task.forEachDir;
  if (!spec?.dir.trim()) {
    return [];
  }
  const entries = await ctx.list(spec.dir).catch(() => []);
  const dirs = entries.filter((entry) => entry.isDirectory).map((entry) => entry.name);
  if (!dirs.length) {
    return [];
  }
  return dirs.slice(0, spec.limit ?? 4).map((dir) => ({
    dir,
    // `tr` with parameters: the label may be a translation key
    // (`templates.tasks.runTarget`), which then knows `{target}`.
    label: tr(spec.label, { target: dir, dir }),
    args: spec.args.map((arg) => arg.replaceAll('{dir}', dir)),
  }));
}

type ExpandedTask = { dir: string; label: string; args: string[]; group?: ProjectTask['group']; };

type MatchSpec = NonNullable<UserKindTask['forEachMatch']>;

/** The text of the first of the files that can be read. */
async function readFirst(ctx: ProjectContext, files: string[]): Promise<string | null> {
  for (const file of files) {
    const text = await ctx.readFile(file).catch(() => null);
    if (text !== null) {
      return text;
    }
  }
  return null;
}

/** Matches from a JSON path — a list of objects (CMake presets) or a plain object (scripts). */
function jsonMatches(spec: MatchSpec, text: string): { found: string[]; labels: Map<string, string>; } | null {
  const found: string[] = [];
  /** Label per match, when the JSON carries a field of its own for it. */
  const labels = new Map<string, string>();
  const node = jsonAt(text, spec.json!);
  if (!node || typeof node !== 'object') {
    return null;
  }
  if (!Array.isArray(node)) {
    found.push(...Object.keys(node as Record<string, unknown>));
    return { found, labels };
  }
  for (const entry of node) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const row = entry as Record<string, unknown>;
    if (spec.jsonSkipWhen && row[spec.jsonSkipWhen]) {
      continue;
    }
    const name = String(row[spec.jsonName ?? 'name'] ?? '');
    if (!name) {
      continue;
    }
    found.push(name);
    const label = spec.jsonLabel ? row[spec.jsonLabel] : undefined;
    if (typeof label === 'string' && label) {
      labels.set(name, label);
    }
  }
  return { found, labels };
}

/** The whole text, or just the named block or section of it. */
export function scopedText(text: string, blockName: string | undefined, sectionName: string | undefined): string {
  if (blockName) {
    return block(text, blockName);
  }
  if (sectionName) {
    return section(text, sectionName);
  }
  return text;
}

/** Matches of a pattern over the text, or over a block or section of it. */
function patternMatches(spec: MatchSpec, text: string): string[] | null {
  const haystack = scopedText(text, spec.block, spec.section);
  if (!haystack) {
    return null;
  }
  const pattern = safeRegex(spec.pattern ?? '', 'gm');
  if (!pattern) {
    return null;
  }
  const found: string[] = [];
  for (const hit of haystack.matchAll(pattern)) {
    found.push(hit[1] ?? '');
  }
  return found;
}

/**
 * Unfold one task per match in a file.
 *
 * An empty list means the same as for `expandPerDir`: nothing to unfold, so
 * the task itself applies.
 */
async function expandPerMatch(ctx: ProjectContext, task: UserKindTask): Promise<ExpandedTask[]> {
  const spec = task.forEachMatch;
  const files = (Array.isArray(spec?.file) ? spec.file : [spec?.file]).filter((file): file is string => Boolean(file?.trim()));
  // Either a pattern or a JSON path — with neither there is nothing to do.
  if (!spec || !files.length) {
    return [];
  }
  if (spec.json === undefined && !spec.pattern?.trim()) {
    return [];
  }
  const text = await readFirst(ctx, files);
  if (text === null) {
    return [];
  }

  // Two routes to the matches: keys from a JSON path, or a pattern over the
  // text. The JSON knows its own nesting; the pattern does not.
  let found: string[] = [];
  let labels = new Map<string, string>();
  if (spec.json !== undefined) {
    const viaJson = jsonMatches(spec, text);
    if (!viaJson) {
      return [];
    }
    ({ found, labels } = viaJson);
  }
  if (spec.json === undefined) {
    const viaPattern = patternMatches(spec, text);
    if (!viaPattern) {
      return [];
    }
    found = viaPattern;
  }
  return unfoldMatches(spec, found, labels);
}

/** One expanded task per distinct, non-skipped match, up to the limit. */
function unfoldMatches(spec: MatchSpec, found: string[], labels: Map<string, string>): ExpandedTask[] {
  const skip = new Set(spec.skip ?? []);
  const skipPattern = spec.skipPattern ? safeRegex(spec.skipPattern) : null;
  const seen = new Set<string>();
  const groupOf = (match: string): ProjectTask['group'] | undefined => {
    for (const rule of spec.groups ?? []) {
      if (safeRegex(rule.pattern)?.test(match)) {
        return rule.group;
      }
    }
    return undefined;
  };
  const out: ExpandedTask[] = [];
  for (const raw of found) {
    const match = raw.trim();
    if (!match || skip.has(match) || seen.has(match)) {
      continue;
    }
    if (skipPattern?.test(match)) {
      continue;
    }
    seen.add(match);
    out.push({
      dir: match,
      label: tr(found.length === 1 && spec.singleLabel ? spec.singleLabel : spec.label, {
        target: labels.get(match) ?? match,
        match: labels.get(match) ?? match,
      }),
      args: spec.args.map((arg) => arg.replaceAll('{match}', match)),
      group: groupOf(match),
    });
    if (out.length >= (spec.limit ?? 12)) {
      break;
    }
  }
  return out;
}

/** Turns a kind's task definitions into runnable tasks — unfolding, dropping out or pulling in replacements. */
export async function kindTasks(id: string, kind: UserProjectKind, ctx: ProjectContext): Promise<ProjectTask[]> {
  const out: ProjectTask[] = [];
  // Tasks can unfold, drop out or pull in replacements — hence a loop of
  // its own rather than a `map`.
  const emit = async (task: UserKindTask) => {
    const command = await taskCommand(ctx, task.command, task.wrapper);
    const extra = await extraArgs(ctx, task);
    const fill = (args: string[]) => args.flatMap((arg) => (arg === '{extraArgs}' ? extra : [arg]));
    const expanded: ExpandedTask[] = [...await expandPerDir(ctx, task), ...await expandPerMatch(ctx, task)];

    if (expanded.length) {
      for (const { dir, label, args, group } of expanded) {
        const filled = fill(args);
        out.push({
          id: `${id}:${task.id}:${dir}`,
          label,
          command,
          args: filled,
          group: group ?? task.group,
          then: task.then,
          detail: [task.command, ...filled].join(' '),
        });
      }
      return;
    }
    if (!omitsWhenEmpty(task)) {
      const filled = fill(task.args);
      out.push({
        id: `${id}:${task.id}`,
        label: task.label || task.id,
        command,
        args: filled,
        group: task.group,
        then: task.then,
        detail: task.detail || [task.command, ...filled].join(' '),
      });
    }
    for (const extraTask of task.alsoWhenEmpty ?? []) {
      await emit(extraTask);
    }
  };
  for (const task of kind.tasks) {
    await emit(task);
  }
  return out;
}
