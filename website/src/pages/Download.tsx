/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { useMemo } from 'react';
import { CopyButton } from '@/components/CopyButton';
import { OsIcon } from '@/components/OsIcon';
import {
  archiveUrl, detectOs, fileKind, fileUrl, formatDate, formatSize, OS_NAME, PLATFORMS, RELEASE_URL, useRelease,
  type Os, type PlatformInfo, type PlatformRelease, type Release, type ReleaseSource,
} from '@/lib/release';

const OS_ORDER: Os[] = ['linux', 'windows', 'mac'];

const OS_HINT: Record<Os, string> = {
  linux: 'Mark the AppImage executable and run it — no installer.',
  windows: 'The installer runs quietly and updates itself; the ZIP is portable.',
  mac: 'Unzip into Applications, then open it from the context menu the first time — the build is ad-hoc signed.',
};

const SOURCE_LABEL: Record<ReleaseSource, string> = {
  live: 'live from latest.json',
  snapshot: 'as of the last site build',
  none: 'release data unavailable',
};

/** The visitor's system first, the others after — nothing hidden. */
function orderedSystems(os: Os | null) {
  if (!os) {
    return OS_ORDER;
  }
  return [os, ...OS_ORDER.filter((candidate) => candidate !== os)];
}

export function Download() {
  const { release, source, loading } = useRelease();
  const os = useMemo(detectOs, []);

  return (
    <>
      <div className="field">
        <div className="mx-auto grid max-w-[1248px] gap-4 px-4 pt-[clamp(48px,7vw,84px)] pb-[clamp(40px,6vw,64px)] sm:px-6">
          <span className="eyebrow text-[#9aa8d8]">Download</span>
          <h1 className="text-[clamp(34px,5vw,56px)] font-bold text-[#f2f4fa]">
            {release ? `Lumen ${release.version}` : 'Lumen'}
          </h1>
          <p className="max-w-[60ch] text-[17.5px] text-[#aab2c6]">
            Free, no account, and it keeps itself up to date. Every package below is listed in the same manifest the
            updater reads, with its SHA-512 — the updater checks it before it installs anything.
          </p>
          <p className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[12px] text-[#737d9c]">
            {release && <span>Released {formatDate(release.releaseDate)}</span>}
            {release?.notes && <span>{release.notes}</span>}
            <span>{loading && source !== 'live' ? 'checking for a newer release…' : SOURCE_LABEL[source]}</span>
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-[1248px] px-4 py-[clamp(40px,6vw,72px)] sm:px-6">
        {!release && <Unavailable loading={loading} />}
        {release && <Systems release={release} os={os} />}
        <Details release={release} />
      </div>
    </>
  );
}

function Unavailable({ loading }: { loading: boolean; }) {
  return (
    <div className="rounded-[14px] border border-edge bg-surface p-6 text-muted">
      {loading && 'Loading the release manifest…'}
      {!loading && (
        <>
          The release manifest could not be loaded. It lives at{' '}
          <a className="text-accent underline underline-offset-2" href={RELEASE_URL}>latest.json</a> — every file is listed
          there with its path and checksum.
        </>
      )}
    </div>
  );
}

function Systems({ release, os }: { release: Release; os: Os | null; }) {
  return (
    <div className="grid items-start gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr))]">
      {orderedSystems(os).map((system) => (
        <SystemCard key={system} release={release} os={system} yours={system === os} />
      ))}
    </div>
  );
}

function SystemCard({ release, os, yours }: { release: Release; os: Os; yours: boolean; }) {
  const platforms = PLATFORMS
    .filter((platform) => platform.os === os)
    .map((platform) => ({ platform, entry: release.platforms[platform.id] }))
    .filter((item): item is { platform: PlatformInfo; entry: PlatformRelease; } => Boolean(item.entry));

  return (
    <section
      className={[
        'grid content-start gap-4 rounded-[14px] border p-5',
        yours ? 'border-accent bg-[rgb(var(--c-accent-rgb)/0.07)]' : 'border-edge bg-surface',
      ].join(' ')}
      aria-label={OS_NAME[os]}
    >
      <header className="flex items-center gap-3">
        <span className="text-accent"><OsIcon os={os} /></span>
        <h2 className="text-[19px] font-semibold tracking-[-0.02em]">{OS_NAME[os]}</h2>
        {yours && (
          <span className="ml-auto rounded-full bg-accent px-2.5 py-0.5 font-mono text-[10px] tracking-[0.1em] text-accent-fg uppercase">
            Your system
          </span>
        )}
      </header>

      {platforms.length === 0 && <p className="text-[14.5px] text-muted">Not part of this release.</p>}

      {platforms.map(({ platform, entry }) => (
        <div key={platform.id} className="grid gap-2">
          <div className="flex items-baseline justify-between gap-3 font-mono text-[11.5px] text-subtle">
            <span>{platform.arch}</span>
            {entry.version !== release.version && <span>v{entry.version}</span>}
          </div>
          {entry.files.map((file) => {
            const url = fileUrl(platform.id, file);
            const primary = file.name === entry.update.name;
            return (
              <div key={file.name} className="grid gap-2 rounded-[10px] border border-edge bg-bg p-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <a href={url} className="min-w-0 truncate font-mono text-[13px] font-medium text-fg hover:text-accent hover:underline">
                    {file.name}
                  </a>
                  <span className="ml-auto font-mono text-[11.5px] text-subtle tabular-nums">{formatSize(file.size)}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-hover px-2 py-0.5 text-[12px] text-muted">{fileKind(file.name)}</span>
                  {primary && <span className="rounded-md bg-hover px-2 py-0.5 text-[12px] text-muted">auto-updates</span>}
                  <span className="ml-auto flex gap-1.5">
                    <CopyButton text={url} className="border-edge text-muted hover:border-accent hover:text-fg" />
                    <CopyButton text={file.sha512} label="SHA-512" className="border-edge text-muted hover:border-accent hover:text-fg" />
                  </span>
                </div>
                <code className="truncate text-[11px] text-subtle" title={file.sha512}>sha512-{file.sha512}</code>
                <a className="font-mono text-[11px] text-subtle hover:text-muted" href={archiveUrl(entry.version, platform.id, file)}>
                  permanent link: /{entry.version}/{platform.id}/
                </a>
              </div>
            );
          })}
        </div>
      ))}

      <p className="text-[13.5px] text-muted">{OS_HINT[os]}</p>
    </section>
  );
}

function Details({ release }: { release: Release | null; }) {
  const missingLinuxArm = release && !release.platforms.linux_aarch64;
  return (
    <div className="mt-12 grid gap-10 lg:grid-cols-2">
      <section className="grid content-start gap-3">
        <h2 className="text-[22px] font-bold">Check a download</h2>
        <p className="text-[15.5px] text-muted">
          The checksums in the manifest are base64-encoded SHA-512 — the form electron-builder writes. To compare one:
        </p>
        <pre className="overflow-x-auto rounded-[10px] border border-edge bg-surface p-4 font-mono text-[12.5px] leading-[1.7] text-muted">
          <span className="text-subtle"># Linux, macOS</span>{'\n'}
          openssl dgst -sha512 -binary Lumen-*.AppImage | base64 -w0{'\n\n'}
          <span className="text-subtle"># Windows (PowerShell 7)</span>{'\n'}
          [Convert]::ToBase64String([Convert]::FromHexString((Get-FileHash .\Lumen-*-setup.exe -Algorithm SHA512).Hash))
        </pre>
        <p className="text-[14px] text-subtle">On macOS, leave out <code>-w0</code>.</p>
      </section>

      <section className="grid content-start gap-3">
        <h2 className="text-[22px] font-bold">From source</h2>
        <pre className="overflow-x-auto rounded-[10px] border border-edge bg-surface p-4 font-mono text-[12.5px] leading-[1.7] text-muted">
          npm install && npm run dev{'\n'}
          npm run dist:linux · dist:win · dist:mac
        </pre>
        <p className="text-[15.5px] text-muted">
          Node and one command. <code>npm run check</code> runs the lot — types, tokenizers, templates, package managers,
          extension manifests and the language server against a real clangd.
        </p>
        <div className="grid gap-2 text-[14px] text-subtle">
          {missingLinuxArm && <p>Linux arm64 is built from source for now — it is not in this release.</p>}
          <p>
            The packages are unsigned, which is also why Lumen installs its own updates rather than going through
            Squirrel. The manifest:{' '}
            <a className="text-accent underline-offset-2 hover:underline" href={RELEASE_URL}>latest.json</a>.
          </p>
        </div>
      </section>
    </div>
  );
}
