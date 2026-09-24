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
 * Tests the matcher and the ranking of the completion: typos, word starts,
 * edge cases, realistic candidate lists and the running time.
 */

import { matchText, prepare, Query, rawScore, score, NO_MATCH, matchRanges } from '@/core/completion/matcher';
import { rank, RankCache, lspBoost, proximityBonus, matchTier, type Candidate, type Origin } from '@/core/completion/ranking';
import { scanWords, wordRulesFor, languageCandidates } from '@/core/completion/words';
import {
  isMemberAccess, triggerBefore, leadInBefore, contextKind, isTypedContext, importScope, localityOf, listReusable,
} from '@/core/completion/context';
import { recordAccepted, recencySignal } from '@/core/completion/recent';
import { declaredTypeBefore, nameSuggestions } from '@/core/completion/naming';
import { ALL_ADDONS } from '@/addons';
import type { LanguageSpec } from '@/core/types';

let failures = 0;
function ok(condition: boolean, message: string) {
  if (condition) {
    console.log(`✓ ${message}`);
    return;
  }
  failures++;
  console.log(`✗ ${message}`);
}

/* ------------------------------------------------------------------ *
 * Realistic lists
 * ------------------------------------------------------------------ */

const VULKAN = [
  'VkSurfaceCapabilitiesKHR', 'VkSurfaceCapabilities2KHR', 'VkSurfaceFormatKHR', 'VkSurfaceKHR',
  'VkSwapchainKHR', 'VkSwapchainCreateInfoKHR', 'VkDisplayKHR', 'VkDisplayModeKHR', 'VkPresentModeKHR',
  'VkSurfaceTransformFlagsKHR', 'VkCompositeAlphaFlagsKHR', 'VkPhysicalDevice', 'VkPhysicalDeviceProperties',
  'VkDevice', 'VkDeviceCreateInfo', 'VkQueue', 'VkQueueFamilyProperties', 'VkInstance', 'VkInstanceCreateInfo',
  'VkApplicationInfo', 'VkImage', 'VkImageView', 'VkImageViewCreateInfo', 'VkFramebuffer', 'VkRenderPass',
  'VkRenderPassCreateInfo', 'VkPipeline', 'VkPipelineLayout', 'VkShaderModule', 'VkCommandBuffer',
  'VkCommandPool', 'VkSemaphore', 'VkFence', 'VkBuffer', 'VkDeviceMemory', 'VkExtent2D', 'VkFormat',
  'VkColorSpaceKHR', 'VkResult', 'VkAllocationCallbacks', 'VkDebugUtilsMessengerEXT', 'VkSampler',
  'vkCreateInstance', 'vkCreateDevice', 'vkGetPhysicalDeviceSurfaceCapabilitiesKHR',
  'vkGetPhysicalDeviceSurfaceFormatsKHR', 'vkGetPhysicalDeviceSurfacePresentModesKHR', 'vkCreateSwapchainKHR',
  'vkDestroySurfaceKHR', 'vkQueuePresentKHR', 'vkAcquireNextImageKHR', 'vkEnumeratePhysicalDevices',
  'VK_KHR_SURFACE_EXTENSION_NAME', 'VK_KHR_SWAPCHAIN_EXTENSION_NAME', 'VK_SUCCESS', 'VK_NULL_HANDLE',
  'surface_caps', 'surfaceCapabilities', 'swapchain', 'physicalDevice', 'getSurfaceCapabilities',
];

const DOM = [
  'document', 'documentElement', 'DocumentFragment', 'console', 'constructor', 'const', 'continue',
  'getElementById', 'getElementsByClassName', 'getElementsByTagName', 'getElementsByName',
  'querySelector', 'querySelectorAll', 'addEventListener', 'removeEventListener', 'dispatchEvent',
  'createElement', 'createTextNode', 'appendChild', 'removeChild', 'insertBefore', 'setAttribute',
  'getAttribute', 'classList', 'className', 'innerHTML', 'textContent', 'localStorage', 'sessionStorage',
  'window', 'navigator', 'location', 'history', 'fetch', 'Promise', 'setTimeout', 'setInterval',
  'clearTimeout', 'requestAnimationFrame', 'HTMLElement', 'HTMLInputElement', 'useState', 'useEffect',
  'useMemo', 'useRef', 'useCallback', 'useStore', 'userState', 'JSON', 'Object', 'Array', 'String',
  'encodeURIComponent', 'decodeURIComponent', 'parseInt', 'parseFloat', 'isNaN', 'undefined', 'null',
  'cosh', 'cos', 'consoleLog', 'dom', 'doc', 'docs',
];

const JAVA = [
  'System', 'String', 'StringBuilder', 'StringBuffer', 'Integer', 'println', 'print', 'printf',
  'PrintStream', 'PrintWriter', 'ArrayList', 'LinkedList', 'HashMap', 'HashSet', 'TreeMap', 'List',
  'Map', 'Set', 'Collections', 'Arrays', 'Optional', 'Stream', 'Collectors', 'toString', 'hashCode',
  'equals', 'length', 'charAt', 'substring', 'indexOf', 'isEmpty', 'valueOf', 'parseInt', 'getClass',
  'InputStreamReader', 'BufferedReader', 'IOException', 'RuntimeException', 'IllegalArgumentException',
  'NullPointerException', 'Thread', 'Runnable', 'Override', 'Deprecated', 'public', 'private',
  'protected', 'static', 'final', 'void', 'class', 'interface', 'extends', 'implements', 'return',
  'printStackTrace', 'println2', 'prntln',
];

