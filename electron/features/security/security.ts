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
 * The security scanner in the main process.
 *
 * The rules and the matching live in `extension-server/src/scanner` — the same
 * module the extension server runs on publish — so what the server refuses and
 * what Lumen warns about never drift apart. This file adds what only the app
 * has: the files of an open project, the rules extensions bring along, and the
 * findings a user has acknowledged for a project.
 *
 * Three jobs:
 *   • commands   — before a task, a run, a pasted block or an extension's
 *                  `ctx.exec` starts something;
 *   • extensions — the manifest and its code before it is saved and started;
 *   • projects   — manifests, scripts and hooks of a folder that was just opened.
 */

import { ipcMain } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  PROJECT_SCAN, scanCommand, scanManifest, scanProjectFiles, toRule, verdictOf,
  type Finding, type Rule, type ScanReport,
} from '../../../extension-server/src/scanner/index.js';
import type { SecurityRuleSpec } from '../extension-host/contract';
import { projectDataDir } from '../documents/project-data';

const MAX_DEPTH = 4;
const MAX_VISITED = 20_000;
const ACKNOWLEDGED_FILE = 'security.json';
const MAX_ACKNOWLEDGED = 2000;

const rulePacks = new Map<string, Rule[]>();

const extraRules = () => [...rulePacks.values()].flat();

/** Rules an extension brings: plain data compiled here, never code. A bad rule is refused as a whole. */
export function addRulePack(owner: string, specs: SecurityRuleSpec[]) {
  if (!Array.isArray(specs) || specs.length > 64) {
    throw new Error('A rule pack holds at most 64 rules');
  }
  rulePacks.set(owner, specs.map((spec) => toRule(spec, owner)));
}

export function removeRulePack(owner: string) {
  rulePacks.delete(owner);
}

/**
 * Programs whose arguments are code or targets, not data: shells and
 * interpreters, destructive utilities, downloaders. For any other program
 * (`git commit -m "…"`, `tsc --noEmit`) the arguments are inert text, and
 * matching rules against a commit message would only block honest work.
 */
const PROGRAMS_THAT_RUN_ARGUMENTS = new Set([
  'rm', 'dd', 'shred', 'mkfs', 'chmod', 'chown', 'find', 'format', 'del', 'rd', 'rmdir', 'diskpart', 'cipher', 'vssadmin',
  'wbadmin', 'bcdedit', 'sudo', 'doas', 'su', 'env', 'nohup', 'xargs', 'eval', 'sh', 'bash', 'zsh', 'dash', 'fish', 'ksh',
  'csh', 'tcsh', 'cmd', 'powershell', 'pwsh', 'python', 'node', 'perl', 'ruby', 'php', 'curl', 'wget', 'nc', 'ncat', 'netcat',
  'socat', 'certutil', 'bitsadmin', 'mshta', 'regsvr32', 'rundll32', 'reg', 'schtasks', 'crontab', 'launchctl', 'iptables',
  'ufw', 'setenforce', 'docker', 'podman', 'kubectl', 'wscript', 'cscript',
]);

function programName(command: string): string {
  const base = command.split(/[\\/]/).pop() ?? command;
  return base.toLowerCase().replace(/\.(?:exe|cmd|bat|com)$/, '').replace(/(?<=^(?:python|pypy|mkfs))[\d.]*$/, '');
}

const runsArguments = (command: string) => {
  const name = programName(command);
  return PROGRAMS_THAT_RUN_ARGUMENTS.has(name) || name.startsWith('mkfs');
};

export function scanCommandLine(input: string | { command: string; args?: string[]; }): ScanReport {
  if (typeof input !== 'string' && !runsArguments(String(input?.command ?? ''))) {
    return scanCommand('', { extraRules: extraRules() });
  }
  return scanCommand(input, { extraRules: extraRules() });
}

export function scanExtensionManifest(manifest: unknown): ScanReport {
  return scanManifest(manifest, { extraRules: extraRules() });
}

/**
 * Whether extension code may start a program. Only the worst — a command that
 * wipes a disk, a download piped into a shell — is refused outright: extensions
 * legitimately run `git`, compilers and formatters, and each of them was
 * approved by the user together with the code.
 */
export function assertExecAllowed(command: string, args: string[]) {
  const report = scanCommandLine({ command, args });
  const critical = report.findings.filter((finding) => finding.severity === 'critical');
  if (!critical.length) {
    return;
  }
  const first = critical[0];
  throw new Error(`Blocked by Lumen's security scanner: ${first.title} (${first.id})`);
}

