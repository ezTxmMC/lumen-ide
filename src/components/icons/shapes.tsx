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
 * Shapes for icon packs: a name from `ICON_SHAPE_NAMES` → an icon component.
 *
 * Most come from Lucide; the role folders and the marks of tools and formats
 * are drawn for Lumen in `custom-shapes.ts` on the same grid.
 */

import {
  Activity, Anchor, Antenna, AppWindow, Apple, Archive, Asterisk, AtSign, Atom, Axe, BadgeCheck,
  BatteryCharging, Beer, Bell, Binary, Bird, Blocks, Bone, Book, BookMarked, BookOpen, BookText, Bookmark,
  Bot, Box, Boxes, Braces, Brackets, Brain, Brush, Bug, BugPlay, Building2, Cable, Cake, Calculator, Calendar,
  Camera, Candy, Carrot, Castle, Cat, ChefHat, Cherry, Circle, CircuitBoard, Citrus, ClipboardCheck,
  ClipboardList, Clock, Cloud, CloudCog, Clover, Code, CodeXml, Coffee, Cog, Coins, Command, Compass,
  Component, Construction, Container, Cookie, Cpu, Crown, Cylinder, Database, DatabaseZap, Diamond, Dices,
  Dna, Dog, Download, Drama, Drill, Droplet, Earth, Egg, Eye, Factory, Feather, File, FileArchive, FileAudio,
  FileBadge, FileBox, FileCheck, FileCode, FileCog, FileDiff, FileImage, FileJson, FileKey, FileLock,
  FileSpreadsheet, FileTerminal, FileText, FileType, FileVideo, Files, Film, Fingerprint, Fish, Flag, Flame,
  FlaskConical, Flower2, Folder, FolderArchive, FolderCheck, FolderClock, FolderCode, FolderCog, FolderDot, FolderGit2,
  FolderHeart, FolderKanban, FolderKey, FolderLock, FolderOpen, FolderRoot, FolderSearch, FolderSymlink,
  FolderSync, FolderTree, Gamepad2, Gauge, Gem, GitBranch, GitCommitHorizontal, GitCompare, GitFork, GitGraph,
  GitMerge, GitPullRequest, Globe, Grape, Hammer, HardDrive, HardHat, Hash, Heart, HeartPulse, Hexagon,
  History, Hourglass, House, Image, Images, Infinity, Joystick, Kanban, Key, KeyRound, Keyboard, Landmark,
  Languages, Laptop, Layers, LayoutDashboard, LayoutTemplate, Leaf, Library, Lightbulb, Link, List,
  ListChecks, ListTodo, ListTree, Lock, LockKeyhole, Magnet, Mail, Map, MapPin, MessageSquare, Microchip,
  Microscope, Monitor, Moon, Mountain, Music, Network, Newspaper, Notebook, NotebookPen, NotepadText, Orbit,
  Package, PackageCheck, PackageOpen, Palette, Paperclip, PenTool, Pickaxe, Pill, Pin, Pizza, Plane, Plug,
  PlugZap, Power, Presentation, Printer, Puzzle, QrCode, Quote, Rabbit, Radar, Radio, Rainbow, Receipt,
  Recycle, Regex, Rocket, Route, Rss, Sailboat, Satellite, Save, Scale, Scissors, ScrollText, Send, Server,
  ServerCog, Settings, Settings2, Shapes, Share2, Sheet, Shield, ShieldCheck, Ship, ShipWheel, Shovel, Sigma,
  Signpost, SlidersHorizontal, Smartphone, Snowflake, Sparkle, Sparkles, Sprout, Square, SquareFunction,
  SquareTerminal, Star, StickyNote, Sun, Swords, Table, Tag, Tags, Target, Terminal, TestTube, TestTubes,
  Thermometer, Timer, Trash2, TreePine, Trees, Triangle, Trophy, Truck, Turtle, Type, Umbrella, Upload,
  UserCog, Users, Variable, Video, Wallet, WandSparkles, Waves, Webhook, Wifi, Wind, Workflow, Wrench, Zap,
  type LucideIcon,
} from 'lucide-react';
import type { IconShapeName } from '@/core/icon-pack';
import { MARKS, ROLE_FOLDERS } from './custom-shapes';

