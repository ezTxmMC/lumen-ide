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
 * What an extension's program code (`code.main`, `code.renderer`) must not do.
 *
 * `code.main` runs in Electron's main process with the full rights of the
 * user, so these rules are about reaching beyond the extension: other
 * people's files, raw network destinations, running what was just downloaded.
 * Using `child_process` is ordinary for a language extension and only noted;
 * it turns serious through the *company it keeps* — a download beside it, a
 * secret store, a hard-coded address.
 *
 * Rules run on the code with comments blanked out. The command rules reach the
 * extension separately, through its string literals.
 */

import { extensionRule, isPublicAddress } from './define.js';

const JS = ['js'];
/** Also applied to the strings an extension ships as data: settings, command defaults, add-on graphs. */
const JS_AND_DATA = ['js', 'html', 'data'];

const IPV4 = String.raw`(\d{1,3}(?:\.\d{1,3}){3})`;
/** Public resolvers that programs ping to see whether the network is up. */
const CONNECTIVITY_CHECKS = new Set(['1.1.1.1', '1.0.0.1', '8.8.8.8', '8.8.4.4', '9.9.9.9', '208.67.222.222']);
const publicAddress = (match) => isPublicAddress(match[1]) && !CONNECTIVITY_CHECKS.has(match[1]);
const SENSITIVE_PLACES = String.raw`(?:["'\`~\/\\]\.ssh\b|authorized_keys|\.(?:bashrc|zshrc|bash_profile|zprofile|profile)\b|["'\`]\/etc\/|LaunchAgents|LaunchDaemons|Start Menu\\Programs\\Startup|\\Startup\b|\.config\/autostart|\/etc\/cron|systemd\/(?:system|user)\/)`;
const CREDENTIAL_STORES = String.raw`(?:\.ssh[\/\\]+(?:id_|known_hosts)|\.aws[\/\\]+credentials|Login Data|Cookies\b|cookies\.sqlite|logins\.json|key[34]\.db|wallet\.dat|\.gnupg|\.docker[\/\\]config\.json|\.kube[\/\\]config|\.git-credentials|\.netrc|Keychains?\b)`;

