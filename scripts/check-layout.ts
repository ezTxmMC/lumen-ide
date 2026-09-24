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
 * Tests the window layout as data (`src/state/layout.ts`): resolving docks,
 * moving views between them, the navigation side, reading stored layouts.
 */

import type { ViewDef } from '@/core/views';
import {
  addPopout, boundsChanged, defaultBounds, dockBackTarget, dockGroupBack, isPopoutWindowName, isViewPopped, MIN_POPOUT,
  normalizeBounds, normalizeBoundsMap, popoutKey, popoutWindowName, poppedGroupIds, poppedViewIds, removePopout,
  settleGroups, visibleGroups, type PopoutEntry,
} from '@/state/popout';
import {
  activeView, DEFAULT_LAYOUT, dockOf, moveView, normalizeLayout, resolveDock, setNavSide, showView, toggleView,
  type LayoutState,
} from '@/state/layout';

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

function view(id: string, defaultDock: ViewDef['defaultDock'], order: number): ViewDef {
  return { id, defaultDock, order, title: () => id, icon: (() => null) as unknown as ViewDef['icon'], render: () => null };
}

const known: ViewDef[] = [
  view('explorer', 'left', 10), view('search', 'left', 20), view('project', 'left', 30),
  view('output', 'bottom', 10), view('terminal', 'bottom', 20), view('chat', 'right', 10),
];

const fresh = (): LayoutState => structuredClone(DEFAULT_LAYOUT);

/* Resolving */
{
  const layout = fresh();
  check('Unplaced views go to their default dock in order', same(resolveDock(layout, 'left', known), ['explorer', 'search', 'project']));
  check('The bottom dock gets its views', same(resolveDock(layout, 'bottom', known), ['output', 'terminal']));
  check('The right dock gets the chat', same(resolveDock(layout, 'right', known), ['chat']));
  check('Active view falls back to the first', activeView({ ...layout, right: { ...layout.right, active: 'gone' } }, 'right', known) === 'chat');
}

/* Moving */
{
  const moved = moveView(fresh(), 'terminal', 'left', known, 1);
  check('Moving into another dock inserts at the index', same(resolveDock(moved, 'left', known), ['explorer', 'terminal', 'search', 'project']));
  check('… and leaves the source dock', same(resolveDock(moved, 'bottom', known), ['output']));
  check('… and makes the view active and the dock open', moved.left.active === 'terminal' && moved.left.open);
  check('dockOf follows the move', dockOf(moved, 'terminal', known) === 'left');

  const reordered = moveView(fresh(), 'project', 'left', known, 0);
  check('Moving within a dock reorders', same(resolveDock(reordered, 'left', known), ['project', 'explorer', 'search']));

  const emptied = moveView(fresh(), 'chat', 'bottom', known);
  check('The source dock closes when its last view leaves', !emptied.right.open && emptied.right.active === null);
  check('Moving to the end without an index', same(resolveDock(emptied, 'bottom', known), ['output', 'terminal', 'chat']));
}

/* Views that come and go */
{
  const withHidden: LayoutState = { ...fresh(), left: { ...fresh().left, views: ['ghost', 'search'] } };
  check('Unregistered ids stay invisible', same(resolveDock(withHidden, 'left', known), ['search', 'explorer', 'project']));
  const moved = moveView(withHidden, 'explorer', 'right', known);
  check('… and survive a move', moved.left.views.includes('ghost'));
}

/* Showing and toggling */
{
  const shown = showView(fresh(), 'terminal', known);
  check('showView opens the dock and activates the view', shown.bottom.open && shown.bottom.active === 'terminal');
  const hidden = toggleView(shown, 'terminal', known);
  check('toggleView on the visible view closes the dock', !hidden.bottom.open);
  check('toggleView on another view switches to it', toggleView(shown, 'output', known).bottom.active === 'output');
}

/* The navigation side */
{
  const right = setNavSide(fresh(), 'right');
  check('Default left views follow the navigation to the right', same(resolveDock(right, 'right', known), ['explorer', 'search', 'project']));
  check('… and right views to the left', same(resolveDock(right, 'left', known), ['chat']));
  check('… with the dock states swapped', right.right.size === DEFAULT_LAYOUT.left.size && right.right.open);
  const back = setNavSide(right, 'left');
  check('Switching back restores the layout', same(back, fresh()));
  const placed = setNavSide(moveView(fresh(), 'terminal', 'left', known), 'right');
  check('Placed views travel with their dock', resolveDock(placed, 'right', known).includes('terminal'));
}

/* Reading stored layouts */
{
  const legacy = normalizeLayout(undefined, { sidebarWidth: 320, panelHeight: 999 });
  check('Old settings carry the sidebar width over', legacy.left.size === 320);
  check('… and clamp the panel height', legacy.bottom.size === 800);
  const broken = normalizeLayout({ left: { views: ['a', 'a', 3], open: 'yes' }, bottom: { views: ['a'] }, navSide: 'up' });
  check('Garbage is cleaned up', same(broken.left.views, ['a']) && broken.left.open === DEFAULT_LAYOUT.left.open && broken.navSide === 'left');
  check('A view in two docks stays in the first', same(broken.bottom.views, []));
}

