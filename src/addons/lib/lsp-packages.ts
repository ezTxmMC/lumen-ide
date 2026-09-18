/**
 * How the built-in languages' servers are installed into Lumen's closed
 * environment (`~/.lumen/lsp`) — see `LspPackage`.
 */

import type { LspPackage } from '@/core/types'

/** `<prefix><rust target><suffix>` for every platform, as Rust-built releases name them. */
function rustTargets(prefix: string, suffix: string, windowsSuffix = suffix): Record<string, string> {
  return {
    'linux-x64': `^${prefix}x86_64-unknown-linux-gnu${suffix}$`,
    'linux-arm64': `^${prefix}aarch64-unknown-linux-gnu${suffix}$`,
    'darwin-x64': `^${prefix}x86_64-apple-darwin${suffix}$`,
    'darwin-arm64': `^${prefix}aarch64-apple-darwin${suffix}$`,
    'win32-x64': `^${prefix}x86_64-pc-windows-msvc${windowsSuffix}$`,
    'win32-arm64': `^${prefix}aarch64-pc-windows-msvc${windowsSuffix}$`,
  }
}

export const LSP_PACKAGES = {
  typescriptLanguageServer: { type: 'npm', packages: ['typescript-language-server', 'typescript@6'] },
  vtsls: { type: 'npm', packages: ['@vtsls/language-server'] },
  langserversExtracted: { type: 'npm', packages: ['vscode-langservers-extracted'] },
  someSass: { type: 'npm', packages: ['some-sass-language-server'] },
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
  jdtls: {
    type: 'archive',
    url: 'https://download.eclipse.org/jdtls/snapshots/jdt-language-server-latest.tar.gz',
    bin: 'bin/jdtls',
    runtime: 'python',
  },
} satisfies Record<string, LspPackage>