export const EXTENSION_RULES = [
  extensionRule('SEC-EXT-001', 'info', 'privilege', 'Uses child_process',
    'The extension can start programs on the user\'s machine; that is normal for tooling but worth knowing.',
    /\b(?:require\s*\(\s*["'](?:node:)?child_process["']\s*\)|from\s+["'](?:node:)?child_process["']|import\s*\(\s*["'](?:node:)?child_process["']\s*\))/, JS),
  extensionRule('SEC-EXT-002', 'low', 'privilege', 'Runs system commands synchronously',
    'Synchronous command execution (`execSync`, `spawnSync`) blocks the main process and runs whatever string it is given.',
    /(?<![\w$])(?:execSync|execFileSync|spawnSync)\s*\(/, JS),
  extensionRule('SEC-EXT-003', 'medium', 'obfuscation', 'Calls eval',
    '`eval` compiles text into code at run time, which can hide what the extension does.',
    /(?<![\w$.])eval\s*\(/, JS),
  extensionRule('SEC-EXT-004', 'medium', 'obfuscation', 'Builds code with new Function',
    '`new Function(…)` compiles text into code at run time, which can hide what the extension does.',
    /\bnew\s+Function\s*\((?!\s*(?:["']return\s+this|""|''))/, JS),
  extensionRule('SEC-EXT-005', 'medium', 'obfuscation', 'Runs code through the vm module',
    '`vm.runInContext` and friends execute text as code outside the normal module system.',
    /\b(?:vm\.)?runIn(?:This|New)?Context\s*\(|\bvm\.(?:Script|compileFunction)\b|\bnew\s+vm\.Script\b/, JS),
  extensionRule('SEC-EXT-006', 'medium', 'privilege', 'Uses process.binding',
    '`process.binding` reaches Node\'s internal modules, which a normal extension never needs.',
    /\bprocess\.binding\s*\(\s*(?!["'](?:buffer|util|uv|constants)["'])/, JS),
  extensionRule('SEC-EXT-007', 'low', 'privilege', 'Opens a computed path or URL with the system',
    '`shell.openPath` or `openExternal` with a non-literal argument can be steered to launch anything.',
    /\bshell\.(?:openPath|openExternal|showItemInFolder)\s*\(\s*(?!["'`])[^)\s]/, JS),
  extensionRule('SEC-EXT-008', 'high', 'persistence', 'Writes to a sensitive location',
    'Writing to `~/.ssh`, shell startup files, `/etc`, LaunchAgents or the Startup folder installs persistence or opens the machine up.',
    new RegExp(String.raw`(?:writeFile\w*|appendFile\w*|createWriteStream|copyFile\w*|rename\w*|symlink\w*)\s*\([^;]{0,200}${SENSITIVE_PLACES}`), JS),
  extensionRule('SEC-EXT-009', 'high', 'exfiltration', 'Reads credential stores',
    'Reading SSH keys, cloud credentials, browser cookies or wallet files is far outside what an editor extension needs.',
    new RegExp(String.raw`(?:readFile\w*|createReadStream|copyFile\w*|readdir\w*|openSync)\s*\([^;]{0,200}${CREDENTIAL_STORES}`), JS),
  extensionRule('SEC-EXT-010', 'medium', 'exfiltration', 'Builds a path into a credential store',
    'Assembling `~/.ssh/id_rsa` or `~/.aws/credentials` from path pieces is how code avoids a plain-text match.',
    /["'`]\.(?:ssh|aws|gnupg)["'`]\s*,\s*["'`](?:id_\w*|credentials|secring\.gpg)/, JS),
  extensionRule('SEC-EXT-011', 'high', 'exfiltration', 'Network request to a hard-coded IP address',
    'Talking to a raw public IP address instead of a named service is typical of command-and-control and data theft.',
    new RegExp(String.raw`["'\`](?:https?|wss?|ftp|tcp):\/\/(?:[^\s"'\`@\/]*@)?${IPV4}(?=[:\/"'\`?#])`), JS_AND_DATA, { confirm: publicAddress }),
  extensionRule('SEC-EXT-012', 'high', 'exfiltration', 'Socket connection to a hard-coded IP address',
    'Opening a socket to a raw public IP address instead of a named service is typical of command-and-control.',
    new RegExp(String.raw`(?:\.connect|createConnection|\.send|\.bind)\s*\([^)]{0,80}["'\`]${IPV4}["'\`]`), JS, { confirm: publicAddress }),
  extensionRule('SEC-EXT-013', 'high', 'exfiltration', 'Known data-drop or tracking host',
    'Webhooks, paste sites, tunnels and IP loggers are where stolen data is delivered to attackers.',
    /\b(?:pastebin\.com\/raw|hastebin\.com\/raw|discord(?:app)?\.com\/api\/webhooks\/|api\.telegram\.org\/bot|ngrok(?:-free)?\.(?:io|app|dev)|[\w-]+\.trycloudflare\.com|transfer\.sh|webhook\.site|requestbin\.(?:com|net)|[\w-]+\.pipedream\.net|grabify\.link|iplogger\.(?:org|com|ru)|2no\.co|blasze\.com|leakix\.net|[\w-]+\.oast\.(?:pro|live|site|online|fun|me)|burpcollaborator\.net|interact\.sh)/i,
    JS_AND_DATA),
  extensionRule('SEC-EXT-014', 'high', 'download-exec', 'Makes a file executable and runs it near a download',
    'A download, a `chmod` to an executable mode and a process launch in one place is a dropper.',
    /\bchmod(?:Sync)?\s*\([^)]{0,100}(?:0o7[0-7]{2}|0x1ed|0x1ff|\b493\b|\b511\b|["']\s*7[0-7]{2}["'])/, JS,
    { confirm: (_match, line) => /\b(?:fetch|https?\.get|download|axios|XMLHttpRequest|got)\b/i.test(line) && /\b(?:exec|spawn|execFile|execSync|child_process)\b/.test(line) }),
  extensionRule('SEC-EXT-015', 'high', 'download-exec', 'Evaluates the result of a network request',
    'Fetching text and handing it to `eval` or `new Function` executes whatever the server answers.',
    /(?<![\w$.])(?:fetch|axios\.get|got)\s*\([^)]{0,200}\)[^;]{0,200}?\b(?:eval|new\s+Function|vm\.run\w+)\s*\(/, JS),
  extensionRule('SEC-EXT-016', 'high', 'download-exec', 'Imports code from a URL',
    'A dynamic `import()` or `require()` of an `http:` or `data:` address loads code that is not part of what was reviewed.',
    /(?:\bimport\s*\(|\brequire\s*\()\s*["'`](?:https?:|data:|blob:)/, JS),
  extensionRule('SEC-EXT-017', 'medium', 'exfiltration', 'Serialises the whole environment',
    '`JSON.stringify(process.env)` captures every variable, secrets included, usually in order to send them somewhere.',
    /\bJSON\.stringify\s*\(\s*process\.env\b/, JS),
  extensionRule('SEC-EXT-018', 'medium', 'exfiltration', 'Collects user and network identity next to a network call',
    'Reading the user name and network interfaces and sending them out fingerprints the machine.',
    /\bnetworkInterfaces\s*\(/, JS,
    { confirm: (_match, line) => /\buserInfo\s*\(/.test(line) && /\b(?:fetch|https?\.request|XMLHttpRequest|WebSocket|net\.connect|dgram)\b/.test(line) }),
  extensionRule('SEC-EXT-019', 'low', 'exfiltration', 'Reads the clipboard',
    'Reading the clipboard can capture passwords and keys the user copied elsewhere.',
    /\bclipboardy\b|\bclipboard\.read(?:Text|Image)?\s*\(|\bnavigator\.clipboard\.read(?:Text)?\s*\(/, JS),
  extensionRule('SEC-EXT-020', 'high', 'malware', 'Keylogger or input-capture library',
    'Global keyboard and mouse hooks (`iohook`, `robotjs`, `uiohook-napi` …) record everything the user types.',
    /(?:\brequire\s*\(|\bfrom\s*|\bimport\s*\()\s*["'](?:iohook|robotjs|uiohook-napi|node-global-key-listener|node-keylogger|keylogger|node-key-sender|@nut-tree(?:-fork)?\/nut-js)["']/, JS),
  extensionRule('SEC-EXT-021', 'critical', 'cryptominer', 'In-browser or embedded cryptominer',
    'Coinhive, CryptoLoot and similar scripts use the user\'s CPU to mine cryptocurrency.',
    /\b(?:coinhive|coin-hive|authedmine|cryptoloot|coinimp|webminepool|deepminer|minero\.cc|ppoi\.org|webmr\.js|cryptonight\.wasm)\b/i, JS_AND_DATA),
  extensionRule('SEC-EXT-022', 'high', 'download-exec', 'Runs a command taken from the network',
    'Passing a fetched response to `exec` or `spawn` lets a server decide what runs on the machine.',
    /(?<![\w$.])(?:exec|execSync|spawn|spawnSync|execFile)\s*\(\s*(?:await\s+)?(?:fetch\s*\(|[\w$.]+\.text\s*\(\s*\))/, JS),
];
