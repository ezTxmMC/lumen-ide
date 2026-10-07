/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { offsetToPos, posToOffset } from '@/core/completion/apply';
import { EditorView, hoverTooltip, showTooltip, ViewPlugin, type Tooltip, type ViewUpdate } from '@codemirror/view';
import { StateEffect, StateField, type Extension } from '@codemirror/state';
import { toMarkdown, type SignatureHelp } from '@/core/lsp/protocol';
import { renderMarkdown } from '@/lib/files/markdown';
import { readyClient } from './lsp-support';

export function lspHover(filePath: string): Extension {
  return hoverTooltip(async (view, pos): Promise<Tooltip | null> => {
    const client = readyClient(filePath);
    if (!client) {
      return null;
    }

    const result = await client.hover(filePath, offsetToPos(view.state.doc, pos));
    const md = toMarkdown(result?.contents).trim();
    if (!md) {
      return null;
    }

    const from = result?.range ? posToOffset(view.state.doc, result.range.start) : pos;
    const to = result?.range ? posToOffset(view.state.doc, result.range.end) : pos;

    return {
      pos: from,
      end: to,
      above: true,
      create: () => {
        const dom = document.createElement('div');
        dom.className = 'lm-lsp-hover';
        renderMarkdown(md.slice(0, 8000), dom);
        return { dom };
      },
    };
  }, { hoverTime: 300 });
}

interface SignatureState { help: SignatureHelp; pos: number; }

export const setSignature = StateEffect.define<SignatureState | null>();

export const signatureField = StateField.define<SignatureState | null>({
  create: () => null,
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setSignature)) {
        return e.value;
      }
    }
    if (value && tr.docChanged) {
      return { ...value, pos: tr.changes.mapPos(value.pos) };
    }
    return value;
  },
  provide: (field) =>
    showTooltip.compute([field], (state) => {
      const sig = state.field(field);
      if (!sig) {
        return null;
      }
      return {
        pos: sig.pos,
        above: true,
        arrow: false,
        create: () => ({ dom: renderSignature(sig.help) }),
      };
    }),
});

function renderSignature(help: SignatureHelp): HTMLElement {
  const dom = document.createElement('div');
  dom.className = 'lm-signature';
  const activeIndex = Math.min(help.activeSignature ?? 0, help.signatures.length - 1);
  const sig = help.signatures[activeIndex];
  if (!sig) {
    return dom;
  }
  const activeParam = sig.activeParameter ?? help.activeParameter ?? 0;

  if (help.signatures.length > 1) {
    const count = document.createElement('span');
    count.className = 'lm-signature-count';
    count.textContent = `${activeIndex + 1}/${help.signatures.length}`;
    dom.append(count);
  }

  const label = document.createElement('div');
  label.className = 'lm-signature-label';
  const param = sig.parameters?.[activeParam];
  const range = parameterRange(sig.label, param?.label);
  if (!range) {
    label.textContent = sig.label;
  }
  if (range) {
    label.append(sig.label.slice(0, range[0]));
    const strong = document.createElement('span');
    strong.className = 'lm-signature-active';
    strong.textContent = sig.label.slice(range[0], range[1]);
    label.append(strong, sig.label.slice(range[1]));
  }
  dom.append(label);

  const docText = toMarkdown(param?.documentation) || toMarkdown(sig.documentation);
  if (docText) {
    const doc = document.createElement('div');
    doc.className = 'lm-signature-doc';
    renderMarkdown(docText.slice(0, 1500), doc);
    dom.append(doc);
  }
  return dom;
}

/** Position of the active parameter within the signature text. */
function parameterRange(signature: string, param: string | [number, number] | undefined): [number, number] | null {
  if (param === undefined) {
    return null;
  }
  if (Array.isArray(param)) {
    return param;
  }
  const index = signature.indexOf(param);
  if (index < 0) {
    return null;
  }
  return [index, index + param.length];
}

export async function triggerSignatureHelp(
  view: EditorView, filePath: string, trigger?: string, isRetrigger = false,
): Promise<boolean> {
  const client = readyClient(filePath);
  if (!client?.supports('signatureHelpProvider')) {
    return false;
  }
  const head = view.state.selection.main.head;
  const help = await client.signatureHelp(filePath, offsetToPos(view.state.doc, head), trigger, isRetrigger);
  if (!help?.signatures.length) {
    if (view.state.field(signatureField, false)) {
      view.dispatch({ effects: setSignature.of(null) });
    }
    return false;
  }
  view.dispatch({ effects: setSignature.of({ help, pos: view.state.selection.main.head }) });
  return true;
}

/**
 * Signature help when a call opens — and only then.
 *
 * The bubble appears on the server's trigger characters (`(`, `,`) and
 * disappears as soon as the first character of the argument is typed, or the
 * cursor leaves the spot. It used to close only on a `)` or a backwards move,
 * so anyone who simply kept writing after the call carried the parameter list
 * along across lines. The full signature stays reachable by hovering the name
 * and through `editor.triggerParameterHints`.
 */
export function signaturePlugin(filePath: string) {
  return ViewPlugin.fromClass(class {
    private timer: ReturnType<typeof setTimeout> | null = null;

    private close(update: ViewUpdate) {
      if (this.timer) {
        clearTimeout(this.timer);
      }
      this.timer = null;
      if (!update.state.field(signatureField, false)) {
        return;
      }
      update.view.dispatch({ effects: setSignature.of(null) });
    }

    update(update: ViewUpdate) {
      const active = Boolean(update.state.field(signatureField, false));

      if (!update.docChanged) {
        // Cursor away from where the bubble hangs → close it.
        if (!update.selectionSet || !active) {
          return;
        }
        const sig = update.state.field(signatureField)!;
        if (update.state.selection.main.head === sig.pos) {
          return;
        }
        this.close(update);
        return;
      }

      const client = readyClient(filePath);
      if (!client) {
        return;
      }
      let inserted = '';
      update.changes.iterChanges((_fa, _ta, _fb, _tb, text) => { inserted = text.toString().slice(-1); });
      const isTrigger = client.signatureTriggerCharacters.includes(inserted);

      // Anything but a trigger character ends the display: the argument is
      // being typed, and the start of the call is behind us.
      if (!isTrigger) {
        this.close(update);
        return;
      }

      if (this.timer) {
        clearTimeout(this.timer);
      }
      this.timer = setTimeout(() => {
        this.timer = null;
        void triggerSignatureHelp(update.view, filePath, inserted, active);
      }, 60);
    }

    destroy() {
      if (this.timer) {
        clearTimeout(this.timer);
      }
    }
  });
}
