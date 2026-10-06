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
 * Rules supplied by extensions.
 *
 * An extension may add rules to the scanner — as data, never as code. The
 * pattern is a regular expression the scanner will run against every line of
 * every file it checks, so it is the one place where somebody else's input
 * can make the scanner itself hang. The checks here are deliberately blunt:
 * a pattern that could backtrack badly is refused, even if it would have been
 * harmless, because the author can always write it another way.
 */

import { SEVERITIES } from './report.js';

const TARGETS = ['command', 'extension', 'project'];
const MAX_PATTERN = 500;
const MAX_UNBOUNDED_QUANTIFIERS = 6;
const OWNER_PATTERN = /^[\w.@-]{1,80}$/;
const ID_PATTERN = /^[\w.-]{1,64}$/;

function fail(message) {
  throw new Error(`Invalid security rule: ${message}`);
}

/** Is the quantifier starting at `index` unbounded (`*`, `+`, `{n,}`) or a counted `{n,m}`? */
function readQuantifier(source, index) {
  const char = source[index];
  if (char === '*' || char === '+') {
    return { unbounded: true, length: 1 };
  }
  if (char !== '{') {
    return null;
  }
  const match = /^\{(\d+)(?:,(\d*))?\}/.exec(source.slice(index, index + 20));
  if (!match) {
    return null;
  }
  const unbounded = match[2] === '' || (match[2] !== undefined && Number(match[2]) > 10);
  return { unbounded, length: match[0].length };
}

/**
 * Refuse patterns that can backtrack exponentially: a group that contains a
 * repetition and is itself repeated — `(a+)+`, `(.*)*`, `(\w+\s?)*`.
 *
 * It also counts the unbounded repetitions in the whole pattern: many of them
 * in a row make matching polynomial, which on a long line is as bad.
 */
export function findBacktrackingRisk(source) {
  const stack = [{ repeats: false }];
  let unbounded = 0;
  let inClass = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (char === '\\') {
      i++;
      continue;
    }
    if (inClass) {
      inClass = char !== ']';
      continue;
    }
    if (char === '[') {
      inClass = true;
      continue;
    }
    if (char === '(') {
      stack.push({ repeats: false });
      continue;
    }
    const quantifier = readQuantifier(source, i);
    if (quantifier) {
      if (quantifier.unbounded) {
        unbounded++;
      }
      stack[stack.length - 1].repeats ||= quantifier.unbounded;
      i += quantifier.length - 1;
      continue;
    }
    if (char !== ')' || stack.length < 2) {
      continue;
    }
    const group = stack.pop();
    const after = readQuantifier(source, i + 1);
    if (group.repeats && after?.unbounded) {
      return 'a repeated group contains another repetition (nested quantifiers)';
    }
    stack[stack.length - 1].repeats ||= group.repeats || Boolean(after?.unbounded);
  }
  if (unbounded > MAX_UNBOUNDED_QUANTIFIERS) {
    return `more than ${MAX_UNBOUNDED_QUANTIFIERS} unbounded repetitions`;
  }
  return '';
}

/**
 * Compile an extension's `SecurityRuleSpec` into a rule.
 *
 * @param {{ id: string, title: string, severity: string, targets: string[], pattern: string, message?: string }} spec
 * @param {string} owner The extension's id; the rule id becomes `${owner}:${spec.id}`.
 * @throws {Error} When the spec is malformed or the pattern is unsafe.
 */
export function toRule(spec, owner) {
  if (!spec || typeof spec !== 'object') {
    fail('the rule is not an object');
  }
  if (typeof owner !== 'string' || !OWNER_PATTERN.test(owner)) {
    fail('the owner is not a valid extension id');
  }
  if (typeof spec.id !== 'string' || !ID_PATTERN.test(spec.id)) {
    fail('`id` must be 1-64 letters, digits, dots, dashes or underscores');
  }
  if (typeof spec.title !== 'string' || !spec.title.trim() || spec.title.length > 120) {
    fail('`title` must be a short text');
  }
  if (!SEVERITIES.includes(spec.severity)) {
    fail(`\`severity\` must be one of ${SEVERITIES.join(', ')}`);
  }
  if (!Array.isArray(spec.targets) || !spec.targets.length || spec.targets.some((target) => !TARGETS.includes(target))) {
    fail(`\`targets\` must be a non-empty list of ${TARGETS.join(', ')}`);
  }
  if (typeof spec.pattern !== 'string' || !spec.pattern) {
    fail('`pattern` must be a text');
  }
  if (spec.pattern.length > MAX_PATTERN) {
    fail(`\`pattern\` is longer than ${MAX_PATTERN} characters`);
  }
  if (spec.message !== undefined && (typeof spec.message !== 'string' || spec.message.length > 400)) {
    fail('`message` must be a text of at most 400 characters');
  }
  const risk = findBacktrackingRisk(spec.pattern);
  if (risk) {
    fail(`\`pattern\` is refused: ${risk}`);
  }
  let pattern;
  try {
    // The only flag allowed is `i`, and it is always on: authors match text, not exact case.
    pattern = new RegExp(spec.pattern, 'i');
  } catch (err) {
    fail(`\`pattern\` is not a valid regular expression (${err.message})`);
  }
  if (pattern.test('')) {
    fail('`pattern` matches the empty text');
  }
  return Object.freeze({
    id: `${owner}:${spec.id}`,
    severity: spec.severity,
    category: 'custom',
    title: spec.title.trim(),
    message: spec.message?.trim() || `Matched the rule "${spec.title.trim()}" supplied by ${owner}.`,
    targets: [...spec.targets],
    pattern,
    scope: 'line',
  });
}
