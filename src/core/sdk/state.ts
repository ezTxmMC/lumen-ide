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
 * State of SDK management: installed SDKs, the catalogue (cached), running
 * installations and the default choice (userData/sdk.json). The per-project
 * choice lives in the project configuration (`project.json`) as `jdk`.
 */

import { create } from 'zustand';
import { useStore } from '@/state/store';
import { t } from '@/i18n';
import { javaProvider } from './java';
import { toolProviders } from './tools';
import type { InstallProgress, InstalledSdk, SdkEnvironment, SdkPackage, SdkProvider } from './types';

export const SDK_PROVIDERS: SdkProvider[] = [javaProvider, ...toolProviders];

export function sdkProvider(id: string): SdkProvider | null {
  return SDK_PROVIDERS.find((p) => p.id === id) ?? null;
}

const CATALOG_KEY = 'lumen.sdk.catalog';
/** Reload the catalogue after a day. */
const CATALOG_MAX_AGE = 24 * 60 * 60 * 1000;

export interface CatalogCache {
  packages: SdkPackage[];
  loadedAt: number;
  earlyAccess: boolean;
}

export interface InstallJob {
  jobId: string;
  pkg: SdkPackage;
  progress: InstallProgress;
}

export interface SdkSettings {
  /** Provider → the stored value (a path, a version, or `distribution-major`). */
  defaults: Record<string, string>;
  earlyAccess: boolean;
}

interface SdkState {
  environment: SdkEnvironment | null;
  settings: SdkSettings;
  installed: Record<string, InstalledSdk[]>;
  detecting: boolean;
  catalogs: Record<string, CatalogCache>;
  catalogLoading: boolean;
  catalogError: string | null;
  /** Package id → installation. */
  jobs: Record<string, InstallJob>;
}

export const useSdk = create<SdkState>(() => ({
  environment: null,
  settings: { defaults: {}, earlyAccess: false },
  installed: {},
  detecting: false,
  catalogs: readCatalogCache(),
  catalogLoading: false,
  catalogError: null,
  jobs: {},
}));

function readCatalogCache(): Record<string, CatalogCache> {
  try {
    const raw = localStorage.getItem(CATALOG_KEY);
    if (!raw) {
      return {};
    }
    return JSON.parse(raw) as Record<string, CatalogCache>;
  } catch {
    return {};
  }
}

function writeCatalogCache(catalogs: Record<string, CatalogCache>) {
  try {
    localStorage.setItem(CATALOG_KEY, JSON.stringify(catalogs));
  } catch {
    // Storage full or locked — then we go without the cache.
  }
}

const notify = (message: string, kind: 'info' | 'success' | 'warning' | 'error' = 'info') =>
  useStore.getState().notify(message, kind);

/* ------------------------------------------------------------------ *
 * Settings
 * ------------------------------------------------------------------ */

export async function loadSdkSettings() {
  const [environment, raw] = await Promise.all([
    window.lumen.sdk.environment(),
    window.lumen.sdk.loadSettings().catch(() => ({} as Record<string, unknown>)),
  ]);
  const defaults = raw.defaults && typeof raw.defaults === 'object' ? raw.defaults as Record<string, string> : {};
  useSdk.setState({ environment, settings: { defaults, earlyAccess: raw.earlyAccess === true } });
}

async function saveSettings(patch: Partial<SdkSettings>) {
  const settings = { ...useSdk.getState().settings, ...patch };
  useSdk.setState({ settings });
  try {
    await window.lumen.sdk.saveSettings({ ...settings });
  } catch (err) {
    notify(t('sdk.error.saveSettings', { message: (err as Error).message }), 'error');
  }
}

export function setDefaultSdk(providerId: string, value: string | null) {
  const defaults = { ...useSdk.getState().settings.defaults };
  if (value) {
    defaults[providerId] = value;
  }
  if (!value) {
    delete defaults[providerId];
  }
  return saveSettings({ defaults });
}

export function setEarlyAccess(earlyAccess: boolean) {
  void saveSettings({ earlyAccess });
  void loadCatalog('java', true);
}

/** The project JDK in the project configuration (`project.json`); `null` follows the default again. */
export async function setProjectSdk(value: string | null) {
  const store = useStore.getState();
  if (!store.workspace) {
    notify(t('sdk.error.noProject'), 'warning');
    return;
  }
  await store.updateProjectConfig({ jdk: value ?? undefined });
}

/* ------------------------------------------------------------------ *
 * Detection and catalogue
 * ------------------------------------------------------------------ */

export async function detectInstalled(providerId = 'java') {
  const provider = sdkProvider(providerId);
  if (!provider) {
    return;
  }
  useSdk.setState({ detecting: true });
  try {
    const found = await provider.detect();
    useSdk.setState((s) => ({ installed: { ...s.installed, [providerId]: found } }));
  } catch (err) {
    notify(t('sdk.error.detect', { message: (err as Error).message }), 'error');
  } finally {
    useSdk.setState({ detecting: false });
  }
}

/** The catalogue request running for each provider. */
const catalogRequests = new Map<string, Promise<void>>();