const C = [
  'strlen', 'strnlen', 'strcpy', 'strncpy', 'strcmp', 'strncmp', 'strcat', 'strchr', 'strstr', 'strtok',
  'sprintf', 'snprintf', 'printf', 'fprintf', 'malloc', 'calloc', 'realloc', 'free', 'memcpy', 'memset',
  'memmove', 'size_t', 'uint32_t', 'uint8_t', 'int64_t', 'FILE', 'fopen', 'fclose', 'fread', 'fwrite',
  'struct', 'static', 'const', 'return', 'include', 'define', 'stderr', 'stdout', 'string',
];

function pool(labels: string[], origin: Origin = 'document'): Candidate<string>[] {
  return labels.map((label) => ({ label, filter: prepare(label), origin, boost: 0, data: label }));
}

function top(pattern: string, labels: string[], count = 3): string[] {
  return rank(pattern, [pool(labels)], {}, count).map((r) => r.candidate.label);
}

function expectTop(pattern: string, labels: string[], expected: string, count = 3) {
  const found = rank(pattern, [pool(labels)], {}, 150).map((r) => r.candidate.label);
  const position = found.indexOf(expected);
  ok(position >= 0 && position < count,
    `„${pattern}“ → ${expected} auf Platz ${position + 1 || '–'} (≤ ${count}): ${found.slice(0, 5).join(', ')}`);
}

/* ------------------------------------------------------------------ *
 * The matcher: the examples from the requirements
 * ------------------------------------------------------------------ */

console.log('— Matcher —');
const must: [string, string][] = [
  ['VkKHR', 'VkSurfaceCapabilitiesKHR'],
  ['VkSurfaceCapabilitesKHR', 'VkSurfaceCapabilitiesKHR'],
  ['VkSruface', 'VkSurfaceCapabilitiesKHR'],
  ['prnitln', 'println'],
  ['cosnole', 'console'],
  ['docuemnt', 'document'],
  ['getElemntById', 'getElementById'],
  ['usestate', 'useState'],
  ['strlen', 'strlen'],
  ['gSC', 'getSurfaceCapabilities'],
  ['sfc', 'surface_caps'],
  ['VkKHR', 'VkSurfaceKHR'],
  ['HTMLE', 'HTMLElement'],
  ['hie', 'HTMLInputElement'],
  ['u32', 'uint32_t'],
  ['$ref', '$refs'],
  ['_priv', '__private'],
  ['größe', 'Größenänderung'],
  ['straße', 'STRASSE_straße'],
];
for (const [pattern, text] of must) {
  const result = matchText(pattern, text);
  ok(Boolean(result), `„${pattern}“ findet ${text}${result ? ` (Wert ${result.score}, ${result.errors} Fehler)` : ''}`);
}

const mustNot: [string, string][] = [
  ['st', 'list'],
  ['xy', 'syntax'],
  ['ab', 'cab'],
  ['str', 'sXr'],
  ['cons', 'nosc'],
  ['console', 'close'],
  ['VkKHR', 'VkInstance'],
  ['prnitln', 'printf'],
  ['q', 'unique'],
];
for (const [pattern, text] of mustNot) {
  const result = matchText(pattern, text);
  ok(!result, `„${pattern}“ findet ${text} nicht${result ? ` (Wert ${result.score})` : ''}`);
}

// Highlighting
{
  const q = new Query('VkKHR');
  const ranges = matchRanges(q, prepare('VkSurfaceCapabilitiesKHR'));
  ok(JSON.stringify(ranges) === '[0,2,21,24]', `Bereiche VkKHR: ${JSON.stringify(ranges)}`);
  const typo = matchRanges(new Query('cosnole'), prepare('console'));
  ok(typo.length >= 2 && typo[0] === 0, `Bereiche cosnole: ${JSON.stringify(typo)}`);
  const gsc = matchRanges(new Query('gSC'), prepare('getSurfaceCapabilities'));
  ok(JSON.stringify(gsc) === '[0,1,3,4,10,11]', `Bereiche gSC: ${JSON.stringify(gsc)}`);
}

// Edge cases
{
  const empty = new Query('');
  ok(score(empty, prepare('anything')) === 0, 'Leere Eingabe passt auf alles mit Wert 0');
  ok(rawScore(new Query('a'), prepare('')) === NO_MATCH, 'Leerer Kandidat passt nicht');
  ok(Boolean(matchText('$', '$scope')), '„$“ findet $scope');
  ok(Boolean(matchText('_', '_internal')), '„_“ findet _internal');
  ok(Boolean(matchText('v2', 'vec2')), '„v2“ findet vec2 (Ziffernwechsel)');
  ok(Boolean(matchText('ext2d', 'VkExtent2D')), '„ext2d“ findet VkExtent2D');
  ok(Boolean(matchText('日本', '日本語テキスト')), 'Unicode-Präfix (日本)');
  ok(Boolean(matchText('ÄÖ', 'äöü')), 'Umlaute ohne Groß/Klein (ÄÖ → äöü)');
  const long = 'x'.repeat(300);
  ok(Boolean(matchText('xxx', long)), 'Sehr langer Kandidat (300 Zeichen) stürzt nicht ab');
  ok(!matchText('y'.repeat(80), long), 'Sehr lange Eingabe (80 Zeichen) stürzt nicht ab');
  ok(Boolean(matchText('İs', 'İstanbul')), 'Zeichen mit mehrteiliger Kleinschreibung (İ)');
}

/* ------------------------------------------------------------------ *
 * Ranking
 * ------------------------------------------------------------------ */

