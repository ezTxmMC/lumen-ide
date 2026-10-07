/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */


import { BrowserWindow } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { type Job } from '../sdk/jdk/types';
import { BIN_NAME, COMMAND_NAME, archiveUrl, check, packageId, selectAsset, validate } from './checks';
import { managedCommand, record, writeLauncher } from './manifest';
import { BIN, CACHE, DEFAULT_PYTHON, IS_WINDOWS, PACKAGES, PLATFORM, ROOT } from './places';
import { Log, fetchFile, fetchJson, findProgram, jobs, onlyFile, run, unpack } from './runner';
import { ensureGo, ensureNode, ensureUv, findDotnet, npmCli, runtimeFor, uvEnvironment } from './toolchains';
import { LspPackage } from './types';

interface NpmPackageJson {
  bin?: string | Record<string, string>;
  name?: string;
}

/** The script behind an npm program name, from the `bin` field of the installed packages. */
async function npmScript(prefix: string, packages: string[], bin: string): Promise<string | null> {
  for (const spec of packages) {
    const name = spec.replace(/(?!^)@.*$/, '');
    const dir = path.join(prefix, 'node_modules', name);
    const json = JSON.parse(await fs.readFile(path.join(dir, 'package.json'), 'utf8').catch(() => '{}')) as NpmPackageJson;
    if (typeof json.bin === 'string' && name.split('/').pop() === bin) {
      return path.join(dir, json.bin);
    }
    if (json.bin && typeof json.bin === 'object' && json.bin[bin]) {
      return path.join(dir, json.bin[bin]);
    }
  }
  return null;
}

async function installNpm(job: Job, log: Log, id: string, spec: Extract<LspPackage, { type: 'npm'; }>, bin: string, command: string) {
  const node = await ensureNode(job, log);
  const prefix = path.join(PACKAGES, id);
  await fs.mkdir(prefix, { recursive: true });
  const env = {
    PATH: `${path.dirname(node)}${path.delimiter}${process.env.PATH ?? ''}`,
    npm_config_cache: path.join(CACHE, 'npm'),
    npm_config_update_notifier: 'false',
    npm_config_fund: 'false',
    npm_config_audit: 'false',
  };
  await run(job, log, node, [npmCli(), 'install', '--prefix', prefix, '--omit=dev', ...spec.packages], { env, cwd: prefix });
  const script = await npmScript(prefix, spec.packages, bin);
  if (!script) {
    throw new Error(`None of ${spec.packages.join(', ')} provides “${bin}”`);
  }
  await writeLauncher(command, script, [node]);
}

async function installPypi(job: Job, log: Log, spec: Extract<LspPackage, { type: 'pypi'; }>, bin: string) {
  const uv = await ensureUv(job, log);
  const args = ['tool', 'install', '--force', '--python', spec.python ?? DEFAULT_PYTHON];
  for (const extra of spec.with ?? []) {
    args.push('--with', extra);
  }
  args.push(spec.package);
  await run(job, log, uv, args, { env: uvEnvironment() });
  if (!(await managedCommand(bin))) {
    throw new Error(`${spec.package} provides no program “${bin}”`);
  }
}

async function installGo(job: Job, log: Log, spec: Extract<LspPackage, { type: 'go'; }>, bin: string) {
  const go = await ensureGo(job, log);
  await fs.mkdir(BIN, { recursive: true });
  const env = {
    GOBIN: BIN,
    GOPATH: path.join(PACKAGES, 'go'),
    GOCACHE: path.join(CACHE, 'go-build'),
    GOMODCACHE: path.join(CACHE, 'go-mod'),
    GOTOOLCHAIN: 'auto',
    GOFLAGS: '-modcacherw',
    GOTELEMETRY: 'off',
    // Go keeps its settings and telemetry under the config folder — keep them in here.
    XDG_CONFIG_HOME: path.join(CACHE, 'go-config'),
    APPDATA: path.join(CACHE, 'go-config'),
    PATH: `${path.dirname(go)}${path.delimiter}${process.env.PATH ?? ''}`,
  };
  await run(job, log, go, ['install', spec.module], { env });
  if (!(await managedCommand(bin))) {
    throw new Error(`${spec.module} provides no program “${bin}”`);
  }
}

async function installDotnet(job: Job, log: Log, spec: Extract<LspPackage, { type: 'dotnet'; }>, bin: string) {
  const dotnet = await findDotnet();
  await fs.mkdir(BIN, { recursive: true });
  const env = { DOTNET_CLI_TELEMETRY_OPTOUT: '1', DOTNET_NOLOGO: '1', NUGET_PACKAGES: path.join(CACHE, 'nuget') };
  await run(job, log, dotnet, ['tool', 'uninstall', '--tool-path', BIN, spec.package], { env }).catch(() => {});
  await run(job, log, dotnet, ['tool', 'install', '--tool-path', BIN, spec.package], { env });
  if (!(await managedCommand(bin))) {
    throw new Error(`${spec.package} provides no program “${bin}”`);
  }
}

interface GithubRelease {
  tag_name: string;
  assets: { name: string; browser_download_url: string; digest?: string | null; }[];
}

