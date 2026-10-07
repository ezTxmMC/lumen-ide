/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

/* ------------------------------------------------------------------ *
 * Projects
 * ------------------------------------------------------------------ */

export type TaskGroup = 'build' | 'run' | 'test' | 'clean' | 'other';

/** A runnable task of a project — build, test, script … */
export interface ProjectTask {
  /** Unique within the project, such as `maven:package`. */
  id: string;
  label: string;
  command: string;
  args: string[];
  group?: TaskGroup;
  /** Relative to the project root, which is also the default. */
  cwd?: string;
  env?: Record<string, string>;
  /** Second stage (compile, then run). */
  then?: { command: string; args: string[]; };
  /** Short description for the panel. */
  detail?: string;
  /**
   * Where a discovered task belongs — a Gradle task group (`Build`, `Help`)
   * or a Maven plugin prefix (`spring-boot`). Used to group custom tasks.
   */
  category?: string;
}

export interface ProjectDependency {
  name: string;
  version?: string;
  /** For instance "test", "dev", "compile". */
  scope?: string;
}

/**
 * A module of a multi-module build — a Maven module listed under `<modules>`
 * or a Gradle project `include`d in the settings script. Modules nest.
 */
export interface ProjectModule {
  /** Unique within the project: the Maven module path or the Gradle project path (`:app:core`). */
  id: string;
  name: string;
  /** Folder relative to the project root (`services/api`). */
  path: string;
  /** A short kind: Maven packaging (`jar`, `pom`) or the Gradle flavour (`application`, `library`). */
  kind?: string;
  /** Tasks scoped to this module (`mvn -pl … -am`, `gradle :app:build`), custom ones included. */
  tasks: ProjectTask[];
  facts?: Record<string, string>;
  dependencies?: ProjectDependency[];
  /** Build file relative to the project root. */
  buildFile?: string;
  modules?: ProjectModule[];
}

export interface ProjectMeta {
  name?: string;
  version?: string;
  description?: string;
  /** Java version, language standard, package manager and the like. */
  facts?: Record<string, string>;
  dependencies?: ProjectDependency[];
  /** Source folders relative to the root (`src/main/java`). */
  sourceRoots?: string[];
  /** File offered when the project opens (`pom.xml`). */
  buildFile?: string;
  /** Modules of a multi-module build, as a tree. */
  modules?: ProjectModule[];
  /** Tasks found in the build files beyond the standard ones — Gradle tasks, Maven plugin goals, profiles. */
  customTasks?: ProjectTask[];
}

export interface ProjectContext {
  root: string;
  /** Reads a file relative to the root; `null` when it is missing. */
  readFile(relative: string): Promise<string | null>;
  exists(relative: string): Promise<boolean>;
  /** Entries of a folder relative to the root (names only). */
  list(relative: string): Promise<{ name: string; isDirectory: boolean; }[]>;
  platform: string;
}

