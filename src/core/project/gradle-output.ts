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
 * The report of `gradle tasks --all`, parsed. The project panel fetches it
 * through Gradle itself, so this is about Gradle's output, not about any
 * language add-on.
 */

export interface GradleTaskInfo {
  name: string;
  group?: string;
  description?: string;
}

/** A line of only dashes underlines a heading in the report. */
const RULE = /^-{3,}$/;
const TASK_LINE = /^([A-Za-z_][\w:.-]*)(?:\s+-\s+(.*))?$/;

/**
 * Parse the report of `gradle tasks --all`:
 *
 *   Build tasks
 *   -----------
 *   assemble - Assembles the outputs of this project.
 *   app:build - Assembles and tests this project.
 *
 * The heading's trailing “tasks” is dropped (`Build`). The banner (“Tasks
 * runnable from root project …”) and the “Rules” section are skipped.
 */
export function parseGradleTasksOutput(output: string): GradleTaskInfo[] {
  const lines = output.split(/\r?\n/).map((line) => line.trimEnd());
  const out: GradleTaskInfo[] = [];
  const seen = new Set<string>();
  let group: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const next = lines[i + 1] ?? '';
    if (RULE.test(line)) {
      continue;
    }
    if (line && RULE.test(next)) {
      group = headingGroup(line, lines[i - 1] ?? '');
      i++;
      continue;
    }
    if (!line) {
      group = null;
      continue;
    }
    if (!group) {
      continue;
    }
    const match = TASK_LINE.exec(line.trim());
    if (!match || seen.has(match[1])) {
      continue;
    }
    seen.add(match[1]);
    out.push({ name: match[1], group, ...(match[2] ? { description: match[2].trim() } : {}) });
  }
  return out;
}

/** The group a heading opens — `null` for the banner and for rules. */
function headingGroup(line: string, previous: string): string | null {
  if (RULE.test(previous)) {
    return null;
  }
  if (/^rules$/i.test(line.trim())) {
    return null;
  }
  return line.trim().replace(/\s+tasks$/i, '');
}

