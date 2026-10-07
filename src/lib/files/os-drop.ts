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
 * Files dragged into the window from the OS file manager.
 *
 * The explorer takes them itself (copying them into the folder under the
 * pointer); anywhere else a dropped file opens in the editor and a dropped
 * folder joins the workspace. Without this, Chromium navigates the window to
 * the dropped file and the whole app is gone.
 */

import { useEffect } from 'react';
import { useStore } from '@/state/store';

/** Is the drag carrying files from outside the app? (In-app drags carry their own types.) */
export const hasOsFiles = (event: { dataTransfer: DataTransfer | null; }) => event.dataTransfer?.types.includes('Files') ?? false;

/** The disk paths of the files in a drop. */
export function osDroppedPaths(event: { dataTransfer: DataTransfer | null; }): string[] {
  const files = [...(event.dataTransfer?.files ?? [])];
  return window.lumen.clipboardFiles.pathsOf(files);
}

/** Files open as tabs, folders are added to the workspace. */
export async function openDroppedPaths(paths: string[]) {
  const state = useStore.getState();
  for (const path of paths) {
    const stat = await window.lumen.fs.stat(path);
    if (!stat) {
      continue;
    }
    if (stat.isDirectory) {
      await state.addFolderToWorkspace(path);
      continue;
    }
    await state.openFile(path).catch(() => {});
  }
}

/** `file://` list of paths, for file managers that take a drop of text/uri-list (what dragging a file out of the app offers). */
export const uriListOf = (paths: string[]) => paths
  .map((path) => encodeURI(`file://${path.startsWith('/') ? '' : '/'}${path.replace(/\\/g, '/')}`))
  .join('\r\n');

/** Window-wide handling of OS file drops outside the explorer tree. Mount once in the workbench. */
export function useOsFileDrop() {
  useEffect(() => {
    const inTree = (event: DragEvent) => event.target instanceof Element && Boolean(event.target.closest('[role="tree"]'));
    const onDragOver = (event: DragEvent) => {
      if (!hasOsFiles(event) || inTree(event)) {
        return;
      }
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'copy';
      }
    };
    const onDrop = (event: DragEvent) => {
      if (!hasOsFiles(event) || inTree(event)) {
        return;
      }
      // Capturing: before the editor (which would paste the file's text) sees it.
      event.preventDefault();
      event.stopPropagation();
      void openDroppedPaths(osDroppedPaths(event));
    };
    window.addEventListener('dragover', onDragOver, true);
    window.addEventListener('drop', onDrop, true);
    return () => {
      window.removeEventListener('dragover', onDragOver, true);
      window.removeEventListener('drop', onDrop, true);
    };
  }, []);
}
