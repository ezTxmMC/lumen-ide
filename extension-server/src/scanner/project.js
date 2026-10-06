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
 * Scanning a project folder that somebody is about to open.
 *
 * The application reads the files named by `PROJECT_SCAN` and hands them over;
 * this module decides what each one is. Files that *start* things — install
 * scripts, tasks that run when the folder opens, dev container commands — are
 * read for what they run, not as text, so a README that merely mentions `curl`
 * never matters.
 */

import { MAX_TEXT, ruleSetsFor, scanCommandText, scanLinesAndText } from './engine.js';
import { RULES_BY_ID } from './rules/index.js';
import { buildReport } from './report.js';
import { scanBody, toFindings } from './scan.js';
import { lineOf, parseJsonc } from './strings.js';

/** Project files the application should read, and how much of them. */
export const PROJECT_SCAN = Object.freeze({
  /** Files at the root of the project, read by exact name. */
  names: [
    'package.json', 'Makefile', 'makefile', 'GNUmakefile', 'justfile', 'setup.py', '.npmrc', 'Dockerfile', 'Jenkinsfile',
    '.vscode/tasks.json', '.devcontainer/devcontainer.json', '.devcontainer.json', '.gitlab-ci.yml', 'azure-pipelines.yml',
  ],
  /** Everything else, matched against the relative path with `/` as the separator. */
  globs: [
    /(^|\/)package\.json$/,
    /\.(?:sh|bash|zsh|command|ps1|psm1|bat|cmd)$/i,
    /\.mk$/i,
    /(^|\/)(?:\.husky|\.githooks)\/[^/]+$/,
    /(^|\/)hooks\/pre-[\w-]+$/,
    /(^|\/)\.github\/workflows\/[^/]+\.ya?ml$/,
    /(^|\/)\.devcontainer\/[^/]+\/devcontainer\.json$/,
    /(^|\/)Dockerfile[\w.-]*$/,
    /\.(?:exe|scr|com|pif|msi|dll|bat|cmd|vbs|vbe|jse|wsf|hta|lnk|jar)$/i,
  ],
  /** Larger files are skipped: a script that long is not a startup script. */
  maxFileBytes: 512 * 1024,
  maxFiles: 200,
  /** Never descended into: dependencies and build output are not the project's own. */
  ignoredDirs: ['node_modules', '.git', 'dist', 'build', 'out', 'target', 'vendor', '.venv', 'venv', '__pycache__', '.next', '.gradle', 'coverage', 'Pods', 'obj', 'release'],
  /** Reported by name only; the application passes `text: ''` for these. */
  executableExtensions: ['.exe', '.scr', '.com', '.pif', '.msi', '.dll', '.bat', '.cmd', '.vbs', '.vbe', '.jse', '.wsf', '.hta', '.lnk', '.jar'],
});

const LIFECYCLE_SCRIPTS = new Set(['preinstall', 'install', 'postinstall', 'prepare', 'prepublish']);
const DEVCONTAINER_COMMANDS = ['initializeCommand', 'onCreateCommand', 'updateContentCommand', 'postCreateCommand', 'postStartCommand', 'postAttachCommand'];

/** What a file is: structured files have a reader of their own, the rest are text of a kind. */
const FILE_TYPES = [
  [/(^|\/)package\.json$/, { structured: 'package' }],
  [/(^|\/)\.vscode\/tasks\.json$/, { structured: 'tasks' }],
  [/^\.devcontainer\.json$|(^|\/)\.devcontainer\/(?:[^/]+\/)?devcontainer\.json$/, { structured: 'devcontainer' }],
  [/(^|\/)setup\.py$/, { kinds: ['python', 'setup-py'] }],
  [/(^|\/)\.npmrc$/, { kinds: ['npmrc'] }],
  [/(^|\/)(?:\.husky|\.githooks)\/[^/]+$|(^|\/)hooks\/pre-[\w-]+$/, { kinds: ['shell', 'shell-hook'] }],
  [/\.(?:ps1|psm1)$/i, { kinds: ['powershell'] }],
  [/\.(?:bat|cmd)$/i, { kinds: ['batch'] }],
  [/(^|\/)(?:Makefile|makefile|GNUmakefile|Dockerfile[\w.-]*|Jenkinsfile|justfile)$|\.(?:mk|sh|bash|zsh|command)$/, { kinds: ['shell'] }],
  [/(^|\/)\.github\/workflows\/[^/]+\.ya?ml$|(^|\/)(?:\.gitlab-ci|azure-pipelines)\.ya?ml$/, { kinds: ['shell'] }],
];

