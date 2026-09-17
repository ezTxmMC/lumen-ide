/**
 * Tests the matcher and the ranking of the completion: typos, word starts,
 * edge cases, realistic candidate lists and the running time.
 */

import { matchText, prepare, Query, rawScore, score, NO_MATCH, matchRanges } from '@/core/completion/matcher'
import { rank, RankCache, lspBoost, proximityBonus, type Candidate, type Origin } from '@/core/completion/ranking'
import { scanWords, wordRulesFor, languageCandidates } from '@/core/completion/words'
import { isMemberAccess, triggerBefore } from '@/core/completion/context'
import { ALL_ADDONS } from '@/addons'
import type { LanguageSpec } from '@/core/types'

let failures = 0
function ok(condition: boolean, message: string) {
  if (condition) {
    console.log(`✓ ${message}`)
    return
  }
  failures++
  console.log(`✗ ${message}`)
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
]

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
]

const JAVA = [
  'System', 'String', 'StringBuilder', 'StringBuffer', 'Integer', 'println', 'print', 'printf',
  'PrintStream', 'PrintWriter', 'ArrayList', 'LinkedList', 'HashMap', 'HashSet', 'TreeMap', 'List',
  'Map', 'Set', 'Collections', 'Arrays', 'Optional', 'Stream', 'Collectors', 'toString', 'hashCode',
  'equals', 'length', 'charAt', 'substring', 'indexOf', 'isEmpty', 'valueOf', 'parseInt', 'getClass',
  'InputStreamReader', 'BufferedReader', 'IOException', 'RuntimeException', 'IllegalArgumentException',
  'NullPointerException', 'Thread', 'Runnable', 'Override', 'Deprecated', 'public', 'private',
  'protected', 'static', 'final', 'void', 'class', 'interface', 'extends', 'implements', 'return',
  'printStackTrace', 'println2', 'prntln',
]

const C = [
  'strlen', 'strnlen', 'strcpy', 'strncpy', 'strcmp', 'strncmp', 'strcat', 'strchr', 'strstr', 'strtok',
  'sprintf', 'snprintf', 'printf', 'fprintf', 'malloc', 'calloc', 'realloc', 'free', 'memcpy', 'memset',
  'memmove', 'size_t', 'uint32_t', 'uint8_t', 'int64_t', 'FILE', 'fopen', 'fclose', 'fread', 'fwrite',
  'struct', 'static', 'const', 'return', 'include', 'define', 'stderr', 'stdout', 'string',
]

function pool(labels: string[], origin: Origin = 'document'): Candidate<string>[] {
  return labels.map((label) => ({ label, filter: prepare(label), origin, boost: 0, data: label }))
}

function top(pattern: string, labels: string[], count = 3): string[] {
  return rank(pattern, [pool(labels)], {}, count).map((r) => r.candidate.label)
}

function expectTop(pattern: string, labels: string[], expected: string, count = 3) {
  const found = rank(pattern, [pool(labels)], {}, 150).map((r) => r.candidate.label)
  const position = found.indexOf(expected)
  ok(position >= 0 && position < count,
    `„${pattern}“ → ${expected} auf Platz ${position + 1 || '–'} (≤ ${count}): ${found.slice(0, 5).join(', ')}`)
}

/* ------------------------------------------------------------------ *
 * The matcher: the examples from the requirements
 * ------------------------------------------------------------------ */

console.log('— Matcher —')
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
]
for (const [pattern, text] of must) {
  const result = matchText(pattern, text)
  ok(Boolean(result), `„${pattern}“ findet ${text}${result ? ` (Wert ${result.score}, ${result.errors} Fehler)` : ''}`)
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
]
for (const [pattern, text] of mustNot) {
  const result = matchText(pattern, text)
  ok(!result, `„${pattern}“ findet ${text} nicht${result ? ` (Wert ${result.score})` : ''}`)
}

// Highlighting
{
  const q = new Query('VkKHR')
  const ranges = matchRanges(q, prepare('VkSurfaceCapabilitiesKHR'))
  ok(JSON.stringify(ranges) === '[0,2,21,24]', `Bereiche VkKHR: ${JSON.stringify(ranges)}`)
  const typo = matchRanges(new Query('cosnole'), prepare('console'))
  ok(typo.length >= 2 && typo[0] === 0, `Bereiche cosnole: ${JSON.stringify(typo)}`)
  const gsc = matchRanges(new Query('gSC'), prepare('getSurfaceCapabilities'))
  ok(JSON.stringify(gsc) === '[0,1,3,4,10,11]', `Bereiche gSC: ${JSON.stringify(gsc)}`)
}

