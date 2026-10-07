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
 * The directory of every namespace. Create a new file and enter it here — the
 * name of the entry is the prefix of its keys (`settings.title`).
 */

import type { NamespaceMessages } from '@/i18n';
import common from './common';
import symbols from './editor/symbols';
import shell from './shell/shell';
import commands from './shell/commands';
import editor from './editor/editor';
import settings from './settings/settings';
import keybindings from './settings/keybindings';
import workspaces from './project/workspaces';
import debug from './project/debug';
import sdk from './project/sdk';
import addonStudio from './extensions/addonStudio';
import themeStudio from './settings/themeStudio';
import minecraft from './project/minecraft';
import completion from './editor/completion';
import palette from './shell/palette';
import statusbar from './shell/statusbar';
import titlebar from './shell/titlebar';
import welcome from './shell/welcome';
import extensions from './extensions/extensions';
import forms from './settings/forms';
import notify from './shell/notify';
import run from './project/run';
import lsp from './editor/lsp';
import explorer from './editor/explorer';
import search from './editor/search';
import project from './project/project';
import outline from './editor/outline';
import panels from './project/panels';
import templates from './project/templates';
import updater from './settings/updater';
import iconPacks from './settings/iconPacks';
import studioProject from './project/studioProject';
import discord from './settings/discord';
import agent from './extensions/agent';
import merge from './editor/merge';
import media from './editor/media';
import extensionView from './extensions/extensionView';
import menubar from './shell/menubar';
import projectSwitcher from './shell/projectSwitcher';
import popout from './shell/popout';
import addons from './extensions/addons';
import format from './editor/format';
import security from './project/security';

export const MESSAGES: Record<string, NamespaceMessages> = {
  common,
  symbols,
  shell,
  commands,
  editor,
  settings,
  keybindings,
  workspaces,
  debug,
  sdk,
  addonStudio,
  themeStudio,
  minecraft,
  completion,
  palette,
  statusbar,
  titlebar,
  welcome,
  extensions,
  forms,
  notify,
  run,
  lsp,
  explorer,
  search,
  project,
  outline,
  panels,
  templates,
  updater,
  iconPacks,
  studioProject,
  discord,
  agent,
  merge,
  media,
  extensionView,
  menubar,
  projectSwitcher,
  popout,
  addons,
  format,
  security,
};