console.log('\n— Rangfolge —');
const mixed = [...VULKAN, ...DOM, ...JAVA, ...C];
expectTop('VkSurfaceCapabilitesKHR', mixed, 'VkSurfaceCapabilitiesKHR', 1);
expectTop('VkSruface', mixed, 'VkSurfaceKHR');
expectTop('VkSurfaceCap', mixed, 'VkSurfaceCapabilitiesKHR', 2);
expectTop('VkKHR', VULKAN, 'VkSurfaceCapabilitiesKHR', 12);
expectTop('prnitln', mixed, 'println');
expectTop('cosnole', mixed, 'console');
expectTop('docuemnt', mixed, 'document');
expectTop('getElemntById', mixed, 'getElementById', 1);
expectTop('usestate', mixed, 'useState', 1);
expectTop('strlen', mixed, 'strlen', 1);
expectTop('gSC', mixed, 'getSurfaceCapabilities');
expectTop('sfc', mixed, 'surface_caps');
expectTop('qsa', mixed, 'querySelectorAll');
expectTop('aEL', mixed, 'addEventListener', 1);
expectTop('con', mixed, 'console');
expectTop('Str', JAVA, 'String', 2);
expectTop('sb', JAVA, 'StringBuilder');
expectTop('npe', JAVA, 'NullPointerException', 1);
expectTop('doc', mixed, 'doc', 1);

{
  const two = top('st', mixed, 150);
  ok(!two.includes('list') && two.length < 40, `Kurze Eingabe „st“ bleibt überschaubar (${two.length} Treffer)`);
  const one = top('q', mixed, 150);
  ok(one.every((l) => /^q|Q|_q/.test(l) || /[a-z]Q/.test(l)), `„q“ nur an Wortanfängen: ${one.join(', ')}`);
}

// Proximity and recency pull candidates of equal worth upwards
{
  const labels = ['VkSurfaceKHR', 'VkSwapchainKHR', 'VkDisplayKHR', 'VkSurfaceCapabilitiesKHR', 'VkPresentModeKHR'];
  const near = rank('VkKHR', [pool(labels)], { proximity: (l) => (l === 'VkSurfaceCapabilitiesKHR' ? proximityBonus(40) : 0) }, 3);
  ok(near.slice(0, 3).some((r) => r.candidate.label === 'VkSurfaceCapabilitiesKHR'),
    `Nähe: VkSurfaceCapabilitiesKHR unter den ersten 3 (${near.map((r) => r.candidate.label).join(', ')})`);
  const recent = rank('pri', [pool(['print', 'printf', 'println', 'private', 'primitive'])], { recency: (l) => (l === 'println' ? 12 : 0) }, 5);
  ok(recent[0]?.candidate.label === 'println', `Recency: println zuerst (${recent.map((r) => r.candidate.label).join(', ')})`);
}

// Duplicates: the LSP wins, the proximity of the document word stays
{
  const lspPool: Candidate<string>[] = [{ label: 'console', filter: prepare('console'), origin: 'lsp', boost: lspBoost(0, 1, false, false), data: 'lsp' }];
  const docPool = pool(['console', 'consoleLog'], 'document');
  const merged = rank('cons', [lspPool, docPool], { proximity: (l) => (l === 'console' ? 12 : 0) }, 10);
  const consoles = merged.filter((r) => r.candidate.label === 'console');
  ok(consoles.length === 1 && consoles[0].candidate.data === 'lsp', 'Duplikat console: ein Eintrag, LSP-Daten behalten');
  // The server's order
  const items = ['zeta', 'alpha', 'beta'].map((label, i): Candidate<string> => ({
    label, filter: prepare(label), origin: 'lsp', boost: lspBoost(i, 3, false, false), data: label,
  }));
  const order = rank('', [items], {}, 10).map((r) => r.candidate.label);
  ok(order.join() === 'zeta,alpha,beta', `Leere Eingabe folgt sortText des Servers: ${order.join(', ')}`);
  const pre = items.map((c) => (c.label === 'beta' ? { ...c, boost: lspBoost(2, 3, true, false) } : c));
  ok(rank('', [pre], {}, 10)[0].candidate.label === 'beta', 'preselect steht oben');
  // Member access hides the keywords
  const kw = pool(['return', 'result'], 'keyword');
  const member = rank('re', [kw, pool(['result'], 'document')], { memberAccess: true }, 10).map((r) => r.candidate.label);
  ok(member.join() === 'result', `Memberzugriff ohne Schlüsselwörter: ${member.join(', ')}`);
}

// Language data and document words
{
  const specs: LanguageSpec[] = ALL_ADDONS.flatMap((a) => a.languages ?? []);
  const java = specs.find((s) => s.id === 'java');
  ok(Boolean(java && languageCandidates(java).length > 10), `Java-Sprachwörter: ${java ? languageCandidates(java).length : 0}`);
  const text = 'const surfaceCaps = 1\nfunction draw() {\n  surfaceCaps + other\n  sur\n}\n';
  const cursor = text.indexOf('sur\n') + 3;
  const scan = scanWords(text, { origin: 'document', rules: wordRulesFor('javascript'), cursor, exclude: text.indexOf('sur\n') });
  ok(scan.pool.some((c) => c.label === 'surfaceCaps') && !scan.pool.some((c) => c.label === 'sur'),
    `Dokumentwörter ohne Wort am Cursor: ${scan.pool.map((c) => c.label).join(', ')}`);
  ok((scan.nearest.get('other') ?? 1e9) < (scan.nearest.get('function') ?? 0), 'Nähe: „other“ näher als „function“');
  const css = scanWords('.a { --color-brand: red; margin-left: 0 }', { origin: 'document', rules: wordRulesFor('css') });
  ok(css.pool.some((c) => c.label === '--color-brand') && css.pool.some((c) => c.label === 'margin-left'), 'CSS-Wörter mit Bindestrich');
}