export function loadCatalog(providerId = 'java', force = false): Promise<void> {
  const provider = sdkProvider(providerId);
  if (!provider) {
    return Promise.resolve();
  }
  const state = useSdk.getState();
  const earlyAccess = state.settings.earlyAccess;
  const cached = state.catalogs[providerId];
  const fresh = cached && cached.earlyAccess === earlyAccess && Date.now() - cached.loadedAt < CATALOG_MAX_AGE;
  if (fresh && !force) {
    return Promise.resolve();
  }
  const running = catalogRequests.get(providerId);
  if (running && !force) {
    return running;
  }

  useSdk.setState({ catalogLoading: true, catalogError: null });
  let request: Promise<void> | null = null;
  request = (async () => {
    try {
      const packages = await provider.catalog({ earlyAccess });
      const catalogs = { ...useSdk.getState().catalogs, [providerId]: { packages, loadedAt: Date.now(), earlyAccess } };
      useSdk.setState({ catalogs });
      writeCatalogCache(catalogs);
    } catch (err) {
      useSdk.setState({ catalogError: (err as Error).message });
    } finally {
      if (catalogRequests.get(providerId) === request) {
        catalogRequests.delete(providerId);
      }
      useSdk.setState({ catalogLoading: false });
    }
  })();
  catalogRequests.set(providerId, request);
  return request;
}

/* ------------------------------------------------------------------ *
 * Installation
 * ------------------------------------------------------------------ */

let jobCounter = 0;

/** Attach a progress message from the main process to its installation. */
export function applyProgress(progress: InstallProgress) {
  const jobs = useSdk.getState().jobs;
  const entry = Object.values(jobs).find((job) => job.jobId === progress.jobId);
  if (!entry) {
    return;
  }
  useSdk.setState({ jobs: { ...jobs, [entry.pkg.id]: { ...entry, progress } } });
}

function dropJob(packageId: string) {
  const jobs = { ...useSdk.getState().jobs };
  delete jobs[packageId];
  useSdk.setState({ jobs });
}

export async function installPackage(pkg: SdkPackage) {
  const provider = sdkProvider(pkg.providerId);
  if (!provider) {
    return;
  }
  const running = useSdk.getState().jobs[pkg.id];
  if (running && !isFinished(running.progress.phase)) {
    return;
  }

  const jobId = `sdk-${Date.now().toString(36)}-${++jobCounter}`;
  const progress: InstallProgress = { jobId, phase: 'resolve', received: 0, total: pkg.size, speed: 0 };
  useSdk.setState((s) => ({ jobs: { ...s.jobs, [pkg.id]: { jobId, pkg, progress } } }));
  try {
    const home = await provider.install(pkg, jobId);
    dropJob(pkg.id);
    await detectInstalled(pkg.providerId);
    notify(t('sdk.installDone', { name: sdkLabel(pkg), path: home }), 'success');
  } catch (err) {
    const job = useSdk.getState().jobs[pkg.id];
    if (job?.progress.phase === 'cancelled') {
      dropJob(pkg.id);
      return;
    }
    const message = (err as Error).message;
    if (job) {
      useSdk.setState((s) => ({ jobs: { ...s.jobs, [pkg.id]: { ...job, progress: { ...job.progress, phase: 'error', error: message } } } }));
    }
    notify(t('sdk.error.install', { message }), 'error');
  }
}

export function cancelInstall(packageId: string) {
  const job = useSdk.getState().jobs[packageId];
  if (!job) {
    return;
  }
  if (isFinished(job.progress.phase)) {
    dropJob(packageId);
    return;
  }
  void window.lumen.sdk.cancel(job.jobId);
}

export function isFinished(phase: InstallProgress['phase']) {
  return phase === 'done' || phase === 'error' || phase === 'cancelled';
}

export async function removeInstalled(sdk: InstalledSdk) {
  if (!sdk.managed) {
    return;
  }
  try {
    await window.lumen.sdk.remove(sdk.home);
  } catch (err) {
    notify(t('sdk.error.remove', { message: (err as Error).message }), 'error');
    return;
  }
  const settings = useSdk.getState().settings;
  if (settings.defaults[sdk.providerId] === sdk.home) {
    await setDefaultSdk(sdk.providerId, null);
  }
  if (useStore.getState().projectConfig.jdk === sdk.home) {
    await setProjectSdk(null);
  }
  await detectInstalled(sdk.providerId);
  notify(t('sdk.removed', { path: sdk.home }), 'success');
}

/* ------------------------------------------------------------------ *
 * Display
 * ------------------------------------------------------------------ */

/** “Eclipse Temurin 21.0.2” */
export function sdkLabel(sdk: Pick<InstalledSdk, 'providerId' | 'distribution' | 'version'>): string {
  const provider = sdkProvider(sdk.providerId);
  const distribution = provider?.distributions.find((d) => d.id === sdk.distribution);
  return `${distribution?.name ?? provider?.name ?? ''} ${sdk.version}`.trim();
}

export function distributionInfo(providerId: string, id: string) {
  const provider = sdkProvider(providerId);
  return provider?.distributions.find((d) => d.id === id) ?? null;
}