/** `a\b/./c` → `a/b/c`. */
function normalizePath(path) {
  return path.replace(/\\/g, '/').replace(/^(?:\.\/)+/, '');
}

function isIgnored(path) {
  const segments = path.split('/');
  segments.pop();
  return segments.some((segment) => PROJECT_SCAN.ignoredDirs.includes(segment));
}

function extensionOf(path) {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  if (dot <= 0) {
    return '';
  }
  return name.slice(dot).toLowerCase();
}

/** Does the project scan read this file? Lets the application filter before it reads anything. */
export function isProjectFile(path) {
  const normalized = normalizePath(path);
  if (isIgnored(normalized)) {
    return false;
  }
  return PROJECT_SCAN.names.includes(normalized) || PROJECT_SCAN.globs.some((glob) => glob.test(normalized));
}

function classify(path) {
  for (const [pattern, type] of FILE_TYPES) {
    if (pattern.test(path)) {
      return type;
    }
  }
  return undefined;
}

/** A hit that is raised by the structured readers themselves. */
function structuredHit(ruleId, severity, line, excerpt) {
  return { rule: RULES_BY_ID.get(ruleId), severity, line, column: 1, excerpt: excerpt.slice(0, 160), matched: excerpt };
}

/** The strings of a value that stands for a command: text, a list of words, or an object of those. */
function commandTexts(value) {
  if (typeof value === 'string') {
    return [value];
  }
  if (Array.isArray(value)) {
    if (value.every((entry) => typeof entry === 'string')) {
      return [value.join(' ')];
    }
    return value.flatMap(commandTexts);
  }
  if (value && typeof value === 'object') {
    return Object.values(value).flatMap(commandTexts);
  }
  return [];
}

function taskCommandLines(task) {
  const lines = [];
  for (const variant of [task, task?.windows, task?.linux, task?.osx]) {
    if (!variant || typeof variant.command !== 'string') {
      continue;
    }
    const args = Array.isArray(variant.args) ? variant.args.map((arg) => (typeof arg === 'string' ? arg : arg?.value ?? '')) : [];
    lines.push([variant.command, ...args].join(' '));
  }
  return lines;
}

/** Run the command rules over a command that a project file will run. */
function scanProjectCommand(command, { file, line, ctx, extraRules }) {
  const sets = ruleSetsFor({ target: 'project', kinds: ['shell'], pipeline: true }, extraRules);
  const hits = [];
  scanCommandText(command, sets, { ...ctx, file, kind: 'shell', lineOffset: line - 1 }, hits);
  return hits;
}

function scanPackageJson(text, file, ctx, extraRules) {
  const data = parseJsonc(text);
  const hits = [];
  if (!data || typeof data.scripts !== 'object' || data.scripts === null) {
    return hits;
  }
  const scriptSets = ruleSetsFor({ target: 'project', kinds: ['package-script'] }, extraRules);
  for (const [name, value] of Object.entries(data.scripts)) {
    if (typeof value !== 'string') {
      continue;
    }
    const line = lineOf(text, `"${name}"`);
    hits.push(...scanProjectCommand(value, { file, line, ctx, extraRules }));
    if (LIFECYCLE_SCRIPTS.has(name)) {
      scanLinesAndText(value, scriptSets, { ...ctx, file, lineOffset: line - 1 }, hits);
    }
  }
  return hits;
}

