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
 * Novus as an SDK (SDK dialog → download from the GitHub releases): the
 * asset for each OS and architecture, the order of pre-release versions, the
 * version check that guards the folder name, the plan for installing bare
 * programs, and the PATH precedence between the chosen SDK, the add-on
 * installer's folder and the rest. Fixtures are recorded releases — no network.
 */

import { ALPHA_6, ALPHA_8 } from '../lib/novus-releases';

type Expect = (cond: boolean, label: string) => void;

type Os = 'linux' | 'darwin' | 'win32';
type Arch = 'x64' | 'arm64';

const COMPILER: Record<string, string> = {
  'linux-x64': 'novusc-x86_64-linux-gnu',
  'linux-arm64': 'novusc-aarch64-linux-gnu',
  'darwin-x64': 'novusc-x86_64-macos',
  'darwin-arm64': 'novusc-aarch64-macos',
  'win32-x64': 'novusc-x86_64-windows-gnu.exe',
  'win32-arm64': 'novusc-aarch64-windows-gnu.exe',
};

const SERVER: Record<string, string> = {
  'linux-x64': 'novus-lsp-x86_64-linux-gnu',
  'linux-arm64': 'novus-lsp-aarch64-linux-gnu',
  'darwin-x64': 'novus-lsp-x86_64-macos',
  'darwin-arm64': 'novus-lsp-aarch64-macos',
  'win32-x64': 'novus-lsp-x86_64-windows-gnu.exe',
  'win32-arm64': 'novus-lsp-aarch64-windows-gnu.exe',
};

