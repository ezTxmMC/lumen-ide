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
 * Code that arrives from the network and runs at once, reverse shells, and the
 * rules the command scanner itself raises for payloads it had to decode.
 *
 * `curl … | jq` is not a download-and-execute; `curl … | sh` is. The pipe
 * target decides.
 */

import { commandRule } from './define.js';

/** An interpreter that executes what it is fed on standard input. */
const INTERPRETER = String.raw`(?:\S*\/)?(?:(?:ba|z|da|k|c|fi|a)?sh|python[\d.]*|perl|ruby|node(?:js)?|php|pwsh|powershell(?:\.exe)?)`;
const SUDO = String.raw`(?:(?:sudo|doas)(?:\s+-\S+)*\s+)?`;
const LOCAL_HOST = /^(?:localhost|127\.|0\.0\.0\.0|\[?::1|\$|\{)/i;

export const REMOTE_RULES = [
  commandRule('SEC-CMD-019', 'high', 'download-exec', 'Download piped into an interpreter',
    'Piping `curl` or `wget` output into a shell or interpreter runs whatever the server sends, unseen.',
    new RegExp(String.raw`(?<![\w.-])(?:curl|wget)\b[^|;]*\|\s*${SUDO}${INTERPRETER}(?=\s|$|[;&|)])`),
    { hint: String.raw`\b(?:curl|wget)\b` }),
  commandRule('SEC-CMD-020', 'high', 'download-exec', 'Shell run on a downloaded script via process substitution',
    '`bash <(curl …)` executes a remote script as it downloads, with no chance to read it.',
    /(?<![\w.-])(?:(?:ba|z|da|k)?sh|source|\.)\s+<\(\s*(?:curl|wget)\b/,
    { hint: String.raw`<\(\s*(?:curl|wget)` }),
  commandRule('SEC-CMD-021', 'high', 'download-exec', 'Shell evaluates a downloaded command substitution',
    '`sh -c "$(curl …)"` and `eval "$(curl …)"` execute remote text as shell code.',
    /(?:(?<![\w.-])eval|(?<![\w.-])(?:ba|z|da|k)?sh\s+(?:-\w+\s+)*-c)\s+["']?(?:\$\(|`)\s*(?:curl|wget)\b/,
    { hint: String.raw`\b(?:curl|wget)\b` }),
  commandRule('SEC-CMD-022', 'high', 'download-exec', 'PowerShell download piped into Invoke-Expression',
    '`iwr … | iex` runs a script downloaded from the web in the current PowerShell session.',
    /(?<![\w.-])(?:iwr|irm|Invoke-WebRequest|Invoke-RestMethod|curl|wget)\b[^|;]*\|\s*(?:iex|Invoke-Expression)\b/i,
    { hint: String.raw`\b(?:iex|Invoke-Expression)\b` }),
  commandRule('SEC-CMD-023', 'high', 'download-exec', 'Invoke-Expression on a download',
    '`iex (iwr …)` or `iex (New-Object Net.WebClient).DownloadString(…)` executes remote code.',
    /(?<![\w.-])(?:iex|Invoke-Expression)\b[^;|]*\b(?:iwr|irm|Invoke-WebRequest|Invoke-RestMethod|DownloadString|Net\.WebClient|WebClient)\b/i,
    { hint: String.raw`\b(?:iex|Invoke-Expression)\b` }),
  commandRule('SEC-CMD-024', 'high', 'download-exec', 'WebClient download piped into Invoke-Expression',
    'A `Net.WebClient` download that is piped to `iex` executes remote code.',
    /\bNet\.WebClient\b[^;]*\.Download(?:String|Data)\s*\([^)]*\)[^;]*\|\s*(?:iex|Invoke-Expression)\b/i,
    { hint: String.raw`\bNet\.WebClient\b` }),
  commandRule('SEC-CMD-025', 'medium', 'download-exec', 'File downloaded and started in one command',
    '`DownloadFile(…)` followed by `Start-Process` runs a binary the moment it arrives.',
    /\.DownloadFile\s*\([^)]*\)[^\n]{0,120}(?:Start-Process|Invoke-Item|\bsaps\b)/i,
    { hint: String.raw`\bDownloadFile\b` }),
  commandRule('SEC-CMD-026', 'high', 'obfuscation', 'PowerShell runs an encoded command',
    '`-EncodedCommand` hides what PowerShell executes inside Base64; legitimate scripts have no need for it.',
    /(?<![\w.-])(?:powershell|pwsh)(?:\.exe)?\b[^|;]*\s-(?:e|ec|en|enc|enco|encod|encode|encoded|encodedc|encodedco|encodedcom|encodedcomm|encodedcomma|encodedcomman|encodedcommand)\s+["']?[A-Za-z0-9+/=]{12,}/i,
    { hint: String.raw`\b(?:powershell|pwsh)\b` }),
  commandRule('SEC-CMD-027', 'high', 'download-exec', 'certutil used as a downloader',
    '`certutil -urlcache -f` downloads a file from a URL — a living-off-the-land trick to bypass download controls.',
    /(?<![\w.-])certutil(?:\.exe)?\b[^|;]*-(?:urlcache|verifyctl)\b[^|;]*(?:\s-f\b|https?:)/i,
    { hint: String.raw`\bcertutil\b` }),
  commandRule('SEC-CMD-028', 'high', 'download-exec', 'bitsadmin used as a downloader',
    '`bitsadmin /transfer` or `Start-BitsTransfer` fetches a file in the background, a common malware stager.',
    /(?<![\w.-])(?:bitsadmin(?:\.exe)?\b[^|;]*\/transfer\b|Start-BitsTransfer\b[^|;]*https?:)/i,
    { hint: String.raw`\b(?:bitsadmin|Start-BitsTransfer)\b` }),
  commandRule('SEC-CMD-029', 'high', 'download-exec', 'mshta runs a remote or script URL',
    '`mshta http://…` executes a remote HTML application with full rights.',
    /(?<![\w.-])mshta(?:\.exe)?\s+["']?(?:https?:|javascript:|vbscript:)/i,
    { hint: String.raw`\bmshta\b` }),
  commandRule('SEC-CMD-030', 'high', 'download-exec', 'regsvr32 loads a remote scriptlet',
    '`regsvr32 /i:http://… scrobj.dll` runs a remote scriptlet and slips past application control.',
    /(?<![\w.-])regsvr32(?:\.exe)?\b[^|;]*(?:\/i:\s*https?:|scrobj\.dll)/i,
    { hint: String.raw`\bregsvr32\b` }),
  commandRule('SEC-CMD-031', 'high', 'download-exec', 'rundll32 runs script code',
    '`rundll32 javascript:` executes script through the HTML engine, bypassing script controls.',
    /(?<![\w.-])rundll32(?:\.exe)?\b[^|;]*(?:javascript:|vbscript:|RunHTMLApplication)/i,
    { hint: String.raw`\brundll32\b` }),
  commandRule('SEC-CMD-032', 'high', 'download-exec', 'Python one-liner downloads and executes code',
    'A `python -c` that fetches from the network and calls `exec` or `eval` runs remote code.',
    /(?<![\w.-])python[\d.]*\s+(?:-\S+\s+)*-c\s+(?=[^\n]*\b(?:urllib|urlopen|requests\.get|http\.client)\b)[^\n]*\b(?:exec|eval)\s*\(/,
    { hint: String.raw`\bpython[\d.]*\b` }),
  commandRule('SEC-CMD-033', 'high', 'download-exec', 'Node one-liner downloads and executes code',
    'A `node -e` that fetches from the network and evaluates or spawns the result runs remote code.',
    /(?<![\w.-])(?:node|nodejs|deno|bun)\s+(?:-\S+\s+)*(?:-e|-p|--eval|eval)\s+(?=[^\n]*(?:https?\.get|\bfetch\b|require\(\W?https?\W?\)|XMLHttpRequest))[^\n]*\b(?:eval|Function|child_process|execSync|spawn)\b/,
    { hint: String.raw`\b(?:node|nodejs|deno|bun)\b` }),
  commandRule('SEC-CMD-034', 'medium', 'download-exec', 'Script downloaded to disk and run straight away',
    'Downloading a file and executing it in the same command leaves no point at which anyone reads it.',
    /(?<![\w.-])(?:curl|wget)\b[^;|&]*?(?:\s-[oO]\s*|--output(?:=|\s+)|>\s*)([\w./-]+)[^;|&]*?(?:;|&&)\s*(?:chmod\s+[-+\w]+\s+\1\s*(?:;|&&)\s*)?(?:(?:ba|z)?sh\s+|python[\d.]*\s+)?(?:\.\/)?\1(?=\s|$)/,
    { hint: String.raw`\b(?:curl|wget)\b` }),

  commandRule('SEC-CMD-035', 'critical', 'reverse-shell', 'Interactive shell wired to a network socket',
    'A shell whose input and output go to `/dev/tcp` hands a remote machine full control.',
    /(?<![\w.-])(?:ba|z|da|k)?sh\s+-i\b[^|;]*\/dev\/(?:tcp|udp)\/|\bexec\s+\d+<>\s*\/dev\/(?:tcp|udp)\/[^|;]*<&\d/,
    { hint: String.raw`\/dev\/(?:tcp|udp)\/` }),
  commandRule('SEC-CMD-036', 'medium', 'reverse-shell', 'Connection through /dev/tcp',
    'Bash\'s `/dev/tcp` opens raw network connections to another host — the basis of most reverse shells.',
    /\/dev\/(?:tcp|udp)\/([^\s/]+)\/\d+/,
    {
      hint: String.raw`\/dev\/(?:tcp|udp)\/`,
      // Waiting for a local port to open is a health check, not an attack.
      confirm: (match) => !LOCAL_HOST.test(match[1]),
    }),
  commandRule('SEC-CMD-037', 'critical', 'reverse-shell', 'netcat executes a shell',
    '`nc -e /bin/sh` or `nc -c sh` attaches a shell to a connection, giving the remote end control.',
    /(?<![\w.-])(?:nc|ncat|netcat)(?:\.\w+)?(?=\s)(?=[^|;]*\s-\w*[ec]\s+(?:\S*\/)?(?:sh|bash|zsh|dash|ash|ksh|cmd(?:\.exe)?|powershell(?:\.exe)?)\b)/,
    { hint: String.raw`\b(?:nc|ncat|netcat)\b` }),
  commandRule('SEC-CMD-038', 'critical', 'reverse-shell', 'Named pipe relayed through netcat',
    'The `mkfifo … | nc` pattern is the classic way to build a reverse shell where `nc -e` is missing.',
    /(?<![\w.-])mkfifo\b[^\n]*\b(?:nc|ncat|netcat|telnet)\b/,
    { hint: String.raw`\bmkfifo\b` }),
  commandRule('SEC-CMD-039', 'critical', 'reverse-shell', 'socat executes a command',
    '`socat … exec:` attaches a program to a network connection — a reverse or bind shell.',
    /(?<![\w.-])socat\b[^|;]*\b(?:exec|system):/i,
    { hint: String.raw`\bsocat\b` }),
  commandRule('SEC-CMD-040', 'critical', 'reverse-shell', 'Scripting-language reverse shell',
    'A one-liner that opens a socket and spawns a shell is a reverse shell.',
    /(?<![\w.-])(?:python[\d.]*|perl|php|ruby|lua)\s+(?:-\S+\s+)*-[a-z]*[ecr]\s+(?=[^\n]*sock)(?=[^\n]*connect|[^\n]*fsockopen|[^\n]*TCPSocket)(?=[^\n]*(?:subprocess|pty\.spawn|\/bin\/(?:ba)?sh|dup2|\bexec\b|system))/i,
    { hint: String.raw`\b(?:python[\d.]*|perl|php|ruby|lua)\b` }),
  commandRule('SEC-CMD-041', 'critical', 'reverse-shell', 'PowerShell TCP reverse shell',
    'A `TCPClient` stream whose input is executed gives the remote end a PowerShell prompt.',
    /\bNet\.Sockets\.TCPClient\b[^\n]*(?:GetStream|\biex\b|Invoke-Expression)/i,
    { hint: String.raw`\bTCPClient\b` }),
];

/**
 * Raised by the command scanner itself, never matched against text: the
 * pattern can match nothing. They are listed so that they have ids, counts and
 * tests like every other rule.
 */
const NEVER = /(?!)/;

export const OBFUSCATION_RULES = [
  commandRule('SEC-CMD-OBF-001', 'critical', 'obfuscation', 'Hidden payload is dangerous',
    'A command decodes a hidden payload (Base64 or encoded PowerShell) that turns out to be a dangerous command.',
    NEVER, { synthetic: true }),
  commandRule('SEC-CMD-OBF-002', 'high', 'obfuscation', 'Decoded payload is executed',
    'Decoding a Base64 payload and feeding it to a shell hides what the command really does.',
    NEVER, { synthetic: true }),
  commandRule('SEC-CMD-OBF-003', 'high', 'obfuscation', 'Command is disguised with quoting tricks',
    'The dangerous command only appears after splitting quotes, `${IFS}` or hex quoting are undone — a sign it was written to evade detection.',
    NEVER, { synthetic: true }),
];
