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
 * Tests the colour arithmetic of the themes (src/core/theme-colors.ts):
 * conversions, WCAG contrast, inverting dark ↔ light, contrast correction,
 * palettes and the colour-blindness matrices.
 *
 *   npm run check:themes
 */
import { themesAddon } from '@/addons/builtin/themes';
import {
  applyAccentHarmony, contrastIssues, contrastRatio, deltaE, deriveSurfaces, ensureContrast,
  fixContrast, fixIssue, HARMONIES, hexToHsl, hexToOklch, hslToRgb, invertAround, invertColor,
  invertTheme, mirrorLightness, oklchToHex, parseHex, simulateVision, syntaxColor, toHex,
  VISION_MATRICES, type VisionMode,
} from '@/core/theme-colors';
import { TOKEN_KINDS, UI_COLOR_KEYS, type Theme } from '@/core/types';
import { hexToRgbChannels, selectionColors } from '@/core/theme';

let failures = 0;
let checks = 0;

function expect(ok: boolean, label: string, detail = '') {
  checks++;
  if (ok) {
    return;
  }
  failures++;
  console.log(`  ✗  ${label}${detail ? ` — ${detail}` : ''}`);
}

function section(title: string) {
  console.log(`\n${title}`);
}

const themes: Theme[] = themesAddon.themes ?? [];
const allColors = themes.flatMap((theme) => [
  ...UI_COLOR_KEYS.map((key) => theme.ui[key]),
  ...TOKEN_KINDS.filter((kind) => theme.syntax[kind]).map((kind) => syntaxColor(theme, kind)),
]);

/* -------------------------------------------------------------- */
section('Umrechnungen');

expect(toHex(parseHex('#abc')!) === '#aabbcc', '#abc → #aabbcc');
expect(toHex(parseHex('#11223380')!) === '#11223380', 'Alpha bleibt erhalten');
expect(parseHex('#12345') === null, 'invalid color → null');

let worstLab = 0;
let worstHsl = 0;
for (const color of allColors) {
  const lch = hexToOklch(color)!;
  const back = oklchToHex(lch, lch.alpha);
  worstLab = Math.max(worstLab, deltaE(color, back));
  expect(back === color.toLowerCase(), `OKLCH-Rundreise ${color}`, back);
  const hsl = hexToHsl(color)!;
  const hslBack = toHex(hslToRgb(hsl, hsl.alpha));
  worstHsl = Math.max(worstHsl, deltaE(color, hslBack));
  expect(hslBack === color.toLowerCase(), `HSL-Rundreise ${color}`, hslBack);
}
console.log(`  ${allColors.length} colours, largest deviation OKLCH ${worstLab.toExponential(1)}, HSL ${worstHsl.toExponential(1)}`);
expect(worstLab < 1e-3, 'Rundungsfehler OKLCH klein');

const white = hexToOklch('#ffffff')!;
const black = hexToOklch('#000000')!;
expect(Math.abs(white.l - 1) < 1e-4 && white.c < 1e-4, 'White: L = 1, C = 0');
expect(Math.abs(black.l) < 1e-4, 'Schwarz: L = 0');
const out = oklchToHex({ l: 0.7, c: 0.4, h: 145 });
expect(parseHex(out) !== null, 'out-of-gamut is clamped to sRGB', out);
expect(Math.abs(hexToOklch(out)!.h - 145) < 2, 'gamut clamping keeps the hue', String(hexToOklch(out)!.h));

/* -------------------------------------------------------------- */
section('Kontrast (WCAG)');

expect(Math.abs(contrastRatio('#000000', '#ffffff') - 21) < 1e-6, 'black/white = 21');
expect(Math.abs(contrastRatio('#777777', '#777777') - 1) < 1e-6, 'gleiche Farbe = 1');
expect(Math.abs(contrastRatio('#767676', '#ffffff') - 4.54) < 0.01, '#767676 on white ≈ 4.54');
expect(contrastRatio('#00000000', '#ffffff') < 1.001, 'transparent counts as background');

