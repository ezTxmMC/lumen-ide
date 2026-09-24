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
 * Data model of user add-ons, the ones built in the Add-on Studio.
 *
 * Everything here is JSON-serialisable: regular expressions are kept as
 * source text, logic as a node graph. `compile.ts` turns all of it into an
 * ordinary `Addon` object.
 *
 * Each add-on lives in one file, `userData/addons/<id>.lumen-addon.json`.
 */

import type { LspConfig, RunConfig, Snippet, StringRule, Theme } from '@/core/types';

export const USER_ADDON_SCHEMA = 1;
export const USER_ADDON_PREFIX = 'user.';
export const USER_ADDON_EXTENSION = '.lumen-addon.json';

/* ------------------------------------------------------------------ *
 * Graphs (visual scripting)
 * ------------------------------------------------------------------ */

export type PinType = 'exec' | 'string' | 'number' | 'boolean' | 'list' | 'any';

export interface GraphNode {
  id: string;
  /** Node kind from the catalogue, such as `text.concat`. */
  type: string;
  x: number;
  y: number;
  /** Inline values of unconnected data pins and settings, keyed by id. */
  values?: Record<string, string | number | boolean>;
}

export interface PinRef {
  node: string;
  pin: string;
}

export interface GraphEdge {
  id: string;
  from: PinRef;
  to: PinRef;
}

/** A comment box, or a frame grouping nodes. */
export interface GraphComment {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  color?: string;
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  comments?: GraphComment[];
}

/* ------------------------------------------------------------------ *
 * Parts
 * ------------------------------------------------------------------ */

/** A language — like `LanguageSpec`, but with regexes as source text. */
export interface UserLanguage {
  id: string;
  name: string;
  extensions: string[];
  filenames?: string[];
  icon?: string;
  color?: string;
  comments?: { line?: string; block?: [string, string]; };
  keywords?: string[];
  controls?: string[];
  types?: string[];
  builtins?: string[];
  constants?: string[];
  strings?: StringRule[];
  numbers?: string;
  identifier?: string;
  operators?: string;
  meta?: string;
  caseInsensitive?: boolean;
  capitalizedAsType?: boolean;
  indentOpen?: string;
  indentClose?: string;
  indentUnit?: number;
  completions?: string[];
  snippets?: Snippet[];
  run?: RunConfig[];
  lsp?: LspConfig[];
  /**
   * Debug adapters that ship with Lumen, named (`delve`, `debugpy` …). An
   * adapter of your own cannot be declared here because its launch request is
   * code; `core/debug/builtin-adapters.ts` lists the names that work.
   */
  debug?: string[];
  /**
   * A tokenizer that ships with Lumen, named (`markdown`, `markup`, `jsx` …).
   * For the few languages whose highlighting is a program rather than a list
   * of keywords; `core/user-addons/tokenizers.ts` lists the names that work.
   */
  tokenizer?: string;
  priority?: number;
}

/** A theme: either referenced from the Theme Studio or embedded outright. */
export type UserThemeEntry = { ref: string; } | { theme: Theme; };

export interface UserCommand {
  /** Local id; the command ends up called `<add-on-id>.<id>`. */
  id: string;
  title: string;
  category?: string;
  keybinding?: string;
  graph: Graph;
}

export interface UserEventGraph {
  id: string;
  name: string;
  graph: Graph;
}

/** A test on a field: `equals`/`notEquals`; with neither, “set and not false”. */
export interface UserCondition {
  field: string;
  equals?: string;
  notEquals?: string;
}

export interface UserTemplateField {
  id: string;
  label: string;
  type?: 'text' | 'select' | 'toggle';
  default?: string;
  placeholder?: string;
  hint?: string;
  choices?: { value: string; label: string; }[];
  pattern?: string;
  required?: boolean;
  section?: string;
  mono?: boolean;
  /** Only show the field while the condition holds. */
  when?: UserCondition;
  /**
   * Choices fetched over the network (HTTPS, JSON). `choicesPath` points at
   * the list (`versions`, `data.items`); entries are strings, or objects read
   * through `choicesValue`/`choicesLabel` (nested paths allowed: `version.id`).
   * `choicesMatch` keeps only values matching the regular expression.
   *
   * Until the list arrives, `choices` stands in.
   */
  choicesUrl?: string;
  choicesPath?: string;
  choicesValue?: string;
  choicesLabel?: string;
  choicesMatch?: string;
  /** At most this many entries; `choicesReverse` flips the list, newest first. */
  choicesLimit?: number;
  choicesReverse?: boolean;
}

export interface UserTemplateFile {
  path: string;
  content: string;
  /**
   * Only create the file while the condition holds. Several conditions must
   * all hold — a `package.json` often hangs on two or three switches at once.
   */
  when?: UserCondition | UserCondition[];
}

