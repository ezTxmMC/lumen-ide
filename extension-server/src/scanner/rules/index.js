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
 * Every built-in rule, in one list.
 *
 * Ids never change and are never reused — users acknowledge findings by them,
 * and the server stores them. A rule that turns out to be wrong is fixed or
 * given a new id; it is never renumbered.
 */

import { DESTRUCTIVE_RULES } from './commands-destructive.js';
import { OBFUSCATION_RULES, REMOTE_RULES } from './commands-remote.js';
import { PERSISTENCE_RULES, PRIVILEGE_RULES, TAMPER_RULES } from './commands-system.js';
import { EXFIL_RULES, MINER_RULES, SUPPLY_RULES } from './commands-data.js';
import { PROJECT_RULES } from './files.js';
import { SECRET_RULES } from './secrets.js';
import { OBFUSCATION_TEXT_RULES } from './obfuscation.js';
import { MALWARE_RULES } from './malware.js';
import { EXTENSION_RULES } from './extension.js';
import { HTML_RULES } from './html.js';

export const RULES = Object.freeze([
  ...DESTRUCTIVE_RULES,
  ...REMOTE_RULES,
  ...PERSISTENCE_RULES,
  ...TAMPER_RULES,
  ...PRIVILEGE_RULES,
  ...EXFIL_RULES,
  ...MINER_RULES,
  ...SUPPLY_RULES,
  ...OBFUSCATION_RULES,
  ...PROJECT_RULES,
  ...SECRET_RULES,
  ...OBFUSCATION_TEXT_RULES,
  ...MALWARE_RULES,
  ...EXTENSION_RULES,
  ...HTML_RULES,
]);

/** The rules the command scanner raises itself, by what they say. */
export const DECODED_DANGEROUS = OBFUSCATION_RULES[0];
export const DECODED_EXECUTED = OBFUSCATION_RULES[1];
export const DISGUISED_COMMAND = OBFUSCATION_RULES[2];

/** Rules by id, for the code that raises a particular rule itself. */
export const RULES_BY_ID = new Map(RULES.map((rule) => [rule.id, rule]));