// Triggers and member access
{
  const triggers = ['.', ':', '>', '<', '/', '"', '@', ' ', '('];
  const cases: [string, string | null][] = [
    ['foo.', '.'], ['std::', ':'], ['a:', null], ['ptr->', '>'], ['a >', null], ['a > b', null],
    ['#include <', '<'], ['a <', null], ['Vec<', '<'], ['import x from "./lib/', '/'], ['a / ', null],
    ['// ', null], ['x = 1.', null], ['range..', null], ['foo(', null], ['@', '@'], ['a ', null],
  ];
  const wrong = cases.filter(([before, expected]) => triggerBefore(before, triggers) !== expected);
  ok(!wrong.length, `Auslöser (${cases.length} Fälle)${wrong.length ? `: falsch ${wrong.map(([b]) => JSON.stringify(b)).join(', ')}` : ''}`);
  ok(triggerBefore('foo.', ['(']) === null, 'Nur Auslöser des Servers zählen');
  const member: [string, boolean][] = [['foo.', true], ['a->', true], ['std::', true], ['x = 1.', false], ['a..', false], ['foo ', false]];
  const wrongMember = member.filter(([b, e]) => isMemberAccess(b) !== e);
  ok(!wrongMember.length, `Memberzugriff (${member.length} Fälle)${wrongMember.length ? `: falsch ${wrongMember.map(([b]) => b).join(', ')}` : ''}`);
}

/* ------------------------------------------------------------------ *
 * Running time
 * ------------------------------------------------------------------ */

console.log('\n— Laufzeit —');
{
  const parts = ['get', 'set', 'Surface', 'Capabilities', 'Element', 'By', 'Id', 'Device', 'Physical', 'Queue',
    'Family', 'Index', 'create', 'destroy', 'Buffer', 'Image', 'View', 'Info', 'KHR', 'EXT', 'Swap', 'chain',
    'Render', 'Pass', 'Frame', 'Pipeline', 'Layout', 'Shader', 'Module', 'Command', 'Pool', 'Memory', 'Allocate',
    'update', 'handle', 'Event', 'Listener', 'Node', 'Tree', 'Map', 'List', 'String', 'Builder', 'Reader', 'Writer',
    'user', 'State', 'Store', 'use', 'Effect', 'Context', 'Provider', 'Config', 'Manager', 'Service', 'Factory',
    'Helper', 'Util', 'Array', 'Object', 'Value', 'Key', 'Entry', 'Item', 'Count', 'Size', 'Length', 'Offset'];
  let seed = 7;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const labels: string[] = [];
  for (let k = 0; k < 10_000; k++) {
    const count = 2 + Math.floor(rnd() * 4);
    let word = '';
    for (let p = 0; p < count; p++) {
      word += parts[Math.floor(rnd() * parts.length)];
    }
    if (rnd() < 0.2) {
      word = word.replace(/[A-Z]/g, (ch) => `_${ch.toLowerCase()}`);
    }
    labels.push(rnd() < 0.3 ? word[0].toUpperCase() + word.slice(1) : word);
  }
  const big = pool(labels);
  const patterns = ['getSurfa', 'getSrufa', 'VkKHR', 'createIn', 'usestate', 'handleEv', 'xqzwv', 'bufImgV'];

  // Warming up for the JIT
  for (let r = 0; r < 5; r++) {
    for (const p of patterns) {
      rank(p, [big], {}, 150);
    }
  }

  const times: string[] = [];
  let worst = 0;
  for (const p of patterns) {
    const runs = 20;
    const start = performance.now();
    let hits = 0;
    for (let r = 0; r < runs; r++) {
      hits = rank(p, [big], {}, 150).length;
    }
    const ms = (performance.now() - start) / runs;
    worst = Math.max(worst, ms);
    times.push(`${p} ${ms.toFixed(2)} ms (${hits})`);
  }
  console.log(`  ${times.join('\n  ')}`);
  ok(worst <= 8, `10 000 Kandidaten, schlechtester Fall ${worst.toFixed(2)} ms (Ziel ≤ 5 ms, Toleranz 8 ms)`);

  // Without a cap (as in the editor): every match sorted, even on empty input
  {
    const all = rank('', [big], {});
    ok(all.length === new Set(labels).size, `leere Eingabe liefert alle ${new Set(labels).size} Kandidaten (${all.length})`);
    for (let r = 0; r < 5; r++) {
      for (const p of ['', 'g', ...patterns]) {
        rank(p, [big], {});
      }
    }
    let worstAll = 0;
    for (const p of ['', 'g', ...patterns]) {
      const start = performance.now();
      for (let r = 0; r < 10; r++) {
        rank(p, [big], {});
      }
      worstAll = Math.max(worstAll, (performance.now() - start) / 10);
    }
    ok(worstAll <= 16, `10 000 Kandidaten ohne Deckel, schlechtester Fall ${worstAll.toFixed(2)} ms (Toleranz 16 ms)`);
  }

  // The matcher alone (without sorting or merging)
  {
    const q = new Query('getSrufa');
    for (let r = 0; r < 10; r++) {
      for (const c of big) {
        rawScore(q, c.filter);
      }
    }
    const start = performance.now();
    const runs = 20;
    for (let r = 0; r < runs; r++) {
      for (const c of big) {
        rawScore(q, c.filter);
      }
    }
    const ms = (performance.now() - start) / runs;
    ok(ms <= 5, `Matcher allein, 10 000 × „getSrufa“: ${ms.toFixed(2)} ms`);
  }

  // Typing on, with the cache
  {
    const cache = new RankCache();
    const word = 'getSurfaceCap';
    const start = performance.now();
    for (let k = 1; k <= word.length; k++) {
      rank(word.slice(0, k), [big], {}, 150, cache);
    }
    const ms = performance.now() - start;
    const cold = performance.now();
    for (let k = 1; k <= word.length; k++) {
      rank(word.slice(0, k), [big], {}, 150);
    }
    const coldMs = performance.now() - cold;
    ok(ms < coldMs, `Weitertippen „${word}“ (13 Anschläge): ${ms.toFixed(1)} ms mit Cache, ${coldMs.toFixed(1)} ms ohne`);
    const same = rank(word, [big], {}, 20, cache).map((r) => r.candidate.label).join();
    const fresh = rank(word, [big], {}, 20).map((r) => r.candidate.label).join();
    ok(same === fresh, 'Cache liefert dieselben Ergebnisse');
  }
}


