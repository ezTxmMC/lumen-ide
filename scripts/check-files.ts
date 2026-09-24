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
 * Tests file handling as data: the explorer's multi-selection and batch
 * planning (`src/components/panels/explorer-selection.ts`) and line endings
 * between disk and editor (`src/lib/line-endings.ts`).
 */

import {
  clickSelection, copyName, EMPTY_SELECTION, inVisibleOrder, isWithin, keepVisible, planMove, selectAll, single, topLevel,
  type TreeSelection,
} from '@/components/panels/explorer-selection';
import { fromDisk, toDisk } from '@/lib/line-endings';

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

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const visible = ['/p/src', '/p/src/a.ts', '/p/src/b.ts', '/p/src/c.ts', '/p/README.md', '/p/package.json'];
const plain = { toggle: false, range: false };
const toggle = { toggle: true, range: false };
const range = { toggle: false, range: true };
const both = { toggle: true, range: true };

/* Clicking */
{
  const one = clickSelection(EMPTY_SELECTION, '/p/src/a.ts', visible, plain);
  check('A plain click selects one row', same(one, { paths: ['/p/src/a.ts'], anchor: '/p/src/a.ts' }));
  const reset = clickSelection({ paths: visible, anchor: '/p/src' }, '/p/README.md', visible, plain);
  check('… and resets a multi-selection', same(reset.paths, ['/p/README.md']));

  const added = clickSelection(one, '/p/src/c.ts', visible, toggle);
  check('Ctrl-click adds a row', same(added.paths, ['/p/src/a.ts', '/p/src/c.ts']));
  check('… and moves the anchor there', added.anchor === '/p/src/c.ts');
  const removed = clickSelection(added, '/p/src/a.ts', visible, toggle);
  check('Ctrl-click on a selected row removes it', same(removed.paths, ['/p/src/c.ts']));
  const emptied = clickSelection(removed, '/p/src/c.ts', visible, toggle);
  check('… down to nothing selected', emptied.paths.length === 0);

  const down = clickSelection(one, '/p/README.md', visible, range);
  check('Shift-click selects the range in visible order', same(down.paths, ['/p/src/a.ts', '/p/src/b.ts', '/p/src/c.ts', '/p/README.md']));
  check('… keeping the anchor', down.anchor === '/p/src/a.ts');
  const up = clickSelection(down, '/p/src', visible, range);
  check('A second Shift-click re-spans from the same anchor', same(up.paths, ['/p/src', '/p/src/a.ts']));
  const noAnchor = clickSelection(EMPTY_SELECTION, '/p/src/b.ts', visible, range);
  check('Shift-click without an anchor selects just that row', same(noAnchor.paths, ['/p/src/b.ts']));
  const lost = clickSelection({ paths: ['/p/gone'], anchor: '/p/gone' }, '/p/src/b.ts', visible, range);
  check('An anchor no longer visible starts afresh', same(lost, single('/p/src/b.ts')));

  const extra: TreeSelection = { paths: ['/p/package.json'], anchor: '/p/src/a.ts' };
  const union = clickSelection(extra, '/p/src/c.ts', visible, both);
  check('Ctrl+Shift adds the range to what is selected', same(union.paths, ['/p/package.json', '/p/src/a.ts', '/p/src/b.ts', '/p/src/c.ts']));
}

/* Select all, pruning */
{
  const all = selectAll(visible);
  check('Select all takes every visible row', same(all.paths, visible) && all.anchor === '/p/src');
  check('Select all on an empty tree', same(selectAll([]), EMPTY_SELECTION));
  const kept = keepVisible({ paths: ['/p/src/a.ts', '/p/old.ts'], anchor: '/p/old.ts' }, visible);
  check('Rows that vanished drop out of the selection', same(kept, { paths: ['/p/src/a.ts'], anchor: '/p/src/a.ts' }));
  const untouched: TreeSelection = { paths: ['/p/src/a.ts'], anchor: '/p/src/a.ts' };
  check('… and an intact selection stays the same object', keepVisible(untouched, visible) === untouched);
}

