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
 * Scanning a published extension manifest.
 *
 * What a manifest can do is spread over several places, and each is read for
 * what it can do there:
 *   • `code.main` / `code.renderer` — program code. The extension rules read the
 *     code itself (comments blanked); the command rules read only its string
 *     literals, because `rm -rf /` as an identifier or a comment is nothing.
 *   • `pages` — only HTML pages can run anything; Markdown is skipped.
 *   • `settings`, `commands` and the add-on's node graphs — data that the app
 *     may hand to a shell, so every string is read as a possible command.
 * The readme is never scanned: it is documentation and is allowed to say what
 * the extension protects against.
 */

import { RULES } from './rules/index.js';
import {
  ruleSetsFor, countRules, scanCommandText, scanLinesAndText,
} from './engine.js';
import { buildReport, findingFromHit } from './report.js';
import { lexJs } from './strings.js';

/** Program code may be larger than ordinary text: a bundled extension is a few megabytes. */
const MAX_CODE = 4 * 1024 * 1024;
const MAX_WALK_DEPTH = 8;
const MAX_STRINGS = 5000;
const MIN_STRING = 4;
const MAX_STRING = 4000;
/** Parts of the add-on that are content, not commands: grammar tables, colours, snippets. */
const SKIPPED_ADDON_KEYS = new Set(['languages', 'themes', 'snippets']);
/** Anything a command might run is at least this serious in an extension's data. */
const DATA_MINIMUM = 'high';
const MAX_LITERAL_COMMAND = 4000;
const MIN_LITERAL = 6;

const TARGET = 'extension';

/** Collects findings and the work done, so that every part of the manifest reports the same way. */
function createCollector(extraRules) {
  const findings = [];
  const state = { scanned: 0, rules: RULES.length + (extraRules?.length ?? 0), truncated: false };
  const add = (hits, file) => {
    for (const hit of hits) {
      findings.push(findingFromHit(hit, TARGET, file));
    }
  };
  return { findings, state, add };
}

/** The lines of program code (comments blanked) through the extension rules, its strings through the command rules. */
function scanCode(code, file, extraRules, collector) {
  const body = code.slice(0, MAX_CODE);
  if (code.length > MAX_CODE) {
    collector.state.truncated = true;
  }
  const lexed = lexJs(body);
  const hits = [];
  const codeSets = ruleSetsFor({ target: TARGET, kinds: ['js'] }, extraRules);
  const ctx = { file, kind: 'js', target: TARGET, ruleTarget: TARGET };
  collector.state.scanned += scanLinesAndText(lexed.code, codeSets, ctx, hits);

  // Markers such as EICAR are looked for in comments too: a test file hides nothing in a comment.
  if (body.includes('EICAR-STANDARD')) {
    const markerSets = codeSets.map((set) => ({ ...set, line: set.line.filter((rule) => rule.category === 'malware'), text: [] }));
    scanLinesAndText(body, markerSets, ctx, hits);
  }
  collector.add(hits, file);

  const commandSets = ruleSetsFor({ target: 'command', kinds: ['shell'], pipeline: true, force: true }, extraRules);
  const literalHits = [];
  for (const literal of lexed.literals) {
    if (literal.text.length < MIN_LITERAL || literal.text.length > MAX_LITERAL_COMMAND) {
      continue;
    }
    scanCommandText(literal.text, commandSets, {
      file, kind: 'shell', target: TARGET, ruleTarget: 'command', lineOffset: literal.line - 1, minSeverity: DATA_MINIMUM,
    }, literalHits);
  }
  collector.add(literalHits, file);
}

function scanPage(page, index, extraRules, collector) {
  if (!page || typeof page.content !== 'string') {
    return;
  }
  const file = `page:${page.id ?? index}`;
  const kind = page.format === 'html' ? 'html' : 'markdown';
  const sets = ruleSetsFor({ target: TARGET, kinds: [kind] }, extraRules);
  const hits = [];
  collector.state.scanned += scanLinesAndText(page.content.slice(0, MAX_CODE), sets, { file, kind, target: TARGET, ruleTarget: TARGET }, hits);
  collector.add(hits, file);
}

