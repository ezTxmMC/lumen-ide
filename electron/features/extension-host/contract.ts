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
 * The contract between extension code (running in the main process) and
 * Lumen's interface. Imported by both sides as types only.
 *
 * Extension code never touches the interface directly. It describes what a
 * view should show as plain data (`ViewContent`), and Lumen draws it with its
 * own components — a view looks like the rest of the program no matter who
 * wrote it, and a buggy extension cannot break the window. Clicks, submitted
 * inputs and choices travel back as `ViewActionEvent`s.
 */

/* ------------------------------------------------------------------ *
 * Agents
 * ------------------------------------------------------------------ */

export type AgentBlock =
  | { type: 'text'; text: string; }
  | { type: 'thinking'; text: string; }
  | { type: 'tool'; id: string; name: string; input: Record<string, unknown>; };

/** Token counts and cost of a turn, as far as the provider knows them. */
export interface AgentUsage {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  costUsd?: number;
  durationMs?: number;
  turns?: number;
}

/** Where a slash command comes from; the `/` palette groups by it. */
export type AgentCommandSource = 'builtin' | 'project' | 'user' | 'plugin' | 'skill';

/** A slash command the agent offers, with what the palette shows next to it. */
export interface AgentSlashCommand {
  /** Without the leading `/`. */
  name: string;
  description?: string;
  /** What follows the name, e.g. `<file>` or `[message]`. */
  argumentHint?: string;
  source?: AgentCommandSource;
}

/** A command as providers may report it: a bare name or the full entry. */
export type AgentCommandEntry = string | AgentSlashCommand;

/**
 * What a session can do besides answering. `compact`, `rewind`, `fork`,
 * `rename`, `delete` and `export` are carried out by the provider's `action`;
 * the panel offers only those the agent declares (manifest `capabilities` or
 * the `session` event's). `clear` — a fresh conversation — is always Lumen's own.
 */
export type AgentActionId = 'compact' | 'rewind' | 'fork' | 'rename' | 'delete' | 'export';

export type AgentCapabilities = { [K in AgentActionId]?: boolean; } & {
  /** The agent reports `usage` events (context meter, cost, limits). */
  usage?: boolean;
};

/** A point of the conversation `rewind` can return to. */
export interface AgentCheckpoint {
  id: string;
  label: string;
  at?: number;
}

/** An extra answer a permission prompt offers besides allow and deny. */
export interface AgentPermissionOption {
  /** Handed back as `optionId`. */
  id: string;
  label: string;
  description?: string;
  /** How long the answer holds; shapes the button (`once` is the plain “allow”). */
  scope?: 'once' | 'session' | 'always';
}

/** A rate limit or quota window the agent reports. */
export interface AgentRateLimit {
  label: string;
  /** 0 to 100. */
  usedPercent?: number;
  /** Epoch milliseconds. */
  resetsAt?: number;
}

/** What a provider reports; the host adds `agent` and `chatId`. */
export type AgentEventBody =
  | {
    kind: 'session'; sessionId: string; model?: string; tools?: string[]; slashCommands?: AgentCommandEntry[]; cwd?: string;
    /** Adds to the manifest's `capabilities`. */
    capabilities?: AgentCapabilities;
    /** The mode the agent actually runs in (shown in the toolbar). */
    mode?: string;
    /** The name the agent gave the conversation. */
    title?: string;
  }
  /** `parentId`: the id of the `subagent` this message belongs to; its tools nest under it. */
  | { kind: 'assistant'; blocks: AgentBlock[]; parentId?: string; }
  /** Streamed text of the message being written; replaced by `assistant` once it is complete. */
  | { kind: 'delta'; text: string; thinking?: boolean; }
  | { kind: 'toolResult'; toolUseId: string; text: string; isError: boolean; }
  | {
    kind: 'permission'; requestId: string; tool: string; input: Record<string, unknown>; blockedPath?: string; canRemember: boolean; reason?: string;
    /** Further answers (“allow for this session”, “always for `git *`”); the reply names one in `optionId`. */
    options?: AgentPermissionOption[];
  }
  | { kind: 'permissionSettled'; requestId: string; }
  /** The agent's plan or to-do list, replacing the previous one. */
  | { kind: 'todos'; items: { text: string; status: 'pending' | 'in_progress' | 'completed'; }[]; }
  /** A subagent (Task) starting or ending; later `assistant` events with this `parentId` nest under it. */
  | {
    kind: 'subagent'; id: string; phase: 'start' | 'finish'; description?: string; agentType?: string;
    isError?: boolean; summary?: string;
  }
  /** A line in the chat: “conversation compacted”, “hook blocked the command” … */
  | { kind: 'notice'; level: 'info' | 'warn'; text: string; }
  /**
   * Live numbers for the toolbar; fields left out keep their last value.
   * `costUsd` is the session's total, not the turn's.
   */
  | {
    kind: 'usage'; contextUsed?: number; contextTotal?: number; costUsd?: number; model?: string; mode?: string;
    rateLimits?: AgentRateLimit[];
  }
  | { kind: 'status'; text: string; }
  | { kind: 'result'; isError: boolean; text: string; costUsd?: number; durationMs?: number; usage?: AgentUsage; }
  | { kind: 'error'; message: string; }
  | { kind: 'done'; };

