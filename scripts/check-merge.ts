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
 * Tests the conflict parser and its resolutions (`src/core/merge/conflicts.ts`):
 * two- and three-way blocks, CRLF, the last line without a break, garbled
 * blocks, navigation and the merge editor's choices.
 */

import {
  choiceText, conflictAt, neighbourConflict, parseConflicts, project, resolutionText, resolveAll,
  UNTOUCHED, type Conflict,
} from '@/core/merge/conflicts';

let failures = 0;
let passed = 0;

function check(name: string, condition: boolean, detail?: unknown) {
  if (condition) {
    passed++;
    console.log(`✓ ${name}`);
    return;
  }
  failures++;
  console.log(`✗ ${name}`, detail ?? '');
}

const TWO_WAY = [
  'top',
  '<<<<<<< HEAD',
  'ours 1',
  'ours 2',
  '=======',
  'theirs',
  '>>>>>>> feature/x',
  'middle',
  '<<<<<<< HEAD',
  'a',
  '=======',
  'b',
  '>>>>>>> feature/x',
  'bottom',
  '',
].join('\n');

/* Two-way blocks */
{
  const conflicts = parseConflicts(TWO_WAY);
  check('Two blocks found', conflicts.length === 2, conflicts.length);
  const [first] = conflicts;
  check('Labels are read', first.currentLabel === 'HEAD' && first.incomingLabel === 'feature/x' && first.baseLabel === null);
  check('Current side is whole lines', TWO_WAY.slice(first.current.from, first.current.to) === 'ours 1\nours 2\n');
  check('Incoming side is whole lines', TWO_WAY.slice(first.incoming.from, first.incoming.to) === 'theirs\n');
  check('The block spans the marker lines', TWO_WAY.slice(first.from, first.to).startsWith('<<<<<<< HEAD') && TWO_WAY.slice(first.from, first.to).endsWith('>>>>>>> feature/x\n'));
  check('Resolve all: current', resolveAll(TWO_WAY, 'current') === 'top\nours 1\nours 2\nmiddle\na\nbottom\n', resolveAll(TWO_WAY, 'current'));
  check('Resolve all: incoming', resolveAll(TWO_WAY, 'incoming') === 'top\ntheirs\nmiddle\nb\nbottom\n', resolveAll(TWO_WAY, 'incoming'));
  check('Resolve all: both', resolveAll(TWO_WAY, 'both') === 'top\nours 1\nours 2\ntheirs\nmiddle\na\nb\nbottom\n');
  check('Resolve all: none drops the block', resolveAll(TWO_WAY, 'none') === 'top\nmiddle\nbottom\n');
  check('Base without diff3 is empty', resolutionText(TWO_WAY, first, 'base') === '');
}

/* Three-way blocks (diff3) */
{
  const text = 'x\n<<<<<<< ours\none\n||||||| merged common ancestors\nzero\n=======\ntwo\n>>>>>>> theirs\ny\n';
  const [conflict] = parseConflicts(text);
  check('diff3 block found', Boolean(conflict));
  check('Base label is read', conflict?.baseLabel === 'merged common ancestors');
  check('Current stops at the base marker', resolutionText(text, conflict, 'current') === 'one\n');
  check('Base is its own section', resolutionText(text, conflict, 'base') === 'zero\n');
  check('Incoming follows the separator', resolutionText(text, conflict, 'incoming') === 'two\n');
}

/* Line endings and the end of the file */
{
  const crlf = 'a\r\n<<<<<<< HEAD\r\nb\r\n=======\r\nc\r\n>>>>>>> other\r\nd\r\n';
  const [conflict] = parseConflicts(crlf);
  check('CRLF markers are found', Boolean(conflict) && conflict.incomingLabel === 'other');
  check('CRLF: incoming keeps its line break', resolveAll(crlf, 'incoming') === 'a\r\nc\r\nd\r\n', JSON.stringify(resolveAll(crlf, 'incoming')));

  const eof = 'a\n<<<<<<< HEAD\nb\n=======\nc\n>>>>>>> other';
  check('A block at the end of the file without a line break', resolveAll(eof, 'incoming') === 'a\nc', JSON.stringify(resolveAll(eof, 'incoming')));
  check('… both sides keep the inner break', resolveAll(eof, 'both') === 'a\nb\nc');

  const empty = '<<<<<<< HEAD\n=======\nonly theirs\n>>>>>>> x\n';
  check('An empty side resolves to nothing', resolveAll(empty, 'current') === '' && resolveAll(empty, 'incoming') === 'only theirs\n');
}