for (const [fg, bg, min] of [['#7c8cff', '#ffffff', 4.5], ['#333333', '#202020', 7], ['#fbbf24', '#fdf9f2', 3]] as const) {
  const fixed = ensureContrast(fg, bg, min);
  const ratio = contrastRatio(fixed, bg);
  expect(ratio >= min, `ensureContrast ${fg} auf ${bg} ≥ ${min}`, `${fixed} ${ratio.toFixed(2)}`);
  const hueShift = Math.abs(hexToOklch(fixed)!.h - hexToOklch(fg)!.h);
  expect(hueShift < 6 || hexToOklch(fixed)!.c < 0.02, `ensureContrast keeps the hue of ${fg}`, `${hueShift.toFixed(1)}°`);
}
expect(ensureContrast('#e4e7ec', '#0e1013', 4.5) === '#e4e7ec', 'sufficient contrast stays unchanged');

/* -------------------------------------------------------------- */
section('Invertierung');

for (const l of [0, 0.1, 0.16, 0.5, 0.72, 0.9, 1]) {
  expect(Math.abs(mirrorLightness(mirrorLightness(l)) - l) < 1e-9, `Spiegelung ist Involution bei L = ${l}`);
}
const darkBg = hexToOklch('#0e1013')!.l;
const lightBg = hexToOklch('#fbfcfd')!.l;
console.log(`  Lumen Dark bg L=${darkBg.toFixed(3)} → ${mirrorLightness(darkBg).toFixed(3)} (Lumen Light: ${lightBg.toFixed(3)})`);
expect(Math.abs(mirrorLightness(darkBg) - lightBg) < 0.02, 'dunkler Hintergrund landet bei typischem Hellwert');

let worstTwice = 0;
for (const color of allColors) {
  worstTwice = Math.max(worstTwice, deltaE(color, invertColor(invertColor(color))));
  const alpha = parseHex(color)!.a;
  expect(Math.abs(parseHex(invertColor(color))!.a - alpha) < 1 / 255, `Alpha bleibt beim Invertieren (${color})`);
}
console.log(`  inverted twice: largest deviation ΔE ${worstTwice.toFixed(4)}`);
expect(worstTwice < 0.03, 'zweimaliges Invertieren ≈ Ausgangsfarbe', worstTwice.toFixed(4));

let worstAround = 0;
for (const theme of themes) {
  const bgL = hexToOklch(theme.ui.bg)!.l;
  const mirroredBgL = mirrorLightness(bgL);
  for (const key of UI_COLOR_KEYS) {
    const once = invertAround(theme.ui[key], bgL);
    worstAround = Math.max(worstAround, deltaE(theme.ui[key], invertAround(once, mirroredBgL)));
  }
}
console.log(`  inverted twice relative to the background: largest deviation ΔE ${worstAround.toFixed(4)}`);
expect(worstAround < 0.03, 'Invertierung relativ zum Hintergrund ist umkehrbar', worstAround.toFixed(4));

