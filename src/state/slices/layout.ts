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
 * The window: which view sits in which dock (left, right, bottom), the run
 * output, the references list and the built-in terminals.
 *
 * The docks themselves are data (`state/layout.ts`); this slice applies the
 * pure functions to the registered views and persists the result.
 */

import { viewRegistry, type Dock } from '@/core/views';
import { editorBridge } from '@/lib/editor-bridge';
import { terminals } from '@/lib/terminals';
import { t } from '@/i18n';
import { isViewPopped, popoutKey } from '../popout';
import {
  activeView, clampSize, DEFAULT_LAYOUT, moveView, setNavSide, showView, toggleView, type LayoutState,
} from '../layout';
import type { LayoutSlice, PanelTab, Slice, State } from '../types';

/** The bottom panel's tabs of old, as views. */
const PANEL_VIEWS: Record<PanelTab, string> = {
  output: 'output',
  terminal: 'terminal',
  problems: 'problems',
  references: 'references',
  lsp: 'lsp',
  debug: 'debug-console',
};

/** Persisting on every pixel of a drag would write the settings file hundreds of times. */
let persistTimer: ReturnType<typeof setTimeout> | null = null;

interface Ctx {
  get: () => State;
  set: Parameters<Slice<LayoutSlice>>[0];
}

const known = () => viewRegistry.list();

function apply({ get, set }: Ctx, next: LayoutState, persist = true) {
  if (next === get().layout) {
    return;
  }
  set({ layout: next });
  if (!persist) {
    return;
  }
  if (persistTimer) {
    clearTimeout(persistTimer);
  }
  persistTimer = setTimeout(() => {
    persistTimer = null;
    get().persist();
  }, 400);
}

/** A view in a window of its own is shown by bringing that window forward — the dock has only its placeholder. */
function focusPopped({ get }: Ctx, id: string): boolean {
  if (!isViewPopped(get().popouts, id)) {
    return false;
  }
  get().focusPopout(popoutKey('view', id));
  return true;
}

function dockActions(ctx: Ctx): Pick<LayoutSlice, 'showView' | 'toggleView' | 'moveView' | 'toggleDock' | 'setDockSize' | 'setNavSide' | 'resetLayout' | 'showSidebar' | 'setSidebarView' | 'showPanel' | 'setPanelTab' | 'togglePanel'> {
  const { get } = ctx;
  return {
      showView(id) {
        if (focusPopped(ctx, id)) {
          return;
        }
        apply(ctx, showView(get().layout, id, known()));
      },

      toggleView(id) {
        if (focusPopped(ctx, id)) {
          return;
        }
        apply(ctx, toggleView(get().layout, id, known()));
      },

      moveView(id, dock, index) {
        apply(ctx, moveView(get().layout, id, dock, known(), index));
      },

      toggleDock(dock, open) {
        const layout = get().layout;
        const next = open ?? !layout[dock].open;
        if (next === layout[dock].open) {
          return;
        }
        apply(ctx, { ...layout, [dock]: { ...layout[dock], open: next } });
      },

      setDockSize(dock, px) {
        const layout = get().layout;
        apply(ctx, { ...layout, [dock]: { ...layout[dock], size: clampSize(dock, px) } });
      },

      setNavSide(side) {
        apply(ctx, setNavSide(get().layout, side));
      },

      resetLayout() {
        const { navSide } = get().layout;
        apply(ctx, setNavSide({ ...DEFAULT_LAYOUT, navSide: 'left' }, navSide));
        get().notify(t('shell.layout.resetDone'), 'info');
      },

      showSidebar(view) {
        get().showView(view);
      },

      setSidebarView(view) {
        if (view) {
          get().toggleView(view);
          return;
        }
        get().toggleDock(get().layout.navSide as Dock, false);
      },

      showPanel(tab) {
        get().showView(PANEL_VIEWS[tab] ?? tab);
      },

      setPanelTab(tab) {
        get().showView(PANEL_VIEWS[tab] ?? tab);
      },

      togglePanel(open) {
        get().toggleDock('bottom', open);
      },
  };
}

function terminalActions(ctx: Ctx): Pick<LayoutSlice, 'toggleTerminal' | 'openTerminal' | 'openExternalTerminal'> {
  const { get } = ctx;
  return {
      toggleTerminal(target) {
        const layout = get().layout;
        const dock = (['left', 'right', 'bottom'] as const).find((candidate) => activeView(layout, candidate, known()) === 'terminal');
        const visible = Boolean(dock && layout[dock].open);
        if (isViewPopped(get().popouts, 'terminal')) {
          get().focusPopout(popoutKey('view', 'terminal'));
          window.setTimeout(() => terminals.focus(terminals.activeId), 30);
          return;
        }
        const element = (target ?? document.activeElement) as HTMLElement | null;
        const inTerminal = Boolean(element?.closest?.('.lm-terminal'));
        if (visible && inTerminal && dock) {
          get().toggleDock(dock, false);
          editorBridge.focus();
          return;
        }
        if (visible) {
          terminals.focus(terminals.activeId);
          return;
        }
        get().showView('terminal');
        window.setTimeout(() => terminals.focus(terminals.activeId), 30);
      },

      async openTerminal(options = {}) {
        const s = get();
        const cwd = options.cwd ?? s.project?.root ?? s.workspace ?? undefined;
        const created = terminals.create({
          shell: options.shell ?? (s.effects.terminalShell || undefined),
          cwd,
          command: options.command,
          title: options.title,
          env: s.projectConfig.env,
        });
        get().showView('terminal');
        await created;
      },

      async openExternalTerminal(cwd, terminalId) {
        const s = get();
        const target = cwd ?? s.project?.root ?? s.workspace ?? '';
        try {
          const label = await window.lumen.terminal.openExternal(target, terminalId ?? (s.effects.externalTerminal || undefined));
          get().notify(t('notify.externalTerminalOpened', { name: label }), 'info');
        } catch (err) {
          get().notify((err as Error).message, 'error');
        }
      },
  };
}

function outputActions(ctx: Ctx): Pick<LayoutSlice, 'clearOutput' | 'appendOutput' | 'setRunning' | 'setReferences'> {
  const { get, set } = ctx;
  return {
      clearOutput() {
        set({ output: [] });
      },

      appendOutput(line) {
        set((s) => ({ output: [...s.output, line].slice(-3000) }));
      },

      setRunning(id, label = null) {
        set({ runningId: id, runningLabel: id ? label : null });
      },

      setReferences(result) {
        set({ references: result });
        if (result) {
          get().showView('references');
        }
      },
  };
}

export const createLayoutSlice: Slice<LayoutSlice> = (set, get) => {
  const ctx: Ctx = { get, set };
  return {
    layout: DEFAULT_LAYOUT,
    output: [],
    runningId: null,
    runningLabel: null,
    references: null,

    ...dockActions(ctx),
    ...outputActions(ctx),
    ...terminalActions(ctx),
  };
};