export type AgentEvent = AgentEventBody & { agent: string; chatId: string; };

/** An image or file the user attached to a message. */
export interface AgentAttachment {
  name: string;
  /** Absolute path, when the attachment is a file of the project. */
  path?: string;
  mimeType?: string;
  /** Base64 content, for pasted images. */
  data?: string;
}

/** A level of how hard a model thinks (`low`, `high` …), as the model offers it. */
export interface AgentEffort {
  id: string;
  /** Lumen names the usual levels itself; this is for the others. */
  label?: string;
  description?: string;
}

/** A model an agent offers, with the effort levels it understands. */
export interface AgentModel {
  id: string;
  label: string;
  description?: string;
  /** Empty or missing: the model has no effort levels. */
  efforts?: AgentEffort[];
  /** The level the model uses when none is chosen. */
  defaultEffort?: string;
  /** The model the agent uses when the panel says “Default”. */
  isDefault?: boolean;
}

export interface AgentSendRequest {
  /** `<extension id>/<agent id>`. */
  agent: string;
  chatId: string;
  text: string;
  cwd: string;
  mode: string;
  sessionId?: string;
  /** The model chosen in the panel, overriding the extension's setting. */
  model?: string;
  /** The effort chosen in the panel for that model, overriding the extension's setting. */
  effort?: string;
  attachments?: AgentAttachment[];
  /**
   * The extension's settings as the user set them, with the active profile's
   * extra settings laid over them.
   */
  settings?: Record<string, string>;
  /** A system prompt the user set for this chat only; the agent adds it to its own. */
  systemPrompt?: string;
}

/** A session action asked of the provider (see `AgentActionId`). */
export interface AgentActionRequest {
  agent: string;
  chatId: string;
  action: AgentActionId;
  cwd: string;
  sessionId?: string;
  mode?: string;
  model?: string;
  effort?: string;
  settings?: Record<string, string>;
  /** `compact`: what to keep in mind; `rename`: the new title; `fork`, `export`: unused. */
  argument?: string;
  /** `rewind`: an id from `checkpoints`. */
  checkpointId?: string;
}

/**
 * What an action leaves behind. A `sessionId` moves the chat to that session
 * (`fork`, `rewind` into a new one); `deleted` closes it; `text` of an
 * `export` is offered for saving as `fileName`.
 */
export interface AgentActionResult {
  sessionId?: string;
  title?: string;
  deleted?: boolean;
  notice?: string;
  export?: { fileName: string; text: string; };
}

export interface AgentAnswer {
  agent: string;
  requestId: string;
  allow: boolean;
  remember?: boolean;
  /** One of the prompt's `options`. */
  optionId?: string;
  message?: string;
  /** For a question the agent asks (`AskUserQuestion`): the chosen answer per question text; several choices joined by ", ". */
  answers?: Record<string, string>;
}

/** What an extension implements for each agent it registers. */
export interface AgentProvider {
  send(
    request: {
      chatId: string; text: string; cwd: string; mode: string; sessionId?: string; model?: string; effort?: string;
      attachments?: AgentAttachment[]; settings: Record<string, string>; systemPrompt?: string;
    },
    emit: (event: AgentEventBody) => void,
  ): Promise<void>;
  answer(
    reply: { requestId: string; allow: boolean; remember?: boolean; message?: string; optionId?: string; answers?: Record<string, string>; },
  ): boolean | Promise<boolean>;
  interrupt(chatId: string): void | Promise<void>;
  /** Earlier conversations the user may resume, newest first. */
  sessions?(cwd: string): Promise<{ id: string; title: string; updatedAt?: number; }[]>;
  /**
   * Models the agent offers right now; they come before the ones the manifest
   * lists. `settings` are the extension's (program path, environment);
   * `refresh` asks to skip any cache and ask the program again.
   */
  models?(options: { settings: Record<string, string>; refresh: boolean; }): Promise<AgentModel[]>;
  /**
   * Carries out a session action the agent declared in `capabilities`. May
   * `emit` events (a compaction reports `status`, `notice`, `usage`); `done`
   * follows when it returns.
   */
  action?(request: Omit<AgentActionRequest, 'agent'> & { settings: Record<string, string>; }, emit: (event: AgentEventBody) => void): Promise<AgentActionResult | void>;
  /** The points `rewind` can return to, newest first. */
  checkpoints?(request: { chatId: string; sessionId?: string; cwd: string; settings: Record<string, string>; }): Promise<AgentCheckpoint[]>;
}