export async function checkNovusSdk(expect: Expect) {
  const model = await import('../../electron/features/sdk/tools/novus/model');
  const { compareSemver, isSafeVersion, PRERELEASE_VERSION_PATTERN } = await import('../../electron/features/sdk/tools/novus/version');

  /* ---- the asset of each platform -------------------------------------- */
  for (const os of ['linux', 'darwin', 'win32'] as Os[]) {
    for (const arch of ['x64', 'arm64'] as Arch[]) {
      const key = `${os}-${arch}`;
      const [release] = model.novusReleases([ALPHA_8], { os, arch });
      expect(release?.filename === COMPILER[key], `${key}: the compiler is ${COMPILER[key]} (got ${release?.filename})`);
      const files = release?.files ?? [];
      expect(files.length === 2 && files[1].filename === SERVER[key], `${key}: novus-lsp comes with it (${files.map((file) => file.filename).join(', ')})`);
      const exe = os === 'win32' ? '.exe' : '';
      expect(files[0]?.dest === `bin/novusc${exe}` && files[1]?.dest === `bin/novus-lsp${exe}`, `${key}: home layout bin/novusc${exe} and bin/novus-lsp${exe}`);
      expect(files.every((file) => /^[0-9a-f]{64}$/.test(file.checksum?.value ?? '')), `${key}: the checksum comes from the digest`);
      expect(release?.size === files.reduce((sum, file) => sum + (file.size ?? 0), 0) && (release?.size ?? 0) > 0, `${key}: the size is the sum of both files`);
    }
  }
  expect(model.assetNames('novusc', { os: 'linux', arch: 'x64' })[0] === 'novusc-x86_64-linux-gnu', 'gnu is preferred over musl on Linux');
  expect(model.assetNames('novusc', { os: 'linux', arch: 'x64' }).includes('novusc-x86_64-linux-musl'), 'musl stays a fallback');
  expect(model.assetNames('novusc', { os: 'freebsd' as Os, arch: 'x64' }).length === 0 && model.assetNames('novusc', { os: 'linux', arch: 'ia32' as Arch }).length === 0, 'no names for an unsupported system');

  /* ---- legacy names and gaps ------------------------------------------- */
  const legacy = { ...ALPHA_8, assets: ALPHA_8.assets.filter((asset) => /^novusc-(linux-x86_64|macos-arm64|windows-x86_64\.exe)$/.test(asset.name)) };
  expect(model.novusReleases([legacy], { os: 'linux', arch: 'x64' })[0]?.filename === 'novusc-linux-x86_64', 'a legacy Linux name still works');
  expect(model.novusReleases([legacy], { os: 'darwin', arch: 'arm64' })[0]?.filename === 'novusc-macos-arm64', 'a legacy macOS name still works');
  expect(model.novusReleases([legacy], { os: 'win32', arch: 'x64' })[0]?.filename === 'novusc-windows-x86_64.exe', 'a legacy Windows name still works');
  expect(model.novusReleases([legacy], { os: 'linux', arch: 'arm64' }).length === 0, 'a release without an asset for the platform is skipped');
  const onlyCompiler = model.novusReleases([ALPHA_6], { os: 'linux', arch: 'x64' })[0];
  expect(onlyCompiler?.files?.length === 1 && onlyCompiler.files[0].dest === 'bin/novusc', 'alpha.6 has no novus-lsp — only the compiler is installed');
  const foreign = { ...ALPHA_8, assets: ALPHA_8.assets.map((asset) => ({ ...asset, browser_download_url: 'https://evil.example/x' })) };
  expect(model.novusReleases([foreign], { os: 'linux', arch: 'x64' }).length === 0, 'a download address outside the project is not taken');

  /* ---- listing, order, pre-release flag -------------------------------- */
  const draft = { ...ALPHA_8, tag_name: 'v9.9.9', draft: true };
  const odd = { ...ALPHA_8, tag_name: 'nightly' };
  const final = { ...ALPHA_8, tag_name: 'v0.1.0', prerelease: false };
  const tenth = { ...ALPHA_8, tag_name: 'v0.1.0-pre.alpha.10' };
  const list = model.novusReleases([ALPHA_6, draft, odd, tenth, ALPHA_8, final, ALPHA_8], { os: 'linux', arch: 'x64' });
  expect(list.map((entry) => entry.version).join(' ') === '0.1.0 0.1.0-pre.alpha.10 0.1.0-pre.alpha.8 0.1.0-pre.alpha.6', `newest first, drafts, odd tags and doubles dropped: ${list.map((entry) => entry.version).join(' ')}`);
  expect(list[0].prerelease === false && list[1].prerelease === true, 'pre-releases are marked');
  expect(list.every((entry) => entry.lts === false), 'none is LTS');

  /* ---- semver order and the version guard ------------------------------ */
  const order = (versions: string[]) => [...versions].sort(compareSemver).join(' ');
  expect(order(['0.1.0', '0.1.0-pre.alpha.10', '0.1.0-pre.alpha.9', '0.1.0-pre.beta.1', '0.0.9', '0.1.0-pre.alpha'])
    === '0.0.9 0.1.0-pre.alpha 0.1.0-pre.alpha.9 0.1.0-pre.alpha.10 0.1.0-pre.beta.1 0.1.0', order(['0.1.0', '0.1.0-pre.alpha.10', '0.1.0-pre.alpha.9', '0.1.0-pre.beta.1', '0.0.9', '0.1.0-pre.alpha']));
  expect(compareSemver('1.0.0-pre.alpha.7', '0.1.0-pre.alpha.8') > 0, 'the numbers rank before the suffix');
  expect(compareSemver('1.2.3', '1.2.3') === 0 && compareSemver('1.2', '1.2.0') === 0, 'equal versions are equal');

  for (const good of ['0.1.0-pre.alpha.8', '1.0.0', '21.0', '3.12.1', '1.0.0-rc1']) {
    expect(isSafeVersion(good), `version ${good} is accepted`);
  }
  for (const bad of ['../x', '1.0.0/..', '1.0.0-../x', '0.1.0-pre..8', '', '1', 'v1.0.0', '1.0.0-', '1.0.0-a b', '..', '0.1.0-pre.alpha.8/', '1.0.0\\..\\x', '1.0.0-pre.alpha.8\n']) {
    expect(!isSafeVersion(bad), `version ${JSON.stringify(bad)} is refused`);
  }
  expect(PRERELEASE_VERSION_PATTERN.exec('novusc 0.1.0-pre.alpha.8\n')?.[1] === '0.1.0-pre.alpha.8', '`novusc version` keeps the suffix');
  expect(PRERELEASE_VERSION_PATTERN.exec('novusc 0.2.0 - the Novus compiler')?.[1] === '0.2.0', 'and a release has none');

  /* ---- errors ---------------------------------------------------------- */
  expect(/limit/.test(model.describeGithubError(new Error('HTTP 403 for https://api.github.com/x'))), 'the rate limit gets its own sentence');
  expect(/HTTP 500/.test(model.describeGithubError(new Error('HTTP 500 for u'))) && /offline/.test(model.describeGithubError(new Error('offline'))), 'other errors say what happened');

  /* ---- installing bare programs ---------------------------------------- */
  const [linux] = model.novusReleases([ALPHA_8], { os: 'linux', arch: 'x64' });
  const plan = model.planFiles(linux.files ?? [], '/s/novus/0.1.0-pre.alpha.8', '/s/.downloads/job', 'linux');
  expect(plan.map((step) => step.target).join(' ') === '/s/novus/0.1.0-pre.alpha.8/bin/novusc /s/novus/0.1.0-pre.alpha.8/bin/novus-lsp', `targets: ${plan.map((step) => step.target).join(' ')}`);
  expect(plan.every((step) => step.mode === 0o755), 'chmod +x on Unix');
  expect(plan.every((step) => step.download.startsWith('/s/.downloads/job/')) && new Set(plan.map((step) => step.download)).size === 2, 'every download has its own file');
  const [windows] = model.novusReleases([ALPHA_8], { os: 'win32', arch: 'x64' });
  expect(model.planFiles(windows.files ?? [], '/h', '/d', 'win32').every((step) => step.mode === null), 'no chmod on Windows');

  /* ---- PATH precedence ------------------------------------------------- */
  const { composePath, withManagedPath, SDK_PATH_VARIABLE } = await import('../../electron/features/lsp-packages/tools/managed-path');
  const sdk = await import('@/core/sdk/env');
  expect(SDK_PATH_VARIABLE === sdk.SDK_PATH_VARIABLE, 'both sides name the same variable');
  expect(composePath('/m/bin', '/n/bin:/usr/bin:/m/bin', ':', ['/n/bin']) === '/n/bin:/m/bin:/usr/bin', 'the managed folder goes behind the chosen SDK');
  expect(composePath('/m/bin', '/usr/bin', ':', ['/n/bin']) === '/m/bin:/usr/bin', 'and in front of the rest when none is chosen');
  const spawned = withManagedPath({ PATH: '/n/bin:/usr/bin', [SDK_PATH_VARIABLE]: '/n/bin' }, '/m/bin', 'linux');
  expect(spawned.PATH === '/n/bin:/m/bin:/usr/bin', `a spawn keeps the chosen Novus first: ${spawned.PATH}`);
  expect(withManagedPath({ PATH: '/usr/bin' }, '/m/bin', 'linux').PATH === '/m/bin:/usr/bin', 'without a choice the add-on folder is first');

  sdk.setBaseEnvironment({ platform: 'linux', pathKey: 'PATH', delimiter: ':', path: '/m/bin:/usr/bin' } as never);
  sdk.setActiveSdks([{ providerId: 'novus', home: '/s/novus/0.1.0-pre.alpha.8', major: 0, origin: 'default', variables: {} }]);
  const env = sdk.sdkEnvironment();
  expect(env.PATH === '/s/novus/0.1.0-pre.alpha.8/bin:/m/bin:/usr/bin', `the renderer puts <home>/bin first: ${env.PATH}`);
  expect(env[SDK_PATH_VARIABLE] === '/s/novus/0.1.0-pre.alpha.8/bin', 'and names it for the main process');

  /* ---- the chosen SDK for server and tool check ------------------------ */
  const novus = await import('@/core/sdk/novus');
  expect(novus.novusCandidates('novus-lsp').join() === '/s/novus/0.1.0-pre.alpha.8/bin/novus-lsp', 'novus-lsp of the SDK is the first candidate');
  expect(novus.novusCandidates('novusc').join() === '/s/novus/0.1.0-pre.alpha.8/bin/novusc', 'novusc of the SDK satisfies the tool check');
  expect(novus.novusCandidates('typescript-language-server').length === 0, 'other programs are not touched');
  expect(novus.novusProgramPath('novusc', { home: 'C:\\n\\0.1.0' }, 'win32') === 'C:\\n\\0.1.0\\bin\\novusc.exe', 'Windows paths get the .exe');
  const decorate = novus.createNovusServerDecorator();
  const config = { label: 'novus-lsp', command: 'novus-lsp' };
  expect(decorate(config, 'novus').env?.[SDK_PATH_VARIABLE] === '/s/novus/0.1.0-pre.alpha.8/bin', 'the server starts with the SDK ahead on its PATH');
  expect(decorate(config, 'novus-html').env?.PATH?.startsWith('/s/novus/') === true, 'also for Novus HTML');
  expect(decorate(config, 'typescript') === config, 'other languages are left alone');
  sdk.setActiveSdks([]);
  expect(novus.novusCandidates('novusc').length === 0 && decorate(config, 'novus') === config, 'without a chosen Novus nothing changes (the add-on copy runs)');
  sdk.setBaseEnvironment({ platform: 'linux', pathKey: 'PATH', delimiter: ':', path: '' } as never);
}
