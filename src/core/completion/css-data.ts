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
 * Completion data for stylesheets: properties, values per property, at-rules,
 * and Tailwind CSS (directives, `@apply` utilities, `@theme` variables).
 *
 * It works without a language server, in every stylesheet language and in the
 * Tailwind language that claims `.css` files. No DOM.
 */

import type { Completion } from '@codemirror/autocomplete';
import { prepare } from './matcher';
import type { CompletionCandidate } from './words';

/** Languages whose files are stylesheets. */
const STYLE_LANGUAGES = new Set(['css', 'scss', 'less', 'sass', 'pcss', 'postcss', 'tailwind', 'tailwindcss']);

export function isStyleLanguage(languageId: string | null | undefined): boolean {
  return Boolean(languageId) && STYLE_LANGUAGES.has(languageId as string);
}

/** Languages whose class attributes may hold Tailwind utilities. */
const MARKUP_LANGUAGES = new Set([
  'html', 'javascript', 'typescript', 'javascriptreact', 'typescriptreact', 'jsx', 'tsx', 'vue', 'svelte', 'astro', 'mdx',
]);

export function isMarkupLanguage(languageId: string | null | undefined): boolean {
  return Boolean(languageId) && MARKUP_LANGUAGES.has(languageId as string);
}

/* ------------------------------------------------------------------ *
 * Properties and values
 * ------------------------------------------------------------------ */

const PROPERTIES = (
  'align-content align-items align-self all animation animation-delay animation-direction animation-duration ' +
  'animation-fill-mode animation-iteration-count animation-name animation-play-state animation-timing-function ' +
  'appearance aspect-ratio backdrop-filter backface-visibility background background-attachment background-blend-mode ' +
  'background-clip background-color background-image background-origin background-position background-repeat ' +
  'background-size block-size border border-block border-bottom border-bottom-color border-bottom-left-radius ' +
  'border-bottom-right-radius border-bottom-style border-bottom-width border-collapse border-color border-image ' +
  'border-inline border-left border-left-color border-left-style border-left-width border-radius border-right ' +
  'border-right-color border-right-style border-right-width border-spacing border-style border-top border-top-color ' +
  'border-top-left-radius border-top-right-radius border-top-style border-top-width border-width bottom box-shadow ' +
  'box-sizing break-after break-before break-inside caption-side caret-color clear clip-path color color-scheme ' +
  'column-count column-gap column-rule column-width columns contain container container-name container-type content ' +
  'content-visibility counter-increment counter-reset cursor direction display empty-cells fill filter flex flex-basis ' +
  'flex-direction flex-flow flex-grow flex-shrink flex-wrap float font font-family font-feature-settings font-kerning ' +
  'font-size font-size-adjust font-stretch font-style font-variant font-variation-settings font-weight gap grid ' +
  'grid-area grid-auto-columns grid-auto-flow grid-auto-rows grid-column grid-column-end grid-column-start grid-gap ' +
  'grid-row grid-row-end grid-row-start grid-template grid-template-areas grid-template-columns grid-template-rows ' +
  'hanging-punctuation height hyphens image-rendering inline-size inset inset-block inset-inline isolation ' +
  'justify-content justify-items justify-self left letter-spacing line-break line-height list-style list-style-image ' +
  'list-style-position list-style-type margin margin-block margin-bottom margin-inline margin-left margin-right ' +
  'margin-top mask max-block-size max-height max-inline-size max-width min-block-size min-height min-inline-size ' +
  'min-width mix-blend-mode object-fit object-position offset opacity order orphans outline outline-color ' +
  'outline-offset outline-style outline-width overflow overflow-anchor overflow-wrap overflow-x overflow-y ' +
  'overscroll-behavior padding padding-block padding-bottom padding-inline padding-left padding-right padding-top ' +
  'page-break-after page-break-before page-break-inside perspective perspective-origin place-content place-items ' +
  'place-self pointer-events position quotes resize right rotate row-gap scale scroll-behavior scroll-margin ' +
  'scroll-padding scroll-snap-align scroll-snap-type scrollbar-color scrollbar-gutter scrollbar-width shape-outside ' +
  'stroke stroke-width tab-size table-layout text-align text-align-last text-decoration text-decoration-color ' +
  'text-decoration-line text-decoration-style text-decoration-thickness text-indent text-justify text-overflow ' +
  'text-shadow text-transform text-underline-offset text-wrap top touch-action transform transform-origin ' +
  'transform-style transition transition-delay transition-duration transition-property transition-timing-function ' +
  'translate unicode-bidi user-select vertical-align view-transition-name visibility white-space widows width ' +
  'will-change word-break word-spacing word-wrap writing-mode z-index accent-color'
).split(' ');