// Edge cases
{
  const empty = new Query('')
  ok(score(empty, prepare('anything')) === 0, 'Leere Eingabe passt auf alles mit Wert 0')
  ok(rawScore(new Query('a'), prepare('')) === NO_MATCH, 'Leerer Kandidat passt nicht')
  ok(Boolean(matchText('$', '$scope')), '„$“ findet $scope')
  ok(Boolean(matchText('_', '_internal')), '„_“ findet _internal')
  ok(Boolean(matchText('v2', 'vec2')), '„v2“ findet vec2 (Ziffernwechsel)')
  ok(Boolean(matchText('ext2d', 'VkExtent2D')), '„ext2d“ findet VkExtent2D')
  ok(Boolean(matchText('日本', '日本語テキスト')), 'Unicode-Präfix (日本)')
  ok(Boolean(matchText('ÄÖ', 'äöü')), 'Umlaute ohne Groß/Klein (ÄÖ → äöü)')
  const long = 'x'.repeat(300)
  ok(Boolean(matchText('xxx', long)), 'Sehr langer Kandidat (300 Zeichen) stürzt nicht ab')
  ok(!matchText('y'.repeat(80), long), 'Sehr lange Eingabe (80 Zeichen) stürzt nicht ab')
  ok(Boolean(matchText('İs', 'İstanbul')), 'Zeichen mit mehrteiliger Kleinschreibung (İ)')
}

/* ------------------------------------------------------------------ *
 * Ranking
 * ------------------------------------------------------------------ */

console.log('\n— Rangfolge —')
const mixed = [...VULKAN, ...DOM, ...JAVA, ...C]
expectTop('VkSurfaceCapabilitesKHR', mixed, 'VkSurfaceCapabilitiesKHR', 1)
expectTop('VkSruface', mixed, 'VkSurfaceKHR')
expectTop('VkSurfaceCap', mixed, 'VkSurfaceCapabilitiesKHR', 2)
expectTop('VkKHR', VULKAN, 'VkSurfaceCapabilitiesKHR', 12)
expectTop('prnitln', mixed, 'println')
expectTop('cosnole', mixed, 'console')
expectTop('docuemnt', mixed, 'document')
expectTop('getElemntById', mixed, 'getElementById', 1)
expectTop('usestate', mixed, 'useState', 1)
expectTop('strlen', mixed, 'strlen', 1)
expectTop('gSC', mixed, 'getSurfaceCapabilities')
expectTop('sfc', mixed, 'surface_caps')
expectTop('qsa', mixed, 'querySelectorAll')
expectTop('aEL', mixed, 'addEventListener', 1)
expectTop('con', mixed, 'console')
expectTop('Str', JAVA, 'String', 2)
expectTop('sb', JAVA, 'StringBuilder')
expectTop('npe', JAVA, 'NullPointerException', 1)
expectTop('doc', mixed, 'doc', 1)

{
  const two = top('st', mixed, 150)
  ok(!two.includes('list') && two.length < 40, `Kurze Eingabe „st“ bleibt überschaubar (${two.length} Treffer)`)
  const one = top('q', mixed, 150)
  ok(one.every((l) => /^q|Q|_q/.test(l) || /[a-z]Q/.test(l)), `„q“ nur an Wortanfängen: ${one.join(', ')}`)
}

// Proximity and recency pull candidates of equal worth upwards
{
  const labels = ['VkSurfaceKHR', 'VkSwapchainKHR', 'VkDisplayKHR', 'VkSurfaceCapabilitiesKHR', 'VkPresentModeKHR']
  const near = rank('VkKHR', [pool(labels)], { proximity: (l) => (l === 'VkSurfaceCapabilitiesKHR' ? proximityBonus(40) : 0) }, 3)
  ok(near.slice(0, 3).some((r) => r.candidate.label === 'VkSurfaceCapabilitiesKHR'),
    `Nähe: VkSurfaceCapabilitiesKHR unter den ersten 3 (${near.map((r) => r.candidate.label).join(', ')})`)
  const recent = rank('pri', [pool(['print', 'printf', 'println', 'private', 'primitive'])], { recency: (l) => (l === 'println' ? 12 : 0) }, 5)
  ok(recent[0]?.candidate.label === 'println', `Recency: println zuerst (${recent.map((r) => r.candidate.label).join(', ')})`)
}

