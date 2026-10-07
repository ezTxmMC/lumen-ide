/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { diffChanges, needsResolve, offsetToPos, planCompletion } from '@/core/completion/apply';
import { snippetToCm } from '@/core/completion/snippet';
import { ensureSnippetSession, startSnippetSession } from '../extensions/snippet-session';
import { EditorView } from '@codemirror/view';
import { ChangeSet, EditorSelection, type Text } from '@codemirror/state';
import { pickedCompletion, type Completion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import type { LspClient } from '@/core/lsp/client';
import { COMPLETION_ICON, toMarkdown, type CompletionItem, type LspCommand, type TextEdit } from '@/core/lsp/protocol';
import { renderMarkdown } from '@/lib/files/markdown';
import { t } from '@/i18n';
import { useStore } from '@/state/store';
import { rangeToOffsets, readyClient, shownFor, warn } from './lsp-support';
import { triggerSignatureHelp } from './lsp-popups';

/** LSP snippet syntax → CodeMirror template syntax (`${1:name}` → `${1:name}` fields, `$0` → `${}`). */
export function lspSnippetToCm(body: string): string {
  return snippetToCm(body);
}

export function textEditsToChanges(doc: Text, edits: TextEdit[]) {
  return edits.map((e) => {
    const { from, to } = rangeToOffsets(doc, e.range);
    return { from, to, insert: e.newText };
  });
}

/** The file's language server, when ready — for the merged completion. */
export function completionClient(filePath: string): LspClient | null {
  return readyClient(filePath);
}

/** The label without decoration — the basis for matching and duplicate detection. */
export function lspItemLabel(item: CompletionItem): string {
  return item.label.trim();
}

export function lspItemDeprecated(item: CompletionItem): boolean {
  return Boolean(item.deprecated || item.tags?.includes(1));
}

/** How long accepting waits for `completionItem/resolve` before applying what it has. */
const RESOLVE_TIMEOUT_MS = 2500;

async function resolveWithTimeout(client: LspClient, item: CompletionItem): Promise<CompletionItem | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), RESOLVE_TIMEOUT_MS); });
  try {
    const result = await Promise.race([client.resolveCompletion(item), timeout]);
    if (!result) {
      warn(t('lsp.editor.importTimeout', { name: item.label }));
    }
    return result ?? undefined;
  } catch (err) {
    warn(t('lsp.editor.importFailed', { name: item.label, error: (err as Error).message }));
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Accepts a suggestion: resolves it when it may still carry auto-imports, then
 * applies main edit, additional edits and snippet in ONE transaction (one undo
 * step). Changes made while resolving are mapped through; a moved cursor aborts.
 */
async function acceptCompletion(
  view: EditorView, client: LspClient, item: CompletionItem, completion: Completion,
  applyFrom: number, applyTo: number, filePath: string | undefined,
) {
  const baseDoc = view.state.doc;
  const baseHead = view.state.selection.main.head;
  const resolved = needsResolve(item) ? await resolveWithTimeout(client, item) : undefined;

  let changes: ChangeSet | undefined;
  if (view.state.doc !== baseDoc) {
    changes = diffChanges(baseDoc, view.state.doc);
    if (view.state.selection.main.head !== changes.mapPos(baseHead, 1)) {
      warn(t('lsp.editor.insertCancelled', { name: item.label }));
      return;
    }
  }
  const state = view.state;
  const sel = state.selection.main;
  const plan = planCompletion({
    doc: state.doc, head: sel.head,
    from: changes ? changes.mapPos(applyFrom, -1) : applyFrom,
    to: changes ? changes.mapPos(applyTo, 1) : applyTo,
    item, resolved, baseDoc: changes ? baseDoc : undefined, changes,
    filePath, selected: sel.empty ? undefined : state.sliceDoc(sel.from, sel.to),
  });
  for (const w of plan.warnings) {
    console.warn(`[lsp] ${w}`);
  }
  if (plan.dropped.length) {
    warn(t('lsp.editor.extraDropped', { count: plan.dropped.length, name: item.label, reason: plan.dropped[0].reason }));
  }

  if (plan.stops) {
    ensureSnippetSession(view);
  }
  try {
    view.dispatch({
      changes: plan.changes,
      selection: EditorSelection.create(
        plan.selection.map((r) => EditorSelection.range(r.anchor, r.head)), 0,
      ),
      effects: plan.stops ? [startSnippetSession(plan.stops)] : [],
      userEvent: 'input.complete',
      annotations: pickedCompletion.of(completion),
      scrollIntoView: true,
    });
  } catch (err) {
    warn(t('lsp.editor.insertFailed', { name: item.label, error: (err as Error).message }));
    return;
  }
  const command = resolved?.command ?? item.command;
  if (command) {
    await runCommand(view, client, command, filePath);
  }
}

/**
 * One server suggestion as a CodeMirror option: documentation (fetched later),
 * snippets, the replacement range from `textEdit`, auto-imports and commands.
 * `filePath` lets a `triggerParameterHints` command open the signature help.
 */
export function lspItemToCompletion(client: LspClient, item: CompletionItem, filePath?: string): Completion {
  const label = lspItemLabel(item);
  const detail = item.labelDetails?.description ?? item.detail?.split('\n')[0];
  const icon = COMPLETION_ICON[item.kind ?? 1] ?? 'text';

  return {
    label,
    displayLabel: label + (item.labelDetails?.detail ?? ''),
    detail: detail && detail !== label ? detail : undefined,
    // A second type class marks deprecated items (styled as strike-through).
    type: lspItemDeprecated(item) ? `${icon} deprecated` : icon,
    info: async () => {
      const resolved = item.documentation ? item : await client.resolveCompletion(item);
      const md = toMarkdown(resolved.documentation);
      const extra = resolved.detail && resolved.detail !== detail
        ? `\`\`\`${client.servedLanguages[0] ?? ''}\n${resolved.detail}\n\`\`\`\n\n` : '';
      if (!md && !extra) {
        return null;
      }
      const node = document.createElement('div');
      node.className = 'lm-lsp-doc';
      renderMarkdown((extra + md).slice(0, 4000), node);
      return node;
    },
    apply: (view, completion, applyFrom, applyTo) => {
      void acceptCompletion(view, client, item, completion, applyFrom, applyTo, filePath ?? shownFor.get(view));
    },
  };
}

/**
 * A server-only source using CodeMirror's filtering. The merged,
 * error-tolerant completion lives in `core/completion`; this source remains
 * for callers who want nothing but the server.
 */
export function lspCompletionSource(filePath: string) {
  return async (context: CompletionContext): Promise<CompletionResult | null> => {
    const client = readyClient(filePath);
    if (!client) {
      return null;
    }

    const word = context.matchBefore(/[\w$@.\-:/]+/);
    const before = context.state.sliceDoc(Math.max(0, context.pos - 1), context.pos);
    const isTrigger = client.triggerCharacters.includes(before);
    if (!word && !context.explicit && !isTrigger) {
      return null;
    }

    const list = await client.completion(
      filePath,
      offsetToPos(context.state.doc, context.pos),
      isTrigger ? before : undefined,
    );
    const items = list.items;
    if (!items.length) {
      return null;
    }

    let from = context.pos;
    const plain = context.matchBefore(/[\w$]+/);
    if (plain) {
      from = plain.from;
    }

    const options = items.map((item, index) => ({
      ...lspItemToCompletion(client, item, filePath),
      boost: (item.preselect ? 30 : 0) - index / items.length,
    }));

    return {
      from,
      options,
      // Re-request incomplete lists on every keystroke.
      validFor: list.isIncomplete ? undefined : /^[\w$]*$/,
    };
  };
}

async function runCommand(view: EditorView, client: LspClient, command: LspCommand, filePath?: string) {
  if (command.command === 'editor.action.triggerParameterHints') {
    if (filePath) {
      await triggerSignatureHelp(view, filePath, undefined, false);
    }
    return;
  }
  try {
    await client.executeCommand(command);
  } catch (err) {
    useStore.getState().notify(t('lsp.editor.commandFailed', { error: (err as Error).message }), 'warning');
  }
}
