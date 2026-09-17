/**
 * The directory of every namespace. Create a new file and enter it here — the
 * name of the entry is the prefix of its keys (`settings.title`).
 */

import type { NamespaceMessages } from '@/i18n'
import common from './common'
import symbols from './symbols'
import shell from './shell'
import commands from './commands'
import editor from './editor'
import settings from './settings'
import keybindings from './keybindings'
import workspaces from './workspaces'
import debug from './debug'
import sdk from './sdk'
import addonStudio from './addonStudio'
import themeStudio from './themeStudio'
import minecraft from './minecraft'
import completion from './completion'
import palette from './palette'
import statusbar from './statusbar'
import titlebar from './titlebar'
import welcome from './welcome'
import extensions from './extensions'
import forms from './forms'
import notify from './notify'
import run from './run'
import lsp from './lsp'
import explorer from './explorer'
import search from './search'
import project from './project'
import outline from './outline'
import panels from './panels'
import templates from './templates'
import updater from './updater'
import iconPacks from './iconPacks'
import studioProject from './studioProject'
import discord from './discord'

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
}
