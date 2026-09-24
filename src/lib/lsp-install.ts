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
 * Installing language servers — the state behind the install dialog.
 *
 * The dialog (`LspInstallDialog`) only draws what lives here, so an install
 * keeps running and reporting when the dialog is hidden or the sidebar
 * switches. One batch runs at a time; each server goes the way the user chose
 * (`InstallPlan`): into Lumen's environment, through the system's package
 * manager, or by its install command.
 *
 * Root rights: when the main process answers `needsPassword`, the batch pauses
 * and the dialog asks for the password. It is handed to the main process for
 * the one call and kept for the rest of this batch only — never stored,
 * never logged, dropped as soon as the batch ends.
 */

import { useStore } from '@/state/store';
import { lsp } from '@/core/lsp/manager';
import { registry } from '@/core/registry';
import { t } from '@/i18n';
import type { InstallPlan } from '@/core/lsp/install-plan';
import type { LspConfig } from '@/core/types';

export type InstallPhase = 'choose' | 'running' | 'password' | 'done';

export interface InstallRequest {
  /** Changes with every opening, so the dialog starts afresh. */
  id: number;
  /** `language`: the servers of one language, one to choose. `batch`: several at once (after installing an extension). */
  mode: 'language' | 'batch';
  languageId: string | null;
  /** The extension or language the servers belong to — shown in the heading. */
  subject: string;
  servers: LspConfig[];
  /** Labels of the servers selected at the start. */
  preselect: string[];
  /** Opened by the automatic prompt: offer “don't ask again”. */
  prompt: boolean;
}

export interface InstallTarget {
  config: LspConfig;
  plan: InstallPlan;
  /** The command as edited in the dialog, for `command` plans. */
  command?: string;
}

export interface InstallResult {
  label: string;
  ok: boolean;
  cancelled?: boolean;
  message?: string;
}

export interface PasswordRequest {
  /** The command that needs root, as it will run. */
  command: string;
  /** The previous attempt had the wrong password. */
  wrong: boolean;
  pkexec: boolean;
}

export interface InstallState {
  request: InstallRequest | null;
  phase: InstallPhase;
  /** The server being installed right now. */
  current: string | null;
  step: number;
  total: number;
  log: string[];
  results: InstallResult[];
  password: PasswordRequest | null;
}

type PasswordAnswer = { password: string; method: 'sudo' | 'pkexec'; };

const LOG_LIMIT = 400;
const listeners = new Set<() => void>();
let version = 0;
let state: InstallState = idle();

let currentJob: string | null = null;
let cancelled = false;
let passwordWaiter: ((answer: PasswordAnswer | null) => void) | null = null;
let logsWired = false;

function idle(): InstallState {
  return { request: null, phase: 'choose', current: null, step: 0, total: 0, log: [], results: [], password: null };
}

function update(patch: Partial<InstallState>) {
  state = { ...state, ...patch };
  version++;
  for (const fn of listeners) {
    fn();
  }
}

function log(text: string) {
  update({ log: [...state.log, text].slice(-LOG_LIMIT) });
  useStore.getState().appendOutput({ stream: 'stdout', text });
}

/** Output of the main process arrives on two channels; only the running job's lines count. */
function wireLogs() {
  if (logsWired) {
    return;
  }
  logsWired = true;
  const forward = (entry: { jobId: string; text: string; }) => {
    if (entry.jobId !== currentJob) {
      return;
    }
    log(entry.text);
  };
  window.lumen.lspPackages.onLog(forward);
  window.lumen.privileged.onLog(forward);
}

/* ------------------------------------------------------------------ *
 * Opening
 * ------------------------------------------------------------------ */

export const lspInstall = {
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  },
  getVersion: () => version,
  get state(): InstallState {
    return state;
  },
  /** The dialog is showing — the automatic prompt waits meanwhile. */
  isOpen: () => state.request !== null,
  isBusy: () => state.phase === 'running' || state.phase === 'password',
};

let requestCounter = 0;

function open(request: Omit<InstallRequest, 'id'>) {
  if (lspInstall.isBusy()) {
    useStore.getState().notify(t('run.alreadyRunning'), 'warning');
    return;
  }
  update({ ...idle(), request: { ...request, id: ++requestCounter } });
}

/** The install dialog for one language, optionally with a server preselected. */
export function openLspInstall(languageId: string, options: { server?: string; prompt?: boolean; } = {}) {
  const language = registry.languages().find((entry) => entry.id === languageId);
  const servers = language?.lsp ?? [];
  if (!servers.length) {
    return;
  }
  const installable = servers.find((config) => lsp.canInstall(config));
  const preferred = servers.find((config) => config.label === options.server) ?? installable ?? servers[0];
  open({
    mode: 'language',
    languageId,
    subject: language?.name ?? languageId,
    servers,
    preselect: [preferred.label],
    prompt: options.prompt === true,
  });
}

/** The install dialog for one server, wherever it came from — finds its language itself. */
export function openServerInstall(config: LspConfig, languageId?: string) {
  const language = registry.languages().find((entry) =>
    (languageId ? entry.id === languageId : true) && entry.lsp?.some((candidate) => candidate.command === config.command));
  if (language) {
    openLspInstall(language.id, { server: config.label });
    return;
  }
  open({ mode: 'batch', languageId: null, subject: config.label, servers: [config], preselect: [config.label], prompt: false });
}

/** Several servers at once — after installing an extension, say. */
export function openServersInstall(subject: string, servers: LspConfig[]) {
  if (!servers.length) {
    return;
  }
  open({ mode: 'batch', languageId: null, subject, servers, preselect: servers.map((config) => config.label), prompt: false });
}

