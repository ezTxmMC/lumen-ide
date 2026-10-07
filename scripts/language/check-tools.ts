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
 * Tools a language declares (`novusc`): which release asset each platform
 * takes, where the managed folder sits on the PATH, how a tool counts as
 * missing, broken or outdated, and that two programs of one repository do not
 * share an install folder. Everything with fakes — no network, no Electron.
 */

type Expect = (cond: boolean, label: string) => void;

/** The assets of the v0.1.0-pre.alpha.8 release (`gh release view`). */
const ASSETS = [
  'novus-lsp-aarch64-linux-gnu', 'novus-lsp-aarch64-macos', 'novus-lsp-aarch64-windows-gnu.exe', 'novus-lsp-linux-x86_64',
  'novus-lsp-macos-arm64', 'novus-lsp-x86_64-linux-gnu', 'novus-lsp-x86_64-linux-musl', 'novus-lsp-x86_64-macos',
  'novus-lsp-x86_64-windows-gnu.exe', 'novusc-aarch64-linux-gnu', 'novusc-aarch64-macos', 'novusc-aarch64-windows-gnu.exe',
  'novusc-linux-x86_64', 'novusc-macos-arm64', 'novusc-windows-x86_64.exe', 'novusc-x86_64-linux-gnu',
  'novusc-x86_64-linux-musl', 'novusc-x86_64-macos', 'novusc-x86_64-windows-gnu.exe', 'novusc-x86_64-linux-gnu.sha256',
].map((name) => ({ name }));

const EXPECTED: Record<string, string> = {
  'linux-x64': 'novusc-x86_64-linux-gnu',
  'linux-arm64': 'novusc-aarch64-linux-gnu',
  'darwin-x64': 'novusc-x86_64-macos',
  'darwin-arm64': 'novusc-aarch64-macos',
  'win32-x64': 'novusc-x86_64-windows-gnu.exe',
  'win32-arm64': 'novusc-aarch64-windows-gnu.exe',
};