export interface UserTemplate {
  id: string;
  name: string;
  description?: string;
  languageId?: string;
  icon?: string;
  color?: string;
  fields: UserTemplateField[];
  /**
   * Path and contents may use `{{name}}`, `{{slug}}` and `{{field}}`, plus the
   * blocks `{{#if field}}…{{/if}}`, `{{#if field=value}}…{{/if}}` and
   * `{{#unless field}}…{{/unless}}`.
   */
  files: UserTemplateFile[];
  /** Kind the new project is recognised as — one of ours, or an existing id. */
  kindId?: string;
  /**
   * Apply `kindId` only while this condition holds.
   *
   * A documentation template becomes a Python project once it brings MkDocs
   * along; without that it is a folder of Markdown files with no build file
   * for a project kind to hang on.
   */
  kindWhen?: UserCondition;
  open?: string;
  next?: string;
  setup?: { label: string; command: string; args: string[]; }[];
}

/** A detection rule: the file exists, and matches `pattern` when one is given. */
export interface UserKindRule {
  file: string;
  pattern?: string;
}

/**
 * One task per subfolder, instead of a single fixed one.
 *
 * A Go module with `cmd/server` and `cmd/cli` should offer two run tasks, not
 * one generic one. When the folder is missing or empty, the task this sits on
 * stands in as the fallback.
 *
 * `{dir}` stands for the subfolder's name in `label` and `args`.
 */
export interface UserKindTaskPerDir {
  /** Folder whose subfolders become the tasks (`cmd`). */
  dir: string;
  label: string;
  args: string[];
  /** At most this many tasks (four by default) — more would flood the list. */
  limit?: number;
  /** With no subfolders the task disappears entirely, rather than standing in. */
  omitWhenEmpty?: boolean;
}

/**
 * One task per match in a file.
 *
 * A Makefile names its own targets, a `shard.yml` its targets, a
 * `package.json` its scripts. Rather than guess, `pattern` reads them out:
 * the first group is the name, and `{match}` puts it into the label and the
 * arguments.
 *
 * `section` narrows the search the same way it does for facts. With no
 * matches, the task this sits on stands in.
 */
export interface UserKindTaskPerMatch {
  /** One file, or several spellings — the first one present counts. */
  file: string | string[];
  /** Pattern over the text. Not needed when `json` is set. */
  pattern?: string;
  section?: string;
  /**
   * An indented block under a YAML heading (`targets:`) — the counterpart to
   * `section` for files that have no bracketed sections.
   */
  block?: string;
  /**
   * Read the file as JSON and look under this path.
   *
   * An object there means its keys are the matches (`scripts` in a
   * `composer.json`). A list of objects — the presets of a `CMakePresets.json`
   * — means `jsonName` says which field holds the name.
   */
  json?: string;
  /** Field holding the name, when `json` points at a list of objects. */
  jsonName?: string;
  /** Field holding the label; without it, `jsonName` is used. */
  jsonLabel?: string;
  /** Skip entries where this field is true (`hidden`). */
  jsonSkipWhen?: string;
  label: string;
  args: string[];
  limit?: number;
  /** Matches that never become a task (`.PHONY`, `all`). */
  skip?: string[];
  /** Matches hitting this pattern fall away (`^(pre|post)-`). */
  skipPattern?: string;
  /**
   * Label used when there is exactly one match.
   *
   * With a single target the task is simply called “Run”; naming it only
   * pays off from two onwards.
   */
  singleLabel?: string;
  /**
   * With no matches the task disappears entirely, rather than standing in —
   * for tasks that would not exist without their pattern.
   */
  omitWhenEmpty?: boolean;
  /**
   * Grouping by the match's name; the first rule that fits wins. A Makefile
   * target called `test` belongs with the tests, `clean` with the cleanup.
   */
  groups?: { pattern: string; group: 'build' | 'run' | 'test' | 'clean' | 'other'; }[];
}

export interface UserKindTask {
  id: string;
  label: string;
  command: string;
  args: string[];
  group?: 'build' | 'run' | 'test' | 'clean' | 'other';
  /** Wrapper in the project root that replaces `command` when present (`gradlew`, `mvnw`). */
  wrapper?: string;
  detail?: string;
  forEachDir?: UserKindTaskPerDir;
  forEachMatch?: UserKindTaskPerMatch;
  /** Second stage: build first, then run. */
  then?: { command: string; args: string[]; };
  /**
   * Extra arguments depending on which file the project has.
   *
   * The first rule that fits wins, and its arguments go wherever
   * `{extraArgs}` stands. That way a CMake call appends the toolchain of
   * vcpkg or Conan without the task having to know about either.
   */
  argsWhenFile?: { file: string | string[]; args: string[]; }[];
  /**
   * Tasks added only when `forEachMatch` or `forEachDir` found nothing —
   * standing in for what the pattern would otherwise have produced.
   */
  alsoWhenEmpty?: UserKindTask[];
}