async function installRelease(
  job: Job, log: Log, id: string, url: string, name: string, sha256: string,
  bin: string, command: string, runtime: 'python' | 'node' | undefined, executables: string[] = [],
) {
  const file = await fetchFile(job, log, url, name, sha256);
  const target = path.join(PACKAGES, id);
  try {
    await unpack(job, file, name, target, bin);
  } finally {
    await fs.rm(file, { force: true });
  }
  // Zip archives lose the execute bits — scripts the program calls need them back.
  for (const relative of executables) {
    if (IS_WINDOWS) {
      break;
    }
    await fs.chmod(path.join(target, check(relative, BIN_NAME, 'executable')), 0o755).catch(() => {});
  }
  const extensions = runtime || !IS_WINDOWS ? ['', '.cmd', '.bat', '.exe'] : ['.exe', '.cmd', '.bat', ''];
  const program = await findProgram(target, bin, extensions) ?? await onlyFile(target);
  if (!program) {
    throw new Error(`“${bin}” was not found in ${name}`);
  }
  if (!IS_WINDOWS) {
    await fs.chmod(program, 0o755);
  }
  const launch = await runtimeFor(job, log, runtime);
  await writeLauncher(command, program, launch.command, launch.env);
}

/** The pinned release, else the latest one — or the newest pre-release for repositories that only have those. */
async function githubRelease(job: Job, repo: string, version?: string): Promise<GithubRelease> {
  const base = `https://api.github.com/repos/${repo}/releases`;
  if (version) {
    return fetchJson<GithubRelease>(`${base}/tags/${version}`, job.controller.signal);
  }
  try {
    return await fetchJson<GithubRelease>(`${base}/latest`, job.controller.signal);
  } catch (err) {
    const [newest] = await fetchJson<GithubRelease[]>(`${base}?per_page=1`, job.controller.signal).catch(() => []);
    if (!newest) {
      throw err;
    }
    return newest;
  }
}

async function installGithub(job: Job, log: Log, id: string, spec: Extract<LspPackage, { type: 'github'; }>, bin: string, command: string): Promise<string> {
  const release = await githubRelease(job, spec.repo, spec.version);
  const pattern = new RegExp(spec.assets[PLATFORM]);
  const asset = selectAsset(release.assets, pattern);
  if (!asset) {
    throw new Error(`${spec.repo} ${release.tag_name} has no download for ${PLATFORM}`);
  }
  log(`${spec.repo} ${release.tag_name}: ${asset.name}`);
  const sha256 = asset.digest?.startsWith('sha256:') ? asset.digest.slice(7) : '';
  await installRelease(job, log, id, asset.browser_download_url, asset.name, sha256, bin, command, spec.runtime);
  return release.tag_name;
}

async function installArchive(job: Job, log: Log, id: string, spec: Extract<LspPackage, { type: 'archive'; }>, bin: string, command: string) {
  const url = archiveUrl(spec);
  const name = decodeURIComponent(new URL(url).pathname.split('/').pop() || 'download');
  await installRelease(job, log, id, url, name, '', bin, command, spec.runtime, spec.executables ?? []);
}

export async function install(
  jobId: string, raw: LspPackage, rawCommand: string, getWindow: () => BrowserWindow | null,
): Promise<string> {
  if (jobs.has(jobId)) {
    throw new Error('An installation is already running');
  }
  const command = check(rawCommand, COMMAND_NAME, 'command');
  const bin = String(raw?.bin ?? command);
  const spec = validate(raw, bin);
  const id = packageId(spec);
  const job: Job = { controller: new AbortController(), child: null, cancelled: false };
  jobs.set(jobId, job);
  const log: Log = (text) => getWindow()?.webContents.send('lspPackages:log', { jobId, text });
  try {
    await fs.mkdir(ROOT, { recursive: true });
    const version = await installBy(job, log, id, spec, bin, command);
    // Tools that write their own launcher name it after the program.
    const own = await managedCommand(command);
    const written = own ? null : await managedCommand(path.basename(bin));
    if (written) {
      await writeLauncher(command, written);
    }
    await record(id, spec.type, command, version);
    const launcher = await managedCommand(command);
    if (!launcher) {
      throw new Error(`No launcher for “${command}” was created`);
    }
    log(`✓ ${command} → ${launcher}`);
    return launcher;
  } catch (err) {
    if (job.cancelled) {
      throw new Error('Cancelled');
    }
    throw err;
  } finally {
    jobs.delete(jobId);
  }
}

async function installBy(job: Job, log: Log, id: string, spec: LspPackage, bin: string, command: string): Promise<string | undefined> {
  if (spec.type === 'npm') {
    return installNpm(job, log, id, spec, bin, command).then(() => undefined);
  }
  if (spec.type === 'pypi') {
    return installPypi(job, log, spec, bin).then(() => undefined);
  }
  if (spec.type === 'go') {
    return installGo(job, log, spec, bin).then(() => undefined);
  }
  if (spec.type === 'dotnet') {
    return installDotnet(job, log, spec, bin).then(() => undefined);
  }
  if (spec.type === 'github') {
    return installGithub(job, log, id, spec, bin, command);
  }
  return installArchive(job, log, id, spec, bin, command).then(() => undefined);
}
