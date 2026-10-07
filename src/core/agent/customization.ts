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
 * What the user can shape in an agent chat without code: quick actions, prompt
 * template commands and profiles. Each lives in a `textarea` or `list`
 * setting of the extension (the manifest names the key), one entry per line,
 * fields separated by `|`:
 *
 *   quick action   Label | prompt
 *   command        name | description | prompt
 *   profile        Label | mode=plan | model=… | effort=high | anyKey=value
 *
 * Inside a prompt `\n` is a line break. Lines starting with `#` are comments.
 */

import type { AgentCommandEntry, AgentSlashCommand } from '../../../electron/features/extension-host/contract';
import type { ExtensionAgentCommand, ExtensionAgentProfile, ExtensionAgentQuickAction } from '@/core/extensions/types';

export interface PromptVariables {
  selection: string;
  file: string;
  clipboard: string;
  args: string;
}

const COMMAND_NAME = /^[A-Za-z0-9][A-Za-z0-9:_.-]*$/;
const PROFILE_FIELDS = new Set(['mode', 'model', 'effort']);

const unescape = (value: string) => value.replace(/\\n/g, '\n');

/** The non-empty, non-comment lines of a setting, split at `|`. */
function rows(value: string | undefined): string[][] {
  return (value ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => line.split('|').map((part) => part.trim()));
}

const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'entry';

export function parseQuickActions(value: string | undefined): ExtensionAgentQuickAction[] {
  return rows(value).flatMap((fields, index) => {
    const [label, ...rest] = fields;
    const prompt = unescape(rest.join(' | '));
    if (!label || !prompt) {
      return [];
    }
    return [{ id: `user-${index}-${slug(label)}`, label, prompt }];
  });
}

export function parseCommands(value: string | undefined): ExtensionAgentCommand[] {
  return rows(value).flatMap((fields) => {
    const [name, description, ...rest] = fields;
    const prompt = unescape(rest.join(' | '));
    if (!name || !COMMAND_NAME.test(name) || !prompt) {
      return [];
    }
    return [{ name, description: description || undefined, prompt }];
  });
}

export function parseProfiles(value: string | undefined): ExtensionAgentProfile[] {
  return rows(value).flatMap((fields, index) => {
    const [label, ...pairs] = fields;
    if (!label) {
      return [];
    }
    const profile: ExtensionAgentProfile = { id: `user-${index}-${slug(label)}`, label };
    const settings: Record<string, string> = {};
    for (const pair of pairs) {
      const at = pair.indexOf('=');
      if (at <= 0) {
        continue;
      }
      const name = pair.slice(0, at).trim();
      const entry = pair.slice(at + 1).trim();
      if (PROFILE_FIELDS.has(name)) {
        profile[name as 'mode' | 'model' | 'effort'] = entry;
        continue;
      }
      settings[name] = entry;
    }
    return [{ ...profile, settings: Object.keys(settings).length ? settings : undefined }];
  });
}

/** Fills `{{selection}}`, `{{file}}`, `{{clipboard}}` and `{{args}}` (also `$ARGUMENTS`); unknown names stay as written. */
export function expandPrompt(template: string, variables: PromptVariables): string {
  return template
    .replace(/\$ARGUMENTS/g, variables.args)
    .replace(/\{\{\s*(selection|file|clipboard|args)\s*\}\}/g, (_match, name: keyof PromptVariables) => variables[name]);
}

/** Does the template use a variable that needs the clipboard or the editor? Lets callers read them only when asked for. */
export function usesVariable(template: string, name: keyof PromptVariables): boolean {
  return new RegExp(`\\{\\{\\s*${name}\\s*\\}\\}`).test(template);
}

/** A command as the `session` event reports it, whether a bare name or the full entry. */
export function normalizeCommands(entries: AgentCommandEntry[] | undefined): AgentSlashCommand[] {
  const seen = new Set<string>();
  const commands: AgentSlashCommand[] = [];
  for (const entry of entries ?? []) {
    const command = typeof entry === 'string' ? { name: entry } : entry;
    const name = typeof command?.name === 'string' ? command.name.replace(/^\//, '') : '';
    if (!name || seen.has(name)) {
      continue;
    }
    seen.add(name);
    commands.push({ ...command, name });
  }
  return commands;
}

/** `/name rest of the line` as the composer sends it. */
export function parseSlash(message: string): { name: string; args: string; } | null {
  const match = /^\/([^\s]+)(?:\s+([\s\S]*))?$/.exec(message.trim());
  if (!match) {
    return null;
  }
  return { name: match[1], args: (match[2] ?? '').trim() };
}