/* ------------------------------------------------------------------ *
 * Views
 * ------------------------------------------------------------------ */

/** Colour of a row, a text or a badge — mapped onto the theme's colours. */
export type ViewTone =
  | 'default' | 'muted' | 'accent' | 'success' | 'warning' | 'danger'
  | 'added' | 'modified' | 'deleted' | 'renamed' | 'untracked' | 'conflict';

/**
 * Something the user can trigger. `action` is handed back to the view's
 * `onAction` together with `payload` and the current values of the view's
 * inputs.
 */
export interface ViewAction {
  action: string;
  title: string;
  /** A lucide icon name (`git-commit`, `refresh-cw` …) or a shape of the icon packs. */
  icon?: string;
  payload?: unknown;
  danger?: boolean;
  disabled?: boolean;
  /** Ask before running — the text of the question. */
  confirm?: string;
}

export interface ViewButton extends ViewAction {
  variant?: 'primary' | 'secondary' | 'danger';
}

export type ViewNode =
  | {
      type: 'section';
      id: string;
      title: string;
      badge?: string | number;
      collapsed?: boolean;
      actions?: ViewAction[];
      children: ViewNode[];
    }
  | {
      type: 'item';
      id: string;
      label: string;
      description?: string;
      tooltip?: string;
      /** A lucide icon name or an icon-pack shape. */
      icon?: string;
      iconTone?: ViewTone;
      /** A file name: the row gets that file's icon from the active icon pack. */
      fileIcon?: string;
      badge?: string | number;
      badgeTone?: ViewTone;
      tone?: ViewTone;
      strike?: boolean;
      /** Run on a click on the row. */
      onClick?: ViewAction;
      /** Buttons shown while the row is hovered. */
      actions?: ViewAction[];
      /** Entries of the row's context menu. */
      menu?: ViewAction[];
      children?: ViewNode[];
      expanded?: boolean;
    }
  | {
      type: 'input';
      id: string;
      placeholder?: string;
      value?: string;
      multiline?: boolean;
      rows?: number;
      mono?: boolean;
      /** Ctrl+Enter (multi-line) or Enter runs it. */
      submit?: ViewAction;
    }
  | { type: 'select'; id: string; label?: string; value: string; options: { value: string; label: string; }[]; change?: ViewAction; }
  | { type: 'toggle'; id: string; label: string; value: boolean; change?: ViewAction; }
  | { type: 'buttons'; buttons: ViewButton[]; }
  | { type: 'text'; text: string; tone?: ViewTone; mono?: boolean; small?: boolean; }
  | { type: 'markdown'; content: string; }
  | { type: 'keyValue'; rows: { key: string; value: string; tone?: ViewTone; }[]; }
  | { type: 'empty'; title: string; hint?: string; icon?: string; action?: ViewButton; }
  | { type: 'progress'; label?: string; }
  | { type: 'divider'; }
  /** Its children side by side (inputs, selects, buttons …), wrapping when narrow. */
  | { type: 'row'; id?: string; children: ViewNode[]; }
  | ViewGridNode
  | ViewCodeNode;

/** A cell of a `grid`: shown as text; `null` appears as a dimmed NULL. */
export type GridValue = string | number | boolean | null;

export interface GridColumn {
  id: string;
  title: string;
  /** Under the title and in its tooltip — a column's type, say. */
  detail?: string;
  /** Right-aligned, tabular figures. */
  numeric?: boolean;
  /** Initial width in pixels; the user can drag it. */
  width?: number;
  sortable?: boolean;
  editable?: boolean;
  /** An editable cell also offers “set to NULL”. */
  nullable?: boolean;
  /** A key column — marked in the header. */
  key?: boolean;
}