const GLOBAL_VALUES = ['inherit', 'initial', 'unset', 'revert', 'revert-layer'];
const COLORS = ['transparent', 'currentColor', 'black', 'white', 'red', 'green', 'blue', 'gray', 'orange', 'yellow', 'purple', 'pink', 'rgb()', 'rgba()', 'hsl()', 'hsla()', 'oklch()', 'color-mix()', 'var()'];
const LENGTHS = ['0', 'auto', 'calc()', 'var()', 'min()', 'max()', 'clamp()', '100%', '100vw', '100vh', '100dvh', 'fit-content', 'min-content', 'max-content'];
const BORDER_STYLES = ['none', 'solid', 'dashed', 'dotted', 'double', 'groove', 'ridge', 'inset', 'outset', 'hidden'];

const VALUES_BY_PROPERTY: Record<string, string[]> = {
  display: ['block', 'inline', 'inline-block', 'flex', 'inline-flex', 'grid', 'inline-grid', 'contents', 'flow-root', 'table', 'table-row', 'table-cell', 'list-item', 'none'],
  position: ['static', 'relative', 'absolute', 'fixed', 'sticky'],
  overflow: ['visible', 'hidden', 'scroll', 'auto', 'clip'],
  'overflow-x': ['visible', 'hidden', 'scroll', 'auto', 'clip'],
  'overflow-y': ['visible', 'hidden', 'scroll', 'auto', 'clip'],
  visibility: ['visible', 'hidden', 'collapse'],
  'flex-direction': ['row', 'row-reverse', 'column', 'column-reverse'],
  'flex-wrap': ['nowrap', 'wrap', 'wrap-reverse'],
  'justify-content': ['flex-start', 'flex-end', 'center', 'space-between', 'space-around', 'space-evenly', 'start', 'end', 'stretch'],
  'align-items': ['stretch', 'flex-start', 'flex-end', 'center', 'baseline', 'start', 'end'],
  'align-content': ['stretch', 'flex-start', 'flex-end', 'center', 'space-between', 'space-around', 'space-evenly'],
  'align-self': ['auto', 'stretch', 'flex-start', 'flex-end', 'center', 'baseline'],
  'justify-items': ['stretch', 'start', 'end', 'center'],
  'place-items': ['center', 'start', 'end', 'stretch'],
  'text-align': ['left', 'right', 'center', 'justify', 'start', 'end'],
  'text-decoration': ['none', 'underline', 'overline', 'line-through'],
  'text-transform': ['none', 'uppercase', 'lowercase', 'capitalize'],
  'text-overflow': ['clip', 'ellipsis'],
  'white-space': ['normal', 'nowrap', 'pre', 'pre-wrap', 'pre-line', 'break-spaces'],
  'word-break': ['normal', 'break-all', 'keep-all', 'break-word'],
  'overflow-wrap': ['normal', 'break-word', 'anywhere'],
  'font-weight': ['normal', 'bold', 'bolder', 'lighter', '100', '200', '300', '400', '500', '600', '700', '800', '900'],
  'font-style': ['normal', 'italic', 'oblique'],
  'font-family': ['system-ui', 'sans-serif', 'serif', 'monospace', 'ui-monospace', 'cursive', 'fantasy'],
  'font-size': ['small', 'medium', 'large', 'x-large', 'smaller', 'larger', 'rem', 'em', 'calc()', 'clamp()'],
  cursor: ['auto', 'default', 'pointer', 'text', 'move', 'not-allowed', 'grab', 'grabbing', 'wait', 'help', 'crosshair', 'zoom-in', 'zoom-out'],
  'pointer-events': ['auto', 'none'],
  'user-select': ['auto', 'none', 'text', 'all'],
  'box-sizing': ['border-box', 'content-box'],
  float: ['none', 'left', 'right'],
  clear: ['none', 'left', 'right', 'both'],
  'object-fit': ['fill', 'contain', 'cover', 'none', 'scale-down'],
  'background-repeat': ['repeat', 'no-repeat', 'repeat-x', 'repeat-y', 'space', 'round'],
  'background-size': ['auto', 'cover', 'contain'],
  'background-position': ['center', 'top', 'bottom', 'left', 'right'],
  'background-attachment': ['scroll', 'fixed', 'local'],
  'background-image': ['none', 'url()', 'linear-gradient()', 'radial-gradient()', 'conic-gradient()'],
  background: [...COLORS, 'none', 'url()', 'linear-gradient()', 'radial-gradient()', 'conic-gradient()', 'no-repeat', 'center', 'cover'],
  'border-style': BORDER_STYLES,
  border: ['none', '1px solid', '1px dashed', '1px dotted', ...BORDER_STYLES, ...COLORS],
  outline: ['none', '1px solid', ...BORDER_STYLES, ...COLORS],
  'border-collapse': ['collapse', 'separate'],
  transition: ['all', 'none', 'ease', 'ease-in', 'ease-out', 'ease-in-out', 'linear', 'opacity', 'transform', 'color', 'background-color'],
  'animation-timing-function': ['ease', 'ease-in', 'ease-out', 'ease-in-out', 'linear', 'cubic-bezier()', 'steps()'],
  'transition-timing-function': ['ease', 'ease-in', 'ease-out', 'ease-in-out', 'linear', 'cubic-bezier()', 'steps()'],
  'animation-fill-mode': ['none', 'forwards', 'backwards', 'both'],
  'animation-direction': ['normal', 'reverse', 'alternate', 'alternate-reverse'],
  'animation-iteration-count': ['infinite', '1', '2', '3'],
  animation: ['none', 'infinite', 'forwards', 'both', 'alternate', 'ease', 'ease-in-out', 'linear'],
  transform: ['none', 'translate()', 'translateX()', 'translateY()', 'scale()', 'rotate()', 'skew()', 'matrix()', 'perspective()'],
  'list-style-type': ['none', 'disc', 'circle', 'square', 'decimal', 'lower-alpha', 'upper-alpha', 'lower-roman', 'upper-roman'],
  'list-style': ['none', 'disc', 'circle', 'square', 'decimal', 'inside', 'outside'],
  resize: ['none', 'both', 'horizontal', 'vertical'],
  'scroll-behavior': ['auto', 'smooth'],
  'vertical-align': ['baseline', 'top', 'middle', 'bottom', 'text-top', 'text-bottom', 'sub', 'super'],
  'mix-blend-mode': ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'difference'],
  'grid-template-columns': ['repeat()', 'minmax()', '1fr', 'auto', 'none', 'subgrid', 'repeat(auto-fill, minmax())', 'repeat(auto-fit, minmax())'],
  'grid-template-rows': ['repeat()', 'minmax()', '1fr', 'auto', 'none', 'subgrid'],
  'grid-auto-flow': ['row', 'column', 'dense', 'row dense', 'column dense'],
  'color-scheme': ['light', 'dark', 'light dark', 'normal'],
  'container-type': ['normal', 'size', 'inline-size'],
  'will-change': ['auto', 'transform', 'opacity', 'scroll-position'],
  'text-wrap': ['wrap', 'nowrap', 'balance', 'pretty', 'stable'],
  'scrollbar-width': ['auto', 'thin', 'none'],
  'aspect-ratio': ['auto', '1 / 1', '16 / 9', '4 / 3'],
  'backface-visibility': ['visible', 'hidden'],
  'writing-mode': ['horizontal-tb', 'vertical-rl', 'vertical-lr'],
  'table-layout': ['auto', 'fixed'],
  isolation: ['auto', 'isolate'],
  appearance: ['none', 'auto', 'menulist-button', 'textfield'],
  'content': ['none', 'normal', '""', 'attr()', 'counter()'],
  'z-index': ['auto', '0', '1', '10', '100', '999', '-1'],
  opacity: ['0', '0.5', '1'],
  color: COLORS,
  'background-color': COLORS,
  'border-color': COLORS,
  'outline-color': COLORS,
  'caret-color': COLORS,
  'accent-color': COLORS,
  fill: COLORS,
  stroke: COLORS,
  'box-shadow': ['none', 'inset', ...COLORS],
  'text-shadow': ['none', ...COLORS],
};