/* Garbled input */
{
  check('No markers, no conflicts', parseConflicts('plain\ntext\n').length === 0);
  check('An unclosed block is ignored', parseConflicts('<<<<<<< HEAD\na\n=======\nb\n').length === 0);
  check('A closing marker without separator is ignored', parseConflicts('<<<<<<< HEAD\na\n>>>>>>> x\n').length === 0);
  check('Eight characters are no marker', parseConflicts('<<<<<<<< HEAD\na\n=======\nb\n>>>>>>> x\n').length === 0);
  check('A marker glued to text is no marker', parseConflicts('<<<<<<<HEAD\na\n=======\nb\n>>>>>>> x\n').length === 0);
  const restarted = parseConflicts('<<<<<<< stale\nzzz\n<<<<<<< HEAD\na\n=======\nb\n>>>>>>> x\n');
  check('A second opening marker starts over', restarted.length === 1 && restarted[0].currentLabel === 'HEAD');
  check('Separators outside a block are left alone', parseConflicts('Title\n=======\n').length === 0);
}

/* Navigation */
{
  const conflicts = parseConflicts(TWO_WAY);
  const [first, second] = conflicts;
  const inFirst = first.current.from + 1;
  check('The block around a position', conflictAt(conflicts, inFirst) === first && conflictAt(conflicts, 0) === null);
  check('Next from the top', neighbourConflict(conflicts, 0, 1) === first);
  check('Next from inside the first', neighbourConflict(conflicts, inFirst, 1) === second);
  check('Next wraps around', neighbourConflict(conflicts, second.from + 1, 1) === first);
  check('Previous from inside the second', neighbourConflict(conflicts, second.current.from, -1) === first);
  check('Previous wraps around', neighbourConflict(conflicts, 0, -1) === second);
  check('No blocks, nowhere to go', neighbourConflict([], 5, 1) === null);
}

/* The merge editor's choices and projections */
{
  const conflicts = parseConflicts(TWO_WAY);
  const pickSide = (side: 'current' | 'incoming') => (conflict: Conflict) => resolutionText(TWO_WAY, conflict, side);
  const ours = project(TWO_WAY, conflicts, pickSide('current'));
  check('The current pane is the file with our sides', ours.text === resolveAll(TWO_WAY, 'current'));
  check('… and knows where each block landed', ours.text.slice(ours.ranges[0].from, ours.ranges[0].to) === 'ours 1\nours 2\n' && ours.text.slice(ours.ranges[1].from, ours.ranges[1].to) === 'a\n');
  const untouched = project(TWO_WAY, conflicts, () => null);
  check('Untouched blocks stay raw', untouched.text === TWO_WAY);
  const [first] = conflicts;
  check('Untouched choice keeps the markers', choiceText(TWO_WAY, first, UNTOUCHED).startsWith('<<<<<<<'));
  check('Both ticked', choiceText(TWO_WAY, first, { current: true, incoming: true, touched: true }) === 'ours 1\nours 2\ntheirs\n');
  check('Only incoming ticked', choiceText(TWO_WAY, first, { current: false, incoming: true, touched: true }) === 'theirs\n');
  check('Nothing ticked falls back to the base', choiceText(TWO_WAY, first, { current: false, incoming: false, touched: true }) === '');
}

console.log(`\n${passed} passed, ${failures} failed`);
if (failures) {
  process.exit(1);
}
console.log('✓ Merge conflicts in order');
