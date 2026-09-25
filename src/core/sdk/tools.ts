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
 * The SDKs beside Java as providers: Node.js, Go, Gradle, Maven, Deno, Bun,
 * Kotlin and Zig. Catalogue, installation and detection live in the main
 * process (`electron/features/sdk-tools.ts`); this is the description the
 * interface needs — a name, a colour, the language add-on the SDK belongs to,
 * and the variables a chosen SDK sets for tasks and terminals.
 */

import type { InstalledSdk, SdkPackage, SdkProvider } from './types';

export interface ToolInfo {
  id: string;
  name: string;
  color: string;
  /** What it is for, one short line. */
  purpose: string;
  /** The add-on (or language) that brings it, for the label in the list. */
  addon: string;
  /** Variables for a chosen SDK, from its home. */
  variables(home: string): Record<string, string>;
  /** The folder with the executable, relative to the home; `bin` when left out. */
  binSubdir?(platform: string): string;
}

export const TOOLS: ToolInfo[] = [
  { id: 'node', name: 'Node.js', color: '#5fa04e', purpose: 'JavaScript runtime', addon: 'JavaScript · TypeScript', variables: () => ({}), binSubdir: (platform) => (platform === 'win32' ? '' : 'bin') },
  { id: 'go', name: 'Go', color: '#00add8', purpose: 'Go toolchain', addon: 'Go', variables: (home) => ({ GOROOT: home }) },
  { id: 'gradle', name: 'Gradle', color: '#02303a', purpose: 'Build tool for Java, Kotlin and Android', addon: 'Java · Kotlin', variables: (home) => ({ GRADLE_HOME: home }) },
  { id: 'maven', name: 'Apache Maven', color: '#c71a36', purpose: 'Build tool for Java', addon: 'Java', variables: (home) => ({ MAVEN_HOME: home, M2_HOME: home }) },
  { id: 'deno', name: 'Deno', color: '#70ffaf', purpose: 'JavaScript and TypeScript runtime', addon: 'TypeScript', variables: () => ({}), binSubdir: () => '' },
  { id: 'bun', name: 'Bun', color: '#fbf0df', purpose: 'JavaScript runtime and package manager', addon: 'JavaScript · TypeScript', variables: () => ({}), binSubdir: () => '' },
  { id: 'kotlin', name: 'Kotlin compiler', color: '#a97bff', purpose: 'kotlinc, the command-line compiler', addon: 'Kotlin', variables: (home) => ({ KOTLIN_HOME: home }) },
  { id: 'zig', name: 'Zig', color: '#f7a41d', purpose: 'Zig compiler and build system', addon: 'Zig', variables: () => ({}), binSubdir: () => '' },
  { id: 'python', name: 'Python', color: '#3776ab', purpose: 'Python interpreter (standalone builds)', addon: 'Python', variables: () => ({}), binSubdir: (platform) => (platform === 'win32' ? '' : 'bin') },
  { id: 'dotnet', name: '.NET SDK', color: '#512bd4', purpose: 'Build and run C#, F# and Visual Basic', addon: 'C#', variables: (home) => ({ DOTNET_ROOT: home }), binSubdir: () => '' },
  { id: 'rust', name: 'Rust', color: '#dea584', purpose: 'rustc and cargo', addon: 'Rust', variables: () => ({}) },
  { id: 'dart', name: 'Dart SDK', color: '#0175c2', purpose: 'Dart compiler and pub', addon: 'Dart', variables: (home) => ({ DART_SDK: home }) },
  { id: 'flutter', name: 'Flutter', color: '#02569b', purpose: 'UI toolkit for mobile, web and desktop', addon: 'Flutter', variables: (home) => ({ FLUTTER_ROOT: home }) },
  { id: 'sbt', name: 'sbt', color: '#c22d40', purpose: 'Build tool for Scala', addon: 'Scala', variables: () => ({}) },
  { id: 'cmake', name: 'CMake', color: '#064f8c', purpose: 'Build system generator for C and C++', addon: 'C · C++', variables: () => ({}), binSubdir: (platform) => (platform === 'darwin' ? 'CMake.app/Contents/bin' : 'bin') },
  { id: 'ninja', name: 'Ninja', color: '#8a8a8a', purpose: 'Fast build runner for CMake and others', addon: 'C · C++', variables: () => ({}), binSubdir: () => '' },
  { id: 'julia', name: 'Julia', color: '#9558b2', purpose: 'Julia language', addon: 'Julia', variables: () => ({}) },
];

/** Display name and colour of any SDK id, Java included. */
export function sdkTitle(id: string): { name: string; color: string; } {
  if (id === 'java') {
    return { name: 'Java', color: '#f89820' };
  }
  const tool = toolInfo(id);
  return { name: tool?.name ?? id, color: tool?.color ?? '#8a94a6' };
}

export const toolInfo = (id: string) => TOOLS.find((tool) => tool.id === id) ?? null;

const joinPath = (home: string, sub: string, platform: string) => {
  const sep = platform === 'win32' ? '\\' : '/';
  const base = home.replace(/[\\/]+$/, '');
  return sub ? `${base}${sep}${sub}` : base;
};

function toolProvider(info: ToolInfo): SdkProvider {
  return {
    id: info.id,
    name: info.name,
    distributions: [{ id: info.id, name: info.name, vendor: '', color: info.color, featured: true, downloadable: true }],

    async catalog() {
      const list = await window.lumen.sdk.tools.catalog(info.id);
      return list.map<SdkPackage>((entry) => ({
        id: entry.id,
        providerId: info.id,
        distribution: info.id,
        version: entry.version,
        major: entry.major,
        lts: entry.lts,
        earlyAccess: false,
        bundled: false,
        size: entry.size,
        filename: entry.filename,
        archiveType: entry.filename.replace(/^.*?\.(tar\.\w+|zip|tgz)$/i, '$1'),
      }));
    },

    install(pkg, jobId) {
      return window.lumen.sdk.tools.install({ jobId, toolId: info.id, version: pkg.version });
    },

    async detect() {
      const found = await window.lumen.sdk.tools.detect(info.id);
      return found.map<InstalledSdk>((entry) => ({
        providerId: info.id,
        home: entry.home,
        version: entry.version,
        major: Number(entry.version.split('.')[0]) || 0,
        distribution: info.id,
        vendor: '',
        sources: entry.sources,
        managed: entry.managed,
        runtimeOnly: false,
      }));
    },

    variables: (sdk) => info.variables(sdk.home),

    binDir: (home, platform) => joinPath(home, info.binSubdir?.(platform) ?? 'bin', platform),
  };
}

export const toolProviders: SdkProvider[] = TOOLS.map(toolProvider);