section('Eingebaute Themes invertiert');
const surfaceOrder = ['bgElevated', 'bgHover', 'bgActive', 'borderStrong'] as const;
for (const theme of themes) {
  const inverted = invertTheme(theme);
  const text = Math.min(...[inverted.ui.bg, inverted.ui.bgElevated, inverted.ui.bgOverlay].map((bg) => contrastRatio(inverted.ui.text, bg)));
  const muted = contrastRatio(inverted.ui.textMuted, inverted.ui.bg);
  const accent = contrastRatio(inverted.ui.accentText, inverted.ui.accent);
  const syntaxWorst = Math.min(...TOKEN_KINDS.filter((k) => k !== 'comment' && k !== 'punctuation' && inverted.syntax[k])
    .map((k) => contrastRatio(syntaxColor(inverted, k), inverted.ui.bg)));
  console.log(`  ${theme.name.padEnd(12)} ${theme.type} → ${inverted.type}  bg ${inverted.ui.bg}  text ${text.toFixed(1)}  muted ${muted.toFixed(1)}  accent ${accent.toFixed(1)}  Syntax min ${syntaxWorst.toFixed(1)}`);
  expect(inverted.type !== theme.type, `${theme.name}: Typ gewechselt`);
  expect(text >= 4.5, `${theme.name}: Text/Hintergrund ≥ 4.5`, text.toFixed(2));
  expect(muted >= 4.5, `${theme.name}: muted text ≥ 4.5`, muted.toFixed(2));
  expect(syntaxWorst >= 4.5, `${theme.name}: Syntaxfarben ≥ 4.5`, syntaxWorst.toFixed(2));
  expect(contrastIssues(inverted).length === 0, `${theme.name}: keine Kontrastwarnungen`, contrastIssues(inverted).map((i) => i.key).join(', '));

  // The surface levels: the distance to the background keeps the same order.
  const distance = (t: Theme, key: (typeof surfaceOrder)[number]) => Math.abs(hexToOklch(t.ui[key])!.l - hexToOklch(t.ui.bg)!.l);
  const before = surfaceOrder.map((k) => distance(theme, k));
  const after = surfaceOrder.map((k) => distance(inverted, k));
  const sameOrder = before.every((_, i) => before.every((__, j) => (before[i] <= before[j]) === (after[i] <= after[j]) || Math.abs(before[i] - before[j]) < 0.01));
  expect(sameOrder, `${theme.name}: surface level order is kept`);
  const invertedDir = Math.sign(hexToOklch(inverted.ui.bgActive)!.l - hexToOklch(inverted.ui.bg)!.l);
  const originalDir = Math.sign(hexToOklch(theme.ui.bgActive)!.l - hexToOklch(theme.ui.bg)!.l);
  expect(invertedDir === -originalDir, `${theme.name}: surfaces contrast in the opposite direction`);

  const hue = (c: string) => hexToOklch(c)!;
  const accentBefore = hue(theme.ui.accent);
  const accentAfter = hue(inverted.ui.accent);
  const hueDiff = Math.abs(((accentAfter.h - accentBefore.h + 540) % 360) - 180);
  expect(accentBefore.c < 0.03 || hueDiff < 8, `${theme.name}: accent keeps the hue`, `${hueDiff.toFixed(1)}°`);

  const back = invertTheme(inverted);
  const drift = Math.max(...(['bg', 'bgElevated', 'text', 'border'] as const).map((k) => deltaE(theme.ui[k], back.ui[k])));
  expect(drift < 0.05, `${theme.name}: inverted twice ≈ original (surfaces/text)`, drift.toFixed(3));
}

/* -------------------------------------------------------------- */
section('Contrast correction and palettes');

for (const theme of themes) {
  const broken: Theme = { ...theme, ui: { ...theme.ui, text: theme.ui.bgActive, textMuted: theme.ui.bg } };
  const issues = contrastIssues(broken);
  expect(issues.some((i) => i.key === 'ui:text'), `${theme.name}: broken text is reported`);
  const fixed = issues.reduce(fixIssue, broken);
  expect(contrastIssues(fixed).length === 0, `${theme.name}: Ein-Klick-Korrektur behebt alles`, contrastIssues(fixed).map((i) => i.key).join(', '));
  expect(contrastIssues(fixContrast(broken)).length === 0, `${theme.name}: fixContrast behebt alles`);

  for (const harmony of HARMONIES) {
    const generated = applyAccentHarmony(theme, '#e0508a', harmony);
    // Only the colours produced count; comments and punctuation stay as in the theme.
    const worst = contrastIssues(generated).filter((i) => i.key.startsWith('syntax:') && !/comment|punctuation|operator|variable|invalid/.test(i.key));
    expect(worst.length === 0, `${theme.name}: Harmonie ${harmony} lesbar`, worst.map((i) => i.key).join(', '));
  }

  const derived = deriveSurfaces(theme, theme.type === 'dark' ? '#1a1430' : '#f4f0ff');
  expect(contrastRatio(derived.ui.text, derived.ui.bg) >= 7, `${theme.name}: derived surfaces have readable text`);
  const lOf = (k: 'bg' | 'bgHover' | 'bgActive') => hexToOklch(derived.ui[k])!.l;
  const ordered = theme.type === 'dark' ? lOf('bg') < lOf('bgHover') && lOf('bgHover') < lOf('bgActive') : lOf('bg') > lOf('bgHover') && lOf('bgHover') > lOf('bgActive');
  expect(ordered, `${theme.name}: derived surface levels ordered`);
}

