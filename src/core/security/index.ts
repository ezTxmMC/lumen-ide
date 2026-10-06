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
 * The security scanner, from the window's side.
 *
 * What counts as dangerous is decided by the scanner module in
 * `extension-server/src/scanner` — the one the extension server runs on
 * publish — behind `window.lumen.security`. This file decides what the
 * person at the keyboard is asked:
 *
 *   • a command about to run (task, runner, terminal paste): critical and
 *     high findings stop it until the user confirms; medium ones are a toast;
 *   • a project that just opened: findings of medium and above open the
 *     report, once per project until acknowledged;
 *   • an extension about to be installed: critical findings refuse it,
 *     everything else goes into the question the user answers anyway.
 */

import { create } from 'zustand';
import { t } from '@/i18n';
import { useStore } from '@/state/store';
import type { Finding, ScanReport, Severity } from '../../../extension-server/src/scanner/index.js';

export type { Finding, ScanReport, Severity };

export type SecurityPrompt =
  | { kind: 'project'; root: string; name: string; findings: Finding[]; }
  | { kind: 'command' | 'paste'; label: string; findings: Finding[]; resolve(run: boolean): void; };

export const useSecurityPrompt = create<{ prompt: SecurityPrompt | null; }>(() => ({ prompt: null }));

/** Worst first — for sorting and for the badge colour. */
export const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];

const STOPS = new Set<Severity>(['critical', 'high']);

/** A command line the scanner takes: one string, or a program with its arguments. */
export interface CommandLike {
  command: string;
  args?: string[];
}

export const stopsExecution = (findings: Finding[]) => findings.some((finding) => STOPS.has(finding.severity));

const bySeverity = (a: Finding, b: Finding) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity);

function mergeFindings(reports: ScanReport[]): Finding[] {
  const seen = new Set<string>();
  const out: Finding[] = [];
  for (const finding of reports.flatMap((report) => report.findings)) {
    const key = `${finding.id}:${finding.excerpt ?? ''}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(finding);
    }
  }
  return out.sort(bySeverity);
}

async function scanAll(inputs: (string | CommandLike)[]): Promise<Finding[]> {
  try {
    return mergeFindings(await Promise.all(inputs.map((input) => window.lumen.security.scanCommand(input))));
  } catch (err) {
    // A scanner that cannot run must not stop someone from working; it says so in the console.
    console.error('[lumen] the security scan failed:', err);
    return [];
  }
}

function ask(kind: 'command' | 'paste', label: string, findings: Finding[]): Promise<boolean> {
  // One question at a time: a second one while the first is open answers "no".
  if (useSecurityPrompt.getState().prompt) {
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    useSecurityPrompt.setState({
      prompt: {
        kind, label, findings,
        resolve: (run) => {
          useSecurityPrompt.setState({ prompt: null });
          resolve(run);
        },
      },
    });
  });
}

function whereOf(finding: Finding): string {
  if (!finding.file) {
    return finding.target;
  }
  return finding.line ? t('security.where', { file: finding.file, line: finding.line }) : finding.file;
}

function hint(finding: Finding) {
  useStore.getState().notify(t('security.hint', { finding: finding.title, id: finding.id, where: whereOf(finding) }), 'warning');
}

/** May these commands run? Asks when something dangerous is in them. */
export async function guardCommands(label: string, commands: (string | CommandLike)[]): Promise<boolean> {
  const findings = await scanAll(commands);
  if (stopsExecution(findings)) {
    return ask('command', label, findings);
  }
  const medium = findings.find((finding) => finding.severity === 'medium');
  if (medium) {
    hint(medium);
  }
  return true;
}

/** May this text go into a terminal? Pasted text runs line by line in a shell without bracketed paste. */
export async function guardPaste(text: string): Promise<boolean> {
  const findings = await scanAll([text]);
  if (stopsExecution(findings)) {
    return ask('paste', t('security.paste.title'), findings);
  }
  return true;
}

/* ------------------------------------------------------------------ *
 * Projects
 * ------------------------------------------------------------------ */

const baseName = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() ?? path;

/** Scan a project folder; `explicit` shows the result even when there is nothing worth a dialog. */
export async function scanProject(root: string, options: { explicit?: boolean; } = {}): Promise<void> {
  const state = useStore.getState();
  const name = baseName(root);
  if (options.explicit) {
    state.notify(t('security.project.scanning'), 'info');
  }
  const report = await window.lumen.security.scanProject(root).catch((err: unknown) => {
    console.error('[lumen] the project scan failed:', err);
    return null;
  });
  if (!report || useStore.getState().workspace !== root) {
    return;
  }
  const findings = [...report.findings].sort(bySeverity);
  const worth = findings.some((finding) => finding.severity !== 'low' && finding.severity !== 'info');
  if (worth || (options.explicit && findings.length)) {
    useSecurityPrompt.setState({ prompt: { kind: 'project', root, name, findings } });
    return;
  }
  if (options.explicit) {
    state.notify(t('security.project.clean', { name }), 'success');
  }
}

export async function acknowledgeProject(root: string, findings: Finding[]) {
  await window.lumen.security.acknowledge(root, findings.map((finding) => finding.fingerprint)).catch(() => {});
  useStore.getState().notify(t('security.project.acknowledged'), 'info');
}

/* ------------------------------------------------------------------ *
 * Extensions
 * ------------------------------------------------------------------ */

/** Thrown when an extension's manifest carries something the scanner refuses outright. */
export class ExtensionBlocked extends Error {
  constructor(name: string, readonly findings: Finding[]) {
    const worst = findings.find((finding) => finding.severity === 'critical') ?? findings[0];
    super(t('security.extension.blocked', { name, finding: worst?.title ?? '?', id: worst?.id ?? '?' }));
    this.name = 'ExtensionBlocked';
  }
}

/** Scan a manifest before it is installed; `block` stops it, anything else comes back as text for the approval. */
export async function checkExtension(manifest: { name: string; }): Promise<string | null> {
  const report = await window.lumen.security.scanManifest(manifest).catch((err: unknown) => {
    console.error('[lumen] the extension scan failed:', err);
    return null;
  });
  if (!report) {
    return null;
  }
  const findings = [...report.findings].sort(bySeverity);
  if (report.verdict === 'block') {
    throw new ExtensionBlocked(manifest.name, findings);
  }
  const worth = findings.filter((finding) => finding.severity !== 'low' && finding.severity !== 'info');
  if (!worth.length) {
    return null;
  }
  return t('security.extension.findings', { count: worth.length, finding: worth[0].title, id: worth[0].id });
}