const LENGTH_PROPERTIES = new Set([
  'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height', 'margin', 'padding', 'top', 'right', 'bottom',
  'left', 'inset', 'gap', 'row-gap', 'column-gap', 'flex-basis', 'border-radius', 'border-width', 'margin-top',
  'margin-right', 'margin-bottom', 'margin-left', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'margin-inline', 'margin-block', 'padding-inline', 'padding-block', 'inline-size', 'block-size', 'line-height',
  'letter-spacing', 'text-indent', 'outline-offset', 'translate', 'scale', 'rotate',
]);

const AT_RULES = [
  'media', 'supports', 'container', 'layer', 'keyframes', 'font-face', 'import', 'charset', 'property', 'scope',
  'starting-style', 'namespace', 'page', 'counter-style', 'mixin', 'include', 'use', 'forward', 'extend', 'function',
  'return', 'each', 'at-root',
];

/** Tailwind CSS directives and functions (v3 and v4). */
const TAILWIND_AT_RULES = [
  'tailwind', 'apply', 'theme', 'utility', 'variant', 'custom-variant', 'source', 'plugin', 'config', 'reference',
  'screen', 'responsive', 'variants',
];

const TAILWIND_THEME_VARIABLES = [
  '--color-', '--font-', '--text-', '--font-weight-', '--tracking-', '--leading-', '--breakpoint-', '--container-',
  '--spacing', '--radius-', '--shadow-', '--inset-shadow-', '--drop-shadow-', '--blur-', '--perspective-', '--aspect-',
  '--ease-', '--animate-',
];