/* -------------------------------------------------------------- */
section('Farbenblindheit');

for (const [mode, matrix] of Object.entries(VISION_MATRICES)) {
  for (let row = 0; row < 3; row++) {
    const sum = matrix[row * 3] + matrix[row * 3 + 1] + matrix[row * 3 + 2];
    expect(Math.abs(sum - 1) < 1e-3, `${mode}: row ${row + 1} preserves white`, sum.toFixed(4));
  }
  expect(simulateVision('#ffffff', mode as VisionMode) === '#ffffff', `${mode}: white stays white`);
  expect(simulateVision('#000000', mode as VisionMode) === '#000000', `${mode}: Schwarz bleibt Schwarz`);
}
const gray = simulateVision('#ff0000', 'grayscale');
expect(gray.slice(1, 3) === gray.slice(3, 5) && gray.slice(3, 5) === gray.slice(5, 7), 'grayscale has equal channels', gray);
expect(deltaE(simulateVision('#ff0000', 'protanopia'), simulateVision('#00ff00', 'protanopia')) < deltaE('#ff0000', '#00ff00'), 'protanopia brings red and green closer');

section('Auswahl im Editor');
{
  // `rgb(r g b / a)` — commas together with a slash the browser quietly discards.
  expect(hexToRgbChannels('#7c8cff') === '124 140 255', 'RGB channels without commas', hexToRgbChannels('#7c8cff'));
  expect(hexToRgbChannels('#7c8cff80') === '124 140 255', 'RGB channels ignore alpha', hexToRgbChannels('#7c8cff80'));
  const parse = (css: string) => {
    const m = /^rgb\((\d+) (\d+) (\d+) \/ (\d+)%\)$/.exec(css);
    if (!m) {
      return null;
    }
    return { rgb: [m[1], m[2], m[3]].map(Number), alpha: Number(m[4]) / 100 };
  };
  const hex = (rgb: number[]) => `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;
  const probes: Theme['ui'][] = [
    ...(themesAddon.themes ?? []).map((theme) => theme.ui),
    // A selection all but invisible must be lifted.
    { ...(themesAddon.themes ?? [])[0].ui, selection: '#10121510' },
  ];
  for (const ui of probes) {
    const colors = selectionColors(ui);
    const focused = parse(colors.focused);
    expect(Boolean(focused), `${ui.selection}: valid CSS`, colors.focused);
    expect(Boolean(parse(colors.inactive)), `${ui.selection}: valid CSS without focus`, colors.inactive);
    if (!focused) {
      continue;
    }
    const shown = `${hex(focused.rgb)}${Math.round(focused.alpha * 255).toString(16).padStart(2, '0')}`;
    const ratio = contrastRatio(shown, ui.bg);
    expect(ratio >= 1.4, `${ui.selection}: Auswahl hebt sich ab (${ratio.toFixed(2)})`);
  }
}

console.log(`\n${checks} checks, ${failures} error(s)`);
process.exit(failures ? 1 : 0);
