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
 * Tests the seam between the app and its add-ons:
 *
 *   • the app's own code (core, state, lib, components, electron) imports
 *     nothing from `src/addons` — add-ons come in through the registry;
 *   • the registry's defaults, formatters and checkers behave;
 *   • the `after` formatter of the POM, the formatting settings a language
 *     states for itself, the diff that applies a formatter's result.
 */

import fs from 'node:fs';
import path from 'node:path';
import '@/addons/register';
import { registry } from '@/core/registry';
import { runAfterFormatters } from '@/core/format/providers';
import { formatFor, formatOptionsOf } from '@/core/format-settings';
import { diffHunks } from '@/lib/editor/text-diff';
import { ALL_ADDONS } from '@/addons';
import type { Addon } from '@/core/types';

let failures = 0;
let passed = 0;

function check(name: string, condition: boolean, detail?: unknown) {
  if (condition) {
    passed++;
    console.log(`✓ ${name}`);
    return;
  }
  failures++;
  console.log(`✗ ${name}`, detail ?? '');
}

/* ---- the app imports no add-on ---------------------------------------- */

// npm runs the scripts from the repository root.
const ROOT = process.cwd();
const APP_DIRS = ['src/core', 'src/state', 'src/lib', 'src/components', 'src/hooks', 'src/features', 'electron'];
const IMPORT_OF_ADDON = /\bfrom\s+['"](?:@\/addons|(?:\.\.\/)+addons)(?:\/[^'"]*)?['"]|\bimport\(\s*['"]@\/addons/;

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...sources(full));
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const leaks = APP_DIRS.flatMap((dir) => sources(path.join(ROOT, dir)))
  .filter((file) => IMPORT_OF_ADDON.test(fs.readFileSync(file, 'utf8')))
  .map((file) => path.relative(ROOT, file));
check('the app imports nothing from src/addons', leaks.length === 0, leaks);

/* ---- registry defaults ------------------------------------------------- */

registry.applyEnabled([]);
check('the default theme comes from the add-on that ships it', registry.defaultThemeId() === 'lumen-dark', registry.defaultThemeId());
check('the default theme resolves to a theme', registry.defaultTheme()?.id === 'lumen-dark');
check('the default icon pack comes from the add-on that ships it', registry.defaultIconPackId() === 'lumen-icons', registry.defaultIconPackId());
check('nothing is on by default beyond the built-ins', registry.defaultEnabledIds().length === 0);

const second: Addon = {
  id: 'test.theme', name: 'Test', version: '1.0.0', category: 'theme',
  themes: [{ ...registry.themes()[0], id: 'test-theme', name: 'Test theme' }],
  defaults: { theme: 'test-theme', enabled: true },
};
registry.register(second);
check('an add-on marked enabled is on from the first start', registry.defaultEnabledIds().includes('test.theme'));
registry.applyEnabled(['test.theme']);
check('the add-on that ships with the app keeps the default', registry.defaultThemeId() === 'lumen-dark', registry.defaultThemeId());
check('a theme from another add-on is offered', registry.themes().some((theme) => theme.id === 'test-theme'));
registry.applyEnabled([]);
check('the theme goes with its add-on', !registry.themes().some((theme) => theme.id === 'test-theme'));

/* ---- an add-on that needs a newer Lumen stays off ------------------------ */

{
  let tooNew = true;
  registry.register({ id: 'test.guarded', name: 'Guarded', version: '1.0.0', category: 'theme', themes: [{ ...registry.themes()[0], id: 'guarded-theme', name: 'Guarded' }] });
  registry.setActivationGuard((id) => (id === 'test.guarded' && tooNew ? 'needs a newer Lumen' : null));
  check('a blocked add-on reports its reason', registry.blockedReason('test.guarded') === 'needs a newer Lumen');
  check('a blocked add-on does not switch on', !registry.activate('test.guarded') && !registry.isActive('test.guarded'));
  registry.applyEnabled(['test.guarded']);
  check('an enabled but blocked add-on stays off at startup', !registry.isActive('test.guarded') && !registry.themes().some((theme) => theme.id === 'guarded-theme'));
  tooNew = false;
  check('the same add-on switches on once it fits', registry.activate('test.guarded') && registry.themes().some((theme) => theme.id === 'guarded-theme'));
  tooNew = true;
  check('enforcing switches a running add-on off', registry.enforceGuard() && !registry.isActive('test.guarded') && !registry.themes().some((theme) => theme.id === 'guarded-theme'));
  check('other add-ons are not affected', registry.blockedReason('test.theme') === null && registry.blockedReason('no.such.addon') === null);
  registry.setActivationGuard(null);
  registry.applyEnabled([]);
}

/* ---- SDKs follow the programming languages ------------------------------ */

{
  const { TOOLS, toolsForLanguages } = await import('@/core/sdk/tools');
  const ids = (languages: string[]) => toolsForLanguages(new Set(languages)).map((tool) => tool.id).sort().join(',');
  check('JavaScript brings its runtimes', ids(['javascript']) === 'bun,deno,node', ids(['javascript']));
  check('a language of an add-on brings its SDK', ids(['python']) === 'python' && ids(['go']) === 'go' && ids(['csharp']) === 'dotnet');
  check('one language can bring several SDKs', ids(['java', 'kotlin']) === 'gradle,kotlin,maven', ids(['java', 'kotlin']));
  check('Novus is brought by both of its languages', ids(['novus']) === 'novus' && ids(['novus-html']) === 'novus', ids(['novus']));
  check('no language, no SDK', ids([]) === '' && ids(['markdown']) === '');
  check('every SDK names a language', TOOLS.every((tool) => tool.languages.length > 0));
}

/* ---- a program runs in the folder of its own project --------------------- */

{
  const { markerDir } = await import('@/lib/project/marker-dir');
  const files = new Set(['/w/project.nv', '/w/website/project.nv', '/w/tools/readme.md']);
  const exists = async (path: string) => files.has(path);
  const at = (file: string) => markerDir(file, ['project.nv'], '/w', exists);
  check('a file in a sub-project runs in that project', await at('/w/website/main.nv') === '/w/website');
  check('a deeper file finds the project above it', await at('/w/website/pages/a/x.nv') === '/w/website');
  check('a file of the root project runs in the root', await at('/w/main.nv') === '/w');
  check('a folder without its own manifest falls back to the project above', await at('/w/tools/x.nv') === '/w');
  check('nothing is searched above the workspace', await markerDir('/w/a.nv', ['missing.nv'], '/w', exists) === null);
  check('a trailing slash on the workspace is fine', await markerDir('/w/website/main.nv', ['project.nv'], '/w/', exists) === '/w/website');
}

/* ---- formatters and checkers -------------------------------------------- */

const calls: string[] = [];
const formatting: Addon = {
  id: 'test.formatting', name: 'Formatting', version: '1.0.0',
  formatters: [
    { id: 'low', priority: 1, supports: () => true, format: () => null },
    { id: 'high', priority: 5, supports: () => true, format: () => null },
    {
      id: 'polish', phase: 'after', supports: ({ languageId }) => languageId === 'plain',
      format: ({ text }) => { calls.push('polish'); return { text: `${text}!` }; },
    },
  ],
  checkers: [{ id: 'c', supports: () => true, check: () => [] }],
};
registry.register(formatting);
registry.applyEnabled(['test.formatting']);
const mine = () => registry.formatters().map((f) => f.id).filter((id) => ['high', 'low', 'polish'].includes(id)).join();
check('formatters of active add-ons come highest priority first', mine() === 'high,low,polish', mine());
check('checkers of active add-ons are listed', registry.checkers().length === 1);
const base = { path: '/x.txt', languageId: 'plain', text: 'a', options: formatOptionsOf(formatFor({}, null)), workspace: null };
check('an after formatter polishes the text', (await runAfterFormatters(base)) === 'a!');
check('an after formatter only runs for files it supports', (await runAfterFormatters({ ...base, languageId: 'other' })) === 'a');
registry.applyEnabled([]);
check('formatters of inactive add-ons are not asked', registry.formatters().every((f) => f.id !== 'high'));

/* ---- the POM keeps its blank lines ------------------------------------- */

const pom = '<project xmlns="http://maven.apache.org/POM/4.0.0">\n  <modelVersion>4.0.0</modelVersion>\n  <dependencies>\n    <dependency/>\n  </dependencies>\n  <build>\n    <plugins/>\n  </build>\n</project>\n';
registry.applyEnabled([]);
const spaced = await runAfterFormatters({ ...base, path: '/p/pom.xml', languageId: 'xml', text: pom });
check('the POM formatter separates the blocks', spaced !== pom && spaced.includes('</dependencies>\n\n  <build>'), spaced);
check('the POM formatter leaves a selection alone', (await runAfterFormatters({ ...base, path: '/p/pom.xml', languageId: 'xml', text: pom, range: { from: 0, to: 4 } })) === pom);
check('the POM formatter ignores other XML', (await runAfterFormatters({ ...base, path: '/p/a.xml', languageId: 'xml', text: '<a><b/>\n<c>\n</c></a>' })) === '<a><b/>\n<c>\n</c></a>');

/* ---- what a language says about itself -------------------------------- */

const java = ALL_ADDONS.flatMap((addon) => addon.languages ?? []).find((language) => language.id === 'java');
check('Java states its own tab width', formatFor({}, java).tabWidth === 4);
check('the user overrides what the language states', formatFor({ java: { tabWidth: 8 } }, java).tabWidth === 8);
check('an unknown language gets the plain defaults', formatFor({}, undefined).tabWidth === 2 && !formatFor({}, undefined).useTabs);
check('a language can ask for tabs', formatFor({}, { id: 'go', format: { useTabs: true } }).useTabs === true);

/* ---- the diff that applies a formatter's result ------------------------ */

function apply(text: string, hunks: ReturnType<typeof diffHunks>) {
  return [...hunks].reverse().reduce((out, h) => out.slice(0, h.from) + h.insert + out.slice(h.to), text);
}
const samples: [string, string][] = [
  ['a\nb\nc\n', 'a\nB\nc\n'], ['', 'x\n'], ['x\n', ''], ['a', 'a'], ['a\nb', 'a\nb\n'],
  ['if (a) return;\nfoo();\n', 'if (a) {\n    return;\n}\nfoo();\n'], ['  x \n\n\n y\n', 'x\n\ny\n'],
];
check('the diff turns every sample into its target', samples.every(([a, b]) => apply(a, diffHunks(a, b)) === b));
check('untouched lines produce no hunk', diffHunks('a\nb\nc\n', 'a\nB\nc\n').length === 1);
const words = ['a', 'b', 'c', 'd', '', 'e'];
let fuzzOk = true;
for (let n = 0; n < 1500 && fuzzOk; n++) {
  const make = () => Array.from({ length: Math.floor(Math.random() * 9) }, () => words[Math.floor(Math.random() * words.length)]).join('\n') + (Math.random() < 0.5 ? '\n' : '');
  const a = make();
  const b = make();
  fuzzOk = apply(a, diffHunks(a, b)) === b;
}
check('the diff survives random texts', fuzzOk);

console.log(`\n${passed} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