/* Batch targets */
{
  check('isWithin: the folder itself', isWithin('/p/src', '/p/src'));
  check('isWithin: inside', isWithin('/p/src', '/p/src/a.ts'));
  check('isWithin: a sibling with the same prefix is not inside', !isWithin('/p/src', '/p/src2/a.ts'));
  check('isWithin: Windows separators', isWithin('C:\\p\\src', 'C:\\p\\src\\a.ts'));

  check('Visible order sorts, unknown paths last', same(inVisibleOrder(['/x', '/p/README.md', '/p/src'], visible), ['/p/src', '/p/README.md', '/x']));
  const top = topLevel(['/p/src/b.ts', '/p/README.md', '/p/src', '/p/src/a.ts', '/p/src'], visible);
  check('Rows inside a selected folder go with the folder', same(top, ['/p/src', '/p/README.md']));
}

/* Moving */
{
  const plan = planMove(['/p/src/a.ts', '/p/README.md'], '/p/lib');
  check('Moving plans a target per item', same(plan.moves, [
    { from: '/p/src/a.ts', to: '/p/lib/a.ts' }, { from: '/p/README.md', to: '/p/lib/README.md' },
  ]));
  const self = planMove(['/p/src', '/p/README.md'], '/p/src/deep');
  check('A folder cannot move into itself', same(self.invalid, ['/p/src']) && same(self.moves, [{ from: '/p/README.md', to: '/p/src/deep/README.md' }]));
  const onto = planMove(['/p/src'], '/p/src');
  check('… nor onto itself', same(onto.invalid, ['/p/src']));
  const stay = planMove(['/p/src/a.ts', '/p/src/b.ts'], '/p/src');
  check('Items already in the folder stay put', stay.moves.length === 0 && same(stay.unchanged, ['/p/src/a.ts', '/p/src/b.ts']));
  const nested = planMove(['/p/src', '/p/src/a.ts'], '/p/lib');
  check('A file inside a moved folder is not moved twice', same(nested.moves, [{ from: '/p/src', to: '/p/lib/src' }]));
}

/* Copy names */
{
  const takenIn = (names: string[]) => (name: string) => names.includes(name);
  check('A free name stays', copyName('a.ts', takenIn([])) === 'a.ts');
  check('A taken name gets “copy”', copyName('a.ts', takenIn(['a.ts'])) === 'a copy.ts');
  check('… then a number', copyName('a.ts', takenIn(['a.ts', 'a copy.ts', 'a copy 2.ts'])) === 'a copy 3.ts');
  check('Folders and dot files keep their name whole', copyName('.env', takenIn(['.env'])) === '.env copy' && copyName('src', takenIn(['src'])) === 'src copy');
  check('Only the last extension moves behind “copy”', copyName('x.test.ts', takenIn(['x.test.ts'])) === 'x.test copy.ts');
}

/* Line endings */
{
  check('LF text passes through', same(fromDisk('a\nb\n'), { text: 'a\nb\n', eol: '\n' }));
  check('CRLF text becomes LF and remembers CRLF', same(fromDisk('a\r\nb\r\n'), { text: 'a\nb\n', eol: '\r\n' }));
  check('Mixed text follows the majority', fromDisk('a\r\nb\r\nc\n').eol === '\r\n' && fromDisk('a\nb\nc\r\n').eol === '\n');
  check('Old Mac breaks are normalised too', fromDisk('a\rb').text === 'a\nb');
  check('Writing restores CRLF', toDisk('a\nb\n', '\r\n') === 'a\r\nb\r\n');
  check('… without doubling a CR already there', toDisk('a\r\nb', '\r\n') === 'a\r\nb');
  check('LF files are written as they are', toDisk('a\nb', '\n') === 'a\nb' && toDisk('a\nb', undefined) === 'a\nb');
  const raw = 'x\r\ny\r\n';
  const read = fromDisk(raw);
  check('A CRLF file round-trips unchanged', toDisk(read.text, read.eol) === raw);
}

console.log(`\n${passed} passed, ${failures} failed`);
if (failures) {
  process.exit(1);
}
console.log('✓ File handling in order');
