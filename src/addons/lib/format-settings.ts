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
 * What language servers with a formatter of their own are told about the
 * editor's formatting choices — the add-on side of `LspConfig.formatSettings`.
 * The core only hands over tab width and tabs-or-spaces; which key each
 * server wants them under is knowledge of the language add-ons.
 */

import type { LanguageFormat } from '@/core/format-settings';

/** `typescript-language-server`: one block for TypeScript, one for JavaScript. */
export function tsserverFormat(format: LanguageFormat) {
  const options = {
    format: {
      tabSize: format.tabWidth,
      indentSize: format.tabWidth,
      convertTabsToSpaces: !format.useTabs,
    },
  };
  return { typescript: options, javascript: options };
}

/** The editor-level keys the VS Code language servers (CSS, HTML, JSON) read. */
export function editorFormat(format: LanguageFormat) {
  return { editor: { tabSize: format.tabWidth, insertSpaces: !format.useTabs } };
}

/** HTML wraps long lines itself; the width is a convention of the add-on, not an editor setting. */
export const HTML_WRAP_COLUMN = 120;

export function htmlFormat(format: LanguageFormat) {
  return {
    html: { format: { wrapLineLength: HTML_WRAP_COLUMN, indentInnerHtml: true } },
    ...editorFormat(format),
  };
}