// Duplicates: the LSP wins, the proximity of the document word stays
{
  const lspPool: Candidate<string>[] = [{ label: 'console', filter: prepare('console'), origin: 'lsp', boost: lspBoost(0, 1, false, false), data: 'lsp' }]
  const docPool = pool(['console', 'consoleLog'], 'document')
  const merged = rank('cons', [lspPool, docPool], { proximity: (l) => (l === 'console' ? 12 : 0) }, 10)
  const consoles = merged.filter((r) => r.candidate.label === 'console')
  ok(consoles.length === 1 && consoles[0].candidate.data === 'lsp', 'Duplikat console: ein Eintrag, LSP-Daten behalten')
  // The server's order
  const items = ['zeta', 'alpha', 'beta'].map((label, i): Candidate<string> => ({
    label, filter: prepare(label), origin: 'lsp', boost: lspBoost(i, 3, false, false), data: label,
  }))
  const order = rank('', [items], {}, 10).map((r) => r.candidate.label)
  ok(order.join() === 'zeta,alpha,beta', `Leere Eingabe folgt sortText des Servers: ${order.join(', ')}`)
  const pre = items.map((c) => (c.label === 'beta' ? { ...c, boost: lspBoost(2, 3, true, false) } : c))
  ok(rank('', [pre], {}, 10)[0].candidate.label === 'beta', 'preselect steht oben')
  // Member access hides the keywords
  const kw = pool(['return', 'result'], 'keyword')
  const member = rank('re', [kw, pool(['result'], 'document')], { memberAccess: true }, 10).map((r) => r.candidate.label)
  ok(member.join() === 'result', `Memberzugriff ohne Schlüsselwörter: ${member.join(', ')}`)
}

// Language data and document words
{
  const specs: LanguageSpec[] = ALL_ADDONS.flatMap((a) => a.languages ?? [])
  const java = specs.find((s) => s.id === 'java')
  ok(Boolean(java && languageCandidates(java).length > 10), `Java-Sprachwörter: ${java ? languageCandidates(java).length : 0}`)
  const text = 'const surfaceCaps = 1\nfunction draw() {\n  surfaceCaps + other\n  sur\n}\n'
  const cursor = text.indexOf('sur\n') + 3
  const scan = scanWords(text, { origin: 'document', rules: wordRulesFor('javascript'), cursor, exclude: text.indexOf('sur\n') })
  ok(scan.pool.some((c) => c.label === 'surfaceCaps') && !scan.pool.some((c) => c.label === 'sur'),
    `Dokumentwörter ohne Wort am Cursor: ${scan.pool.map((c) => c.label).join(', ')}`)
  ok((scan.nearest.get('other') ?? 1e9) < (scan.nearest.get('function') ?? 0), 'Nähe: „other“ näher als „function“')
  const css = scanWords('.a { --color-brand: red; margin-left: 0 }', { origin: 'document', rules: wordRulesFor('css') })
  ok(css.pool.some((c) => c.label === '--color-brand') && css.pool.some((c) => c.label === 'margin-left'), 'CSS-Wörter mit Bindestrich')
}

// Triggers and member access
{
  const triggers = ['.', ':', '>', '<', '/', '"', '@', ' ', '(']
  const cases: [string, string | null][] = [
    ['foo.', '.'], ['std::', ':'], ['a:', null], ['ptr->', '>'], ['a >', null], ['a > b', null],
    ['#include <', '<'], ['a <', null], ['Vec<', '<'], ['import x from "./lib/', '/'], ['a / ', null],
    ['// ', null], ['x = 1.', null], ['range..', null], ['foo(', null], ['@', '@'], ['a ', null],
  ]
  const wrong = cases.filter(([before, expected]) => triggerBefore(before, triggers) !== expected)
  ok(!wrong.length, `Auslöser (${cases.length} Fälle)${wrong.length ? `: falsch ${wrong.map(([b]) => JSON.stringify(b)).join(', ')}` : ''}`)
  ok(triggerBefore('foo.', ['(']) === null, 'Nur Auslöser des Servers zählen')
  const member: [string, boolean][] = [['foo.', true], ['a->', true], ['std::', true], ['x = 1.', false], ['a..', false], ['foo ', false]]
  const wrongMember = member.filter(([b, e]) => isMemberAccess(b) !== e)
  ok(!wrongMember.length, `Memberzugriff (${member.length} Fälle)${wrongMember.length ? `: falsch ${wrongMember.map(([b]) => b).join(', ')}` : ''}`)
}

/* ------------------------------------------------------------------ *
 * Running time
 * ------------------------------------------------------------------ */

