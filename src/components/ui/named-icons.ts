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
 * Icons by name — for data that cannot carry a component: extension views,
 * status-bar items, declared panels.
 *
 * A name is either one of the icon-pack shapes (`ICON_SHAPES`: `git-branch`,
 * `github`, `package` …) or one of the action icons below (`refresh-cw`,
 * `plus`, `check` …). Unknown names fall back to a neutral dot, so a typo in
 * an extension never breaks the interface.
 */

import {
  ArrowDown, ArrowDownToLine, ArrowLeft, ArrowRight, ArrowUp, ArrowUpDown, ArrowUpFromLine,
  Ban, Check, CheckCheck, ChevronDown, ChevronRight, ChevronUp, Circle, CircleAlert, CircleCheck,
  CircleDashed, CircleDot, CircleX, CloudDownload, CloudUpload, Copy, Ellipsis, ExternalLink, EyeOff, FileMinus,
  FilePlus, FileX, Filter, GitBranchPlus, GitCommitVertical, GitPullRequestArrow, GitPullRequestClosed,
  GitPullRequestDraft, Inbox, Info, ListFilter, Loader, LogIn, LogOut, MessageSquarePlus, MessagesSquare,
  Milestone, Minus, Pause, Pencil, Play, Plus, Redo2, RefreshCw, RotateCcw, Search, ShieldAlert, Square,
  TriangleAlert, Trash2, Undo2, LockOpen, User, X, type LucideIcon,
} from 'lucide-react';
import { ICON_SHAPES } from '@/components/icons/shapes';

const ACTION_ICONS: Record<string, LucideIcon> = {
  'alert-triangle': TriangleAlert, 'triangle-alert': TriangleAlert,
  'arrow-down': ArrowDown, 'arrow-up': ArrowUp, 'arrow-left': ArrowLeft, 'arrow-right': ArrowRight,
  'arrow-up-down': ArrowUpDown, pull: ArrowDownToLine, push: ArrowUpFromLine,
  ban: Ban, check: Check, 'check-check': CheckCheck,
  'chevron-down': ChevronDown, 'chevron-right': ChevronRight, 'chevron-up': ChevronUp,
  dot: Circle, 'circle-alert': CircleAlert, 'circle-check': CircleCheck, 'circle-dashed': CircleDashed,
  'circle-dot': CircleDot, 'circle-x': CircleX, 'cloud-download': CloudDownload, 'cloud-upload': CloudUpload,
  copy: Copy, more: Ellipsis, 'external-link': ExternalLink, 'eye-off': EyeOff,
  'file-minus': FileMinus, 'file-plus': FilePlus, 'file-x': FileX, filter: Filter, 'list-filter': ListFilter,
  'git-branch-plus': GitBranchPlus, 'git-commit-vertical': GitCommitVertical,
  'git-pull-request-arrow': GitPullRequestArrow, 'git-pull-request-closed': GitPullRequestClosed,
  'git-pull-request-draft': GitPullRequestDraft, inbox: Inbox, info: Info, loader: Loader,
  'log-in': LogIn, 'log-out': LogOut, 'message-square-plus': MessageSquarePlus, messages: MessagesSquare,
  milestone: Milestone, minus: Minus, pause: Pause, pencil: Pencil, play: Play, plus: Plus, redo: Redo2,
  'refresh-cw': RefreshCw, refresh: RefreshCw, 'rotate-ccw': RotateCcw, search: Search,
  'shield-alert': ShieldAlert, stop: Square, 'trash-2': Trash2, undo: Undo2, unlock: LockOpen, user: User,
  x: X, close: X,
};

/** The icon component for a name; unknown names get a small dot. */
export function namedIcon(name: string | undefined): LucideIcon {
  if (!name) {
    return Circle;
  }
  const shapes = ICON_SHAPES as Record<string, LucideIcon>;
  return shapes[name] ?? ACTION_ICONS[name] ?? Circle;
}

/** Every name `namedIcon` knows — for checks and documentation. */
export function knownIconNames(): string[] {
  return [...new Set([...Object.keys(ICON_SHAPES), ...Object.keys(ACTION_ICONS)])].sort();
}