/* ------------------------------------------------------------------ *
 * Tailwind utilities
 * ------------------------------------------------------------------ */

const SPACING = [
  '0', 'px', '0.5', '1', '1.5', '2', '2.5', '3', '3.5', '4', '5', '6', '7', '8', '9', '10', '11', '12', '14', '16', '20',
  '24', '28', '32', '36', '40', '44', '48', '52', '56', '60', '64', '72', '80', '96',
];
const SPACING_PREFIXES = [
  'p', 'px', 'py', 'pt', 'pr', 'pb', 'pl', 'ps', 'pe', 'm', 'mx', 'my', 'mt', 'mr', 'mb', 'ml', 'ms', 'me', 'gap', 'gap-x',
  'gap-y', 'space-x', 'space-y', 'top', 'right', 'bottom', 'left', 'inset', 'inset-x', 'inset-y', 'size', 'w', 'h',
  'min-w', 'min-h', 'max-w', 'max-h', 'basis',
];
const SIZE_KEYWORDS = ['auto', 'full', 'screen', 'min', 'max', 'fit', '1/2', '1/3', '2/3', '1/4', '3/4', 'dvh', 'svh', 'lvh'];

const COLOR_NAMES = [
  'slate', 'gray', 'zinc', 'neutral', 'stone', 'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal',
  'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose',
];
const SHADES = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'];
const COLOR_PREFIXES = ['text', 'bg', 'border', 'ring', 'fill', 'stroke', 'from', 'via', 'to', 'outline', 'divide', 'accent', 'decoration', 'caret'];
const COLOR_KEYWORDS = ['black', 'white', 'transparent', 'current', 'inherit'];