console.log('\n— Laufzeit —')
{
  const parts = ['get', 'set', 'Surface', 'Capabilities', 'Element', 'By', 'Id', 'Device', 'Physical', 'Queue',
    'Family', 'Index', 'create', 'destroy', 'Buffer', 'Image', 'View', 'Info', 'KHR', 'EXT', 'Swap', 'chain',
    'Render', 'Pass', 'Frame', 'Pipeline', 'Layout', 'Shader', 'Module', 'Command', 'Pool', 'Memory', 'Allocate',
    'update', 'handle', 'Event', 'Listener', 'Node', 'Tree', 'Map', 'List', 'String', 'Builder', 'Reader', 'Writer',
    'user', 'State', 'Store', 'use', 'Effect', 'Context', 'Provider', 'Config', 'Manager', 'Service', 'Factory',
    'Helper', 'Util', 'Array', 'Object', 'Value', 'Key', 'Entry', 'Item', 'Count', 'Size', 'Length', 'Offset']
  let seed = 7
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed / 0x7fffffff
  }
  const labels: string[] = []
  for (let k = 0; k < 10_000; k++) {
    const count = 2 + Math.floor(rnd() * 4)
    let word = ''
    for (let p = 0; p < count; p++) word += parts[Math.floor(rnd() * parts.length)]
    if (rnd() < 0.2) word = word.replace(/[A-Z]/g, (ch) => `_${ch.toLowerCase()}`)
    labels.push(rnd() < 0.3 ? word[0].toUpperCase() + word.slice(1) : word)
  }
  const big = pool(labels)
  const patterns = ['getSurfa', 'getSrufa', 'VkKHR', 'createIn', 'usestate', 'handleEv', 'xqzwv', 'bufImgV']

  // Warming up for the JIT
  for (let r = 0; r < 5; r++) for (const p of patterns) rank(p, [big], {}, 150)

  const times: string[] = []
  let worst = 0
  for (const p of patterns) {
    const runs = 20
    const start = performance.now()
    let hits = 0
    for (let r = 0; r < runs; r++) hits = rank(p, [big], {}, 150).length
    const ms = (performance.now() - start) / runs
    worst = Math.max(worst, ms)
    times.push(`${p} ${ms.toFixed(2)} ms (${hits})`)
  }
  console.log(`  ${times.join('\n  ')}`)
  ok(worst <= 8, `10 000 Kandidaten, schlechtester Fall ${worst.toFixed(2)} ms (Ziel ≤ 5 ms, Toleranz 8 ms)`)

  // Without a cap (as in the editor): every match sorted, even on empty input
  {
    const all = rank('', [big], {})
    ok(all.length === new Set(labels).size, `leere Eingabe liefert alle ${new Set(labels).size} Kandidaten (${all.length})`)
    for (let r = 0; r < 5; r++) for (const p of ['', 'g', ...patterns]) rank(p, [big], {})
    let worstAll = 0
    for (const p of ['', 'g', ...patterns]) {
      const start = performance.now()
      for (let r = 0; r < 10; r++) rank(p, [big], {})
      worstAll = Math.max(worstAll, (performance.now() - start) / 10)
    }
    ok(worstAll <= 16, `10 000 Kandidaten ohne Deckel, schlechtester Fall ${worstAll.toFixed(2)} ms (Toleranz 16 ms)`)
  }

  // The matcher alone (without sorting or merging)
  {
    const q = new Query('getSrufa')
    for (let r = 0; r < 10; r++) for (const c of big) rawScore(q, c.filter)
    const start = performance.now()
    const runs = 20
    for (let r = 0; r < runs; r++) for (const c of big) rawScore(q, c.filter)
    const ms = (performance.now() - start) / runs
    ok(ms <= 5, `Matcher allein, 10 000 × „getSrufa“: ${ms.toFixed(2)} ms`)
  }

  // Typing on, with the cache
  {
    const cache = new RankCache()
    const word = 'getSurfaceCap'
    const start = performance.now()
    for (let k = 1; k <= word.length; k++) rank(word.slice(0, k), [big], {}, 150, cache)
    const ms = performance.now() - start
    const cold = performance.now()
    for (let k = 1; k <= word.length; k++) rank(word.slice(0, k), [big], {}, 150)
    const coldMs = performance.now() - cold
    ok(ms < coldMs, `Weitertippen „${word}“ (13 Anschläge): ${ms.toFixed(1)} ms mit Cache, ${coldMs.toFixed(1)} ms ohne`)
    const same = rank(word, [big], {}, 20, cache).map((r) => r.candidate.label).join()
    const fresh = rank(word, [big], {}, 20).map((r) => r.candidate.label).join()
    ok(same === fresh, 'Cache liefert dieselben Ergebnisse')
  }
}

console.log(`\n${failures} error(s)`)
process.exit(failures ? 1 : 0)