export interface GridRow {
  id: string;
  cells: GridValue[];
  tone?: ViewTone;
  strike?: boolean;
  /** Indices of cells changed but not saved yet — highlighted. */
  changed?: number[];
}

/**
 * A table of rows — query results, table data, keys. Only the visible rows are
 * drawn, so tens of thousands are fine. Every action it raises carries the
 * action's own `payload` as `data` next to what happened.
 */
export interface ViewGridNode {
  type: 'grid';
  id: string;
  columns: GridColumn[];
  rows: GridRow[];
  sort?: { column: string; direction: 'asc' | 'desc'; };
  /** A click on a sortable header; payload `{ column, direction, data }` (`direction` null: unsorted). */
  onSort?: ViewAction;
  /** An edited cell; payload `{ row, column, value, data }` — `value` is the typed text or `null`. */
  onEdit?: ViewAction;
  /** Double-click or Enter on a row (a single click with `activate: 'click'`); payload `{ row, data }`. */
  onOpen?: ViewAction;
  activate?: 'click' | 'double';
  /** Row selection. The selected ids reach every action as a JSON list in `inputs[<grid id>]`. */
  select?: 'single' | 'multi';
  /** The rows' context menu; the selection travels in the inputs. */
  menu?: ViewAction[];
  /** A footer to page through; the action's payload is `{ offset, data }`. */
  paging?: { offset: number; limit: number; total?: number; more?: boolean; action: ViewAction; };
  /** Take the free height of a `fill` view; otherwise `height` pixels (default 320). */
  grow?: boolean;
  height?: number;
  /** Shown when there are no rows. */
  empty?: string;
}

/**
 * A code editor as an input — an SQL console, a JSON document. Its text is in
 * `inputs[<id>]`, the selected text in `inputs['<id>.selection']`.
 */
export interface ViewCodeNode {
  type: 'code';
  id: string;
  value?: string;
  /** A language id Lumen knows (`sql`, `json` …) for highlighting. */
  language?: string;
  placeholder?: string;
  /** Height in lines when not growing (default 8). */
  rows?: number;
  grow?: boolean;
  readOnly?: boolean;
  /** Ctrl+Enter runs it. */
  submit?: ViewAction;
}

export interface ViewContent {
  nodes: ViewNode[];
  /**
   * `scroll` (default): the nodes stack and the view scrolls. `fill`: the view
   * takes the full height and a `grid` or `code` with `grow` gets the rest —
   * for editor views built around a table.
   */
  layout?: 'scroll' | 'fill';
  /** Buttons in the dock header. */
  toolbar?: ViewAction[];
  /** A counter on the view's icon or tab. */
  badge?: string | number;
  /** Overrides the declared title while set. */
  title?: string;
}

export interface ViewActionEvent {
  action: string;
  payload?: unknown;
  /** The values of every `input`, `select`, `toggle`, `code` and grid selection of the view, by id. */
  inputs: Record<string, string | boolean>;
  /** Which open tab of an editor view (`location: "editor"`) raised it. */
  instance?: string;
}

export interface ViewProvider {
  /** `instance` names the tab of an editor view; docked views get none. */
  render(instance?: string): ViewContent | Promise<ViewContent>;
  onAction?(event: ViewActionEvent): unknown | Promise<unknown>;
  /** The view became visible — a good moment to refresh. */
  onShow?(instance?: string): void;
  /** A tab of an editor view was closed — release what it held. */
  onClose?(instance: string): void;
}

/* ------------------------------------------------------------------ *
 * Status bar, dialogs, events
 * ------------------------------------------------------------------ */

export interface StatusItem {
  text: string;
  tooltip?: string;
  /** A lucide icon name or an icon-pack shape. */
  icon?: string;
  tone?: ViewTone;
  /** A command of the extension (`commands.register`) run on click. */
  command?: string;
  /** Defaults to `left`. */
  side?: 'left' | 'right';
  /** Higher comes first within its side. */
  priority?: number;
}

/** A field of `ui.input` — rendered by Lumen's form dialog. */
export interface InputField {
  id: string;
  label: string;
  type?: 'text' | 'password' | 'textarea' | 'select' | 'toggle';
  value?: string;
  placeholder?: string;
  hint?: string;
  required?: boolean;
  choices?: { value: string; label: string; }[];
  mono?: boolean;
}

