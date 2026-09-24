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
 * Java as an SDK provider: the catalogue from the foojay Disco API
 * (https://api.foojay.io/disco/v3.0), with installation and detection in the
 * main process.
 */

import type {
  CatalogOptions, DetectedJdk, InstalledSdk, SdkDistribution, SdkPackage, SdkProvider,
} from './types';

const DISCO = 'https://api.foojay.io/disco/v3.0';
const MIN_MAJOR = 8;
/** Smaller “packages” are broken placeholders, as some prereleases are. */
const MIN_SIZE = 1024 * 1024;

export const JAVA_DISTRIBUTIONS: SdkDistribution[] = [
  { id: 'temurin', name: 'Eclipse Temurin', vendor: 'Eclipse Adoptium', color: '#ff1464', featured: true, downloadable: true },
  { id: 'corretto', name: 'Amazon Corretto', vendor: 'Amazon', color: '#ff9900', featured: true, downloadable: true },
  { id: 'oracle_open_jdk', name: 'OpenJDK', vendor: 'Oracle · jdk.java.net', color: '#e8423b', featured: true, downloadable: true },
  { id: 'zulu', name: 'Azul Zulu', vendor: 'Azul', color: '#2fa4e7', featured: true, downloadable: true },
  { id: 'liberica', name: 'Liberica', vendor: 'BellSoft', color: '#3fb56a', downloadable: true },
  { id: 'microsoft', name: 'Microsoft Build of OpenJDK', vendor: 'Microsoft', color: '#7fba00', downloadable: true },
  { id: 'sap_machine', name: 'SapMachine', vendor: 'SAP', color: '#f0ab00', downloadable: true },
  { id: 'graalvm_community', name: 'GraalVM CE', vendor: 'GraalVM Community', color: '#b36cf0', downloadable: true },
  { id: 'semeru', name: 'IBM Semeru', vendor: 'IBM', color: '#5b8cff', downloadable: true },
  { id: 'redhat', name: 'Red Hat OpenJDK', vendor: 'Red Hat', color: '#ee0000', downloadable: false },
  { id: 'jetbrains', name: 'JetBrains Runtime', vendor: 'JetBrains', color: '#fe2857', downloadable: false },
  { id: 'openjdk', name: 'OpenJDK', vendor: '', color: '#8a94a6', downloadable: false },
];

/** Implementor from the `release` file → distribution. Order matters: GraalVM before Oracle. */
const IMPLEMENTORS: [RegExp, string][] = [
  [/adoptium|adoptopenjdk|temurin/i, 'temurin'],
  [/amazon|corretto/i, 'corretto'],
  [/azul|zulu/i, 'zulu'],
  [/bellsoft|liberica/i, 'liberica'],
  [/microsoft/i, 'microsoft'],
  [/\bsap\b|sapmachine/i, 'sap_machine'],
  [/graalvm/i, 'graalvm_community'],
  [/\bibm\b|international business machines|semeru/i, 'semeru'],
  [/red ?hat/i, 'redhat'],
  [/jetbrains/i, 'jetbrains'],
  [/oracle/i, 'oracle_open_jdk'],
];

export function javaDistribution(id: string): SdkDistribution {
  return JAVA_DISTRIBUTIONS.find((d) => d.id === id) ?? JAVA_DISTRIBUTIONS[JAVA_DISTRIBUTIONS.length - 1];
}

function distributionOf(jdk: DetectedJdk): string {
  if (jdk.distribution) {
    return jdk.distribution;
  }
  const text = `${jdk.implementor} ${jdk.implementorVersion} ${jdk.home.split(/[\\/]/).slice(-2).join(' ')}`;
  const hit = IMPLEMENTORS.find(([pattern]) => pattern.test(text));
  return hit ? hit[1] : 'openjdk';
}

/** Platform parameters of the Disco API. */
const OS: Record<string, string> = { linux: 'linux', darwin: 'macos', win32: 'windows' };
const ARCH: Record<string, string> = { x64: 'x64', arm64: 'aarch64', ia32: 'x86', arm: 'arm' };

interface DiscoPackage {
  id: string;
  archive_type: string;
  distribution: string;
  major_version: number;
  java_version: string;
  release_status: 'ga' | 'ea';
  term_of_support: string;
  javafx_bundled: boolean;
  directly_downloadable: boolean;
  filename: string;
  size: number;
}

/** `1.8.0_392` → `8.0.392`, dropping the build suffix (`+7`, `-ea`) — for comparing the release file with the catalogue. */
export function normalizeJavaVersion(version: string): string {
  return version.replace(/^1\.(\d+)\.(\d+)_(\d+)/, '$1.$2.$3').split(/[+-]/)[0];
}

/** Numeric version comparison: `21.0.12.1+1` > `21.0.2+13`. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(/[^0-9]+/).filter(Boolean).map(Number);
  const pb = b.split(/[^0-9]+/).filter(Boolean).map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
}

export function catalogUrl(platform: string, arch: string, options: CatalogOptions): string {
  const params = new URLSearchParams();
  for (const d of JAVA_DISTRIBUTIONS.filter((entry) => entry.downloadable)) {
    params.append('distribution', d.id);
  }
  params.set('architecture', ARCH[arch] ?? arch);
  params.set('archive_type', platform === 'win32' ? 'zip' : 'tar.gz');
  params.set('package_type', 'jdk');
  params.set('operating_system', OS[platform] ?? platform);
  params.set('latest', 'available');
  params.append('release_status', 'ga');
  if (options.earlyAccess) {
    params.append('release_status', 'ea');
  }
  if (platform === 'linux') {
    params.set('lib_c_type', 'glibc');
  }
  return `${DISCO}/packages?${params.toString()}`;
}

/** Raw API data → tidied packages: per distribution, major version and status, with only the newest JavaFX build. */
export function normalizePackages(raw: DiscoPackage[]): SdkPackage[] {
  // Prereleases only for upcoming major versions — old EA builds are superseded.
  const newestGa = Math.max(0, ...raw.filter((entry) => entry.release_status === 'ga').map((entry) => entry.major_version));
  const best = new Map<string, SdkPackage>();
  for (const entry of raw) {
    if (entry.major_version < MIN_MAJOR || !entry.directly_downloadable) {
      continue;
    }
    if (entry.release_status === 'ea' && entry.major_version <= newestGa) {
      continue;
    }
    if (entry.size > 0 && entry.size < MIN_SIZE) {
      continue;
    }
    const pkg: SdkPackage = {
      id: entry.id,
      providerId: 'java',
      distribution: entry.distribution,
      version: entry.java_version,
      major: entry.major_version,
      lts: entry.term_of_support?.toLowerCase() === 'lts',
      earlyAccess: entry.release_status === 'ea',
      bundled: Boolean(entry.javafx_bundled),
      size: Math.max(0, entry.size),
      filename: entry.filename,
      archiveType: entry.archive_type,
    };
    const key = `${pkg.distribution}|${pkg.major}|${pkg.earlyAccess}|${pkg.bundled}`;
    const known = best.get(key);
    if (known && compareVersions(known.version, pkg.version) >= 0) {
      continue;
    }
    best.set(key, pkg);
  }
  const order = (id: string) => {
    const index = JAVA_DISTRIBUTIONS.findIndex((d) => d.id === id);
    return index === -1 ? 99 : index;
  };
  return [...best.values()].sort((a, b) =>
    b.major - a.major || order(a.distribution) - order(b.distribution) || Number(a.earlyAccess) - Number(b.earlyAccess));
}

export const javaProvider: SdkProvider = {
  id: 'java',
  name: 'Java',
  distributions: JAVA_DISTRIBUTIONS,

  async catalog(options) {
    const env = await window.lumen.sdk.environment();
    const url = catalogUrl(env.platform, env.arch, options);
    const response = await window.lumen.net.fetchJson<{ result?: DiscoPackage[]; }>(url);
    return normalizePackages(response.result ?? []);
  },

  install(pkg, jobId) {
    return window.lumen.sdk.install({
      jobId,
      kind: 'java',
      packageId: pkg.id,
      distribution: pkg.distribution,
      version: pkg.version,
    });
  },

  async detect() {
    const found = await window.lumen.sdk.detect('java');
    return found.map<InstalledSdk>((jdk) => {
      const distribution = distributionOf(jdk);
      return {
        providerId: 'java',
        home: jdk.home,
        version: jdk.version,
        major: jdk.major,
        distribution,
        vendor: jdk.implementor,
        sources: jdk.sources,
        managed: jdk.managed,
        runtimeOnly: jdk.jreOnly,
      };
    });
  },

  variables(sdk) {
    return { JAVA_HOME: sdk.home };
  },
};

/** Name of the runtime for jdtls (`java.configuration.runtimes`). */
export function jdtlsRuntimeName(major: number): string {
  if (major <= 8) {
    return `JavaSE-1.${major}`;
  }
  return `JavaSE-${major}`;
}