const LUCIDE_SHAPES = {
  file: File, 'file-code': FileCode, 'file-text': FileText, 'file-json': FileJson, 'file-cog': FileCog,
  'file-lock': FileLock, 'file-type': FileType, folder: Folder, 'folder-open': FolderOpen,
  'folder-git': FolderGit2, 'folder-cog': FolderCog, 'folder-code': FolderCode, 'folder-kanban': FolderKanban,
  braces: Braces, code: Code, terminal: Terminal, hash: Hash, type: Type, binary: Binary, component: Component,
  lock: Lock, key: Key, 'shield-check': ShieldCheck, fingerprint: Fingerprint, package: Package, boxes: Boxes,
  box: Box, blocks: Blocks, archive: Archive, container: Container, ship: Ship, anchor: Anchor,
  settings: Settings, cog: Cog, wrench: Wrench, hammer: Hammer, pickaxe: Pickaxe, workflow: Workflow,
  webhook: Webhook, layers: Layers, 'git-branch': GitBranch, 'git-merge': GitMerge, 'book-open': BookOpen,
  'book-marked': BookMarked, scale: Scale, receipt: Receipt, languages: Languages, database: Database,
  table: Table, sheet: Sheet, server: Server, cloud: Cloud, globe: Globe, image: Image, palette: Palette,
  music: Music, video: Video, flask: FlaskConical, 'test-tube': TestTube, bug: Bug, eye: Eye, coffee: Coffee,
  leaf: Leaf, gem: Gem, feather: Feather, atom: Atom, zap: Zap, flame: Flame, rocket: Rocket,
  sparkles: Sparkles, cpu: Cpu, smartphone: Smartphone, gamepad: Gamepad2, puzzle: Puzzle, link: Link,
  'list-tree': ListTree, diamond: Diamond, hexagon: Hexagon, triangle: Triangle, circle: Circle,
  square: Square, star: Star, heart: Heart, 'file-image': FileImage, 'file-archive': FileArchive,
  'file-audio': FileAudio, 'file-video': FileVideo, 'file-spreadsheet': FileSpreadsheet,
  'file-terminal': FileTerminal, 'file-key': FileKey, 'file-badge': FileBadge, 'file-check': FileCheck,
  'file-diff': FileDiff, 'file-box': FileBox, files: Files, 'folder-tree': FolderTree,
  'folder-archive': FolderArchive, 'folder-lock': FolderLock, 'folder-key': FolderKey,
  'folder-search': FolderSearch, 'folder-dot': FolderDot, 'folder-root': FolderRoot, 'folder-sync': FolderSync,
  'folder-clock': FolderClock, 'folder-symlink': FolderSymlink, 'folder-heart': FolderHeart, 'folder-check': FolderCheck, book: Book,
  'book-text': BookText, library: Library, notebook: Notebook, 'notebook-pen': NotebookPen, scroll: ScrollText,
  newspaper: Newspaper, presentation: Presentation, quote: Quote, 'sticky-note': StickyNote,
  notepad: NotepadText, brackets: Brackets, regex: Regex, variable: Variable, function: SquareFunction,
  'code-xml': CodeXml, 'square-terminal': SquareTerminal, command: Command, keyboard: Keyboard,
  'at-sign': AtSign, asterisk: Asterisk, sigma: Sigma, calculator: Calculator, 'key-round': KeyRound,
  'lock-keyhole': LockKeyhole, shield: Shield, 'badge-check': BadgeCheck, 'user-cog': UserCog, users: Users,
  'package-open': PackageOpen, 'package-check': PackageCheck, cylinder: Cylinder, shapes: Shapes, truck: Truck,
  factory: Factory, construction: Construction, 'hard-hat': HardHat, 'ship-wheel': ShipWheel,
  'settings-2': Settings2, sliders: SlidersHorizontal, drill: Drill, axe: Axe, shovel: Shovel,
  wand: WandSparkles, magnet: Magnet, scissors: Scissors, paperclip: Paperclip, pin: Pin,
  'git-commit': GitCommitHorizontal, 'git-pull-request': GitPullRequest, 'git-fork': GitFork,
  'git-compare': GitCompare, 'git-graph': GitGraph, list: List, 'list-checks': ListChecks,
  'list-todo': ListTodo, 'clipboard-list': ClipboardList, 'clipboard-check': ClipboardCheck, tag: Tag, tags: Tags,
  bookmark: Bookmark, flag: Flag, 'server-cog': ServerCog, 'database-zap': DatabaseZap, kanban: Kanban,
  'layout-dashboard': LayoutDashboard, 'layout-template': LayoutTemplate, 'app-window': AppWindow,
  network: Network, plug: Plug, 'plug-zap': PlugZap, cable: Cable, route: Route, signpost: Signpost,
  share: Share2, rss: Rss, send: Send, mail: Mail, bell: Bell, download: Download, upload: Upload,
  'cloud-cog': CloudCog, earth: Earth, map: Map, 'map-pin': MapPin, satellite: Satellite, radio: Radio,
  radar: Radar, antenna: Antenna, wifi: Wifi, images: Images, camera: Camera, film: Film, brush: Brush,
  'pen-tool': PenTool, 'qr-code': QrCode, printer: Printer, drama: Drama, monitor: Monitor, laptop: Laptop,
  'hard-drive': HardDrive, save: Save, 'circuit-board': CircuitBoard, microchip: Microchip, power: Power,
  'battery-charging': BatteryCharging, 'test-tubes': TestTubes, microscope: Microscope, dna: Dna, pill: Pill,
  'heart-pulse': HeartPulse, 'bug-play': BugPlay, activity: Activity, gauge: Gauge, target: Target,
  lightbulb: Lightbulb, thermometer: Thermometer, calendar: Calendar, clock: Clock, history: History,
  hourglass: Hourglass, timer: Timer, bot: Bot, brain: Brain, infinity: Infinity, orbit: Orbit,
  recycle: Recycle, trash: Trash2, message: MessageSquare, sun: Sun, moon: Moon, snowflake: Snowflake,
  droplet: Droplet, wind: Wind, waves: Waves, umbrella: Umbrella, rainbow: Rainbow, mountain: Mountain,
  'tree-pine': TreePine, trees: Trees, sprout: Sprout, flower: Flower2, clover: Clover, compass: Compass,
  bird: Bird, dog: Dog, cat: Cat, fish: Fish, rabbit: Rabbit, turtle: Turtle, bone: Bone, egg: Egg,
  apple: Apple, cherry: Cherry, citrus: Citrus, grape: Grape, carrot: Carrot, candy: Candy, cake: Cake,
  cookie: Cookie, pizza: Pizza, beer: Beer, 'chef-hat': ChefHat, crown: Crown, trophy: Trophy,
  sparkle: Sparkle, plane: Plane, sailboat: Sailboat, dices: Dices, joystick: Joystick, swords: Swords,
  house: House, building: Building2, landmark: Landmark, castle: Castle, wallet: Wallet, coins: Coins,
} as const;

export const ICON_SHAPES: Record<IconShapeName, LucideIcon> = { ...LUCIDE_SHAPES, ...ROLE_FOLDERS, ...MARKS };
