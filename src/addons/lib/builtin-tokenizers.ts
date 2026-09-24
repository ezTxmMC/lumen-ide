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
 * The named tokenizers, and their registration.
 *
 * Each name stands for exactly what the add-on of that language used before it
 * became an extension, so that the highlighting is the one people know.
 * `core/user-addons/tokenizers.ts` explains why the detour through names
 * exists at all.
 */

import { registerTokenizers, type TokenizerFactory } from '@/core/user-addons/tokenizers';
import { cssTokenizer } from './css-tokenizer';
import { createMarkupTokenizer } from './html-tokenizer';
import { createJsxTokenizer } from './jsx-tokenizer';
import { createMarkdownTokenizer, markdownTokenizer } from './markdown-tokenizer';

/** A tokenizer that does not care about the language's own spec. */
const fixed = (tokenizer: unknown): TokenizerFactory => () => tokenizer as never;

export const BUILTIN_TOKENIZERS: Record<string, TokenizerFactory> = {
  css: fixed(cssTokenizer),
  markdown: fixed(markdownTokenizer),
  mdx: fixed(createMarkdownTokenizer({ mdx: true })),
  markup: fixed(createMarkupTokenizer()),
  'markup-mustache': fixed(createMarkupTokenizer({ mustache: true })),
  'markup-astro': fixed(createMarkupTokenizer({ frontmatter: '---', expressions: true })),
  // The only one that needs the language: JSX highlights the surrounding code
  // with the language's own keywords and adds the tags on top.
  jsx: (spec) => createJsxTokenizer(spec) as never,
};

registerTokenizers(BUILTIN_TOKENIZERS);