/* ------------------------------------------------------------------ *
 * Tiers, identity, imports, contexts
 * ------------------------------------------------------------------ */

console.log('\n— Tiers and identity —');

interface Spec {
  label: string;
  origin?: Origin;
  identity?: string;
  deprecated?: boolean;
  locality?: number;
  boost?: number;
  kind?: 'variable' | 'type';
}

function cands(specs: Spec[]): Candidate<string>[] {
  return specs.map((sp) => ({
    label: sp.label, filter: prepare(sp.label), origin: sp.origin ?? 'lsp', boost: sp.boost ?? 0,
    identity: sp.identity, deprecated: sp.deprecated, locality: sp.locality, kind: sp.kind, data: sp.identity ?? sp.label,
  }));
}

function order(pattern: string, specs: Spec[], signals = {}): string[] {
  return rank(pattern, [cands(specs)], signals).map((r) => `${r.candidate.label}${r.candidate.identity ? `@${r.candidate.identity}` : ''}`);
}

// 1. Same label, different packages
{
  const list = order('List', [
    { label: 'List', identity: 'java.util' }, { label: 'List', identity: 'java.awt' },
    { label: 'List', identity: 'java.util' },
  ]);
  ok(list.length === 2, `List aus java.util und java.awt bleiben zwei Einträge (${list.join(', ')})`);
  const many = order('Date', [
    { label: 'Date', identity: 'java.util' }, { label: 'Date', identity: 'java.sql' },
    { label: 'Date', identity: 'java.time' }, { label: 'Date', identity: 'java.util' },
  ]);
  ok(many.length === 3, `drei Date-Pakete, echtes Duplikat verschmolzen (${many.length})`);
  const keep = rank('List', [cands([{ label: 'List', identity: 'a' }, { label: 'List', identity: 'b' }])]);
  ok(new Set(keep.map((r) => r.candidate.data)).size === 2, 'jeder Eintrag behält seine eigenen Daten');
  const withWord = rank('List', [cands([{ label: 'List', identity: 'java.util' }, { label: 'List', identity: 'java.awt' }]),
    cands([{ label: 'List', origin: 'document' }])]);
  ok(withWord.length === 2 && withWord.every((r) => r.candidate.origin === 'lsp'), 'Dokumentwort gleichen Namens verschmilzt in die Server-Einträge');
  const withSnippet = rank('for', [cands([{ label: 'for', identity: 'x' }]), cands([{ label: 'for', origin: 'snippet' }])]);
  ok(withSnippet.length === 1 && withSnippet[0].candidate.origin === 'lsp', 'Snippet und LSP-Eintrag gleichen Namens verschmelzen, LSP gewinnt');
  const wordOnly = rank('foo', [cands([{ label: 'foo', origin: 'document' }]), cands([{ label: 'foo', origin: 'tab' }])]);
  ok(wordOnly.length === 1, 'Dokument- und Tab-Wort gleichen Namens: ein Eintrag');
  const overloads = order('add', [
    { label: 'add', identity: '\0(int)\x002' }, { label: 'add', identity: '\0(int, E)\x002' },
  ]);
  ok(overloads.length === 2, 'Überladungen mit anderer Signatur bleiben getrennt');
  const kinds = order('Foo', [{ label: 'Foo', identity: '\0\x007' }, { label: 'Foo', identity: '\0\x006' }]);
  ok(kinds.length === 2, 'Klasse und Variable gleichen Namens bleiben getrennt');
}

// 2. Match tiers
{
  const q = (p: string, t: string) => matchTier(new Query(p), prepare(t), matchText(p, t)?.errors ?? 0);
  ok(q('Arr', 'ArrayList') === 0, 'Stufe 0: Präfix mit Groß/Klein');
  ok(q('arr', 'ArrayList') === 1, 'Stufe 1: Präfix ohne Groß/Klein');
  ok(q('NPE', 'NullPointerException') === 2, 'Stufe 2: Camel-Hump NPE');
  ok(q('ArLi', 'ArrayList') === 2, 'Stufe 2: Camel-Hump ArLi');
  ok(q('gSC', 'getSurfaceCapabilities') === 2, 'Stufe 2: gSC');
  ok(q('gsf', 'get_some_foo') === 2, 'Stufe 2: Unterstrich-Wortgrenzen gsf');
  ok(q('list', 'ArrayList') === 3 || q('list', 'ArrayList') === 2, `Stufe ≥ 2: „list“ mitten im Wort (${q('list', 'ArrayList')})`);
  ok(q('cosnole', 'console') === 4, 'Stufe 4: Tippfehler');
  ok(q('', 'x') === 0, 'leere Eingabe: Stufe 0');
  const all = order('arr', [
    { label: 'tarrget' }, { label: 'ArrayList' }, { label: 'arr' }, { label: 'arraycopy' }, { label: 'aRxRx' },
  ]);
  ok(all[0] === 'arr' || all[0] === 'arraycopy', `Präfix mit gleicher Schreibung vor Groß/Klein-Präfix (${all.join(', ')})`);
  ok(all.indexOf('ArrayList') > all.indexOf('arraycopy'), 'Groß/Klein-Präfix nach exaktem Präfix');
}

