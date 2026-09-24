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
 * Collapsed folder chains in the explorer.
 *
 * A Java project hides its first class behind six levels:
 * `src/main/java/com/example/project/…`. Each of them holds exactly one
 * subfolder, so each costs a row and an indent while showing nothing. IntelliJ
 * and VS Code collapse such chains into one row; Lumen does the same.
 *
 * Two rules keep the result readable:
 *   • A chain ends before a source root (`java`, `kotlin`, …). That keeps
 *     `src/main/java` on its own row and the packages beneath it on a second,
 *     so the line between project layout and packages stays visible.
 *   • Below a source root the names are joined with dots
 *     (`com.example.project`), elsewhere with slashes. Dots are how the
 *     package is written in the source anyway.
 */

import type { DirEntry } from '../../../electron/preload';

/** Folders that packages begin under — they end a chain and switch on dot notation. */
const SOURCE_ROOTS = new Set(['java', 'kotlin', 'scala', 'groovy', 'kotlin-js', 'aidl']);

/** A name segment that passes as a package name. */
const PACKAGE_SEGMENT = /^[a-z_$][a-z0-9_$]*$/i;

/** Does a package tree start below this folder? */
export function isSourceRoot(name: string): boolean {
  return SOURCE_ROOTS.has(name.toLowerCase());
}

/**
 * The label of a collapsed chain.
 *
 * Dots as long as every part passes as a package name — exactly how the
 * package appears in the source. Slashes otherwise, so a folder with a hyphen
 * or a space does not masquerade as a package.
 */
export function chainLabel(names: readonly string[]): string {
  if (names.length === 1) {
    return names[0];
  }
  if (names.every((name) => PACKAGE_SEGMENT.test(name))) {
    return names.join('.');
  }
  return names.join('/');
}

/**
 * The single subfolder `entry` may be collapsed with.
 *
 * `null` as soon as anything argues against it: several entries, a file, or a
 * source root — which gets a row of its own, or the line between project
 * layout and packages would blur.
 */
export function onlyChildFolder(children: readonly DirEntry[] | null): DirEntry | null {
  if (!children || children.length !== 1) {
    return null;
  }
  const only = children[0];
  if (!only.isDirectory) {
    return null;
  }
  if (isSourceRoot(only.name)) {
    return null;
  }
  return only;
}
