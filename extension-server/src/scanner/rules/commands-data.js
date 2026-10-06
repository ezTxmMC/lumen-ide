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
 * Commands that carry data away (credentials, wallets, browser profiles),
 * mine cryptocurrency on someone else's machine, or pull packages from places
 * nobody vetted.
 *
 * Reading `~/.ssh/id_rsa` is what `ssh` does all day. It only becomes a
 * finding together with something that sends it away, so the exfiltration
 * rules confirm a network tool on the same line.
 */

import { NETWORK_SINK, commandRule } from './define.js';

const hasSink = (_match, line) => NETWORK_SINK.test(line);

/** The registries a package manager is expected to talk to. */
const KNOWN_REGISTRY = String.raw`(?!(?:registry\.npmjs\.org|registry\.yarnpkg\.com|npm\.pkg\.github\.com|registry\.npmmirror\.com|localhost|127\.0\.0\.1)(?:[:/\s"']|$))`;

export const EXFIL_RULES = [
  commandRule('SEC-CMD-070', 'high', 'exfiltration', 'SSH private key sent over the network',
    'A private key read together with a network tool is how SSH credentials are stolen.',
    /\.ssh\/(?:id_[a-z0-9_]+|identity)(?!\.pub)(?![a-z0-9_])/i,
    { hint: String.raw`\.ssh\/`, confirm: hasSink }),
  commandRule('SEC-CMD-071', 'high', 'exfiltration', 'Cloud or registry credentials sent over the network',
    'Credential files such as `~/.aws/credentials`, `.npmrc` or `.kube/config` read together with a network tool are being exfiltrated.',
    /\.aws\/credentials|\.npmrc\b|\.config\/gcloud|\.docker\/config\.json|\.kube\/config|\.git-credentials|\.netrc\b|\.pgpass\b|\.azure\/(?:accessTokens|msal_token_cache)/i,
    { hint: String.raw`\.(?:aws|npmrc|config\/gcloud|docker|kube|git-credentials|netrc|pgpass|azure)`, confirm: hasSink }),
  commandRule('SEC-CMD-072', 'high', 'exfiltration', 'Environment file or variables piped to the network',
    'Sending `.env` or the whole environment to a remote host leaks every secret in it.',
    /(?<![\w.-])(?:cat|base64|tar|zip)\b[^|;]*\.env\b[^|;]*\|[^;]*\b(?:curl|wget|nc|ncat|netcat|socat)\b|(?<![\w.-])(?:curl|wget)\b[^|;]*(?:@|=@|--post-file[= ]|\s-T\s*)\S*\.env\b|(?<![\w.-])(?:nc|ncat|netcat)\b[^|;]*<\s*\S*\.env\b|(?<![\w.-])(?:printenv|env)\b[^|;]*\|\s*(?:base64[^|;]*\|\s*)?(?:curl|wget|nc|ncat|netcat|socat)\b|(?<![\w.-])(?:curl|wget)\b[^|;]*(?:\$\(\s*(?:env|printenv)\b|`\s*(?:env|printenv)\b)/,
    { hint: String.raw`\.env\b|\b(?:printenv|env)\b` }),
  commandRule('SEC-CMD-073', 'medium', 'exfiltration', 'curl uploads a local file',
    '`curl -d @file`, `-F f=@file` or `-T file` sends a file\'s contents to a server.',
    /(?<![\w.-])curl\b[^|;]*\s(?:(?:-d|--data(?:-binary|-raw|-urlencode)?|-F|--form)(?:\s+|=)["']?(?:\w+=)?@|(?:-T|--upload-file)(?:\s+|=)\S)/,
    { hint: String.raw`\bcurl\b` }),
  commandRule('SEC-CMD-074', 'medium', 'exfiltration', 'wget posts a local file',
    '`wget --post-file` sends a file\'s contents to a server.',
    /(?<![\w.-])wget\b[^|;]*\s--(?:post-file|body-file)(?:=|\s)/,
    { hint: String.raw`\bwget\b` }),
  commandRule('SEC-CMD-075', 'high', 'exfiltration', 'Browser profile or password store accessed',
    'Browser profiles hold saved passwords, cookies and sessions — a command that touches them is stealing or snooping.',
    /\.config\/(?:google-chrome|chromium|BraveSoftware|microsoft-edge)|Application Support\/(?:Google\/Chrome|BraveSoftware|Microsoft Edge)|AppData\\(?:Local|Roaming)\\(?:Google\\Chrome|Mozilla|BraveSoftware|Microsoft\\Edge)|\.mozilla\/firefox|\bLogin Data\b|\bcookies\.sqlite\b|\blogins\.json\b|\bkey[34]\.db\b/i,
    { hint: String.raw`chrome|chromium|brave|edge|mozilla|firefox|Login Data|cookies\.sqlite|logins\.json|key[34]\.db` }),
  commandRule('SEC-CMD-076', 'high', 'exfiltration', 'Cryptocurrency wallet files accessed',
    'Wallet files (`wallet.dat`, Solana keypairs, Electrum, keystores) hold funds; commands touching them are theft.',
    /\bwallet\.dat\b|\.config\/solana|\.solana\/id\.json|\/\.?(?:electrum|bitcoin|ethereum|monero)\/wallets?\b|\bkeystore\/UTC--|Exodus\/exodus\.wallet/i,
    { hint: String.raw`wallet|solana|electrum|bitcoin|ethereum|monero|keystore|exodus` }),
  commandRule('SEC-CMD-077', 'high', 'exfiltration', 'Shell history sent over the network',
    'History files contain commands with passwords and tokens; sending one away leaks them.',
    /\.(?:bash_history|zsh_history|zhistory|psql_history|mysql_history|python_history)\b/,
    { hint: 'history', confirm: hasSink }),
  commandRule('SEC-CMD-078', 'high', 'exfiltration', 'macOS keychain dumped',
    '`security dump-keychain` and `find-generic-password` read stored passwords out of the keychain.',
    /(?<![\w.-])security\s+(?:dump-keychain|find-(?:generic|internet)-password)\b/,
    { hint: String.raw`\bsecurity\b` }),
];

export const MINER_RULES = [
  commandRule('SEC-CMD-079', 'critical', 'cryptominer', 'Cryptocurrency miner',
    'Names of well-known miners (`xmrig`, `minerd`, `cpuminer` …) mean the machine is being used to mine.',
    /(?<![\w.-])(?:xmrig|xmr-stak|minerd|cpuminer(?:-multi|-opt)?|cgminer|bfgminer|ethminer|nbminer|phoenixminer|lolminer|ccminer)\b/i,
    { hint: String.raw`miner|xmr|cpuminer|minerd` , targets: ['command', 'project', 'extension'] }),
  commandRule('SEC-CMD-080', 'critical', 'cryptominer', 'Mining pool connection string',
    'A `stratum+tcp://` address is how a miner is told which pool to work for.',
    /\bstratum2?\+(?:tcp|ssl|tls|udp)?:\/\//i,
    { hint: 'stratum', targets: ['command', 'project', 'extension'] }),
  commandRule('SEC-CMD-081', 'critical', 'cryptominer', 'Miner donation option',
    '`--donate-level` is an option of XMRig-family miners and only appears in miner command lines.',
    /(?:^|\s)--donate-level(?:=|\s|$)/,
    { hint: 'donate-level', targets: ['command', 'project', 'extension'] }),
  commandRule('SEC-CMD-082', 'critical', 'cryptominer', 'Known mining pool',
    'The address belongs to a public cryptocurrency mining pool.',
    /(?<![\w-])(?:[\w-]+\.)*(?:nanopool\.org|supportxmr\.com|minexmr\.com|moneroocean\.stream|2miners\.com|f2pool\.com|ethermine\.org|hashvault\.pro|miningpoolhub\.com|unmineable\.com|c3pool\.com|herominers\.com|minergate\.com|dwarfpool\.com)\b/i,
    { hint: String.raw`nanopool|supportxmr|minexmr|moneroocean|2miners|f2pool|ethermine|hashvault|miningpoolhub|unmineable|c3pool|herominers|minergate|dwarfpool`, targets: ['command', 'project', 'extension'] }),
];

export const SUPPLY_RULES = [
  commandRule('SEC-CMD-083', 'medium', 'supply-chain', 'Package installed from a URL',
    'Installing from a tarball or git URL skips the registry\'s checks, so whatever sits at that address is installed.',
    /(?<![\w.-])(?:npm|yarn|pnpm|bun)\s+(?:i|install|add)\b[^|;]*\s(?:https?:\/\/\S+|git\+(?:https?|ssh):\/\/\S+|git:\/\/\S+)/,
    { hint: String.raw`\b(?:npm|yarn|pnpm|bun)\b` }),
  commandRule('SEC-CMD-084', 'high', 'supply-chain', 'Package installed over plain HTTP',
    'A package fetched over `http://` can be swapped on the way by anyone on the network.',
    /(?<![\w.-])(?:npm|yarn|pnpm|bun)\s+(?:i|install|add)\b[^|;]*\s(?:git\+)?http:\/\/(?!localhost|127\.0\.0\.1)/,
    { hint: String.raw`\b(?:npm|yarn|pnpm|bun)\b` }),
  commandRule('SEC-CMD-085', 'medium', 'supply-chain', 'Package registry overridden',
    'Pointing the package manager at an unknown registry lets that server decide what every package contains.',
    new RegExp(String.raw`(?<![\w.-])(?:npm|yarn|pnpm|bun|npx)\b[^|;]*\s--registry(?:=|\s+)["']?https?:\/\/${KNOWN_REGISTRY}`),
    { hint: String.raw`--registry` }),
  commandRule('SEC-CMD-086', 'high', 'supply-chain', 'pip uses an insecure index',
    '`pip install --index-url http://…` or `--trusted-host` downloads code over a connection that can be tampered with.',
    /(?<![\w.-])pip[\d.]*\s+install\b[^|;]*(?:(?:--(?:extra-)?index-url|\s-i)[ =]\s*["']?http:\/\/|--trusted-host\b)/,
    { hint: String.raw`\bpip[\d.]*\b` }),
  commandRule('SEC-CMD-087', 'medium', 'supply-chain', 'pip installs from a URL or git repository',
    'Installing from a URL skips PyPI\'s checks, so whatever sits at that address is installed.',
    /(?<![\w.-])pip[\d.]*\s+install\b[^|;]*\s(?:git\+\S+|https?:\/\/\S+)/,
    { hint: String.raw`\bpip[\d.]*\b` }),
  commandRule('SEC-CMD-088', 'high', 'supply-chain', 'pip installs from a URL next to a download',
    'Combining `pip install <url>` with `curl`/`wget` in one command chains a remote download into an install.',
    /(?<![\w.-])pip[\d.]*\s+install\b[^|;]*\s(?:git\+\S+|https?:\/\/\S+)[^\n]*\b(?:curl|wget)\b/,
    { hint: String.raw`\bpip[\d.]*\b` }),
  commandRule('SEC-CMD-089', 'medium', 'supply-chain', 'Default package registry replaced',
    '`npm config set registry` or `pip config set global.index-url` changes where every later install comes from.',
    new RegExp(String.raw`(?<![\w.-])(?:(?:npm|yarn|pnpm)\s+config\s+set\s+registry\s+["']?https?:\/\/${KNOWN_REGISTRY}|pip[\d.]*\s+config\s+set\s+global\.(?:extra-)?index-url\s+["']?https?:\/\/(?!pypi\.org))`),
    { hint: String.raw`\bconfig\s+set\b` }),
];
