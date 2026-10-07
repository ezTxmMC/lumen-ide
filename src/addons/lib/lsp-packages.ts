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
 * How the built-in languages' servers are installed into Lumen's closed
 * environment (`~/.lumen/lsp`) — see `LspPackage`.
 */

import type { LspPackage, SystemPackages } from '@/core/types';

/** `<prefix><rust target><suffix>` for every platform, as Rust-built releases name them. */
function rustTargets(prefix: string, suffix: string, windowsSuffix = suffix): Record<string, string> {
  return {
    'linux-x64': `^${prefix}x86_64-unknown-linux-gnu${suffix}$`,
    'linux-arm64': `^${prefix}aarch64-unknown-linux-gnu${suffix}$`,
    'darwin-x64': `^${prefix}x86_64-apple-darwin${suffix}$`,
    'darwin-arm64': `^${prefix}aarch64-apple-darwin${suffix}$`,
    'win32-x64': `^${prefix}x86_64-pc-windows-msvc${windowsSuffix}$`,
    'win32-arm64': `^${prefix}aarch64-pc-windows-msvc${windowsSuffix}$`,
  };
}

/**
 * The Novus release both programs come from. Pinned: the releases are
 * pre-releases, which "latest" does not return — and the installer records the
 * tag, so raising it re-offers the update.
 */
export const NOVUS_VERSION = 'v0.1.0-pre.alpha.8';

/** A program of the Novus release: `<bin>-<arch>-<os>`, Windows as `-windows-gnu.exe`. */
function novusRelease(bin: string): LspPackage {
  return {
    type: 'github',
    repo: 'ezTxmMC/novus',
    version: NOVUS_VERSION,
    bin,
    assets: {
      'linux-x64': `^${bin}-x86_64-linux-gnu$`,
      'linux-arm64': `^${bin}-aarch64-linux-gnu$`,
      'darwin-x64': `^${bin}-x86_64-macos$`,
      'darwin-arm64': `^${bin}-aarch64-macos$`,
      'win32-x64': `^${bin}-x86_64-windows-gnu\\.exe$`,
      'win32-arm64': `^${bin}-aarch64-windows-gnu\\.exe$`,
    },
  };
}

export const LSP_PACKAGES = {
  typescriptLanguageServer: { type: 'npm', packages: ['typescript-language-server', 'typescript@6'] },
  eslint: { type: 'npm', packages: ['vscode-langservers-extracted'] },
  biome: { type: 'npm', packages: ['@biomejs/biome'] },
  vtsls: { type: 'npm', packages: ['@vtsls/language-server'] },
  langserversExtracted: { type: 'npm', packages: ['vscode-langservers-extracted'] },
  someSass: { type: 'npm', packages: ['some-sass-language-server'] },
  // novus-lsp and novusc ship in the same release, as bare programs.
  novusLsp: novusRelease('novus-lsp'),
  novusc: novusRelease('novusc'),
  deno: { type: 'github', repo: 'denoland/deno', assets: rustTargets('deno-', '\\.zip') },
  superhtml: {
    type: 'github',
    repo: 'kristoff-it/superhtml',
    assets: {
      'linux-x64': '^x86_64-linux-musl\\.tar\\.xz$',
      'linux-arm64': '^aarch64-linux\\.tar\\.xz$',
      'darwin-x64': '^x86_64-macos\\.zip$',
      'darwin-arm64': '^aarch64-macos\\.zip$',
      'win32-x64': '^x86_64-windows\\.zip$',
      'win32-arm64': '^aarch64-windows\\.zip$',
    },
  },
  // The Apache NetBeans Java server as Oracle ships it for VS Code (Open VSX):
  // nb-javac and Gradle/Maven through their tooling APIs.
  netbeansJava: {
    type: 'archive',
    url: 'https://open-vsx.org/api/Oracle/oracle-java/26.0.2/file/Oracle.oracle-java-26.0.2.vsix',
    bin: 'extension/nbcode/bin/nbcode.sh',
    executables: ['extension/nbcode/platform/lib/nbexec.sh', 'extension/nbcode/java/maven/bin/mvn.sh'],
  },
  jdtls: {
    type: 'archive',
    url: 'https://download.eclipse.org/jdtls/snapshots/jdt-language-server-latest.tar.gz',
    bin: 'bin/jdtls',
    runtime: 'python',
  },
} satisfies Record<string, LspPackage>;

/**
 * The same servers in the system's package managers — the alternative the
 * install dialog offers beside Lumen's own environment.
 */
export const SYSTEM_PACKAGES = {
  typescriptLanguageServer: { pacman: 'typescript-language-server', brew: 'typescript-language-server' },
  langserversExtracted: { brew: 'vscode-langservers-extracted' },
  deno: { pacman: 'deno', brew: 'deno', winget: 'DenoLand.Deno', scoop: 'deno', choco: 'deno' },
  jdtls: { brew: 'jdtls' },
} satisfies Record<string, SystemPackages>;