/** A fact for the project panel: the first group of `pattern` in `file`. */
export interface UserKindFact {
  label: string;
  file: string;
  /** Pattern over the text; not needed when `json` is set. */
  pattern?: string;
  /** Read the file as JSON and take the value under this path (`require.php`). */
  json?: string;
  /** Use as the project's name, version or description instead of as a fact. */
  role?: 'name' | 'version' | 'description';
  /** Only search inside this TOML/INI section (`package`, `tool.poetry`). */
  section?: string;
}

/**
 * Adding a dependency by running a command.
 *
 * This covers the case where the package manager can do it itself (`go get`,
 * `cargo add`, `composer require`, `dotnet add package`). Writing into the
 * middle of a build file — `pom.xml`, `build.gradle` — stays with the add-ons
 * that ship with Lumen: that is surgery on someone else's XML, and no data
 * format describes it well. For the simpler case of putting lines under a
 * heading, see `UserDependencyEdit`.
 *
 * `args` may use `{name}`, `{version}`, `{scope}` and `{spec}`, where `{spec}`
 * is `name@version`, or just `name` when no version is given.
 */
export interface UserDependencySupport {
  manager: string;
  placeholder: string;
  hint?: string;
  scopes?: { value: string; label: string; }[];
  versionRequired?: boolean;
  /** Separator for `{spec}` — `@` by default (`cargo add x@1.2`). */
  specSeparator?: string;
  /** Command that adds the dependency. Not needed when `edit` is set. */
  command?: string;
  args?: string[];
  label?: string;
  /** Id of the task produced; `<command>:add` by default. */
  id?: string;
  /** Instead of a command: write the entry into the build file. */
  edit?: UserDependencyEdit;
  /**
   * Extra arguments per scope — `{ "dev": ["--dev"] }`. The list goes in
   * wherever the placeholder `{scopeArgs}` stands.
   */
  scopeArgs?: Record<string, string[]>;
}

/**
 * Writing a dependency into the build file.
 *
 * Some package managers have no command for it — Shards expects the entry to
 * appear in `shard.yml`. The shape is always the same: put lines under a
 * heading, and create the heading when it is missing. That, and nothing more,
 * is what this describes.
 *
 * Every field may use `{name}`, `{version}`, `{scope}`, `{spec}` and `{short}`
 * (the last part of the name, `kemalcr/kemal` → `kemal`).
 *
 * A line whose placeholder resolves to nothing is left out, so without a
 * version `  version: {version}` writes no half-finished line.
 */
export interface UserDependencyEdit {
  file: string;
  /** Pattern that finds the section heading (`^{scope}:\\s*$`). */
  sectionPattern: string;
  /** Heading written when the section does not exist yet. */
  sectionHeader: string;
  /** Lines of the entry, without their shared indentation. */
  lines: string[];
  /** Indentation before every line (two spaces by default). */
  indent?: string;
  /** Command to run afterwards (`shards install`). */
  then?: { id?: string; label: string; command: string; args: string[]; };
}

/** A project kind — like `ProjectKind`, but declared as data. */
export interface UserProjectKind {
  id: string;
  name: string;
  icon?: string;
  color?: string;
  /** At least one of these files has to sit in the root (`*` allowed). */
  markers: string[];
  /** Every rule has to hold — `build.gradle.kts` containing `paperweight`, say. */
  rules?: UserKindRule[];
  priority?: number;
  languageIds?: string[];
  tasks: UserKindTask[];
  facts?: UserKindFact[];
  dependencies?: UserDependencySupport;
  /** File the project builds from (`go.mod`, `pom.xml`) — shown in the panel. */
  buildFile?: string;
  /** Read dependencies out of the build file; several passes are allowed. */
  dependencyScan?: UserKindDependencyScan | UserKindDependencyScan[];
  /** Folders holding source code — for the outline and for search (`src`, `tests`). */
  sourceRoots?: string[];
}

/**
 * Reading dependencies out of a build file, for the list in the project panel.
 *
 * `pattern` is applied line by line (`g`, `m`). The first group is the name,
 * the second the version; when a third one matches, `indirectScope` applies.
 *
 * `section` narrows the search to a TOML/INI section (`[dependencies]`,
 * `[dev-dependencies]`), so each group gets its own scope without the pattern
 * needing to know how the file is laid out.
 */
