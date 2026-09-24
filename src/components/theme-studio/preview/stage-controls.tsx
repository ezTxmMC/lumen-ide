/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import type { ReactNode } from 'react';
import {
  Code2, Columns2, Component, Eye, LayoutDashboard, MousePointerClick, Minus, Plus, SquareSplitHorizontal,
  Terminal as TerminalIcon,
} from 'lucide-react';
import { useT } from '@/i18n';
import { svgColorMatrix, VISION_MODES, type VisionMode } from '@/core/theme-colors';
import type { ColorKey } from '../keys';
import { SAMPLES } from '../samples';

/* The controls around the preview stage: toolbar, vision filters and footer. */

export type PreviewMode = 'ide' | 'editor' | 'elements' | 'terminal';
export type Compare = 'off' | 'split' | 'slider';
export type Backdrop = 'app' | 'checker' | 'black' | 'white';

export interface StageSettings {
  mode: PreviewMode;
  zoom: number;
  compare: Compare;
  backdrop: Backdrop;
  vision: VisionMode;
  language: string;
}

export const DEFAULTS: StageSettings = {
  mode: 'ide', zoom: 100, compare: 'off', backdrop: 'app', vision: 'none', language: 'typescript',
};

const MODES: { id: PreviewMode; icon: typeof Code2; }[] = [
  { id: 'ide', icon: LayoutDashboard },
  { id: 'editor', icon: Code2 },
  { id: 'elements', icon: Component },
  { id: 'terminal', icon: TerminalIcon },
];

const COMPARE_ICON: Record<Compare, typeof Code2> = { off: Eye, split: Columns2, slider: SquareSplitHorizontal };

export const BACKDROP_CLASS: Record<Backdrop, string> = {
  app: 'bg-bg',
  checker: 'lm-ts-checker',
  black: 'bg-black',
  white: 'bg-white',
};

export function ToolButton({ active, title, onClick, children }: { active?: boolean; title: string; onClick: () => void; children: ReactNode; }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={[
        'lm-transition flex h-6 shrink-0 items-center gap-1 rounded-[5px] px-1.5 text-[11.5px]',
        active ? 'bg-accent text-accent-fg' : 'text-muted hover:bg-hover hover:text-fg',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

export function StageToolbar({ settings, update }: { settings: StageSettings; update(patch: Partial<StageSettings>): void; }) {
  const t = useT();
  const zoomBy = (delta: number) => update({ zoom: Math.min(200, Math.max(50, settings.zoom + delta)) });
  return (
  <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-edge px-2 py-1.5">
    <div className="flex items-center gap-0.5 rounded-lumen-sm border border-edge p-0.5">
      {MODES.map(({ id, icon: Icon }) => (
        <ToolButton key={id} active={settings.mode === id} title={t(`themeStudio.stage.mode.${id}`)} onClick={() => update({ mode: id })}>
          <Icon size={12} /> <span className="max-[1100px]:hidden">{t(`themeStudio.stage.mode.${id}`)}</span>
        </ToolButton>
      ))}
    </div>

    {settings.mode === 'editor' && (
      <select
        value={settings.language}
        onChange={(e) => update({ language: e.target.value })}
        aria-label={t('themeStudio.stage.language')}
        className="lm-transition h-6 rounded-lumen-sm border border-edge bg-input px-1.5 text-[11.5px] hover:border-edge-strong"
      >
        {SAMPLES.map((s) => <option key={s.languageId} value={s.languageId}>{s.label}</option>)}
      </select>
    )}

    <span className="flex-1" />

    <div className="flex items-center gap-0.5" title={t('themeStudio.stage.zoom')}>
      <ToolButton title={t('themeStudio.stage.zoomOut')} onClick={() => zoomBy(-10)}><Minus size={11} /></ToolButton>
      <button
        onClick={() => update({ zoom: 100 })}
        title={t('themeStudio.stage.zoomReset')}
        className="lm-transition h-6 w-11 rounded-[5px] font-mono text-[10.5px] tabular-nums text-muted hover:bg-hover"
      >
        {settings.zoom}%
      </button>
      <ToolButton title={t('themeStudio.stage.zoomIn')} onClick={() => zoomBy(10)}><Plus size={11} /></ToolButton>
    </div>

    <span className="mx-1 h-4 w-px bg-edge" />

    <div className="flex items-center gap-0.5 rounded-lumen-sm border border-edge p-0.5">
      {(['off', 'split', 'slider'] as const).map((id) => {
        const Icon = COMPARE_ICON[id];
        return (
          <ToolButton key={id} active={settings.compare === id} title={t(`themeStudio.stage.compare.${id}`)} onClick={() => update({ compare: id })}>
            <Icon size={12} />
          </ToolButton>
        );
      })}
    </div>

    <select
      value={settings.backdrop}
      onChange={(e) => update({ backdrop: e.target.value as Backdrop })}
      title={t('themeStudio.stage.backdrop')}
      aria-label={t('themeStudio.stage.backdrop')}
      className="lm-transition h-6 rounded-lumen-sm border border-edge bg-input px-1.5 text-[11.5px] hover:border-edge-strong"
    >
      {(['app', 'checker', 'black', 'white'] as const).map((id) => (
        <option key={id} value={id}>{t(`themeStudio.stage.backdrops.${id}`)}</option>
      ))}
    </select>

    <select
      value={settings.vision}
      onChange={(e) => update({ vision: e.target.value as VisionMode })}
      title={t('themeStudio.stage.vision')}
      aria-label={t('themeStudio.stage.vision')}
      className={[
        'lm-transition h-6 rounded-lumen-sm border bg-input px-1.5 text-[11.5px] hover:border-edge-strong',
        settings.vision === 'none' ? 'border-edge' : 'border-accent text-accent',
      ].join(' ')}
    >
      {VISION_MODES.map((id) => <option key={id} value={id}>{t(`themeStudio.vision.${id}`)}</option>)}
    </select>
  </div>
  );
}

/** Filters for the colour-blindness simulation. */
export function VisionFilters({ filterId }: { filterId: string; }) {
  return (
  <svg width="0" height="0" className="absolute" aria-hidden>
    {VISION_MODES.filter((m) => m !== 'none').map((mode) => (
      <filter key={mode} id={`${filterId}-${mode}`} colorInterpolationFilters="linearRGB">
        <feColorMatrix type="matrix" values={svgColorMatrix(mode as Exclude<VisionMode, 'none'>)} />
      </filter>
    ))}
  </svg>
  );
}

/** Footer: comparison slider and hint for the hovered colour. */
export function StageFooter({ compare, split, onSplit, hover, labelOf }: {
  compare: Compare;
  split: number;
  onSplit(value: number): void;
  hover: ColorKey[];
  labelOf(key: ColorKey): string;
}) {
  const t = useT();
  return (
  <div className="flex h-7 shrink-0 items-center gap-2 border-t border-edge px-3 text-[11px] text-subtle">
    {compare === 'slider' && (
      <label className="flex w-64 items-center gap-2">
        <span className="shrink-0">{t('themeStudio.stage.before')}</span>
        <input
          type="range"
          min={0}
          max={100}
          value={split}
          onChange={(e) => onSplit(Number(e.target.value))}
          className="lm-range flex-1"
          aria-label={t('themeStudio.stage.compare.slider')}
        />
        <span className="shrink-0">{t('themeStudio.stage.after')}</span>
      </label>
    )}
    <span className="flex-1" />
    <MousePointerClick size={11} className="shrink-0" />
    <span className="truncate">
      {hover.length ? hover.map(labelOf).join(' · ') : t('themeStudio.stage.pickHint')}
    </span>
  </div>
  );
}