// 3. Tier ordering matrix: quality first, whatever else is attached
{
  const strong: Spec = { label: 'NullPointerException', origin: 'document' };
  const good = order('Nu', [
    { label: 'NullPointerException', boost: 0 }, { label: 'aNuller', boost: 30, locality: 1 }, { label: 'xNyzu', boost: 30 },
  ]);
  ok(good[0] === 'NullPointerException', `Präfix schlägt Substring trotz Server-Vorsprung (${good.join(', ')})`);
  const rec = order('Nu', [{ label: 'NullPointerException' }, { label: 'bigNumber' }], { recency: (l: string) => (l === 'bigNumber' ? 40 : 0), proximity: () => 12 });
  ok(rec[0] === 'NullPointerException', 'Recency und Nähe heben keinen schwächeren Treffer über einen Präfix');
  const hump = order('NPE', [{ label: 'NullPointerException' }, { label: 'NPEHelper', boost: -5 }, { label: 'nope' }]);
  ok(hump[0] === 'NPEHelper' && hump.indexOf('NullPointerException') === 1, `NPE: exakter Präfix vor Hump (${hump.join(', ')})`);
  ok(order('NPE', [{ label: 'NullPointerException' }])[0] === 'NullPointerException', 'NPE → NullPointerException');
  ok(order('ArLi', [{ label: 'ArrayList' }, { label: 'ArrayDeque' }, { label: 'LinkedList' }])[0] === 'ArrayList', 'ArLi → ArrayList zuerst');
  ok(order('hM', [{ label: 'hashMap', origin: 'document' }, { label: 'hMac', origin: 'document' }])[0] === 'hMac', 'hM: Präfix vor Hump');
  void strong;
  // Deprecated last within a tier, not across tiers
  const dep = order('Dat', [{ label: 'Date', deprecated: true, boost: 20 }, { label: 'DateTime' }, { label: 'Dates', boost: -3 }]);
  ok(dep[dep.length - 1] === 'Date', `Deprecated am Ende der Stufe (${dep.join(', ')})`);
  const depTier = order('date', [{ label: 'date', deprecated: true }, { label: 'Datestamp' }]);
  ok(depTier[0] === 'date', 'Deprecated mit besserer Stufe steht vor schlechterer Stufe');
  const depAll = order('', [{ label: 'a', deprecated: true, boost: 40 }, { label: 'b' }, { label: 'c', deprecated: true }, { label: 'd', boost: -8 }]);
  ok(depAll.slice(0, 2).every((l) => l === 'b' || l === 'd'), `leere Eingabe: Deprecated hinten (${depAll.join(', ')})`);
  // Fit: preselect, server order
  const fit = order('get', [{ label: 'getA', boost: 0 }, { label: 'getB', boost: 10 }, { label: 'getC', boost: 4 }]);
  ok(fit.join() === 'getB,getC,getA', `Server-Reihenfolge/Preselect in der Stufe (${fit.join()})`);
  // Locality
  const loc = order('Li', [
    { label: 'List', identity: 'java.awt', locality: -1, boost: 5 }, { label: 'List', identity: 'java.util', locality: 1, boost: 5 },
    { label: 'LinkedList', identity: 'java.util', locality: 1, boost: 5 },
  ]);
  ok(loc[0] === 'List@java.util' && loc.indexOf('List@java.awt') > loc.indexOf('List@java.util'), `importiert vor nicht importiert (${loc.join(', ')})`);
  const locRec = order('Li', [
    { label: 'List', identity: 'java.awt', locality: -1 }, { label: 'List', identity: 'java.util', locality: 1 },
  ], { recency: (l: string) => (l === 'List' ? 5 : 0) });
  ok(locRec[0] === 'List@java.util', 'Locality steht vor Recency');
  // Recency decides within same fit and locality
  const recIn = order('pri', [{ label: 'print' }, { label: 'println' }, { label: 'printf' }], { recency: (l: string) => (l === 'printf' ? 9 : 0) });
  ok(recIn[0] === 'printf', 'Recency innerhalb gleicher Stufe und Passung');
  // Loose tiers: match quality before source
  const loose = order('sfc', [{ label: 'xsfxxc', boost: 40, origin: 'lsp' }, { label: 'surface_caps', origin: 'document' }]);
  ok(loose[0] === 'surface_caps', `schwacher Treffer gewinnt nicht durch Herkunft (${loose.join(', ')})`);
  const typo = order('cosnole', [{ label: 'cxxsxnxle', boost: 30 }, { label: 'console' }]);
  ok(typo[0] === 'console', 'Tippfehler: bester Treffer zuerst');
  // Prefix beats typo whatever the boost
  const pvt = order('pri', [{ label: 'prnit', boost: 40 }, { label: 'print' }]);
  ok(pvt[0] === 'print', 'Präfix vor Tippfehler-Treffer');
  // Names / own variables still lead within the tier
  const own = order('user', [{ label: 'UserService', kind: 'type' }, { label: 'userService', kind: 'variable', boost: 14 }]);
  ok(own[0] === 'userService', 'eigene Variable vor Typ bei Kleinschreibung');
  // Alphabetical + length tie break
  const tie = order('a', [{ label: 'abc' }, { label: 'ab' }, { label: 'aa' }, { label: 'ac' }]);
  ok(tie.join() === 'aa,ab,ac,abc', `Gleichstand: kürzer, dann alphabetisch (${tie.join()})`);
}

// 4. Case handling
{
  ok(order('str', [{ label: 'String' }, { label: 'str' }])[0] === 'str', 'kleingeschrieben: exakte Schreibung zuerst');
  ok(order('Str', [{ label: 'str' }, { label: 'String' }])[0] === 'String', 'Großschreibung: String zuerst');
  ok(order('STR', [{ label: 'String' }, { label: 'STRICT' }])[0] === 'STRICT', 'STR → STRICT (exakter Präfix)');
  ok(order('nullp', [{ label: 'NullPointerException' }]).length === 1, 'nullp findet NullPointerException');
  ok(order('ÖFF', [{ label: 'Öffnen' }, { label: 'öffentlich' }]).length === 2, 'Umlaute in Großschreibung');
}