const STATIC_UTILITIES = (
  'block inline-block inline flex inline-flex grid inline-grid contents flow-root hidden table table-row table-cell ' +
  'static fixed absolute relative sticky visible invisible collapse isolate ' +
  'flex-row flex-row-reverse flex-col flex-col-reverse flex-wrap flex-nowrap flex-wrap-reverse flex-1 flex-auto flex-initial flex-none ' +
  'grow grow-0 shrink shrink-0 grid-cols-1 grid-cols-2 grid-cols-3 grid-cols-4 grid-cols-5 grid-cols-6 grid-cols-12 ' +
  'grid-rows-1 grid-rows-2 grid-rows-3 grid-rows-4 col-span-1 col-span-2 col-span-3 col-span-4 col-span-6 col-span-full ' +
  'row-span-1 row-span-2 row-span-3 row-span-full col-auto order-first order-last order-none ' +
  'items-start items-end items-center items-baseline items-stretch justify-start justify-end justify-center justify-between ' +
  'justify-around justify-evenly justify-items-center justify-self-auto content-center content-start content-end ' +
  'self-auto self-start self-end self-center self-stretch place-items-center place-content-center ' +
  'container mx-auto my-auto overflow-auto overflow-hidden overflow-scroll overflow-visible overflow-x-auto overflow-y-auto ' +
  'overflow-x-hidden overflow-y-hidden truncate text-ellipsis text-clip whitespace-nowrap whitespace-normal whitespace-pre ' +
  'whitespace-pre-wrap break-words break-all break-normal ' +
  'text-xs text-sm text-base text-lg text-xl text-2xl text-3xl text-4xl text-5xl text-6xl text-7xl text-8xl text-9xl ' +
  'text-left text-center text-right text-justify text-start text-end ' +
  'font-thin font-extralight font-light font-normal font-medium font-semibold font-bold font-extrabold font-black ' +
  'font-sans font-serif font-mono italic not-italic uppercase lowercase capitalize normal-case underline overline line-through no-underline ' +
  'leading-none leading-tight leading-snug leading-normal leading-relaxed leading-loose tracking-tighter tracking-tight tracking-normal tracking-wide tracking-wider tracking-widest ' +
  'rounded rounded-none rounded-sm rounded-md rounded-lg rounded-xl rounded-2xl rounded-3xl rounded-full rounded-t rounded-b rounded-l rounded-r ' +
  'border border-0 border-2 border-4 border-8 border-t border-b border-l border-r border-x border-y border-solid border-dashed border-dotted border-none ' +
  'shadow shadow-sm shadow-md shadow-lg shadow-xl shadow-2xl shadow-inner shadow-none ' +
  'ring ring-0 ring-1 ring-2 ring-4 ring-8 ring-inset outline outline-none outline-1 outline-2 outline-dashed ' +
  'opacity-0 opacity-5 opacity-10 opacity-20 opacity-25 opacity-30 opacity-40 opacity-50 opacity-60 opacity-70 opacity-75 opacity-80 opacity-90 opacity-95 opacity-100 ' +
  'cursor-pointer cursor-default cursor-not-allowed cursor-wait cursor-text cursor-move cursor-grab pointer-events-none pointer-events-auto select-none select-text select-all ' +
  'transition transition-all transition-colors transition-opacity transition-shadow transition-transform transition-none ' +
  'duration-75 duration-100 duration-150 duration-200 duration-300 duration-500 duration-700 duration-1000 ' +
  'ease-linear ease-in ease-out ease-in-out delay-75 delay-100 delay-150 delay-200 delay-300 delay-500 ' +
  'transform scale-0 scale-50 scale-75 scale-90 scale-95 scale-100 scale-105 scale-110 scale-125 scale-150 ' +
  'rotate-0 rotate-1 rotate-2 rotate-3 rotate-6 rotate-12 rotate-45 rotate-90 rotate-180 -rotate-45 -rotate-90 -rotate-180 ' +
  'translate-x-0 translate-y-0 -translate-x-1/2 -translate-y-1/2 translate-x-full -translate-x-full origin-center origin-top origin-bottom origin-left origin-right ' +
  'animate-none animate-spin animate-ping animate-pulse animate-bounce ' +
  'blur blur-none blur-sm blur-md blur-lg blur-xl backdrop-blur backdrop-blur-sm backdrop-blur-md backdrop-blur-lg ' +
  'brightness-50 brightness-75 brightness-100 brightness-125 brightness-150 grayscale grayscale-0 invert sepia ' +
  'object-contain object-cover object-fill object-none object-scale-down object-center aspect-auto aspect-square aspect-video ' +
  'z-0 z-10 z-20 z-30 z-40 z-50 z-auto sr-only not-sr-only list-none list-disc list-decimal list-inside list-outside ' +
  'bg-cover bg-contain bg-center bg-no-repeat bg-repeat bg-fixed bg-none bg-gradient-to-t bg-gradient-to-b bg-gradient-to-l bg-gradient-to-r bg-gradient-to-tr bg-gradient-to-br ' +
  'bg-linear-to-t bg-linear-to-b bg-linear-to-l bg-linear-to-r bg-linear-to-tr bg-linear-to-br ' +
  'appearance-none resize resize-none resize-x resize-y scroll-smooth snap-x snap-y snap-mandatory snap-start snap-center ' +
  'touch-none touch-pan-x touch-pan-y fill-current stroke-current stroke-0 stroke-1 stroke-2 table-auto table-fixed border-collapse border-separate ' +
  'divide-x divide-y divide-solid divide-dashed w-px h-px'
).split(' ');

