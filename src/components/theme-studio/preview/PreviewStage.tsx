/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '@/i18n';
import type { Effects } from '@/core/theme';
import type { Theme } from '@/core/types';
import { CodeView } from '../CodeView';
import { readStorage, STORAGE, uses, writeStorage, type ColorKey } from '../keys';
import { SAMPLES, sampleSelection } from '../samples';
import {
  BACKDROP_CLASS, DEFAULTS, StageFooter, StageToolbar, VisionFilters, type StageSettings,
} from './stage-controls';
import { ElementsPreview } from './ElementsPreview';
import { IdePreview } from './IdePreview';
import { TerminalPreview } from './TerminalPreview';

export type { PreviewMode } from './stage-controls';
/** CodeMirror elements belonging to an interface colour, for highlighting and clicking. */
const EDITOR_SELECTORS: [string, ColorKey][] = [
  ['.cm-matchingBracket', 'ui:accent'],
  ['.cm-selectionBackground', 'ui:selection'],
  ['.cm-cursor', 'ui:cursor'],
  ['.cm-activeLineGutter', 'ui:text'],
  ['.cm-gutters', 'ui:gutter'],
  ['.cm-activeLine', 'ui:lineHighlight'],
];

const HIT_RULE = `outline: 2px solid #ff3ea5 !important; outline-offset: -1px; border-radius: 3px;
  animation: lm-ts-flash 1.1s ease-in-out infinite !important; position: relative; z-index: 1;`;

/** CSS that makes every place a colour appears light up in the preview. */
function highlightCss(key: ColorKey | null): string {
  if (!key) {
    return '';
  }
  const selectors = [`.lm-ts-stage [data-c~="${key}"]`];
  if (key.startsWith('syntax:')) {
    selectors.push(`.lm-ts-stage .lm-tk-${key.slice(7)}`);
  }
  for (const [selector, owner] of EDITOR_SELECTORS) {
    if (owner === key) {
      selectors.push(`.lm-ts-stage ${selector}`);
    }
  }
  return `${selectors.join(',\n')} { ${HIT_RULE} }`;
}

/** Colour key of an element that was clicked or hovered. */
function keysAt(target: EventTarget | null): ColorKey[] {
  const el = target as HTMLElement | null;
  if (!el?.closest) {
    return [];
  }
  const token = el.closest('[class*="lm-tk-"]');
  const tokenKind = token && /lm-tk-(\w+)/.exec(token.className)?.[1];
  if (tokenKind) {
    return [`syntax:${tokenKind}` as ColorKey];
  }
  for (const [selector, key] of EDITOR_SELECTORS) {
    if (el.closest(selector)) {
      return [key];
    }
  }
  const tagged = el.closest('[data-c]');
  if (!tagged) {
    return [];
  }
  return (tagged.getAttribute('data-c') ?? '').split(' ').filter(Boolean) as ColorKey[];
}

function EditorPreview({ theme, effects, language }: { theme: Theme; effects: Effects; language: string; }) {
  const sample = SAMPLES.find((s) => s.languageId === language) ?? SAMPLES[0];
  const selection = useMemo(() => sampleSelection(sample), [sample]);
  return (
    <div
      {...uses('ui:bg', 'ui:text')}
      className="flex h-full min-h-[380px] flex-col overflow-hidden rounded-lumen border"
      style={{ background: theme.ui.bg, borderColor: theme.ui.border, color: theme.ui.text }}
    >
      <div {...uses('ui:bgElevated', 'ui:border')} className="flex h-8 shrink-0 items-stretch border-b" style={{ background: theme.ui.bgElevated, borderColor: theme.ui.border }}>
        <span {...uses('ui:bg', 'ui:text', 'ui:accent')} className="relative flex items-center px-3 text-[11.5px]" style={{ background: theme.ui.bg, color: theme.ui.text }}>
          <span className="absolute top-0 right-0 left-0 h-[2px]" style={{ background: theme.ui.accent }} />
          {sample.file}
        </span>
      </div>
      <div className="min-h-0 flex-1">
        <CodeView
          key={sample.languageId}
          value={sample.code}
          languageId={sample.languageId}
          theme={theme}
          effects={effects}
          selection={selection}
          readOnly
        />
      </div>
    </div>
  );
}