// 5. Unicode identifiers
{
  ok(order('größ', [{ label: 'Größe' }, { label: 'größer' }])[0] === 'größer', 'Unicode: größ → größer zuerst');
  ok(order('日本', [{ label: '日本語' }, { label: 'x日本' }])[0] === '日本語', 'Unicode: CJK-Präfix');
  ok(order('şeh', [{ label: 'şehir' }, { label: 'Şehir' }]).length === 2, 'Unicode: türkische Buchstaben');
  ok(order('naïve', [{ label: 'naïveté' }]).length === 1, 'Unicode: Akzente');
  ok(order('π', [{ label: 'π2' }, { label: 'pi' }])[0] === 'π2', 'Unicode: griechisch');
}

// 6. Postfix on member access, keywords hidden
{
  const list = rank('for', [cands([{ label: 'for', identity: 'postfix' }, { label: 'format' }]), cands([{ label: 'for', origin: 'snippet' }, { label: 'forEach', origin: 'keyword' }])],
    { memberAccess: true });
  const labels = list.map((r) => r.candidate.label);
  ok(labels.includes('for') && labels.includes('format'), `Postfix-Eintrag des Servers bleibt bei Memberzugriff (${labels.join(', ')})`);
  ok(!list.some((r) => r.candidate.origin === 'snippet' || r.candidate.origin === 'keyword'), 'lokale Snippets und Schlüsselwörter bei Memberzugriff verborgen');
  const dot = rank('list.for', [[{ label: 'for', filter: prepare('list.for'), origin: 'lsp', boost: 0, identity: 'p', data: 'x' }]], { memberAccess: true });
  ok(dot.length === 1, 'Filtertext mit Empfänger (list.for) passt auf list.for');
  const at = rank('@Over', [[{ label: 'Override', filter: prepare('@Override'), origin: 'lsp', boost: 0, data: 'x' }]]);
  ok(at.length === 1 && at[0].tier === 0, '@Over passt auf @Override als Präfix');
}

// 7. Import scope, locality
{
  const scope = importScope('package com.acme.app;\n\nimport java.util.List;\nimport java.io.*;\nimport static org.junit.Assert.assertEquals;\n\nclass A {}');
  ok(scope.packageName === 'com.acme.app', 'Package erkannt');
  ok(localityOf(scope, 'List', 'java.util') === 1, 'importierte Klasse: 1');
  ok(localityOf(scope, 'File', 'java.io') === 1, 'Wildcard-Import: 1');
  ok(localityOf(scope, 'List', 'java.awt') === -1, 'nicht importiert: -1');
  ok(localityOf(scope, 'String', 'java.lang') === 1, 'java.lang: 1');
  ok(localityOf(scope, 'Helper', 'com.acme.app') === 1, 'gleiches Package: 1');
  ok(localityOf(scope, 'List', 'java.util.List') === 1, 'voll qualifizierter Detailtext');
  ok(localityOf(scope, 'x', 'int') === 0, 'kein Package: 0');
  ok(localityOf(scope, 'x', undefined) === 0, 'ohne Detail: 0');
  ok(localityOf(scope, 'assertEquals', 'org.junit.Assert') === 1, 'statischer Import (Klasse.*) über Name');
}

// 8. Triggers and contexts
{
  const cases: [string, string | null][] = [
    ['    new ', 'new'], ['x = new ', 'new'], ['import ', 'import'], ['import static ', 'import'], ['    @', 'annotation'],
    ['class A extends ', 'extends'], ['class A implements ', 'extends'], ['void f() throws ', 'throws'],
    ['renew ', null], ['foo.@', null], ['x = 1', null], ['newValue ', null], ['a @', 'annotation'], ['important ', null],
  ];
  const wrong = cases.filter(([b, e]) => leadInBefore(b) !== e);
  ok(!wrong.length, `Auslöser-Kontexte (${cases.length})${wrong.length ? `: falsch ${wrong.map(([b]) => JSON.stringify(b)).join(', ')}` : ''}`);
  ok(contextKind('list.') === 'member' && contextKind('    ') === 'statement' && contextKind('x = ') === 'expression', 'Kontextart');
  ok(isTypedContext('member') && isTypedContext('new') && !isTypedContext('statement'), 'typisierte Kontexte');
}

// 9. Server lists: reuse rules
{
  ok(listReusable({ isIncomplete: false, pattern: 'Li' }, 'Lis'), 'vollständige Liste, Muster verlängert: wiederverwenden');
  ok(listReusable({ isIncomplete: false, pattern: '' }, 'abc'), 'vollständige Liste ab leerem Muster: wiederverwenden');
  ok(!listReusable({ isIncomplete: false, pattern: 'Lis' }, 'Li'), 'Backspace: neu anfragen');
  ok(!listReusable({ isIncomplete: false, pattern: 'Lis' }, 'Lix'), 'nicht verlängertes Muster: neu anfragen');
  ok(!listReusable({ isIncomplete: true, pattern: 'Li' }, 'Lis'), 'unvollständige Liste: neu anfragen');
  ok(listReusable({ isIncomplete: false, pattern: 'li' }, 'LIS'), 'Groß/Klein beim Verlängern egal');
  // a stale list stays correctly filtered by the local matcher
  const stale = cands([{ label: 'List' }, { label: 'ListIterator' }, { label: 'Lis' }]);
  ok(order('Lisx', []).length === 0 && rank('Li', [stale]).length === 3, 'veraltete Liste wird lokal weiter korrekt gefiltert');
  ok(rank('Lis', [stale]).every((r) => r.tier === 0), 'Filter nach Backspace: Stufen stimmen');
}

