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
 * What a project folder can do to the person who opens it: scripts that run on
 * install or on opening the folder, hooks, `setup.py`, registry settings, and
 * executables lying around.
 *
 * Several of these rules do not look at file text line by line. They have a
 * kind of their own (`package-script`, `tasks-folder-open`, `path` …) and are
 * driven by the structured scan in `project.js`, which knows what a lifecycle
 * script or a `runOn` entry is. That keeps `"description": "uses curl"` out of
 * the results.
 */

import { projectRule } from './define.js';

/** Words that make a lifecycle script a downloader or an interpreter of hidden code. */
export const REMOTE_CODE_WORDS = /\b(?:curl|wget|Invoke-WebRequest|iwr|irm)\b|https?:\/\/|\bnode\s+-e\b|\beval\b|base64\s+(?:-d|--decode)|\bpowershell(?:\.exe)?\b|\biex\b|\batob\s*\(|Buffer\.from\([^)]*base64|\bInvoke-Expression\b/i;

/** Network fetch or decode words in a devcontainer command. */
const FETCH_WORDS = /\b(?:curl|wget|Invoke-WebRequest|iwr|irm)\b|base64\s+(?:-d|--decode)|\beval\b|(?<![\w.-])nc\b|\/dev\/tcp\//i;

/** Registries npm talks to by default. */
const KNOWN_NPM_REGISTRY = String.raw`(?!(?:registry\.npmjs\.org|registry\.yarnpkg\.com|npm\.pkg\.github\.com|registry\.npmmirror\.com|localhost|127\.0\.0\.1)(?:[:/\s"']|$))`;

export const PROJECT_RULES = [
  projectRule('SEC-PKG-001', 'high', 'supply-chain', 'Lifecycle script downloads or executes remote code',
    'A script that npm runs automatically on install or publish fetches or decodes code — the usual vehicle for supply-chain malware.',
    REMOTE_CODE_WORDS, ['package-script']),
  projectRule('SEC-PRJ-001', 'medium', 'persistence', 'Task runs automatically when the folder is opened',
    'A `runOn: folderOpen` task starts as soon as the project is opened; it should be something the user expects.',
    /(?:)/, ['tasks-folder-open'], { synthetic: true }),
  projectRule('SEC-PRJ-002', 'medium', 'persistence', 'Dev container lifecycle command fetches code',
    'A dev container command that downloads or decodes code runs automatically when the container is created or started.',
    FETCH_WORDS, ['devcontainer-command']),
  projectRule('SEC-PRJ-003', 'medium', 'persistence', 'Git hook fetches remote content',
    'A hook runs on every commit or checkout; one that downloads something runs unreviewed code again and again.',
    /(?<![\w.-])(?:curl|wget|Invoke-WebRequest|iwr)\b[^\n]*(?:https?:\/\/|\$\()/i, ['shell-hook']),
  projectRule('SEC-PRJ-004', 'high', 'supply-chain', 'setup.py executes code or commands',
    'A `setup.py` that calls `exec`, `os.system` or `subprocess` and also reaches the network can run anything at install time.',
    /\b(?:exec|eval)\s*\(|\bos\.system\s*\(|\bsubprocess\.(?:run|call|Popen|check_output|check_call)\s*\(/, ['setup-py'],
    { confirm: (_match, _line, context) => /\b(?:urllib|urlopen|requests\.|http\.client|curl|wget|socket|httpx)\b/.test(context.text ?? '') }),
  projectRule('SEC-PRJ-005', 'medium', 'supply-chain', 'npm configured with a foreign registry',
    'An `.npmrc` that points at an unknown registry makes every install come from that server.',
    new RegExp(String.raw`^\s*(?:@[\w.-]+:)?registry\s*=\s*["']?https?:\/\/${KNOWN_NPM_REGISTRY}`, 'i'), ['npmrc']),
  projectRule('SEC-PRJ-006', 'high', 'supply-chain', 'Install scripts forced on with a foreign registry',
    '`ignore-scripts=false` together with an unknown registry lets that registry\'s packages run code on install.',
    /^\s*ignore-scripts\s*=\s*false\b/i, ['npmrc'],
    { confirm: (_match, _line, context) => new RegExp(String.raw`registry\s*=\s*["']?https?:\/\/${KNOWN_NPM_REGISTRY}`, 'im').test(context.text ?? '') }),
  projectRule('SEC-PRJ-007', 'medium', 'secret', 'Auth token committed in .npmrc',
    'A literal `_authToken` or `_password` in `.npmrc` leaks registry access to everyone who can read the repository.',
    /(?:_authToken|_auth|_password)\s*=\s*(?!\$\{|\$[A-Z_]|["']?\$)["']?[^\s"'$]{6,}/i, ['npmrc']),
  projectRule('SEC-PRJ-010', 'medium', 'malware', 'Script-host or disguised executable in project',
    'Files such as `.scr`, `.pif`, `.hta`, `.lnk`, `.vbs` or `.wsf` are launched by double-click and are a common malware carrier.',
    /\.(?:scr|pif|com|hta|lnk|vbs|vbe|jse|wsf)$/i, ['path']),
  projectRule('SEC-PRJ-011', 'low', 'malware', 'Executable file in project',
    'The project contains a binary or batch file (`.exe`, `.dll`, `.msi`, `.jar`, `.bat`, `.cmd`) that cannot be reviewed as text.',
    /\.(?:exe|msi|dll|bat|cmd|jar)$/i, ['path']),
];
