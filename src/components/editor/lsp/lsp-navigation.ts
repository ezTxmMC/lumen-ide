/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { offsetToPos } from '@/core/completion/apply';
import { EditorView } from '@codemirror/view';
import { lsp } from '@/core/lsp/manager';
import { uriToPath, type Location } from '@/core/lsp/protocol';
import { t } from '@/i18n';
import { declarationHits, definitionSymbols, preferCurrentModule, searchExtensions } from './definition-fallback';
import { useStore, type ReferenceHit } from '@/state/store';
import { readyClient, wordAt } from './lsp-support';

export type LocationKind = 'definition' | 'declaration' | 'typeDefinition' | 'implementation';

/** Translation keys of the location kinds (`editor.nav.kinds.*`). */
const KIND_KEYS: Record<LocationKind, string> = {
  definition: 'definition',
  declaration: 'declaration',
  typeDefinition: 'typeDefinition',
  implementation: 'implementation',
};

/** Open one location, the cursor on the name. */
async function openLocation(target: Location) {
  await useStore.getState().openAt(
    uriToPath(target.uri),
    target.range.start.line, target.range.start.character,
    target.range.end.line, target.range.end.character,
  );
}

/**
 * When the server knows no definition: an exact match among the servers'
 * workspace symbols, then a declaration of the name found by text search in
 * the project's files of this language (and its siblings, Java ↔ Kotlin).
 */
async function fallbackDefinitions(filePath: string, word: string): Promise<Location[]> {
  const symbols = await lsp.workspaceSymbols(word).catch(() => []);
  const fromSymbols = definitionSymbols(symbols, word);
  if (fromSymbols.length) {
    return fromSymbols;
  }
  const state = useStore.getState();
  const root = state.project?.root ?? state.workspace;
  if (!root || word.length < 2) {
    return [];
  }
  const spec = state.languageFor(state.tabs.find((tab) => tab.path === filePath) ?? null);
  const extensions = searchExtensions(spec?.extensions ?? [filePath.slice(filePath.lastIndexOf('.'))]);
  const hits = await window.lumen.fs.search(root, word, 400).catch(() => []);
  return declarationHits(hits, word, extensions);
}

export async function gotoLocation(
  view: EditorView, filePath: string, kind: LocationKind,
): Promise<boolean> {
  const client = readyClient(filePath);
  const head = view.state.selection.main.head;
  const word = wordAt(view, head);
  const kindLabel = t(`editor.nav.kinds.${KIND_KEYS[kind]}`);
  const fromServer = client ? await client[kind](filePath, offsetToPos(view.state.doc, head)) : [];
  const fallback = !fromServer.length && (kind === 'definition' || kind === 'declaration') && word;
  const found = fallback ? await fallbackDefinitions(filePath, word) : fromServer;
  const locations = preferCurrentModule(found, filePath);
  if (!locations.length) {
    // A server still importing the build knows little yet — say so rather than “not found”.
    const busy = client?.busy;
    const message = busy
      ? t('editor.nav.notFoundBusy', { kind: kindLabel, name: word, busy })
      : t(word ? 'editor.nav.notFoundNamed' : 'editor.nav.notFound', { kind: kindLabel, name: word });
    useStore.getState().notify(message, 'info');
    return false;
  }
  if (locations.length === 1) {
    await openLocation(locations[0]);
    return true;
  }
  await showLocations(t('editor.nav.listTitle', { kind: kindLabel, name: word }), locations);
  return true;
}

export async function findReferences(view: EditorView, filePath: string): Promise<boolean> {
  const client = readyClient(filePath);
  if (!client) {
    return false;
  }
  const head = view.state.selection.main.head;
  const locations = await client.references(filePath, offsetToPos(view.state.doc, head), true);
  const word = wordAt(view, head);
  if (!locations.length) {
    useStore.getState().notify(t(word ? 'editor.nav.noReferencesNamed' : 'editor.nav.noReferences', { name: word }), 'info');
    return false;
  }
  await showLocations(t('editor.nav.referencesTitle', { name: word, count: locations.length }), locations);
  return true;
}

/** The hit list into the references panel; preview lines are fetched afterwards. */
export async function showLocations(title: string, locations: Location[]) {
  const store = useStore.getState();
  const hits: ReferenceHit[] = locations.map((l) => ({
    path: uriToPath(l.uri),
    line: l.range.start.line,
    character: l.range.start.character,
    endLine: l.range.end.line,
    endCharacter: l.range.end.character,
  }));
  store.setReferences({ title, hits, loading: true });

  const cache = new Map<string, string[] | null>();
  const previews = await Promise.all(hits.map(async (hit) => {
    if (!cache.has(hit.path)) {
      const tab = useStore.getState().tabs.find((t) => t.path === hit.path);
      const text = tab ? tab.content : await window.lumen.fs.readFile(hit.path).catch(() => null);
      cache.set(hit.path, text === null ? null : text.split('\n'));
    }
    return cache.get(hit.path)?.[hit.line]?.trim().slice(0, 240) ?? '';
  }));
  const current = useStore.getState().references;
  if (current?.title !== title) {
    return;
  }
  store.setReferences({
    title,
    hits: hits.map((h, i) => ({ ...h, preview: previews[i] })),
    loading: false,
  });
}