// 10. Recency per context
{
  recordAccepted('java', 'get', 'member');
  recordAccepted('java', 'get', 'member');
  recordAccepted('java', 'print', 'statement');
  const member = recencySignal('java', 'member');
  const stmt = recencySignal('java', 'statement');
  ok(member('get') > stmt('get'), 'Recency: get zählt am Memberzugriff mehr als am Anweisungsanfang');
  ok(stmt('get') > 0, 'Recency: anderer Kontext zählt noch ein wenig');
  ok(stmt('print') > member('print'), 'Recency: print am Anweisungsanfang');
  ok(recencySignal('java', 'new')('never') === 0, 'Recency: unbekanntes Label 0');
  ok(recencySignal('rust', 'member')('get') === 0, 'Recency: andere Sprache getrennt');
  const boosted = order('g', [{ label: 'getA' }, { label: 'get' }, { label: 'getB' }], { recency: recencySignal('java', 'member') });
  ok(boosted[0] === 'get', 'Recency hebt get im Memberkontext');
}

// 11. Huge lists
{
  const labels: string[] = [];
  let seed = 11;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const syll = ['Array', 'List', 'Map', 'Node', 'Stream', 'Buffer', 'Reader', 'Writer', 'Event', 'Handler', 'Factory', 'Null', 'Pointer', 'Exception'];
  for (let k = 0; k < 100_000; k++) {
    let word = '';
    for (let p = 0, n = 2 + Math.floor(rnd() * 3); p < n; p++) {
      word += syll[Math.floor(rnd() * syll.length)];
    }
    labels.push(word + (k % 7 === 0 ? String(k) : ''));
  }
  const big: Candidate<string>[] = labels.map((label, k) => ({
    label, filter: prepare(label), origin: 'lsp', boost: 0, identity: `pkg${k % 40}`, data: label,
  }));
  for (const p of ['Arr', 'NPE', 'ArLi', '']) {
    rank(p, [big], {}, 150);
  }
  let worst = 0;
  for (const p of ['Arr', 'NPE', 'ArLi', 'nullp', 'HandlrFactory']) {
    const start = performance.now();
    const runs = 5;
    for (let r = 0; r < runs; r++) {
      rank(p, [big], {}, 150);
    }
    worst = Math.max(worst, (performance.now() - start) / runs);
  }
  ok(worst <= 120, `100 000 Kandidaten mit Identität, schlechtester Fall ${worst.toFixed(1)} ms (Budget 120 ms)`);
  const whole = rank('', [big], {});
  ok(whole.length > 50_000, `100 000 Kandidaten ohne Muster: ${whole.length} verschiedene Einträge (Identität)`);
  const cache = new RankCache();
  const start = performance.now();
  for (const p of ['A', 'Ar', 'Arr', 'Arra', 'Array']) {
    rank(p, [big], {}, 150, cache);
  }
  ok(performance.now() - start < 600, `Weitertippen mit Cache auf 100 000: ${(performance.now() - start).toFixed(0)} ms`);
  const top3 = rank('Arr', [big], {}, 5).map((r) => r.tier);
  ok(top3.every((tr) => tr === 0), 'große Liste: oben nur Präfix-Treffer');
}

/* ------------------------------------------------------------------ *
 * Variable names
 * ------------------------------------------------------------------ */

{
  const names = (type: string) => nameSuggestions(type).join(',');
  ok(nameSuggestions('UserService')[0] === 'userService', 'Name: UserService → userService zuerst');
  ok(nameSuggestions('UserService')[1] === 'service', 'Name: letztes Wort als zweiter Vorschlag');
  ok(nameSuggestions('URLConnection')[0] === 'urlConnection', 'Name: Akronym URLConnection → urlConnection');
  ok(nameSuggestions('Class')[0] === 'clazz', 'Name: Class → clazz');
  ok(names('List<User>').startsWith('list,users'), `Name: List<User> → ${names('List<User>')}`);
  ok(nameSuggestions('User[]')[0] === 'users', 'Name: User[] → users');
  ok(nameSuggestions('Map<String, User>').includes('stringToUser'), 'Name: Map<String, User> → stringToUser');
  ok(nameSuggestions('java.util.List<Entry>').includes('entries'), 'Name: entry → entries');
  ok(nameSuggestions('int').length === 0, 'Name: primitive → nichts');

  ok(declaredTypeBefore('    UserService ', 'java') === 'UserService', 'Kontext: Deklaration am Zeilenanfang');
  ok(declaredTypeBefore('    private final List<User> ', 'java') === 'List<User>', 'Kontext: nach Modifikatoren, Generics');
  ok(declaredTypeBefore('  void run(int a, Foo ', 'java') === 'Foo', 'Kontext: Parameter');
  ok(declaredTypeBefore('    @Inject UserService ', 'java') === 'UserService', 'Kontext: nach Annotation');
  ok(declaredTypeBefore('    return Foo ', 'java') === null, 'Kontext: return Foo → keiner');
  ok(declaredTypeBefore('    new Foo ', 'java') === null, 'Kontext: new Foo → keiner');
  ok(declaredTypeBefore('    // the Foo ', 'java') === null, 'Kontext: Kommentar → keiner');
  ok(declaredTypeBefore('    Foo ', 'kotlin') === null, 'Kontext: Kotlin schreibt den Namen vor dem Typ');

  const cand = (label: string, kind?: 'variable' | 'type'): Candidate => ({ label, filter: prepare(label), origin: 'lsp', boost: 0, kind, data: null });
  const pool = [cand('UserService', 'type'), cand('userService', 'variable'), cand('userSession', undefined)];
  ok(rank('user', [pool])[0].candidate.label === 'userService', 'Ranking: kleingeschrieben → Variable vor Typ');
  const upper = rank('User', [pool]);
  ok(upper[0].candidate.label === 'UserService', 'Ranking: Großschreibung → Typ bleibt vorn');
}

console.log(`\n${failures} error(s)`);
process.exit(failures ? 1 : 0);