/** Close the dialog; `decline` records “don't ask again” for the language. */
export function closeLspInstall(decline = false) {
  if (lspInstall.isBusy()) {
    return;
  }
  const languageId = state.request?.languageId;
  if (decline && languageId) {
    useStore.getState().declineLspInstall(languageId);
  }
  update(idle());
}

/* ------------------------------------------------------------------ *
 * Running
 * ------------------------------------------------------------------ */

function askPassword(command: string, wrong: boolean): Promise<PasswordAnswer | null> {
  const pkexec = Boolean(lsp.systemInfo?.pkexec);
  update({ phase: 'password', password: { command, wrong, pkexec } });
  return new Promise((resolve) => {
    passwordWaiter = resolve;
  });
}

/** The dialog's answer to the password question; `null` cancels. */
export function answerPassword(answer: PasswordAnswer | null) {
  const waiter = passwordWaiter;
  passwordWaiter = null;
  update({ phase: 'running', password: null });
  waiter?.(answer);
}

type Privileged = Parameters<typeof window.lumen.privileged.run>[1];
type Outcome = { ok: boolean; cancelled?: boolean; message?: string; };

/** Run through the main process, asking for the password as often as sudo wants one. */
async function runPrivileged(jobId: string, request: Privileged, summary: string, secret: { value: PasswordAnswer | null; }): Promise<Outcome> {
  let result = await window.lumen.privileged.run(jobId, { ...request, ...(secret.value ?? {}) });
  while ((result.needsPassword || result.wrongPassword) && !cancelled) {
    const answer = await askPassword(summary, Boolean(result.wrongPassword));
    if (!answer || cancelled) {
      return { ok: false, cancelled: true };
    }
    secret.value = answer;
    result = await window.lumen.privileged.run(jobId, { ...request, ...answer });
  }
  return { ok: result.ok, cancelled: result.cancelled || cancelled, message: result.message };
}

async function installOne(target: InstallTarget, jobId: string, secret: { value: PasswordAnswer | null; }): Promise<Outcome> {
  const { plan, config } = target;
  if (plan.kind === 'managed') {
    return window.lumen.lspPackages.install(jobId, plan.spec, config.command).then(
      () => ({ ok: true }),
      (err: Error) => ({ ok: false, cancelled, message: err.message }),
    );
  }
  if (plan.kind === 'system') {
    return runPrivileged(jobId, { kind: 'packages', manager: plan.manager, packages: plan.packages }, plan.summary, secret);
  }
  const command = (target.command ?? plan.command).trim();
  if (!command) {
    return { ok: false, message: t('lsp.dialog.noCommand') };
  }
  return runPrivileged(jobId, { kind: 'command', command, confirmed: true }, command, secret);
}

/** Open files of the languages the servers serve get their server now. */
async function restartFor(configs: LspConfig[]) {
  lsp.rescan();
  const commands = new Set(configs.map((config) => config.command));
  const store = useStore.getState();
  const seen = new Set<string>();
  for (const tab of store.tabs) {
    if (!tab.path || tab.virtual || seen.has(tab.path)) {
      continue;
    }
    const spec = store.languageFor(tab);
    if (!spec?.lsp?.some((config) => commands.has(config.command))) {
      continue;
    }
    seen.add(tab.path);
    await lsp.restart(spec, tab.path).catch(() => {});
  }
}

/** Install the chosen servers one after another; one failing does not stop the rest. */
export async function startInstall(targets: InstallTarget[]) {
  if (lspInstall.isBusy() || !targets.length) {
    return;
  }
  wireLogs();
  cancelled = false;
  // The password lives only as long as this batch.
  const secret: { value: PasswordAnswer | null; } = { value: null };
  const store = useStore.getState();
  update({ phase: 'running', step: 0, total: targets.length, log: [], results: [], current: null });

  const results: InstallResult[] = [];
  const installed: LspConfig[] = [];
  for (const [index, target] of targets.entries()) {
    if (cancelled) {
      break;
    }
    const label = target.config.label;
    currentJob = `lsp-${Date.now().toString(36)}-${index}`;
    update({ current: label, step: index + 1 });
    const heading = `→ ${t('run.installLabel', { name: label })}`;
    store.appendOutput({ stream: 'system', text: heading });
    update({ log: [...state.log, heading].slice(-LOG_LIMIT) });
    const outcome = await installOne(target, currentJob, secret).catch((err: Error) => ({ ok: false, message: err.message }) as Outcome);
    results.push({ label, ok: outcome.ok, cancelled: outcome.cancelled, message: outcome.message });
    if (outcome.ok) {
      installed.push(target.config);
    }
    if (!outcome.ok && outcome.message) {
      log(outcome.message);
    }
    update({ results: [...results] });
  }
  secret.value = null;
  currentJob = null;

  if (installed.length) {
    await restartFor(installed);
  }
  const done = results.filter((result) => result.ok).map((result) => result.label);
  const failed = results.filter((result) => !result.ok && !result.cancelled).map((result) => result.label);
  if (done.length) {
    store.notify(t('run.installed', { name: done.join(', ') }), 'success');
  }
  if (failed.length) {
    store.notify(t('run.installFailed', { name: failed.join(', ') }), 'error');
  }
  update({ phase: 'done', current: null, password: null });
}

export function cancelInstall() {
  if (!lspInstall.isBusy()) {
    return;
  }
  cancelled = true;
  if (passwordWaiter) {
    answerPassword(null);
  }
  const job = currentJob;
  if (!job) {
    return;
  }
  void window.lumen.lspPackages.cancel(job).catch(() => false);
  void window.lumen.privileged.cancel(job).catch(() => false);
}
