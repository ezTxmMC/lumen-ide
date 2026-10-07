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
 * Forms (project templates, dependencies, dialogs)
 * ------------------------------------------------------------------ */

export type FormValues = Record<string, string>;

/** One entry of a select. `group` puts it under a heading (“Releases”, “Snapshots”). */
export interface FieldChoice {
  value: string;
  label: string;
  hint?: string;
  group?: string;
  /** A short tag beside the label — “latest”, “recommended”, “beta”. */
  badge?: string;
}

/** An input in a dialog. Values are always strings — `'true'`/`'false'` for switches. */
export interface FormField {
  id: string;
  label: string;
  /**
   * Defaults to `text`. `combobox` is a select with a search box, for long
   * lists such as every Minecraft version or every loader build.
   */
  type?: 'text' | 'select' | 'combobox' | 'toggle' | 'password' | 'textarea';
  /** A fixed starting value, or one derived from other fields until someone edits it. */
  default?: string | ((values: FormValues) => string);
  placeholder?: string;
  hint?: string;
  choices?: FieldChoice[];
  /** Choices computed from the other fields — replaces `choices` when given. */
  choicesFor?: (values: FormValues) => FieldChoice[];
  /**
   * Choices fetched on demand — versions from a Maven repository, say. Called
   * when the form opens and again whenever a field named in `dependsOn`
   * changes; `signal` aborts a fetch that has been overtaken. While it runs
   * the field shows a spinner; on failure the error with a retry. When the
   * current value is not among the result, the field's `default` (or the
   * first choice) takes its place.
   */
  loadChoices?: (values: FormValues, signal: AbortSignal) => Promise<FieldChoice[]>;
  /** Fields whose change reloads `loadChoices` (and recomputes `choicesFor`). */
  dependsOn?: string[];
  /** Regular expression source; the whole value has to match. */
  pattern?: string;
  /** Message shown when `pattern` does not match. */
  patternHint?: string;
  /** Defaults to true for text fields. */
  required?: boolean;
  /** Heading the field appears under. */
  section?: string;
  /** Only show — and only read — the field while the condition holds. */
  when?: (values: FormValues) => boolean;
  /** Render in a monospaced font (packages, versions, paths). */
  mono?: boolean;
  /**
   * Suggestions for the field, offered beside the input rather than enforced.
   * A function when they depend on other fields, such as versions of a package.
   */
  suggestions?: string[] | ((values: FormValues) => string[]);
}