/** Something the extension code asks the interface to do. */
export type UiMessage =
  | { kind: 'notify'; message: string; tone: 'info' | 'success' | 'warning' | 'error'; }
  | { kind: 'openFile'; path: string; line?: number; column?: number; }
  /** Docked views are revealed; an editor view opens (or focuses) the tab `instance`, named `title`. */
  | { kind: 'showView'; viewId: string; instance?: string; title?: string; }
  | { kind: 'runInTerminal'; command: string; cwd?: string; title?: string; }
  | { kind: 'refreshProject'; }
  /** A read-only tab with text the extension made — a diff, a pull request's description. */
  | { kind: 'openDocument'; name: string; content: string; languageId?: string; };

/** A question the extension code waits for an answer to. */
export type UiRequest =
  | { kind: 'confirm'; title: string; message: string; confirmLabel?: string; danger?: boolean; }
  | { kind: 'input'; title: string; description?: string; fields: InputField[]; submitLabel?: string; }
  | { kind: 'pick'; title: string; items: { value: string; label: string; detail?: string; }[]; placeholder?: string; };

/** What the interface tells running extensions about. */
export type HostEvent =
  | { kind: 'fileSaved'; path: string; }
  /** Also sent once at startup. `languageId`/`languageName` as Lumen detected them for the tab. */
  | { kind: 'activeFile'; path: string | null; languageId?: string; languageName?: string; }
  | { kind: 'windowFocus'; }
  | { kind: 'windowBlur'; }
  /** The open project: its root folder and the name Lumen shows for it — also sent once at startup. */
  | { kind: 'project'; root: string | null; name: string | null; }
  | { kind: 'viewVisible'; extensionId: string; viewId: string; }
  /** The interface language changed (`de`, `en` …) — also sent once at startup. */
  | { kind: 'locale'; language: string; };

/* ------------------------------------------------------------------ *
 * Formatters and checkers
 * ------------------------------------------------------------------ */

/** What identifies a file to a formatter or checker. */
export interface FileRef {
  /** Absolute path; `null` for a tab that was never saved. */
  path: string | null;
  /** Lumen's language id for the tab (`typescript`, `java` …); `null` when no language matched. */
  languageId: string | null;
}

/** Editor-level options the formatter should honour unless a project file of its own says otherwise. */
export interface FormatOptions {
  tabWidth: number;
  useTabs: boolean;
  /** `keep` leaves line endings as they are. */
  endOfLine: 'keep' | 'lf' | 'crlf';
  trimTrailingWhitespace: boolean;
  insertFinalNewline: boolean;
}

export interface FormatRequest extends FileRef {
  text: string;
  /** Character offsets of the selection; missing: the whole document. */
  range?: { from: number; to: number; };
  options: FormatOptions;
  /** The open project's root, `null` without one. */
  workspace: string | null;
}

export interface FormatResult {
  /** The whole document after formatting (a range request still returns the whole document). */
  text: string;
  /** Who did it, for the status line — `Pureline 1.1 (.pureline)`, `Prettier 3.3`. */
  engine?: string;
  /** Things worth telling the user: a config that could not be read, a tool that was missing. */
  notes?: string[];
}

/** Formats documents. The first registered provider that `supports` a file gets it; higher `priority` first. */
export interface FormatterProvider {
  supports(file: FileRef): boolean | Promise<boolean>;
  /** `null` leaves the document untouched. */
  format(request: FormatRequest): Promise<FormatResult | null>;
}

export type CheckSeverity = 'error' | 'warning' | 'info' | 'hint';

export interface CheckDiagnostic {
  /** Zero-based line and column (UTF-16 units) of the start. */
  line: number;
  column: number;
  /** Zero-based end; missing: to the end of the line. */
  endLine?: number;
  endColumn?: number;
  severity: CheckSeverity;
  message: string;
  /** A stable rule id (`PL-CF-002`). */
  code?: string;
  /** Shown as the diagnostic's source (`Pureline`). */
  source?: string;
  /** What to do about it, shown below the message. */
  suggestion?: string;
}

export interface CheckRequest extends FileRef {
  text: string;
  workspace: string | null;
}

/** Checks documents and reports diagnostics; shown like a language server's. */
export interface DiagnosticProvider {
  supports(file: FileRef): boolean | Promise<boolean>;
  check(request: CheckRequest): Promise<CheckDiagnostic[]>;
}

/** A rule an extension adds to Lumen's security scanner — plain data, never code. */
export interface SecurityRuleSpec {
  /** Unique within the extension; Lumen prefixes it (`ext.name:rule`). */
  id: string;
  title: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  /** Where it applies. */
  targets: ('command' | 'extension' | 'project')[];
  /** A regular expression as text, matched per line (flags: `i`). */
  pattern: string;
  message?: string;
}
