/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import type { CSSProperties, ReactNode } from 'react';
import type { Info } from 'lucide-react';
import { withAlpha } from '@/core/theme-colors';
import type { Theme } from '@/core/types';
import { tokenCss, uses, type ColorKey } from '../keys';

/** A tile with a heading; defined outside the preview so dragging does not rebuild it. */
export function Card({ theme, title, children, className = '' }: { theme: Theme; title: string; children: ReactNode; className?: string; }) {
  const ui = theme.ui;
  return (
    <section
      {...uses('ui:bgElevated', 'ui:border')}
      className={`flex flex-col gap-2.5 rounded-lumen border p-3 ${className}`}
      style={{ background: ui.bgElevated, borderColor: ui.border }}
    >
      <h4 {...uses('ui:textSubtle')} className="text-[9.5px] font-semibold tracking-[0.1em] uppercase" style={{ color: ui.textSubtle }}>
        {title}
      </h4>
      {children}
    </section>
  );
}

/** The drawing helpers every tile of the preview shares. */
export interface Kit {
  theme: Theme;
  ui: Theme['ui'];
  t: (key: string, params?: Record<string, string | number>) => string;
  mono: CSSProperties;
  /** A syntax-coloured piece of text. */
  tk(kind: Parameters<typeof tokenCss>[1], text: string, extra?: CSSProperties, keys?: ColorKey[]): ReactNode;
  button(variant: 'solid' | 'outline' | 'ghost' | 'danger' | 'disabled', label: string): ReactNode;
  codeBox(children: ReactNode): ReactNode;
  toast(kind: 'info' | 'success' | 'warning' | 'error', Icon: typeof Info, color: string, key: ColorKey): ReactNode;
}

export function makeKit(theme: Theme, t: Kit['t']): Kit {
  const ui = theme.ui;
  const mono: CSSProperties = { fontFamily: 'var(--font-mono)' };
  const tk: Kit['tk'] = (kind, text, extra = {}, keys = []) => (
    <span {...uses(`syntax:${kind}`, ...keys)} style={{ ...tokenCss(theme, kind), ...extra }}>{text}</span>
  );

  const button: Kit['button'] = (variant, label) => {
    const styles: Record<typeof variant, { style: CSSProperties; keys: ColorKey[]; }> = {
      solid: { style: { background: ui.accent, color: ui.accentText }, keys: ['ui:accent', 'ui:accentText'] },
      outline: { style: { border: `1px solid ${ui.border}`, color: ui.text }, keys: ['ui:border', 'ui:text'] },
      ghost: { style: { background: ui.bgHover, color: ui.text }, keys: ['ui:bgHover', 'ui:text'] },
      danger: { style: { color: ui.danger, background: withAlpha(ui.danger, 0.12) }, keys: ['ui:danger'] },
      disabled: { style: { background: ui.accent, color: ui.accentText, opacity: 0.4 }, keys: ['ui:accent'] },
    };
    return (
      <span {...uses(...styles[variant].keys)} className="inline-flex h-7 items-center rounded-lumen-sm px-2.5 text-[12px] font-medium" style={styles[variant].style}>
        {label}
      </span>
    );
  };

  const codeBox: Kit['codeBox'] = (children) => (
    <div {...uses('ui:bg')} className="rounded-lumen-sm px-2.5 py-2 text-[12px] leading-[1.75]" style={{ ...mono, background: ui.bg }}>
      {children}
    </div>
  );

  const toast: Kit['toast'] = (kind, Icon, color, key) => (
    <div {...uses('ui:bgOverlay', 'ui:border')} className="flex items-center gap-2 rounded-lumen border px-2.5 py-1.5 text-[12px]" style={{ background: ui.bgOverlay, borderColor: ui.border, color: ui.text }}>
      <Icon size={13} {...uses(key)} style={{ color }} />
      {t(`themeStudio.preview.toast.${kind}`)}
    </div>
  );

  return { theme, ui, t, mono, tk, button, codeBox, toast };
}