/* Pop-outs: bookkeeping */
{
  const view: PopoutEntry = { key: popoutKey('view', 'explorer'), kind: 'view', ref: 'explorer', bounds: null };
  const group: PopoutEntry = { key: popoutKey('group', 'group-2'), kind: 'group', ref: 'group-2', from: 'group-1', bounds: null };
  const list = addPopout(addPopout([], view), group);
  check('Entries are keyed by kind and reference', view.key === 'view:explorer' && group.key === 'group:group-2');
  check('Adding an entry twice keeps one', addPopout(list, view).length === 2);
  check('Popped views and groups are told apart', poppedViewIds(list).has('explorer') && !poppedViewIds(list).has('group-2') && poppedGroupIds(list).has('group-2'));
  check('A view is popped exactly while it has an entry', isViewPopped(list, 'explorer') && !isViewPopped(list, 'search'));
  check('Removing an entry ends it', removePopout(list, view.key).length === 1 && !isViewPopped(removePopout(list, view.key), 'explorer'));
  check('Removing an unknown key changes nothing', removePopout(list, 'view:nope') === list);
  check('Window names round-trip the prefix the main process expects', isPopoutWindowName(popoutWindowName(view.key)) && !isPopoutWindowName('_blank'));
}

/* Pop-outs: bounds */
{
  check('Bounds are rounded to whole numbers', same(normalizeBounds({ x: 10.4, y: 20.6, width: 500.2, height: 400.7 }), { x: 10, y: 21, width: 500, height: 401 }));
  const tiny = normalizeBounds({ x: 0, y: 0, width: 5, height: 5 });
  check('A window is never smaller than the minimum', tiny?.width === MIN_POPOUT.width && tiny.height === MIN_POPOUT.height);
  check('Junk bounds are dropped', normalizeBounds(null) === null && normalizeBounds({ x: 'a', y: 0, width: 300, height: 300 }) === null && normalizeBounds({ x: NaN, y: 0, width: 300, height: 300 }) === null);
  check('Negative positions stay (a second monitor to the left)', normalizeBounds({ x: -1200, y: 40, width: 400, height: 300 })?.x === -1200);
  const map = normalizeBoundsMap({ 'view:explorer': { x: 1, y: 2, width: 400, height: 300 }, bad: 'no', group: { x: 0, y: 0, width: 1, height: 1 } });
  check('A stored map keeps only the usable entries', Object.keys(map).sort().join() === 'group,view:explorer', map);
  check('Arrays are no bounds map', Object.keys(normalizeBoundsMap([1, 2])).length === 0);
  check('A drag reports a change only when something moved', !boundsChanged({ x: 1, y: 2, width: 3, height: 4 }, { x: 1, y: 2, width: 3, height: 4 }) && boundsChanged({ x: 1, y: 2, width: 3, height: 4 }, { x: 1, y: 2, width: 3, height: 5 }) && boundsChanged(null, { x: 1, y: 2, width: 3, height: 4 }));
  const host = { x: 100, y: 100, width: 1440, height: 900 };
  const column = defaultBounds('view', 'column', host);
  const strip = defaultBounds('view', 'strip', host);
  check('A side view opens tall, a bottom view wide', column.height > column.width && strip.width > strip.height);
  check('… near the main window', column.x >= host.x && column.x < host.x + host.width && column.y >= host.y);
  check('An editor group opens larger than a side view', defaultBounds('group', 'column', host).width > column.width);
  check('Without a main window a default still exists', defaultBounds('view', 'column', null).width >= MIN_POPOUT.width);
}

/* Pop-outs: editor groups */
{
  const g = (id: string, tabIds: string[], activeTabId: string | null = tabIds[0] ?? null) => ({ id, tabIds, activeTabId });
  const away: PopoutEntry = { key: 'group:g2', kind: 'group', ref: 'g2', from: 'g1', bounds: null };
  const list = [away];
  const groups = [g('g1', ['a', 'b']), g('g2', ['c']), g('g3', ['d'])];
  check('The main window does not draw popped groups', same(visibleGroups(groups, list).map((x) => x.id), ['g1', 'g3']));
  check('A group goes back to where it came from', dockBackTarget(groups, list, 'g1')?.id === 'g1');
  check('… or to the last group left when that is gone', dockBackTarget(groups, list, 'g9')?.id === 'g3' && dockBackTarget(groups, list, undefined)?.id === 'g3');
  check('A popped group is never its own target', dockBackTarget([g('g2', ['c'])], list, 'g2') === null);
  const back = dockGroupBack(groups, list, 'g2', 'g1', 'g2');
  check('Docking back joins the tabs and drops the group', same(back?.groups.map((x) => [x.id, x.tabIds]), [['g1', ['a', 'b', 'c']], ['g3', ['d']]]), back);
  check('… the popped group\'s tab becomes the active one', back?.groups[0].activeTabId === 'c');
  check('… and focus follows the tabs', back?.activeGroupId === 'g1');
  check('Focus elsewhere stays there', dockGroupBack(groups, list, 'g2', 'g1', 'g3')?.activeGroupId === 'g3');
  check('Docking back a tab already in the target adds it once', same(dockGroupBack([g('g1', ['c']), g('g2', ['c'])], list, 'g2', 'g1', 'g1')?.groups[0].tabIds, ['c']));
  check('Docking back an unknown group does nothing', dockGroupBack(groups, list, 'g9', 'g1', 'g1') === null);

  const fallback = () => g('home', []);
  check('Empty groups fall away', same(settleGroups([g('g1', ['a']), g('g3', [])], [], fallback).map((x) => x.id), ['g1']));
  check('The main window keeps a group when its only tab leaves', same(settleGroups([g('g1', []), g('g2', ['c'])], list, fallback).map((x) => x.id), ['g1', 'g2']));
  check('… made up when there is none at all', same(settleGroups([g('g2', ['c'])], list, fallback).map((x) => x.id), ['home', 'g2']));
  check('Without tabs anywhere one empty group remains', same(settleGroups([g('g1', []), g('g3', [])], [], fallback).map((x) => x.id), ['g1']));
}

console.log(`\n${passed} passed, ${failures} failed`);
if (failures) {
  process.exit(1);
}
console.log('✓ Window layout in order');