export interface UserKindDependencyScan {
  file: string;
  /** Pattern over the text; not needed when `json` is set. */
  pattern?: string;
  /**
   * Read the file as JSON and take the object under this path — `require` in
   * a `composer.json`, `dependencies` in a `package.json`. The key is the
   * name, the value the version.
   */
  json?: string;
  /** Names hitting this pattern fall away (`^(php|ext-)`). */
  skipPattern?: string;
  /** Only search inside this section. */
  section?: string;
  /** Only search inside this indented YAML block. */
  block?: string;
  /**
   * Pull the version out of the match when it is not in the second group —
   * a line further down in a YAML list, for instance.
   */
  versionPattern?: string;
  /** Scope of these finds (`direct` by default). */
  scope?: string;
  /** Scope when the third group matches (`indirect` by default). */
  indirectScope?: string;
  /** Scope otherwise (`direct` by default). */
  directScope?: string;
}

/** A snippet for any language, including ones from other add-ons such as `java`. */
export interface UserSnippet {
  languageId: string;
  label: string;
  detail?: string;
  body: string;
}

export type UserAddonCategory = 'language' | 'theme' | 'tool';

/** A panel for the docks: Markdown or HTML, shown without scripts. */
export interface UserPanel {
  id: string;
  title: string;
  icon?: string;
  location: 'left' | 'right' | 'bottom';
  format: 'markdown' | 'html';
  content: string;
}

export interface UserAddonModel {
  schema: typeof USER_ADDON_SCHEMA;
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  icon?: string;
  color?: string;
  category?: UserAddonCategory;
  languages: UserLanguage[];
  themes: UserThemeEntry[];
  commands: UserCommand[];
  events: UserEventGraph[];
  templates: UserTemplate[];
  projectKinds: UserProjectKind[];
  snippets: UserSnippet[];
  /** Optional in files from before panels existed; `normalizeModel` fills it in. */
  panels?: UserPanel[];
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

export const emptyGraph = (): Graph => ({ nodes: [], edges: [], comments: [] });

/** Turn a name into a valid identifier (`My Add-on` → `my-add-on`). */
export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function newId(prefix = 'n'): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/** An empty add-on with sensible starting values. */
export function createUserAddon(name: string, existing: string[] = []): UserAddonModel {
  return {
    schema: USER_ADDON_SCHEMA,
    id: uniqueAddonId(slugify(name) || 'addon', existing),
    name,
    version: '1.0.0',
    description: '',
    author: '',
    icon: name.slice(0, 2),
    color: '#7c8cff',
    category: 'tool',
    languages: [],
    themes: [],
    commands: [],
    events: [],
    templates: [],
    projectKinds: [],
    snippets: [],
    panels: [],
  };
}

export function uniqueAddonId(base: string, existing: string[]): string {
  const plain = base.startsWith(USER_ADDON_PREFIX) ? base.slice(USER_ADDON_PREFIX.length) : base;
  const root = `${USER_ADDON_PREFIX}${slugify(plain) || 'addon'}`;
  if (!existing.includes(root)) {
    return root;
  }
  let n = 2;
  while (existing.includes(`${root}-${n}`)) {
    n++;
  }
  return `${root}-${n}`;
}

/** Fill in missing lists — for older or hand-written files. */
export function normalizeModel(raw: unknown): UserAddonModel {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Partial<UserAddonModel>;
  const list = <T,>(value: T[] | undefined): T[] => (Array.isArray(value) ? value : []);
  return {
    ...data,
    schema: USER_ADDON_SCHEMA,
    id: String(data.id ?? ''),
    name: String(data.name ?? ''),
    version: String(data.version ?? '1.0.0'),
    languages: list(data.languages),
    themes: list(data.themes),
    commands: list(data.commands).map((c) => ({ ...c, graph: normalizeGraph(c.graph) })),
    events: list(data.events).map((e) => ({ ...e, graph: normalizeGraph(e.graph) })),
    templates: list(data.templates).map((tpl) => ({ ...tpl, fields: list(tpl.fields), files: list(tpl.files) })),
    projectKinds: list(data.projectKinds).map((kind) => ({
      ...kind,
      markers: list(kind.markers),
      rules: list(kind.rules),
      tasks: list(kind.tasks).map((task) => ({ ...task, args: list(task.args) })),
      facts: list(kind.facts),
    })),
    snippets: list(data.snippets),
    panels: list(data.panels),
  };
}

export function normalizeGraph(graph: Partial<Graph> | undefined): Graph {
  return {
    nodes: Array.isArray(graph?.nodes) ? graph.nodes : [],
    edges: Array.isArray(graph?.edges) ? graph.edges : [],
    comments: Array.isArray(graph?.comments) ? graph.comments : [],
  };
}
