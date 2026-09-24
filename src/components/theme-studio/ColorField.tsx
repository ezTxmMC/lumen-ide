/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, Pipette } from 'lucide-react';
import { useT } from '@/i18n';
import { splitAlpha } from '@/core/theme';
import {
  contrastLevel, contrastRatio, hexToHsl, hexToOklch, hslToRgb, isHexColor, maxChroma, oklchToHex,
  parseHex, toHex,
} from '@/core/theme-colors';
import { useRecentColors } from './recent';
import type { ColorKey } from './keys';

/* ------------------------------------------------------------------ *
 * Contrast badge
 * ------------------------------------------------------------------ */

const LEVEL_CLASS = {
  AAA: 'border-ok/40 text-ok',
  AA: 'border-ok/40 text-ok',
  AA18: 'border-warn/40 text-warn',
  fail: 'border-bad/50 bg-bad/10 text-bad',
} as const;

export function ContrastBadge({ fg, bg, min, compact = false }: { fg: string; bg: string; min?: number; compact?: boolean; }) {
  const t = useT();
  const ratio = contrastRatio(fg, bg);
  const level = contrastLevel(ratio);
  const failing = min !== undefined && ratio < min;
  const tone = failing ? LEVEL_CLASS.fail : LEVEL_CLASS[level];
  const label = level === 'AA18' ? 'AA+' : level;
  return (
    <span
      title={t('themeStudio.contrast.badgeTitle', { ratio: ratio.toFixed(2), min: min ?? 4.5 })}
      className={`inline-flex h-[16px] shrink-0 items-center gap-1 rounded-[4px] border px-1 font-mono text-[9.5px] tabular-nums ${tone}`}
    >
      {ratio.toFixed(1)}
      {!compact && <b className="font-semibold">{level === 'fail' ? '✕' : label}</b>}
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * Sliders (HSL / OKLCH)
 * ------------------------------------------------------------------ */

type SliderMode = 'hsl' | 'oklch';

function GradientSlider({
  label, value, min, max, step, stops, onChange, format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  stops: string[];
  onChange: (value: number) => void;
  format: (value: number) => string;
}) {
  return (
    <label className="flex items-center gap-2">
      <span className="w-4 shrink-0 font-mono text-[10px] text-subtle">{label}</span>
      <span className="relative h-3 flex-1 overflow-hidden rounded-full border border-edge">
        <span className="lm-ts-checker-sm absolute inset-0" />
        <span className="absolute inset-0" style={{ background: `linear-gradient(to right, ${stops.join(', ')})` }} />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          aria-label={label}
          onChange={(e) => onChange(Number(e.target.value))}
          className="lm-range absolute inset-0 h-full w-full cursor-pointer bg-transparent"
          style={{ background: 'transparent', height: '100%' }}
        />
      </span>
      <span className="w-9 shrink-0 text-right font-mono text-[10px] tabular-nums text-muted">{format(value)}</span>
    </label>
  );
}

const samples = (count: number, fn: (x: number) => string) =>
  Array.from({ length: count }, (_, i) => fn(i / (count - 1)));

function HslSliders({ value, onChange }: { value: string; onChange: (value: string) => void; }) {
  const hsl = hexToHsl(value) ?? { h: 0, s: 0, l: 0, alpha: 1 };
  const set = (patch: Partial<typeof hsl>) => {
    const next = { ...hsl, ...patch };
    onChange(toHex(hslToRgb(next, next.alpha)));
  };
  const at = (patch: Partial<typeof hsl>) => toHex(hslToRgb({ ...hsl, ...patch }, 1));
  return (
    <>
      <GradientSlider label="H" value={Math.round(hsl.h)} min={0} max={360} step={1} format={(v) => `${v}°`}
        stops={samples(7, (x) => at({ h: x * 360 }))} onChange={(h) => set({ h })} />
      <GradientSlider label="S" value={Math.round(hsl.s * 100)} min={0} max={100} step={1} format={(v) => `${v}%`}
        stops={samples(3, (x) => at({ s: x }))} onChange={(s) => set({ s: s / 100 })} />
      <GradientSlider label="L" value={Math.round(hsl.l * 100)} min={0} max={100} step={1} format={(v) => `${v}%`}
        stops={samples(5, (x) => at({ l: x }))} onChange={(l) => set({ l: l / 100 })} />
    </>
  );
}

function OklchSliders({ value, onChange }: { value: string; onChange: (value: string) => void; }) {
  const lch = hexToOklch(value) ?? { l: 0, c: 0, h: 0, alpha: 1 };
  // Remember the hue of achromatic colours, or the slider jumps to 0° at chroma 0.
  const hue = useRef(lch.h);
  if (lch.c > 0.002) {
    hue.current = lch.h;
  }
  const set = (patch: Partial<typeof lch>) => {
    const next = { ...lch, h: hue.current, ...patch };
    if (patch.h !== undefined) {
      hue.current = patch.h;
    }
    onChange(oklchToHex(next, next.alpha));
  };
  const at = (patch: Partial<typeof lch>) => oklchToHex({ ...lch, h: hue.current, ...patch });
  const cap = Math.max(0.01, maxChroma(lch.l, hue.current));
  return (
    <>
      <GradientSlider label="L" value={Math.round(lch.l * 1000) / 10} min={0} max={100} step={0.5} format={(v) => `${v.toFixed(0)}%`}
        stops={samples(5, (x) => at({ l: x }))} onChange={(l) => set({ l: l / 100 })} />
      <GradientSlider label="C" value={Math.round(lch.c * 1000) / 1000} min={0} max={0.37} step={0.002} format={(v) => v.toFixed(3)}
        stops={samples(4, (x) => at({ c: x * cap }))} onChange={(c) => set({ c })} />
      <GradientSlider label="H" value={Math.round(hue.current)} min={0} max={360} step={1} format={(v) => `${v}°`}
        stops={samples(9, (x) => at({ h: x * 360 }))} onChange={(h) => set({ h })} />
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Colour swatch
 * ------------------------------------------------------------------ */

interface EyeDropperResult { sRGBHex: string; }
interface EyeDropperApi { open: () => Promise<EyeDropperResult>; }
type EyeDropperCtor = new () => EyeDropperApi;

const eyeDropper = (): EyeDropperCtor | null =>
  (window as unknown as { EyeDropper?: EyeDropperCtor; }).EyeDropper ?? null;

/** The expanded part of a field: slider mode, eyedropper, sliders and recent colours. */
function AdjustPanel({ colorKey, value, base, alpha, mode, onMode, recent, onChange }: {
  colorKey: ColorKey;
  value: string;
  base: string;
  alpha: string;
  mode: SliderMode;
  onMode(mode: SliderMode): void;
  recent: string[];
  onChange(value: string, mark: string): void;
}) {
  const t = useT();
  const alphaValue = parseHex(value)?.a ?? 1;
  const setAlpha = (percent: number) => {
    const rgba = parseHex(value);
    if (!rgba) {
      return;
    }
    onChange(toHex({ ...rgba, a: percent / 100 }), `${colorKey}:alpha`);
  };

  const pick = async () => {
    const Ctor = eyeDropper();
    if (!Ctor) {
      return;
    }
    try {
      const result = await new Ctor().open();
      onChange(alpha ? `${result.sRGBHex}${alpha}` : result.sRGBHex, `${colorKey}:pick`);
    } catch {
      // Cancelled with Esc — do nothing.
    }
  };

  return (
    <div className="lm-anim-up mb-2 ml-8 flex flex-col gap-1.5 rounded-lumen-sm border border-edge bg-surface/60 p-2">
      <div className="flex items-center gap-1">
        {(['oklch', 'hsl'] as const).map((m) => (
          <button
            key={m}
            onClick={() => onMode(m)}
            className={[
              'lm-transition h-5 rounded-[4px] px-1.5 font-mono text-[10px] uppercase',
              mode === m ? 'bg-accent text-accent-fg' : 'text-muted hover:bg-hover',
            ].join(' ')}
          >
            {m}
          </button>
        ))}
        <span className="flex-1" />
        {eyeDropper() && (
          <button
            onClick={() => void pick()}
            title={t('themeStudio.field.eyedropper')}
            className="lm-transition flex h-5 items-center gap-1 rounded-[4px] px-1.5 text-[10.5px] text-muted hover:bg-hover hover:text-fg"
          >
            <Pipette size={11} /> {t('themeStudio.field.pick')}
          </button>
        )}
      </div>

      {mode === 'hsl' && <HslSliders value={value} onChange={(v) => onChange(v, `${colorKey}:hsl`)} />}
      {mode === 'oklch' && <OklchSliders value={value} onChange={(v) => onChange(v, `${colorKey}:oklch`)} />}
      <GradientSlider
        label="A"
        value={Math.round(alphaValue * 100)}
        min={0}
        max={100}
        step={1}
        format={(v) => `${v}%`}
        stops={[`${base}00`, base]}
        onChange={setAlpha}
      />

      {recent.length > 0 && (
        <div className="mt-0.5 flex flex-wrap items-center gap-1">
          <span className="mr-1 text-[10px] text-subtle">{t('themeStudio.field.recent')}</span>
          {recent.map((color) => (
            <button
              key={color}
              title={color}
              onClick={() => onChange(color, `${colorKey}:recent`)}
              className="lm-transition relative size-4 overflow-hidden rounded-[4px] border border-edge hover:scale-110"
            >
              <span className="lm-ts-checker-sm absolute inset-0" />
              <span className="absolute inset-0" style={{ background: color }} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ColorField({
  colorKey, label, value, onChange, contrast, extra, selected, flash, onSelect, onHover,
}: {
  colorKey: ColorKey;
  label: string;
  value: string;
  /** `mark` merges rapid changes to the same field into one history entry. */
  onChange: (value: string, mark: string) => void;
  contrast?: { against: string; min: number; };
  extra?: ReactNode;
  selected: boolean;
  /** A counter raised when the colour is picked from the preview (the flash). */
  flash: number;
  onSelect: () => void;
  onHover: (key: ColorKey | null) => void;
}) {
  const t = useT();
  const { base, alpha } = splitAlpha(value);
  const [text, setText] = useState(value);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<SliderMode>('oklch');
  const row = useRef<HTMLDivElement>(null);
  const recent = useRecentColors();
  useEffect(() => setText(value), [value]);

  useEffect(() => {
    if (!flash || !selected) {
      return;
    }
    row.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    row.current?.classList.remove('lm-ts-picked');
    void row.current?.offsetWidth;
    row.current?.classList.add('lm-ts-picked');
  }, [flash, selected]);

  const commitText = (next: string) => {
    const trimmed = next.trim();
    setText(trimmed);
    if (isHexColor(trimmed)) {
      onChange(toHex(parseHex(trimmed)!), `${colorKey}:text`);
    }
  };

  return (
    <div
      ref={row}
      data-color-field={colorKey}
      onMouseEnter={() => onHover(colorKey)}
      onMouseLeave={() => onHover(null)}
      className={[
        'lm-transition -mx-1.5 rounded-lumen-sm px-1.5',
        selected ? 'bg-active/70' : 'hover:bg-hover/60',
      ].join(' ')}
    >
      <div className="flex items-center gap-2 py-[3px]" onClick={onSelect}>
        <label className="relative size-6 shrink-0 cursor-pointer overflow-hidden rounded-lumen-sm border border-edge">
          <span className="lm-ts-checker-sm absolute inset-0" />
          <span className="absolute inset-0" style={{ background: value }} />
          <input
            type="color"
            value={base}
            aria-label={label}
            onChange={(e) => onChange(alpha ? `${e.target.value}${alpha}` : e.target.value, `${colorKey}:picker`)}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>

        <span className="min-w-0 flex-1 truncate text-[12px] text-muted" title={colorKey}>{label}</span>
        {extra}
        {contrast && <ContrastBadge fg={value} bg={contrast.against} min={contrast.min} />}

        <input
          value={text}
          spellCheck={false}
          aria-label={t('themeStudio.field.hex', { name: label })}
          onChange={(e) => commitText(e.target.value)}
          onBlur={() => setText(value)}
          className="lm-transition w-[82px] shrink-0 rounded-lumen-sm border border-edge bg-input px-1.5 py-0.5 text-right font-mono text-[11px] outline-none focus:border-accent"
        />
        <button
          onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
          title={t('themeStudio.field.adjust')}
          aria-expanded={open}
          className="lm-transition flex size-5 shrink-0 items-center justify-center rounded-sm text-subtle hover:bg-hover hover:text-fg"
        >
          <ChevronDown size={12} className="lm-transition" style={{ transform: open ? 'rotate(180deg)' : undefined }} />
        </button>
      </div>

      {open && (
        <AdjustPanel
          colorKey={colorKey}
          value={value}
          base={base}
          alpha={alpha}
          mode={mode}
          onMode={setMode}
          recent={recent}
          onChange={onChange}
        />
      )}
    </div>
  );
}

export function StyleToggle({
  active, title, children, onClick,
}: {
  active: boolean;
  title: string;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title={title}
      aria-pressed={active}
      className={[
        'lm-transition flex size-5 shrink-0 items-center justify-center rounded-sm text-[11px]',
        active ? 'bg-accent text-accent-fg' : 'text-subtle hover:bg-hover hover:text-fg',
      ].join(' ')}
    >
      {children}
    </button>
  );
}
