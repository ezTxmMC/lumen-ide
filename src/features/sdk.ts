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
 * Starting SDK management: load the settings and the installed JDKs, provide
 * the active JDK (the project's ahead of the default) as the environment for
 * tasks, terminals and language servers, and register the commands.
 */

import { useStore } from '@/state/store';
import { registerCommandProvider } from '@/core/commands';
import { lsp } from '@/core/lsp/manager';
import { terminals } from '@/lib/terminals';
import { t } from '@/i18n';
import type { Command, FormField } from '@/core/types';
import {
  SDK_PROVIDERS, activeSdk, applyProgress, createGradleImportDecorator, createJavacBackendDecorator, createJvmServerDecorator, createNetBeansDecorator,
  detectInstalled, loadSdkSettings,
  resolveSdk, sdkEnvironment, sdkLabel, setActiveSdks, setBaseEnvironment, setDefaultSdk, setProjectSdk,
  useSdk, type ActiveSdk,
} from '@/core/sdk';

let started = false;
let signature: string | null = null;
/** Settles once the SDK settings are loaded and the installed JDKs detected. */
let markDetected: () => void = () => {};
const detected = new Promise<void>((resolve) => { markDetected = resolve; });

export function init() {
  if (started) {
    return;
  }
  started = true;
  window.lumen.sdk.onProgress(applyProgress);
  terminals.envProvider = sdkEnvironment;
  lsp.addConfigDecorator(createJvmServerDecorator(() => useSdk.getState().installed.java ?? []));
  // The script lives in userData; until the main process has written it, jdtls starts without.
  let gradleInitScript: string | null = null;
  void window.lumen.lsp.gradleInitScript().then((path) => { gradleInitScript = path; }).catch(() => {});
  lsp.addConfigDecorator(createGradleImportDecorator(() => gradleInitScript));
  lsp.addConfigDecorator(createJavacBackendDecorator({
    enabled: () => useStore.getState().effects.javacBackend,
    ready: detected,
    installed: () => useSdk.getState().installed.java ?? [],
    backend: (command) => window.lumen.lsp.jdtlsJavacBackend(command),
    agent: (command, javaHome) => window.lumen.lsp.jdtlsJavacAgent(command, javaHome),
  }));
  lsp.addConfigDecorator(createNetBeansDecorator({ ready: detected, installed: () => useSdk.getState().installed.java ?? [] }));
  registerCommandProvider(sdkCommands);

  useSdk.subscribe((state, previous) => {
    if (state.installed === previous.installed && state.settings === previous.settings) {
      return;
    }
    recompute();
  });
  useStore.subscribe((state, previous) => {
    if (state.projectConfig.jdk === previous.projectConfig.jdk && state.workspace === previous.workspace) {
      return;
    }
    recompute();
  });
  // Switching the compiler jdtls checks with takes a restart.
  useStore.subscribe((state, previous) => {
    if (state.effects.javacBackend === previous.effects.javacBackend) {
      return;
    }
    void restartJvmServers(t('lsp.java.compilerRestart'));
  });
  void start();
}

async function start() {
  try {
    await loadSdkSettings();
    const environment = useSdk.getState().environment;
    if (environment) {
      setBaseEnvironment(environment);
    }
  } catch (err) {
    console.error('[lumen] SDK-Einstellungen:', err);
  }
  await detectInstalled('java').catch(() => {});
  recompute();
  markDetected();
}

/** Work out the active SDKs again; restart running JVM servers when the Java JDK changed. */
function recompute() {
  const sdk = useSdk.getState();
  const store = useStore.getState();
  const next: ActiveSdk[] = [];
  for (const provider of SDK_PROVIDERS) {
    const installed = sdk.installed[provider.id] ?? [];
    const projectValue = provider.id === 'java' && store.workspace ? store.projectConfig.jdk : undefined;
    const fromProject = resolveSdk(projectValue, installed);
    const chosen = fromProject ?? resolveSdk(sdk.settings.defaults[provider.id], installed);
    if (!chosen) {
      continue;
    }
    next.push({
      providerId: provider.id,
      home: chosen.home,
      major: chosen.major,
      origin: fromProject ? 'project' : 'default',
      variables: provider.variables(chosen),
    });
  }
  const nextSignature = JSON.stringify(next.map((entry) => [entry.providerId, entry.home, entry.origin]));
  if (nextSignature === signature) {
    return;
  }
  const javaBefore = activeSdk('java')?.home ?? null;
  signature = nextSignature;
  setActiveSdks(next);
  if ((activeSdk('java')?.home ?? null) === javaBefore) {
    return;
  }
  void restartJvmServers(t('sdk.lspRestart'));
}

async function restartJvmServers(message: string) {
  const entries = lsp.list().filter((entry) => entry.languages.some((id) => ['java', 'kotlin'].includes(id)));
  if (!entries.length) {
    return;
  }
  const state = useStore.getState();
  state.notify(message, 'info');
  for (const entry of entries) {
    await lsp.restartClient(entry.id);
  }
}

/* ------------------------------------------------------------------ *
 * Commands
 * ------------------------------------------------------------------ */

function jdkChoices(): FormField['choices'] {
  const installed = (useSdk.getState().installed.java ?? []).filter((sdk) => !sdk.runtimeOnly);
  return installed.map((sdk) => ({
    value: sdk.home,
    label: sdkLabel(sdk),
    hint: sdk.home,
  }));
}

function openJdkForm(scope: 'project' | 'default') {
  const store = useStore.getState();
  const current = scope === 'project'
    ? store.projectConfig.jdk ?? ''
    : useSdk.getState().settings.defaults.java ?? '';
  const emptyLabel = scope === 'project' ? t('sdk.form.followDefault') : t('sdk.form.system');
  const choices = [{ value: '', label: emptyLabel }, ...(jdkChoices() ?? [])];
  if (current && !choices.some((choice) => choice.value === current)) {
    choices.push({ value: current, label: current });
  }

  store.openForm({
    title: t(scope === 'project' ? 'sdk.form.projectTitle' : 'sdk.form.defaultTitle'),
    description: t(scope === 'project' ? 'sdk.form.projectDescription' : 'sdk.form.defaultDescription'),
    fields: [{ id: 'jdk', label: t('sdk.form.jdk'), type: 'select', choices, mono: false }],
    initial: { jdk: current },
    submitLabel: t('common.apply'),
    onSubmit: async (values) => {
      const value = values.jdk || null;
      if (scope === 'project') {
        await setProjectSdk(value);
        return;
      }
      await setDefaultSdk('java', value);
    },
  });
}

async function selectJdk(scope: 'project' | 'default') {
  if (!useSdk.getState().installed.java) {
    await detectInstalled('java');
  }
  openJdkForm(scope);
}

function sdkCommands(): Command[] {
  const s = () => useStore.getState();
  const category = t('sdk.category');
  return [
    { id: 'sdk.manage', title: t('sdk.command.manage'), category, run: () => s().openDialog('sdks', 'installed') },
    { id: 'sdk.download', title: t('sdk.command.download'), category, run: () => s().openDialog('sdks', 'download') },
    {
      id: 'sdk.selectProjectJdk', title: t('sdk.command.selectProjectJdk'), category,
      run: () => selectJdk('project'),
      when: () => Boolean(s().workspace),
    },
    { id: 'sdk.selectDefaultJdk', title: t('sdk.command.selectDefaultJdk'), category, run: () => selectJdk('default') },
    { id: 'sdk.detect', title: t('sdk.command.detect'), category, run: () => detectInstalled('java') },
  ];
}
