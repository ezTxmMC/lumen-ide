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
 * A missing tool: ask once, and install on request.
 *
 * The tools of the languages in the open tabs (`LanguageSpec.tools` —
 * `novusc` for Novus) are looked up when a file opens. One that is missing,
 * does not start, or is older than the version the add-on pins opens the
 * install dialog — the same one the language servers use — with the tool
 * preselected. Same manners as `lspInstall`: only what Lumen can install here,
 * once per tool and session, never after “don't ask again”
 * (`tool:<id>` in `lspInstallDeclined`), never on top of another dialog.
 */

import { useStore } from '@/state/store';
import { lsp } from '@/core/lsp/manager';
import { registry } from '@/core/registry';
import { needsAttention, toolConfig, tools, toolsOf, type ToolStatus } from '@/core/tools';
import { openToolsInstall, lspInstall } from '@/lib/project/lsp-install';
import { overlayOpen } from '@/hooks/useEditorRefocus';

let started = false;
let checking = false;
const asked = new Set<string>();

export const declineKey = (id: string) => `tool:${id}`;

/** The tools of the languages in the open tabs. */
function openTools() {
  const state = useStore.getState();
  const open = new Set(state.tabs.map((tab) => state.languageFor(tab)?.id).filter((id): id is string => Boolean(id)));
  return toolsOf(registry.languages().filter((language) => open.has(language.id)));
}

function promptable(status: ToolStatus): boolean {
  const state = useStore.getState();
  return needsAttention(status)
    && !asked.has(status.tool.id)
    && !state.lspInstallDeclined.includes(declineKey(status.tool.id))
    && lsp.canInstall(toolConfig(status.tool));
}

async function check() {
  if (checking || lspInstall.isOpen()) {
    return;
  }
  const state = useStore.getState();
  if (!state.ready || !state.effects.lsp) {
    return;
  }
  const wanted = openTools().filter((tool) => !asked.has(tool.id) && tools.status(tool.id)?.state !== 'ok');
  if (!wanted.length) {
    return;
  }
  checking = true;
  const statuses = await tools.check(wanted).finally(() => { checking = false; });
  if (lspInstall.isOpen() || overlayOpen(useStore.getState())) {
    return;
  }
  const missing = statuses.filter(promptable);
  if (!missing.length) {
    return;
  }
  for (const status of missing) {
    asked.add(status.tool.id);
  }
  const subject = missing.map((status) => status.tool.label).join(', ');
  openToolsInstall(subject, missing.map((status) => toolConfig(status.tool)), {
    prompt: true,
    declineKey: declineKey(missing[0].tool.id),
  });
}

export function init() {
  if (started) {
    return;
  }
  started = true;
  const run = () => { void check(); };
  lsp.subscribe(run);
  useStore.subscribe(run);
  lspInstall.subscribe(run);
}