const VARIANTS = [
  'hover:', 'focus:', 'focus-visible:', 'focus-within:', 'active:', 'visited:', 'disabled:', 'enabled:', 'checked:',
  'first:', 'last:', 'odd:', 'even:', 'only:', 'empty:', 'group-hover:', 'group-focus:', 'peer-checked:', 'peer-focus:',
  'sm:', 'md:', 'lg:', 'xl:', '2xl:', 'dark:', 'light:', 'print:', 'motion-safe:', 'motion-reduce:', 'placeholder:',
  'before:', 'after:', 'selection:', 'file:', 'marker:', 'open:', 'aria-selected:', 'aria-disabled:', 'data-[state=open]:',
  'rtl:', 'ltr:', 'supports-[display:grid]:', 'max-sm:', 'max-md:', 'max-lg:', 'has-[:checked]:', 'in-focus:', 'not-hover:',
];

let utilityNames: string[] | null = null;

/** Every utility class, built on first use. */
function tailwindUtilities(): string[] {
  if (utilityNames) {
    return utilityNames;
  }
  const names = new Set<string>(STATIC_UTILITIES);
  for (const prefix of SPACING_PREFIXES) {
    for (const value of SPACING) {
      names.add(`${prefix}-${value}`);
    }
    for (const value of SIZE_KEYWORDS) {
      names.add(`${prefix}-${value}`);
    }
  }
  for (const prefix of ['m', 'mx', 'my', 'mt', 'mr', 'mb', 'ml', 'top', 'left', 'inset']) {
    for (const value of SPACING.slice(1, 20)) {
      names.add(`-${prefix}-${value}`);
    }
  }
  for (const prefix of COLOR_PREFIXES) {
    for (const color of COLOR_KEYWORDS) {
      names.add(`${prefix}-${color}`);
    }
    for (const color of COLOR_NAMES) {
      for (const shade of SHADES) {
        names.add(`${prefix}-${color}-${shade}`);
      }
    }
  }
  utilityNames = [...names];
  return utilityNames;
}

/* ------------------------------------------------------------------ *
 * Candidates
 * ------------------------------------------------------------------ */

function candidate(label: string, origin: CompletionCandidate['origin'], data: Completion, boost = 0): CompletionCandidate {
  return { label, filter: prepare(label), origin, boost, data };
}

/** `display` → inserts `display: ` — unless a colon follows already. */
function propertyApply(name: string): Completion['apply'] {
  return (view, _completion, from, to) => {
    const next = view.state.sliceDoc(to, to + 1);
    const insert = next === ':' ? name : `${name}: `;
    view.dispatch({
      changes: { from, to, insert },
      selection: { anchor: from + insert.length },
      userEvent: 'input.complete',
    });
  };
}

/** `rgb()` → inserts `rgb()` with the cursor between the parentheses. */
function valueApply(value: string): Completion['apply'] | undefined {
  if (!value.endsWith('()')) {
    return undefined;
  }
  return (view, _completion, from, to) => {
    view.dispatch({
      changes: { from, to, insert: value },
      selection: { anchor: from + value.length - 1 },
      userEvent: 'input.complete',
    });
  };
}

const pools = new Map<string, CompletionCandidate[]>();

function cached(key: string, build: () => CompletionCandidate[]): CompletionCandidate[] {
  const hit = pools.get(key);
  if (hit) {
    return hit;
  }
  const pool = build();
  pools.set(key, pool);
  return pool;
}

function propertyPool(): CompletionCandidate[] {
  return cached('properties', () => PROPERTIES.map((name) =>
    candidate(name, 'builtin', { label: name, type: 'property', apply: propertyApply(name) })));
}

function atRulePool(tailwind: boolean): CompletionCandidate[] {
  return cached(tailwind ? 'at-tailwind' : 'at', () => {
    const names = tailwind ? [...AT_RULES, ...TAILWIND_AT_RULES] : AT_RULES;
    return names.map((name) => candidate(name, 'keyword', {
      label: name,
      type: 'keyword',
      detail: TAILWIND_AT_RULES.includes(name) ? 'Tailwind CSS' : '@-rule',
    }));
  });
}

