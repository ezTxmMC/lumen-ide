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
 * Minecraft Development — the window part of the extension.
 *
 * Templates for plugins (Spigot, Paper, Folia, Purpur, Leaf, Velocity,
 * BungeeCord) and mods (Fabric, NeoForge, Forge, Quilt, Architectury) whose
 * version fields load live from the official sources, project kinds with
 * build and run tasks, snippets, and commands to refresh the versions.
 */

import type { RendererApi, RendererAddon } from '../../src/core/extensions/renderer-api';
import type { AddonContext, Command } from '../../src/core/types';
import { MINECRAFT_KINDS } from './src/kinds';
import { lumen, setLumen, t, useStore, versions } from './src/lumen';
import { MINECRAFT_SNIPPETS } from './src/snippets';
import { TEMPLATES } from './src/templates';

function updateCommand(ctx: AddonContext): Command {
  let running = false;
  return {
    id: 'minecraft.updateVersions',
    get title() { return t('command.updateVersions'); },
    category: 'Minecraft',
    async run() {
      if (running) { return; }
      running = true;
      ctx.notify(t('toast.updating'), 'info');
      try {
        const failed = await versions().refresh();
        if (failed.length) {
          console.warn('[minecraft] versions partly not loaded:', failed);
          ctx.notify(t('toast.partial', { count: failed.length, first: failed[0] }), 'warning');
          return;
        }
        ctx.notify(t('toast.updated'), 'success');
      } catch (err) {
        ctx.notify(t('toast.failed', { message: (err as Error).message }), 'error');
      } finally {
        running = false;
      }
    },
  };
}

function clearCommand(ctx: AddonContext): Command {
  return {
    id: 'minecraft.clearVersions',
    get title() { return t('command.clearVersions'); },
    category: 'Minecraft',
    run() {
      versions().clear();
      ctx.notify(t('toast.cleared'), 'success');
    },
  };
}

function insertSnippetCommand(ctx: AddonContext): Command {
  return {
    id: 'minecraft.insertSnippet',
    get title() { return t('command.insertSnippet'); },
    category: 'Minecraft',
    scope: 'editor',
    run() {
      const api = lumen();
      const language = api.editor.languageId();
      if (!language) {
        ctx.notify(t('toast.noEditor'), 'warning');
        return;
      }
      const matching = MINECRAFT_SNIPPETS.filter((s) => s.language === language);
      const list = matching.length ? matching : MINECRAFT_SNIPPETS;
      api.ui.openForm({
        title: t('command.insertSnippet'),
        description: t('snippet.description'),
        submitLabel: t('snippet.submit'),
        fields: [{
          id: 'snippet',
          label: t('snippet.label'),
          type: 'combobox',
          default: '0',
          choices: list.map((s, i) => ({
            value: String(i),
            label: `${s.platform} · ${s.detail}`,
            hint: `${s.label} (${s.language === 'java' ? 'Java' : 'Kotlin'})`,
            group: s.platform,
          })),
        }],
        onSubmit(values) {
          const chosen = list[Number(values.snippet)];
          if (!chosen) { return t('snippet.missing'); }
          if (!api.editor.insertSnippet(chosen.body)) { return t('toast.noEditor'); }
        },
      });
    },
  };
}

export function addon(api: RendererApi): RendererAddon {
  setLumen(api);
  return {
    get description() { return t('addon.description'); },
    icon: 'MC',
    category: 'tool',
    projectKinds: MINECRAFT_KINDS,
    projectTemplates: TEMPLATES,
    snippets: MINECRAFT_SNIPPETS.map(({ language, platform, ...snippet }) => ({ ...snippet, languageId: language, detail: `${platform} · ${snippet.detail ?? ''}` })),
    activate(ctx) {
      useStore(ctx.storage);
      ctx.registerCommand(updateCommand(ctx));
      ctx.registerCommand(clearCommand(ctx));
      ctx.registerCommand(insertSnippetCommand(ctx));
      return () => useStore(null);
    },
  };
}
