/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import type { ProjectTask, ProjectMeta, ProjectContext } from './project';
import type { FormValues, FormField } from './forms';

/* ------------------------------------------------------------------ *
 * Project kinds and package managers
 * ------------------------------------------------------------------ */

export interface DependencySpec {
  name: string;
  version?: string;
  scope?: string;
}

/**
 * Outcome of “add dependency”: either a command for the package manager
 * (`npm add`, `cargo add`) or an edit to the build file (`pom.xml`,
 * `vcpkg.json`), optionally followed by a command.
 */
export type DependencyAction =
  | { type: 'task'; task: ProjectTask; }
  | { type: 'edit'; file: string; content: string; then?: ProjectTask; };

export interface DependencySupport {
  /** What the package manager is called — “npm”, “vcpkg”, “Maven”. */
  manager: string;
  /** Placeholder for the name field, such as `org.slf4j:slf4j-api`. */
  placeholder: string;
  hint?: string;
  /** Scopes, such as compile/test or dependencies/devDependencies. */
  scopes?: { value: string; label: string; }[];
  /** Does a version have to be given, as Maven requires? */
  versionRequired?: boolean;
  add(ctx: ProjectContext, dep: DependencySpec): Promise<DependencyAction> | DependencyAction;
}

/**
 * A kind of project an add-on recognises — Maven, CMake, npm …
 *
 * Recognition goes through `markers` in the project root; tasks and metadata
 * come out of the build files.
 */
export interface ProjectKind {
  id: string;
  name: string;
  /** One or two characters for the panel. */
  icon?: string;
  color?: string;
  /**
   * Files of which at least one must sit in the root. Simple `*` patterns
   * are allowed (`*.csproj`).
   */
  markers: string[];
  /**
   * A closer look once the markers matched — whether `build.gradle` uses a
   * particular plugin, say. `false` rejects the kind despite the markers.
   */
  detect?(ctx: ProjectContext): Promise<boolean> | boolean;
  /** Higher wins when several kinds match. Defaults to 0. */
  priority?: number;
  /** Languages this kind is typical for. */
  languageIds?: string[];
  /** `build` for build systems, `packages` for plain package managers (vcpkg, Conan). */
  role?: 'build' | 'packages';
  tasks(ctx: ProjectContext): Promise<ProjectTask[]> | ProjectTask[];
  inspect?(ctx: ProjectContext): Promise<ProjectMeta> | ProjectMeta;
  /** Adding dependencies through this kind's package manager. */
  dependencies?: DependencySupport;
}

/* ------------------------------------------------------------------ *
 * Project templates
 * ------------------------------------------------------------------ */

export interface TemplateContext {
  /** Project name, as typed. */
  name: string;
  /** Cleaned-up name for folders, artefacts and packages (`my-project`). */
  slug: string;
  /** Path of the new project. */
  dir: string;
  /** Every field value of the template, filled in, defaults applied. */
  values: FormValues;
}

/** A template for “New project”. */
export interface ProjectTemplate {
  id: string;
  name: string;
  description?: string;
  /**
   * The group on the project page — “Minecraft”, “Web”, “JVM” … Without one
   * the template's language names the group.
   */
  category?: string;
  /** Search terms beyond the name — “spigot bukkit plugin”, say. */
  keywords?: string[];
  languageId?: string;
  /** Kind of project this produces (`maven`, say) — may depend on the fields. */
  kindId?: string | ((values: FormValues) => string | undefined);
  icon?: string;
  color?: string;
  /** Fields in the dialog, beyond name and target folder. */
  fields?: FormField[];
  /**
   * Relative path → contents. May be asynchronous (to fetch a file); the
   * project page previews the paths of a synchronous result only.
   */
  files(ctx: TemplateContext): Record<string, string> | Promise<Record<string, string>>;
  /** File opened once the project exists (relative). */
  open?: string | ((ctx: TemplateContext) => string);
  /** Commands to run afterwards — installing dependencies and such — only on request. */
  setup?(ctx: TemplateContext): ProjectTask[];
  /** A hint shown once the project is created. */
  next?: string | ((ctx: TemplateContext) => string);
}