/* ------------------------------------------------------------------ *
 * Projects
 * ------------------------------------------------------------------ */

const matchesGlobs = (name: string) => PROJECT_SCAN.globs.some((pattern) => pattern.test(name));
const isExecutableName = (name: string) => PROJECT_SCAN.executableExtensions.includes(path.extname(name).toLowerCase());

interface Candidate {
  path: string;
  text: string;
  size?: number;
}

async function readCandidate(root: string, file: string, size: number): Promise<Candidate | null> {
  const relative = path.relative(root, file).split(path.sep).join('/');
  const name = path.basename(file);
  if (isExecutableName(name)) {
    return { path: relative, text: '', size };
  }
  const wanted = PROJECT_SCAN.names.includes(name) || matchesGlobs(relative);
  if (!wanted || size > PROJECT_SCAN.maxFileBytes) {
    return null;
  }
  const text = await fs.readFile(file, 'utf8').catch(() => null);
  return text === null ? null : { path: relative, text, size };
}

/** Walk the project: shallow, bounded, without the folders nobody wrote by hand. */
async function collectProjectFiles(root: string): Promise<Candidate[]> {
  const found: Candidate[] = [];
  const ignored = new Set(PROJECT_SCAN.ignoredDirs);
  let visited = 0;
  const walk = async (dir: string, depth: number): Promise<void> => {
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (found.length >= PROJECT_SCAN.maxFiles || visited++ > MAX_VISITED) {
        return;
      }
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) {
        continue;
      }
      if (entry.isDirectory()) {
        if (depth < MAX_DEPTH && !ignored.has(entry.name)) {
          await walk(full, depth + 1);
        }
        continue;
      }
      const stat = await fs.stat(full).catch(() => null);
      const candidate = stat ? await readCandidate(root, full, stat.size) : null;
      if (candidate) {
        found.push(candidate);
      }
    }
  };
  await walk(root, 0);
  return found;
}

const acknowledgedFile = (root: string) => path.join(projectDataDir(root), ACKNOWLEDGED_FILE);

async function readAcknowledged(root: string): Promise<string[]> {
  try {
    const data = JSON.parse(await fs.readFile(acknowledgedFile(root), 'utf8')) as { acknowledged?: unknown; };
    return Array.isArray(data.acknowledged) ? data.acknowledged.filter((entry): entry is string => typeof entry === 'string') : [];
  } catch {
    return [];
  }
}

async function acknowledge(root: string, fingerprints: string[]) {
  const merged = [...new Set([...(await readAcknowledged(root)), ...fingerprints.filter((entry) => typeof entry === 'string')])];
  await fs.mkdir(projectDataDir(root), { recursive: true });
  await fs.writeFile(acknowledgedFile(root), `${JSON.stringify({ acknowledged: merged.slice(-MAX_ACKNOWLEDGED) }, null, 2)}\n`, 'utf8');
}

export interface ProjectScan extends ScanReport {
  /** Findings the user acknowledged earlier and that were left out. */
  acknowledged: number;
}

export async function scanProjectFolder(root: string): Promise<ProjectScan> {
  if (typeof root !== 'string' || !path.isAbsolute(root)) {
    throw new Error('Project root must be an absolute path');
  }
  const files = await collectProjectFiles(root);
  const report = scanProjectFiles(files, { extraRules: extraRules() });
  const known = new Set(await readAcknowledged(root));
  const findings: Finding[] = report.findings.filter((finding) => !known.has(finding.fingerprint));
  return { ...report, findings, verdict: verdictOf(findings), acknowledged: report.findings.length - findings.length };
}

/* ------------------------------------------------------------------ *
 * IPC
 * ------------------------------------------------------------------ */

export function registerSecurityIpc() {
  ipcMain.handle('security:scan:command', (_e, input: string | { command: string; args?: string[]; }) => scanCommandLine(input));
  ipcMain.handle('security:scan:manifest', (_e, manifest: unknown) => scanExtensionManifest(manifest));
  ipcMain.handle('security:scan:project', (_e, root: string) => scanProjectFolder(root));
  ipcMain.handle('security:acknowledge', (_e, root: string, fingerprints: string[]) => acknowledge(root, fingerprints));
}
