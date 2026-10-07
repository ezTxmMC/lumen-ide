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
 * What a diagnostic says besides its message: the code (a link where the
 * server gave a `codeDescription`), the source, the related locations and
 * the tags. Shared by the editor's tooltip and the problems panel; pure.
 */

import { uriToPath, type Diagnostic } from './protocol';

export interface RelatedLine {
  path: string;
  /** The file's name, for display. */
  name: string;
  /** Zero-based. */
  line: number;
  character: number;
  message: string;
}

export interface DiagnosticParts {
  message: string;
  code?: string;
  /** Where the code is explained; web addresses only. */
  href?: string;
  source?: string;
  related: RelatedLine[];
  deprecated: boolean;
  unnecessary: boolean;
}

const RELATED_LIMIT = 4;

export function diagnosticParts(diagnostic: Diagnostic): DiagnosticParts {
  const href = diagnostic.codeDescription?.href;
  return {
    message: diagnostic.message,
    code: diagnostic.code === undefined || diagnostic.code === '' ? undefined : String(diagnostic.code),
    href: href && /^https?:\/\//i.test(href) ? href : undefined,
    source: diagnostic.source || undefined,
    related: (diagnostic.relatedInformation ?? []).slice(0, RELATED_LIMIT).map((entry) => {
      const path = uriToPath(entry.location.uri);
      return {
        path,
        name: path.split(/[\\/]/).pop() ?? path,
        line: entry.location.range.start.line,
        character: entry.location.range.start.character,
        message: entry.message,
      };
    }),
    deprecated: diagnostic.tags?.includes(2) ?? false,
    unnecessary: diagnostic.tags?.includes(1) ?? false,
  };
}

/** The plain-text form (clipboard, accessibility): message, code and related lines. */
export function diagnosticText(diagnostic: Diagnostic): string {
  const parts = diagnosticParts(diagnostic);
  const head = parts.code ? `${parts.message}  [${parts.code}]` : parts.message;
  return [head, ...parts.related.map((entry) => `↳ ${entry.name}:${entry.line + 1}: ${entry.message}`)].join('\n');
}