/** Every string of a value with the path that leads to it, bounded in depth and number. */
function* walkStrings(value, path, depth, budget) {
  if (budget.left <= 0 || depth > MAX_WALK_DEPTH) {
    return;
  }
  if (typeof value === 'string') {
    budget.left--;
    yield { text: value, path };
    return;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      yield* walkStrings(value[i], `${path}[${i}]`, depth + 1, budget);
    }
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      yield* walkStrings(child, `${path}.${key}`, depth + 1, budget);
    }
  }
}

/** Strings that may reach a shell: through the command rules, and the address rules that apply to data. */
function scanStrings(strings, extraRules, collector) {
  const commandSets = ruleSetsFor({ target: 'command', kinds: ['shell'], pipeline: true, force: true }, extraRules);
  const dataSets = ruleSetsFor({ target: TARGET, kinds: ['data'] }, extraRules);
  for (const { text, path } of strings) {
    if (text.length < MIN_STRING || text.length > MAX_STRING) {
      continue;
    }
    collector.state.scanned++;
    const hits = [];
    const ctx = { file: path, kind: 'shell', target: TARGET, ruleTarget: 'command', minSeverity: DATA_MINIMUM };
    scanCommandText(text, commandSets, ctx, hits);
    scanLinesAndText(text, dataSets, { ...ctx, kind: 'data', ruleTarget: TARGET }, hits);
    collector.add(hits, path);
  }
}

/** The add-on graph without the grammar and theme tables, and without template file contents. */
function addonStrings(addon, budget) {
  const strings = [];
  for (const [key, value] of Object.entries(addon ?? {})) {
    if (SKIPPED_ADDON_KEYS.has(key)) {
      continue;
    }
    if (key === 'templates' && Array.isArray(value)) {
      value.forEach((template, index) => {
        const { files: _files, ...rest } = template ?? {};
        strings.push(...walkStrings(rest, `addon.templates[${index}]`, 1, budget));
      });
      continue;
    }
    strings.push(...walkStrings(value, `addon.${key}`, 1, budget));
  }
  return strings;
}

function settingStrings(settings, budget) {
  const strings = [];
  (Array.isArray(settings) ? settings : []).forEach((setting, index) => {
    strings.push(...walkStrings(setting?.default, `settings[${index}].default`, 1, budget));
  });
  return strings;
}

/**
 * Scan an extension manifest as it is published.
 * @param {unknown} manifest
 * @param {{ extraRules?: object[] }} [options]
 */
export function scanManifest(manifest, options = {}) {
  const collector = createCollector(options.extraRules);
  if (!manifest || typeof manifest !== 'object') {
    return buildReport([], collector.state);
  }
  for (const key of ['main', 'renderer']) {
    const code = manifest.code?.[key];
    if (typeof code === 'string') {
      scanCode(code, `code.${key}`, options.extraRules, collector);
    }
  }
  (Array.isArray(manifest.pages) ? manifest.pages : []).forEach((page, index) => scanPage(page, index, options.extraRules, collector));

  const budget = { left: MAX_STRINGS };
  scanStrings(settingStrings(manifest.settings, budget), options.extraRules, collector);
  scanStrings([...walkStrings(manifest.commands, 'commands', 0, budget)], options.extraRules, collector);
  scanStrings(addonStrings(manifest.addon, budget), options.extraRules, collector);

  if (budget.left <= 0) {
    collector.state.truncated = true;
  }
  return buildReport(collector.findings, collector.state);
}

/** The number of rules that apply to extensions, for callers that want to show it. */
export function extensionRuleCount(extraRules) {
  return countRules(ruleSetsFor({ target: TARGET, kinds: ['js', 'html', 'data'] }, extraRules));
}
