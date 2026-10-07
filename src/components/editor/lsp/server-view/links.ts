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
 * Document links from the language server (Novus: the target of an `import`).
 * Ctrl/Cmd-click on a link opens its target — a file in the editor, a web
 * address in the browser; a click on anything else keeps its usual meaning.
 */

import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { Prec, StateEffect, StateField, type Text } from '@codemirror/state';
import { posToOffset } from '@/core/completion/apply';
import { uriToPath, type DocumentLink } from '@/core/lsp/protocol';
import { useStore } from '@/state/store';
import { readyClient } from '../lsp-support';

interface Link {
  from: number;
  to: number;
  target: string;
}

const setLinks = StateEffect.define<Link[]>();

const linksField = StateField.define<Link[]>({
  create: () => [],
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setLinks)) {
        return effect.value;
      }
    }
    if (!tr.docChanged) {
      return value;
    }
    return value.map((link) => ({ ...link, from: tr.changes.mapPos(link.from, 1), to: tr.changes.mapPos(link.to, -1) }));
  },
});

const marksField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    if (!tr.docChanged && !tr.effects.some((effect) => effect.is(setLinks))) {
      return value;
    }
    const links = tr.state.field(linksField);
    return Decoration.set(
      links.filter((link) => link.to > link.from).map((link) => Decoration.mark({ class: 'lm-doc-link' }).range(link.from, link.to)),
      true,
    );
  },
  provide: (field) => EditorView.decorations.from(field),
});

/** Links with a target and a non-empty range, as offsets. */
export function linksOf(doc: Text, links: DocumentLink[]): Link[] {
  const out: Link[] = [];
  for (const link of links) {
    if (!link.target) {
      continue;
    }
    const from = posToOffset(doc, link.range.start);
    const to = posToOffset(doc, link.range.end);
    if (to > from) {
      out.push({ from, to, target: link.target });
    }
  }
  return out;
}

/** What opening a target does: a web address goes to the browser, a file URI into the editor. */
export function openTarget(target: string) {
  if (/^https?:\/\//i.test(target)) {
    void window.lumen.shell.openExternal(target);
    return true;
  }
  if (/^file:\/\//i.test(target)) {
    void useStore.getState().openAt(uriToPath(target), 0, 0);
    return true;
  }
  return false;
}

const clickLink = Prec.highest(EditorView.domEventHandlers({
  mousedown(event, view) {
    if (!(event.ctrlKey || event.metaKey) || event.button !== 0) {
      return false;
    }
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    const hit = pos === null ? undefined : view.state.field(linksField).find((link) => pos >= link.from && pos <= link.to);
    if (!hit || !openTarget(hit.target)) {
      return false;
    }
    event.preventDefault();
    return true;
  },
}));

const linkTheme = EditorView.baseTheme({
  '.lm-doc-link:hover': { textDecoration: 'underline dotted', textUnderlineOffset: '2px' },
});

function linkPlugin(filePath: string) {
  return ViewPlugin.fromClass(class {
    private timer: ReturnType<typeof setTimeout> | null = null;
    private attempts = 0;

    constructor(readonly view: EditorView) {
      this.schedule(800);
    }

    update(update: ViewUpdate) {
      if (update.docChanged) {
        this.schedule(900);
      }
    }

    private schedule(delay: number) {
      if (this.timer) {
        clearTimeout(this.timer);
      }
      this.timer = setTimeout(() => {
        this.timer = null;
        void this.request();
      }, delay);
    }

    private async request() {
      const client = readyClient(filePath);
      if (!client?.supports('documentLinkProvider')) {
        if (!client && this.attempts++ < 20) {
          this.schedule(1500);
        }
        return;
      }
      const doc = this.view.state.doc;
      const links = await client.documentLinks(filePath);
      if (this.view.state.doc !== doc) {
        this.schedule(300);
        return;
      }
      this.view.dispatch({ effects: setLinks.of(linksOf(doc, links)) });
    }

    destroy() {
      if (this.timer) {
        clearTimeout(this.timer);
      }
    }
  });
}

export function lspLinks(filePath: string) {
  return [linksField, marksField, clickLink, linkTheme, linkPlugin(filePath)];
}
