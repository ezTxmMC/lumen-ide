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
 * The tokenizers of Novus on top of the generic word-list one:
 *
 *   `novus`  `..` (cascade) as an operator, `c { … }` blocks — raw C with
 *            `$name` / `$$` placeholders — coloured as C, the paths of
 *            `import geo/shapes` and `import @geo/circle`, and the keywords
 *            of a `project.nv` manifest
 *   `nvh`    a component: HTML with `<?nv … ?>` and `<?= … ?>` blocks,
 *            `{expr}`, `{#if}` / `{:else}` / `{/if}` / `{#for}` / `{@html}`
 *            and the `@event` / `bind` / `class:name` directives
 */

import type { StringStream } from '@codemirror/language';
import type { CustomTokenizer, LanguageSpec, TokenKind } from '@/core/types';
import { createTokenizer } from '@/core/editor/tokenizer';
import { createMarkupTokenizer, type MarkupState } from './html-tokenizer';

type Inner = ReturnType<typeof createTokenizer>;

/** Just enough C to colour the inside of a `c { }` block. */
const C_SPEC: LanguageSpec = {
  id: 'c-in-novus',
  name: 'C',
  extensions: [],
  comments: { line: '//', block: ['/*', '*/'] },
  controls: ['if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default', 'return', 'break', 'continue', 'goto'],
  keywords: ['static', 'const', 'struct', 'union', 'enum', 'typedef', 'extern', 'inline', 'sizeof', 'volatile', 'register'],
  types: ['void', 'char', 'short', 'int', 'long', 'float', 'double', 'unsigned', 'signed', 'size_t', 'nv', 'uint8_t', 'int64_t'],
  constants: ['NULL', 'nv_nil'],
  meta: /^(?:#\w+|\$\$|\$[A-Za-z_]\w*)/,
  strings: [{ start: '"' }, { start: "'" }],
};

const cTokenizer = createTokenizer(C_SPEC);

interface OpenState {
  block?: boolean;
  string?: unknown;
  /** Open `${ … }` interpolations: their closing brace is not the code's. */
  frames?: unknown[];
}

/** True while the generic tokenizer sits inside a string or a block comment — braces there are not code. */
function isOpen(state: unknown): boolean {
  const open = state as OpenState;
  return Boolean(open.block || open.string || open.frames?.length);
}

interface NovusState {
  nv: unknown;
  /** Brace depth inside a `c { }` block; 0 outside of one. */
  c: number;
  /** `c` was just read: a `{` that follows opens the block. */
  cPending: boolean;
  cState: unknown;
  /** `import` was just read: the path that follows is a package, not an expression. */
  importPending: boolean;
}

/** The words that start a line of `project.nv` (compiler/manifest/manifest.nv); each takes quoted values. */
const MANIFEST_KEY = /^(?:project|version|main|lib|output|novus|require|replace)(?=[ \t]+")/;

/** `import json`, `import geo/shapes`, `import @geo/circle` (compiler/loader/imports.nv). */
const IMPORT_HEAD = /^import(?=[ \t]+[@A-Za-z_])/;
const IMPORT_PATH = /^@?[A-Za-z_][A-Za-z0-9_]*(?:\/[A-Za-z_][A-Za-z0-9_]*)*/;

/** After these words `c {` declares something called `c` (compiler/lexer/cblock.nv). */
const C_NAME_CONTEXT = /(?:^|[^\w.$@])(?:method|class|construct|async)\s+$/;

/** The Novus tokenizer: the generic one plus cascades and C blocks. */
export function createNovusTokenizer(spec: LanguageSpec): CustomTokenizer<NovusState> {
  const base: Inner = createTokenizer({ ...spec, tokenizer: undefined });
  const modules = new Set(spec.builtins ?? []);

  return {
    startState: (): NovusState => ({ nv: base.startState(), c: 0, cPending: false, cState: null, importPending: false }),
    copyState: (s) => ({
      ...s,
      nv: base.copyState?.(s.nv) ?? { ...(s.nv as object) },
      cState: s.cState ? (cTokenizer.copyState?.(s.cState) ?? { ...(s.cState as object) }) : null,
    }),

    token(stream: StringStream, state: NovusState): TokenKind | null {
      if (state.c > 0) {
        return tokenizeC(stream, state);
      }
      if (isOpen(state.nv)) {
        return base.token(stream, state.nv);
      }
      if (state.cPending) {
        if (stream.eatSpace()) {
          return null;
        }
        state.cPending = false;
        if (stream.eat('{')) {
          state.c = 1;
          state.cState = cTokenizer.startState();
          return 'punctuation';
        }
      }
      if (state.importPending) {
        return tokenizeImportPath(stream, state, modules, base);
      }
      if (stream.match('..')) {
        return 'operator';
      }
      const head = stream.string.slice(0, stream.pos);
      if (stream.pos === 0 && stream.match(MANIFEST_KEY)) {
        return 'keyword';
      }
      if (/^\s*$/.test(head) && stream.match(IMPORT_HEAD)) {
        state.importPending = true;
        return 'keyword';
      }
      // `c` as a word of its own, followed by `{`: the start of a C block.
      const before = head.slice(-1);
      if (!/[\w.$@]/.test(before) && !C_NAME_CONTEXT.test(head) && stream.match(/^c(?![\w$])(?=\s*\{)/)) {
        state.cPending = true;
        return 'keyword';
      }
      return base.token(stream, state.nv);
    },
  };
}

/** The path after `import`: a standard module keeps the colour of a module, any other package is a type-like name. */
function tokenizeImportPath(stream: StringStream, state: NovusState, modules: ReadonlySet<string>, base: Inner): TokenKind | null {
  if (stream.eatSpace()) {
    return null;
  }
  state.importPending = false;
  const path = stream.match(IMPORT_PATH) as RegExpMatchArray | null;
  if (!path) {
    return base.token(stream, state.nv);
  }
  return modules.has(path[0]) ? 'builtin' : 'type';
}

/** Inside `c { … }`: C tokens until the matching brace. */
function tokenizeC(stream: StringStream, state: NovusState): TokenKind | null {
  if (!isOpen(state.cState)) {
    if (stream.peek() === '{') {
      state.c++;
    }
    if (stream.peek() === '}') {
      state.c--;
      stream.next();
      if (state.c === 0) {
        state.cState = null;
      }
      return 'punctuation';
    }
  }
  return cTokenizer.token(stream, state.cState);
}

/* ------------------------------------------------------------------ *
 * .nvh
 * ------------------------------------------------------------------ */

type NvhMode = 'markup' | 'block' | 'expr' | 'handler';

interface NvhState {
  mode: NvhMode;
  html: MarkupState;
  nv: NovusState;
  /** Brace depth of the `{ … }` expression. */
  depth: number;
  /** The first word of a `{#if` and the like was already coloured. */
  head: boolean;
  /** Where the code block or expression returns to. */
  back: 'text' | 'tag';
  /** An `@event` was just read: the `="handler(args)"` that follows is Novus. */
  eventPending: boolean;
}

const html = createMarkupTokenizer();
const TEMPLATE_HEAD = /^(?:[#:]\s*(?:else\s+if|if|else|for)|\/\s*(?:if|for)|@html)\b/;
const DIRECTIVE = /^(?:@[A-Za-z]+(?:\.[A-Za-z]+)*|bind(?::[A-Za-z]+)?|class:[A-Za-z0-9_-]+|key)(?=\s*=|\s|\/?>)/;
const EVENT_VALUE_OPEN = /^\s*=\s*"/;

export function createNvhTokenizer(spec: LanguageSpec): CustomTokenizer<NvhState> {
  const code = createNovusTokenizer(spec);

  const enter = (state: NvhState, mode: NvhMode, back: 'text' | 'tag') => {
    state.mode = mode;
    state.back = back;
    state.nv = code.startState();
    state.depth = 1;
    state.head = false;
  };

  return {
    startState: (): NvhState => ({
      mode: 'markup', html: html.startState(), nv: code.startState(), depth: 0, head: false, back: 'text', eventPending: false,
    }),
    copyState: (s) => ({ ...s, html: html.copyState!(s.html), nv: code.copyState!(s.nv) }),

    token(stream: StringStream, state: NvhState): TokenKind | null {
      if (state.mode === 'block') {
        return tokenizeBlock(stream, state);
      }
      if (state.mode === 'expr') {
        return tokenizeExpression(stream, state);
      }
      if (state.mode === 'handler') {
        return tokenizeHandler(stream, state);
      }

      const mode = state.html.mode;
      const text = mode === 'text';
      const bareTag = mode === 'tag' && !state.html.attrValue;
      if (text || bareTag) {
        if (stream.match(/^<\?nv\b/) || stream.match('<?=')) {
          enter(state, 'block', text ? 'text' : 'tag');
          return 'meta';
        }
      }
      if (text && stream.match(/^\\[{}]/)) {
        return 'escape';
      }
      if (bareTag && state.eventPending) {
        state.eventPending = false;
        if (stream.match(EVENT_VALUE_OPEN)) {
          enter(state, 'handler', 'tag');
          return 'string';
        }
      }
      if (bareTag && stream.match(DIRECTIVE)) {
        state.eventPending = stream.current().startsWith('@');
        return 'attribute';
      }
      if ((text || bareTag) && stream.peek() === '{') {
        stream.next();
        enter(state, 'expr', text ? 'text' : 'tag');
        return 'meta';
      }
      return html.token(stream, state.html);
    },
  };

  /** `@click="handler(args, $value)"`: Novus up to the closing quote. */
  function tokenizeHandler(stream: StringStream, state: NvhState): TokenKind | null {
    if (!isOpen(state.nv.nv) && stream.eat('"')) {
      state.mode = 'markup';
      return 'string';
    }
    if (!isOpen(state.nv.nv) && stream.match(/^\$value\b/)) {
      return 'builtin';
    }
    return codeUntil(stream, state, '"');
  }

  /** `<?nv … ?>` and `<?= … ?>`. */
  function tokenizeBlock(stream: StringStream, state: NvhState): TokenKind | null {
    if (!isOpen(state.nv.nv) && stream.match('?>')) {
      state.mode = 'markup';
      return 'meta';
    }
    if (stream.sol() || state.nv.c === 0) {
      if (stream.match(/^(?:prop|ref)\b/)) {
        return 'keyword';
      }
    }
    return codeUntil(stream, state, '?>');
  }

  /** `{ … }`, with the template blocks `{#if …}`, `{:else}`, `{/if}`, `{@html …}`. */
  function tokenizeExpression(stream: StringStream, state: NvhState): TokenKind | null {
    if (!state.head) {
      state.head = true;
      stream.eatSpace();
      if (stream.match(TEMPLATE_HEAD)) {
        return 'control';
      }
    }
    if (!isOpen(state.nv.nv) && state.nv.c === 0) {
      if (stream.peek() === '{') {
        state.depth++;
      }
      if (stream.peek() === '}') {
        stream.next();
        state.depth--;
        if (state.depth <= 0) {
          state.mode = 'markup';
          return 'meta';
        }
        return 'punctuation';
      }
      if (stream.match(/^\$value\b/)) {
        return 'builtin';
      }
    }
    return codeUntil(stream, state, null);
  }

  /** A token of Novus, the line cut short at `stop` so that nothing swallows the closing mark. */
  function codeUntil(stream: StringStream, state: NvhState, stop: string | null): TokenKind | null {
    const full = stream.string;
    if (stop && !isOpen(state.nv.nv)) {
      const at = full.indexOf(stop, stream.pos);
      if (at > stream.pos) {
        stream.string = full.slice(0, at);
      }
    }
    try {
      return code.token(stream, state.nv);
    } finally {
      stream.string = full;
    }
  }
}
