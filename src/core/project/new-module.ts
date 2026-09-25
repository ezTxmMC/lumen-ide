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
 * Adding a module to a multi-module build: the new module's build file, and
 * the entry in the parent's (`<module>` in the parent pom, `include` in
 * Gradle's settings). Text in, text out — the files are read and written by
 * `lib/new-module.ts`.
 */

export const MODULE_NAME = /^[A-Za-z0-9][\w.-]*$/;

export interface MavenCoordinates {
  groupId: string;
  artifactId: string;
  version: string;
}

/** The pom without its `<parent>` block and the blocks that hold other artifacts — what is left names the project itself. */
function ownPart(pom: string): string {
  return pom
    .replace(/<parent>[\s\S]*?<\/parent>/, '')
    .replace(/<(dependencies|dependencyManagement|build|profiles|pluginRepositories|repositories|reporting)>[\s\S]*?<\/\1>/g, '');
}

const tag = (text: string, name: string) => new RegExp(`<${name}>\\s*([^<]+?)\\s*</${name}>`).exec(text)?.[1];

/** Group, artifact and version of a pom — the parent's when it has none of its own. */
export function mavenCoordinates(pom: string): MavenCoordinates {
  const own = ownPart(pom);
  const parent = /<parent>([\s\S]*?)<\/parent>/.exec(pom)?.[1] ?? '';
  return {
    groupId: tag(own, 'groupId') ?? tag(parent, 'groupId') ?? 'com.example',
    artifactId: tag(own, 'artifactId') ?? 'parent',
    version: tag(own, 'version') ?? tag(parent, 'version') ?? '1.0.0-SNAPSHOT',
  };
}

/** The parent pom with `name` listed as a module — and `pom` packaging, which a parent needs. */
export function addMavenModule(pom: string, name: string): string {
  let text = pom;
  const entry = `<module>${name}</module>`;
  if (!text.includes(entry)) {
    if (/<\/modules>/.test(text)) {
      text = text.replace(/(\s*)<\/modules>/, `$1    ${entry}$1</modules>`);
    } else {
      text = text.replace(/(\s*)<\/project>\s*$/, `$1    <modules>$1        ${entry}$1    </modules>$1</project>\n`);
    }
  }
  if (/<packaging>\s*pom\s*<\/packaging>/.test(ownPart(text))) {
    return text;
  }
  if (/<packaging>[^<]*<\/packaging>/.test(ownPart(text))) {
    return text.replace(/<packaging>[^<]*<\/packaging>/, '<packaging>pom</packaging>');
  }
  // After the artifact id of the project itself (the one that follows the parent block, if any).
  const start = /<\/parent>/.exec(text)?.index ?? 0;
  const at = text.indexOf('</artifactId>', start);
  if (at < 0) {
    return text;
  }
  const end = at + '</artifactId>'.length;
  const indent = /([ \t]*)<artifactId>[^<]*$/.exec(text.slice(0, at))?.[1] ?? '    ';
  return `${text.slice(0, end)}\n${indent}<packaging>pom</packaging>${text.slice(end)}`;
}

/** The pom of a new module below `parent`. */
export function mavenModulePom(parent: MavenCoordinates, name: string, packaging: 'jar' | 'pom'): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <parent>
        <groupId>${parent.groupId}</groupId>
        <artifactId>${parent.artifactId}</artifactId>
        <version>${parent.version}</version>
    </parent>

    <artifactId>${name}</artifactId>${packaging === 'pom' ? '\n    <packaging>pom</packaging>' : ''}
</project>
`;
}

/** Gradle's settings file with `include` for the module; `kotlin` picks the `.kts` syntax. */
export function addGradleInclude(settings: string, name: string, kotlin: boolean): string {
  const line = kotlin ? `include("${name}")` : `include '${name}'`;
  if (settings.includes(line)) {
    return settings;
  }
  return `${settings.replace(/\s*$/, '')}\n${line}\n`;
}