export async function checkTools(expect: Expect) {
  const { LSP_PACKAGES, NOVUS_VERSION } = await import('@/addons/lib/lsp-packages');
  const { novusSpec, nvhSpec } = await import('@/addons/builtin/novus');
  const { selectAsset, packageId } = await import('../../electron/features/lsp-packages/checks');
  const { composePath, withManagedPath } = await import('../../electron/features/lsp-packages/tools/managed-path');
  const { probeTool } = await import('../../electron/features/lsp-packages/tools/tool-probe');
  const status = await import('@/core/tools/status');
  const plans = await import('@/core/lsp/install-plan');

  const novusc = LSP_PACKAGES.novusc;
  const lsp = LSP_PACKAGES.novusLsp;
  if (novusc.type !== 'github' || lsp.type !== 'github') {
    expect(false, 'novusc and novus-lsp are GitHub release packages');
    return;
  }
  expect(novusc.repo === lsp.repo && novusc.version === lsp.version && novusc.version === NOVUS_VERSION, 'novusc and novus-lsp come from the same pinned release');

  // Asset selection
  for (const [platform, name] of Object.entries(EXPECTED)) {
    const picked = selectAsset(ASSETS, new RegExp(novusc.assets[platform]));
    expect(picked?.name === name, `novusc on ${platform}: ${picked?.name} (expected ${name})`);
    const server = selectAsset(ASSETS, new RegExp(lsp.assets[platform]));
    expect(server?.name === name.replace('novusc', 'novus-lsp'), `novus-lsp on ${platform}: ${server?.name}`);
  }
  expect(selectAsset(ASSETS, /^novusc-x86_64-linux-gnu$/)?.name === 'novusc-x86_64-linux-gnu', 'a checksum file next to the asset is not picked');
  expect(selectAsset([{ name: 'novusc-x86_64-linux-gnu.sha256' }], /^novusc-x86_64-linux-gnu/) === null, 'a checksum alone is no download');
  expect(novusc.bin === 'novusc' && lsp.bin === 'novus-lsp', 'each package names its own program');

  // One folder per program: the unpack step wipes the folder of the package.
  expect(packageId(novusc) !== packageId(lsp), `separate install folders (${packageId(novusc)} / ${packageId(lsp)})`);
  expect(packageId({ type: 'github', repo: 'denoland/deno', assets: {} }) === 'github-denoland-deno', 'packages without own bin keep their id');

  // PATH composition
  expect(composePath('/m/bin', '/usr/bin:/bin') === '/m/bin:/usr/bin:/bin', 'the managed folder goes first');
  expect(composePath('/m/bin', '/usr/bin:/m/bin:/bin') === '/m/bin:/usr/bin:/bin', 'and only once');
  expect(composePath('/m/bin', undefined) === '/m/bin', 'with no PATH at all it is the PATH');
  const posix = withManagedPath({ PATH: '/usr/bin', HOME: '/h' }, '/m/bin', 'linux');
  expect(posix.PATH === '/m/bin:/usr/bin' && posix.HOME === '/h', 'an environment gets it without losing other variables');
  const win = withManagedPath({ Path: 'C:\\Windows', SystemRoot: 'C:\\Windows' }, 'C:\\m\\bin', 'win32');
  expect(win.Path === 'C:\\m\\bin;C:\\Windows' && !('PATH' in win), 'Windows keeps its own spelling of Path and the ; separator');
  const projectPath = withManagedPath({ PATH: '/only/this' }, '/m/bin', 'linux');
  expect(projectPath.PATH.startsWith('/m/bin:'), 'a project PATH cannot hide the managed folder');

  // Detection with fakes
  const tool = novusSpec.tools?.[0];
  expect(tool?.id === 'novusc' && nvhSpec.tools?.[0] === tool, 'Novus and Novus HTML declare the same novusc');
  if (!tool) {
    return;
  }
  const resolved = async (hit: string | null) => hit;
  const never = async () => ({ code: 1, stdout: '' });
  const probe = await probeTool(['novusc'], undefined, () => resolved(null), never);
  expect(probe.path === null && !probe.ok, 'nothing found: not resolved');
  const onPath = await probeTool(['novusc'], ['version'], () => resolved('/usr/bin/novusc'), async () => ({ code: 0, stdout: 'novusc 0.1.0\nmore' }));
  expect(onPath.ok && !onPath.managed && onPath.output === 'novusc 0.1.0', 'a program from the PATH that answers its check');
  const failing = await probeTool(['novusc'], ['version'], () => resolved('/usr/bin/novusc'), never);
  expect(failing.path !== null && !failing.ok, 'a program whose check fails is found but not ok');
  const home = (await import('node:os')).homedir();
  const managed = await probeTool(['novusc'], undefined, () => resolved(`${home}/.lumen/lsp/bin/novusc`));
  expect(managed.managed, 'a launcher in ~/.lumen/lsp/bin counts as managed');

  const record = (version?: string) => [{ id: 'github-eztxmmc-novus-novusc', type: 'github' as const, bins: ['novusc'], installedAt: '', version }];
  const state = (p: Parameters<typeof status.toolStatus>[1], installed: ReturnType<typeof record>) => status.toolStatus(tool, p, installed).state;
  expect(state(null, []) === 'missing', 'missing when nothing resolves');
  expect(state({ path: '/m/novusc', managed: true, ok: true, output: '' }, record(NOVUS_VERSION)) === 'ok', 'managed at the pinned version is ok');
  expect(state({ path: '/m/novusc', managed: true, ok: true, output: '' }, record('v0.1.0-pre.alpha.7')) === 'outdated', 'managed at an older version is outdated — a newer pin re-offers the install');
  expect(state({ path: '/m/novusc', managed: true, ok: true, output: '' }, record(undefined)) === 'outdated', 'managed with no recorded version is outdated');
  expect(state({ path: '/usr/bin/novusc', managed: false, ok: true, output: '' }, []) === 'ok', 'the user\'s own novusc is never "outdated"');
  expect(state({ path: '/m/novusc', managed: true, ok: false, output: '' }, record(NOVUS_VERSION)) === 'broken', 'a program that does not start is broken');
  expect(status.needsAttention(status.toolStatus(tool, null, [])), 'missing tools need attention');

  // Install plans: the tool goes through the same planner as a server.
  const config = status.toolConfig(tool);
  const system = { platform: 'linux', managers: [], isRoot: false, sudo: false, pkexec: false };
  const linux = plans.installPlans(config, { platform: 'linux', platformKey: 'linux-x64', system });
  expect(linux[0]?.kind === 'managed' && linux[0].spec === tool.package, 'a managed plan with the declared package');
  expect(plans.installPlans(config, { platform: 'freebsd', platformKey: 'freebsd-x64', system }).length === 0, 'no download for the platform: no plan');
  expect(status.toolsOf([novusSpec, nvhSpec]).length === 1, 'tools of several languages are listed once');
}
