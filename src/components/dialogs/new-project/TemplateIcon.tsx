/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { Boxes } from 'lucide-react';
import type { LanguageSpec, ProjectTemplate } from '@/core/types';

function languageOf(template: ProjectTemplate, languages: LanguageSpec[]) {
  return languages.find((language) => language.id === template.languageId);
}

/** The template's glyph on a tile tinted with its (or its language's) colour. */
export function TemplateIcon({ template, languages, size = 34 }: {
  template: ProjectTemplate;
  languages: LanguageSpec[];
  size?: number;
}) {
  const language = languageOf(template, languages);
  const color = template.color ?? language?.color ?? 'var(--c-accent)';
  const glyph = template.icon ?? language?.icon;
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-lumen-sm border font-mono font-bold"
      style={{
        width: size, height: size, color,
        fontSize: size * (glyph && glyph.length > 2 ? 0.3 : 0.38),
        background: `color-mix(in srgb, ${color} 14%, transparent)`,
        borderColor: `color-mix(in srgb, ${color} 30%, transparent)`,
      }}
      aria-hidden
    >
      {glyph || <Boxes size={size * 0.45} />}
    </span>
  );
}

/** Short tags for a card: the language and, when fixed, the project kind. */
export function templateBadges(template: ProjectTemplate, languages: LanguageSpec[]): string[] {
  const language = languageOf(template, languages);
  const kind = typeof template.kindId === 'string' ? template.kindId.split('.').pop() : undefined;
  const out = [language?.name, kind].filter((entry): entry is string => Boolean(entry));
  // “Go” and “go” are one badge.
  return out.filter((entry, index) => out.findIndex((other) => other.toLowerCase() === entry.toLowerCase()) === index);
}