function valuePool(property: string): CompletionCandidate[] {
  return cached(`values:${property}`, () => {
    const specific = VALUES_BY_PROPERTY[property] ?? (LENGTH_PROPERTIES.has(property) ? LENGTHS : []);
    const all = [...new Set([...specific, ...GLOBAL_VALUES])];
    return all.map((value, index) => candidate(value.replace(/\(\)$/, ''), 'constant', {
      label: value.endsWith('()') ? value.slice(0, -2) : value,
      displayLabel: value,
      type: value.endsWith('()') ? 'function' : 'constant',
      apply: valueApply(value),
    }, index < specific.length ? 2 : -2));
  });
}

function utilityPool(): CompletionCandidate[] {
  return cached('utilities', () => [
    ...tailwindUtilities().map((name) => candidate(name, 'builtin', { label: name, type: 'class', detail: 'Tailwind CSS' })),
    ...VARIANTS.map((name) => candidate(name, 'keyword', { label: name, type: 'keyword', detail: 'Tailwind CSS' }, -2)),
  ]);
}

function themeVariablePool(): CompletionCandidate[] {
  return cached('theme', () => TAILWIND_THEME_VARIABLES.map((name) =>
    candidate(name, 'builtin', { label: name, type: 'variable', detail: '@theme' })));
}

/* ------------------------------------------------------------------ *
 * Context
 * ------------------------------------------------------------------ */

const APPLY_CONTEXT = /@apply\s[^;{}]*$/;
const AT_RULE_CONTEXT = /@[\w-]*$/;
const VALUE_CONTEXT = /(?:^|[;{\s])([\w-]+)\s*:\s*[^;{}]*$/;
const CLASS_ATTRIBUTE_CONTEXT = /(?:\bclass|\bclassName|\bclass:list|\btw)\s*=\s*(?:\{\s*)?["'`{][^"'`]*$/;

/** What kind of stylesheet position the cursor is at, from the text before the word. */
export type StyleContext = 'at-rule' | 'apply' | 'value' | 'property';

export function styleContextBefore(lineBefore: string): StyleContext {
  if (APPLY_CONTEXT.test(lineBefore)) {
    return 'apply';
  }
  if (AT_RULE_CONTEXT.test(lineBefore)) {
    return 'at-rule';
  }
  return VALUE_CONTEXT.test(lineBefore) ? 'value' : 'property';
}

/** Whether the line ends inside the class attribute of an element. */
export function inClassAttribute(lineBefore: string): boolean {
  return CLASS_ATTRIBUTE_CONTEXT.test(lineBefore);
}

/**
 * The stylesheet candidates for the position before the cursor. The word
 * itself starts after `@`, so at-rule names carry no `@`.
 */
export function styleCandidates(lineBefore: string, tailwind: boolean, inside: boolean): CompletionCandidate[][] {
  const context = styleContextBefore(lineBefore);
  if (context === 'at-rule') {
    return [atRulePool(tailwind)];
  }
  // Properties, values and utilities only make sense within a rule.
  if (!inside) {
    return [];
  }
  if (context === 'apply') {
    return [utilityPool()];
  }
  if (context === 'value') {
    const property = VALUE_CONTEXT.exec(lineBefore)?.[1] ?? '';
    return [valuePool(property)];
  }
  return [propertyPool(), themeVariablePool()];
}

/**
 * Whether the position lies within a `{ … }` block: the nearest unmatched
 * opening brace in the text before it (a bounded window; comments are not
 * looked at).
 */
export function insideBlock(textBefore: string): boolean {
  let depth = 0;
  for (let index = textBefore.length - 1; index >= 0; index--) {
    const char = textBefore[index];
    if (char === '}') {
      depth++;
      continue;
    }
    if (char !== '{') {
      continue;
    }
    if (depth === 0) {
      return true;
    }
    depth--;
  }
  return false;
}

/** Tailwind utilities for the class attribute of markup — ranked below the server's own entries. */
export function classAttributeCandidates(): CompletionCandidate[][] {
  return [cached('class-attribute', () => utilityPool().map((entry) => ({ ...entry, boost: entry.boost - 6 })))];
}