function scanTasks(text, file, ctx, extraRules) {
  const data = parseJsonc(text);
  const hits = [];
  if (!data || !Array.isArray(data.tasks)) {
    return hits;
  }
  for (const task of data.tasks) {
    if (!task || typeof task !== 'object') {
      continue;
    }
    const label = typeof task.label === 'string' ? task.label : '';
    const line = lineOf(text, label ? JSON.stringify(label) : '"command"');
    const taskHits = taskCommandLines(task).flatMap((command) => scanProjectCommand(command, { file, line, ctx, extraRules }));
    hits.push(...taskHits);
    if (task.runOptions?.runOn !== 'folderOpen') {
      continue;
    }
    let severity = 'medium';
    if (taskHits.length) {
      severity = 'critical';
    }
    hits.push(structuredHit('SEC-PRJ-001', severity, lineOf(text, 'folderOpen'), `${label || 'task'} runs on folder open: ${taskCommandLines(task)[0] ?? ''}`));
  }
  return hits;
}

function scanDevContainer(text, file, ctx, extraRules) {
  const data = parseJsonc(text);
  const hits = [];
  if (!data || typeof data !== 'object') {
    return hits;
  }
  const rule = RULES_BY_ID.get('SEC-PRJ-002');
  for (const key of DEVCONTAINER_COMMANDS) {
    const line = lineOf(text, `"${key}"`);
    for (const command of commandTexts(data[key])) {
      hits.push(...scanProjectCommand(command, { file, line, ctx, extraRules }));
      if (!rule.pattern.test(command)) {
        continue;
      }
      // `initializeCommand` runs on the host, outside the container.
      let severity = rule.severity;
      if (key === 'initializeCommand') {
        severity = 'high';
      }
      hits.push(structuredHit('SEC-PRJ-002', severity, line, `${key}: ${command}`));
    }
  }
  return hits;
}

const STRUCTURED = { package: scanPackageJson, tasks: scanTasks, devcontainer: scanDevContainer };

/**
 * Scan files of a project: `{ path, text, size? }`, `path` relative to the project root.
 * Files the scanner has no interest in are ignored, so the caller can pass whatever it read.
 */
export function scanProjectFiles(files, options = {}) {
  const findings = [];
  const list = Array.isArray(files) ? files : [];
  const truncated = list.length > PROJECT_SCAN.maxFiles;
  let scanned = 0;
  let rules = 0;
  for (const entry of list.slice(0, PROJECT_SCAN.maxFiles)) {
    if (!entry || typeof entry.path !== 'string') {
      continue;
    }
    const path = normalizePath(entry.path);
    if (isIgnored(path)) {
      continue;
    }
    const ctx = { target: 'project', ruleTarget: 'project' };
    if (PROJECT_SCAN.executableExtensions.includes(extensionOf(path))) {
      const run = scanBody(path, { file: path, kinds: ['path'], target: 'project', extraRules: options.extraRules });
      findings.push(...toFindings(run.hits.map((hit) => ({ ...hit, excerpt: path.slice(-160) })), 'project', path));
    }
    const type = classify(path);
    const text = typeof entry.text === 'string' ? entry.text : '';
    const size = entry.size ?? text.length;
    if (!type || !text || size > PROJECT_SCAN.maxFileBytes) {
      continue;
    }
    scanned++;
    const body = text.slice(0, MAX_TEXT);
    const kinds = type.kinds ?? ['json'];
    const run = scanBody(body, { file: path, kinds, target: 'project', extraRules: options.extraRules });
    rules = Math.max(rules, run.rules);
    const structured = STRUCTURED[type.structured];
    const hits = structured ? [...run.hits, ...structured(body, path, ctx, options.extraRules)] : run.hits;
    findings.push(...toFindings(hits, 'project', path));
  }
  return buildReport(findings, { scanned, rules, truncated });
}
