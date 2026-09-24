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
 * Makes a pop-out's document look like the main one — and keep looking like it.
 *
 * A window opened with `window.open` starts empty. The look of Lumen lives in
 * three places, all of which change while it runs: the stylesheets in `<head>`
 * (bundled ones, the custom CSS of the effects, Vite's while developing), the
 * attributes of `<html>` and `<body>` (the theme's colours are inline custom
 * properties, the effects are `data-*` switches), and the language. Each is
 * copied once and then followed with observers, so switching the theme in the
 * main window recolours the pop-outs live.
 */

const STYLE_SELECTOR = 'style, link[rel="stylesheet"]';

function copyAttributes(from: Element, to: Element) {
  for (const { name } of [...to.attributes]) {
    if (!from.hasAttribute(name)) {
      to.removeAttribute(name);
    }
  }
  for (const { name, value } of [...from.attributes]) {
    if (to.getAttribute(name) !== value) {
      to.setAttribute(name, value);
    }
  }
}

/** A copy of a stylesheet node for another document; links get absolute addresses, since the new document has no base of its own. */
function cloneStyle(node: Element, target: Document): Element {
  const clone = target.importNode(node, true) as HTMLStyleElement | HTMLLinkElement;
  if (node instanceof HTMLLinkElement) {
    (clone as HTMLLinkElement).href = node.href;
  }
  return clone;
}

/** Keeps the stylesheets of `target`'s head equal to `source`'s, node by node, in order. */
function mirrorStyles(source: Document, target: Document): () => void {
  const clones = new Map<Element, Element>();
  let scheduled = false;

  const sync = () => {
    scheduled = false;
    const current = [...source.head.querySelectorAll(STYLE_SELECTOR)];
    for (const [node, clone] of clones) {
      if (current.includes(node)) {
        continue;
      }
      clone.remove();
      clones.delete(node);
    }
    for (const node of current) {
      const known = clones.get(node);
      if (!known) {
        const clone = cloneStyle(node, target);
        clones.set(node, clone);
        target.head.append(clone);
        continue;
      }
      // Vite (and the custom CSS) rewrite a `<style>` in place.
      if (node instanceof HTMLStyleElement && known.textContent !== node.textContent) {
        known.textContent = node.textContent;
      }
      if (node instanceof HTMLLinkElement && (known as HTMLLinkElement).href !== node.href) {
        (known as HTMLLinkElement).href = node.href;
      }
    }
    // Later rules win: keep the order of the source, moving only what is out of place.
    let previous: Element | null = null;
    for (const node of current) {
      const clone = clones.get(node);
      if (!clone) {
        continue;
      }
      if (previous && previous.nextElementSibling !== clone) {
        previous.after(clone);
      }
      previous = clone;
    }
  };

  const schedule = () => {
    if (scheduled) {
      return;
    }
    scheduled = true;
    queueMicrotask(sync);
  };

  sync();
  const observer = new MutationObserver(schedule);
  observer.observe(source.head, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['href', 'media'] });
  return () => {
    observer.disconnect();
    for (const clone of clones.values()) {
      clone.remove();
    }
    clones.clear();
  };
}

/** Keeps the attributes of `<html>` and `<body>` equal — theme colours, effect switches, language. */
function mirrorRootAttributes(source: Document, target: Document): () => void {
  const sync = () => {
    copyAttributes(source.documentElement, target.documentElement);
    copyAttributes(source.body, target.body);
  };
  sync();
  const observer = new MutationObserver(sync);
  observer.observe(source.documentElement, { attributes: true });
  observer.observe(source.body, { attributes: true });
  return () => observer.disconnect();
}

/** Make `target` look like `source`; the returned function stops following. */
export function mirrorDocument(source: Document, target: Document): () => void {
  // Relative addresses in copied inline styles (`url(./font.woff2)`) resolve against the main document.
  if (!target.head.querySelector('base')) {
    const base = target.createElement('base');
    base.href = source.baseURI;
    target.head.prepend(base);
  }
  const stopStyles = mirrorStyles(source, target);
  const stopAttributes = mirrorRootAttributes(source, target);
  return () => {
    stopStyles();
    stopAttributes();
  };
}