/**
 * The Studio's preview area: mode, zoom, before/after, background and the
 * colour-blindness simulation. Hovering a swatch lights up here, and clicking
 * an element selects its colour.
 */
export function PreviewStage({
  draft, original, effects, highlight, onPick, labelOf,
}: {
  draft: Theme;
  original: Theme;
  effects: Effects;
  highlight: ColorKey | null;
  onPick: (key: ColorKey) => void;
  labelOf: (key: ColorKey) => string;
}) {
  const t = useT();
  const [settings, setSettings] = useState<StageSettings>(() => ({ ...DEFAULTS, ...readStorage<Partial<StageSettings>>(STORAGE.preview, {}) }));
  const [split, setSplit] = useState(50);
  const [hover, setHover] = useState<ColorKey[]>([]);
  const filterId = useRef(`lm-ts-vision-${Math.random().toString(36).slice(2, 8)}`).current;

  const update = (patch: Partial<StageSettings>) => setSettings((s) => ({ ...s, ...patch }));
  useEffect(() => writeStorage(STORAGE.preview, settings), [settings]);

  const render = (theme: Theme) => {
    if (settings.mode === 'editor') {
      return <EditorPreview theme={theme} effects={effects} language={settings.language} />;
    }
    if (settings.mode === 'elements') {
      return <ElementsPreview theme={theme} />;
    }
    if (settings.mode === 'terminal') {
      return <TerminalPreview theme={theme} />;
    }
    return <IdePreview theme={theme} />;
  };

  const pick = (event: React.MouseEvent) => {
    const keys = keysAt(event.target);
    if (!keys.length) {
      return;
    }
    event.preventDefault();
    onPick(keys[0]);
  };

  const zoomStyle = { zoom: settings.zoom / 100 };
  const visionFilter = settings.vision === 'none' ? undefined : `url(#${filterId}-${settings.vision})`;

  const caption = (text: string, side = 'left-2') => (
    <span className={`lm-glass pointer-events-none absolute top-2 z-10 rounded-full border border-edge px-2 py-0.5 text-[10.5px] text-muted ${side}`}>
      {text}
    </span>
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <VisionFilters filterId={filterId} />
      <style>{highlightCss(highlight)}</style>

      <StageToolbar settings={settings} update={update} />

      {/* Stage */}
      <div
        className={`lm-ts-stage lm-transition relative min-h-0 flex-1 overflow-auto p-4 ${BACKDROP_CLASS[settings.backdrop]}`}
        onClickCapture={pick}
        onMouseOver={(e) => {
          const next = keysAt(e.target);
          setHover((prev) => (prev.join() === next.join() ? prev : next));
        }}
        onMouseLeave={() => setHover([])}
      >
        <div className="h-full" style={{ filter: visionFilter }}>
          {settings.compare === 'off' && (
            <div key={settings.mode} className="lm-anim-fade h-full" style={zoomStyle}>{render(draft)}</div>
          )}

          {settings.compare === 'split' && (
            <div className="grid h-full grid-cols-2 gap-3">
              <div className="relative h-full min-w-0">
                {caption(t('themeStudio.stage.before'))}
                <div className="h-full" style={zoomStyle}>{render(original)}</div>
              </div>
              <div className="relative h-full min-w-0">
                {caption(t('themeStudio.stage.after'))}
                <div className="h-full" style={zoomStyle}>{render(draft)}</div>
              </div>
            </div>
          )}

          {settings.compare === 'slider' && (
            <div className="relative h-full">
              <div className="absolute inset-0" style={zoomStyle}>{render(original)}</div>
              <div className="absolute inset-0" style={{ ...zoomStyle, clipPath: `inset(0 0 0 ${split}%)` }}>{render(draft)}</div>
              <span className="pointer-events-none absolute inset-y-0 z-10 w-[2px] bg-accent shadow-[0_0_0_1px_rgb(0_0_0/30%)]" style={{ left: `${split}%` }} />
              {caption(t('themeStudio.stage.before'))}
              {caption(t('themeStudio.stage.after'), 'right-2')}
            </div>
          )}
        </div>
      </div>

      <StageFooter compare={settings.compare} split={split} onSplit={setSplit} hover={hover} labelOf={labelOf} />
    </div>
  );
}
