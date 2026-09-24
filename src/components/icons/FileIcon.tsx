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
 * Draws icons from icon packs: a custom SVG path, a built-in shape, or a text
 * glyph. `FileIcon`/`FolderIcon` read the active pack and redraw when it
 * changes.
 */

import { useSyncExternalStore } from 'react';
import { isIconShape } from '@/core/icon-pack';
import type { IconDef } from '@/core/types';
import { fileGlyph, folderIcon, iconPackVersion, subscribeIconPack } from '@/lib/file-icon';
import { ICON_SHAPES } from './shapes';

export function useIconPackVersion() {
  return useSyncExternalStore(subscribeIconPack, iconPackVersion);
}

/** One icon; `size` in px — glyphs are scaled down to suit. */
export function IconGlyph({ icon, size = 13, className = '', title }: {
  icon: IconDef;
  size?: number;
  className?: string;
  title?: string;
}) {
  const color = icon.color ?? 'currentColor';
  if (icon.path) {
    return (
      <svg
        width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}
        strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`} aria-hidden={!title}
      >
        {title && <title>{title}</title>}
        <path d={icon.path} />
      </svg>
    );
  }
  if (isIconShape(icon.shape)) {
    const Shape = ICON_SHAPES[icon.shape];
    return <Shape size={size} color={color} strokeWidth={2} className={`shrink-0 ${className}`} aria-label={title} />;
  }
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center font-mono font-bold leading-none ${className}`}
      style={{ color, width: size + 2, fontSize: glyphSize(icon.glyph ?? '', size) }}
      title={title}
    >
      {icon.glyph || '·'}
    </span>
  );
}

/** Longer glyphs shrink, so they fit the column. */
function glyphSize(glyph: string, size: number) {
  if (glyph.length >= 3) {
    return size * 0.58;
  }
  return size * 0.73;
}

export function FileIcon({ name, size = 13, className = '' }: { name: string; size?: number; className?: string; }) {
  useIconPackVersion();
  return <IconGlyph icon={fileGlyph(name)} size={size} className={className} />;
}

/** The folder icon, when the pack supplies a shape; `folder` becomes `folder-open` when expanded. */
export function FolderIcon({ name, open, size = 13, className = '' }: {
  name: string;
  open: boolean;
  size?: number;
  className?: string;
}) {
  useIconPackVersion();
  const icon = folderIcon(name);
  if (!icon.shape && !icon.path && !icon.glyph) {
    return null;
  }
  const shape = open && icon.shape === 'folder' ? 'folder-open' : icon.shape;
  return <IconGlyph icon={{ ...icon, shape }} size={size} className={className} />;
}
