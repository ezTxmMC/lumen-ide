/** Shapes for icon packs: a name from `ICON_SHAPE_NAMES` → a Lucide icon. */

import {
  Anchor, Archive, Atom, Binary, BookMarked, BookOpen, Box, Boxes, Blocks, Braces, Bug, Circle, Cloud, Code,
  Coffee, Cog, Component, Container, Cpu, Database, Diamond, Eye, Feather, File, FileCode, FileCog, FileJson,
  FileLock, FileText, FileType, Fingerprint, FlaskConical, Flame, Folder, FolderCode, FolderCog, FolderGit2,
  FolderKanban, FolderOpen, Gamepad2, Gem, GitBranch, GitMerge, Github, Globe, Hammer, Hash, Heart, Hexagon,
  Image, Key, Languages, Layers, Leaf, Link, ListTree, Lock, Music, Package, Palette, Pickaxe, Puzzle,
  Receipt, Rocket, Scale, Server, Settings, Sheet, ShieldCheck, Ship, Smartphone, Sparkles, Square, Star,
  Table, Terminal, TestTube, Triangle, Type, Video, Webhook, Workflow, Wrench, Zap, type LucideIcon,
} from 'lucide-react'
import type { IconShapeName } from '@/core/icon-pack'

export const ICON_SHAPES: Record<IconShapeName, LucideIcon> = {
  file: File, 'file-code': FileCode, 'file-text': FileText, 'file-json': FileJson, 'file-cog': FileCog,
  'file-lock': FileLock, 'file-type': FileType,
  folder: Folder, 'folder-open': FolderOpen, 'folder-git': FolderGit2, 'folder-cog': FolderCog,
  'folder-code': FolderCode, 'folder-kanban': FolderKanban,
  braces: Braces, code: Code, terminal: Terminal, hash: Hash, type: Type, binary: Binary, component: Component,
  lock: Lock, key: Key, 'shield-check': ShieldCheck, fingerprint: Fingerprint,
  package: Package, boxes: Boxes, box: Box, blocks: Blocks, archive: Archive, container: Container, ship: Ship,
  anchor: Anchor,
  settings: Settings, cog: Cog, wrench: Wrench, hammer: Hammer, pickaxe: Pickaxe, workflow: Workflow,
  webhook: Webhook, layers: Layers,
  'git-branch': GitBranch, 'git-merge': GitMerge, github: Github,
  'book-open': BookOpen, 'book-marked': BookMarked, scale: Scale, receipt: Receipt, languages: Languages,
  database: Database, table: Table, sheet: Sheet, server: Server, cloud: Cloud, globe: Globe,
  image: Image, palette: Palette, music: Music, video: Video,
  flask: FlaskConical, 'test-tube': TestTube, bug: Bug, eye: Eye,
  coffee: Coffee, leaf: Leaf, gem: Gem, feather: Feather, atom: Atom, zap: Zap, flame: Flame, rocket: Rocket,
  sparkles: Sparkles,
  cpu: Cpu, smartphone: Smartphone, gamepad: Gamepad2, puzzle: Puzzle, link: Link, 'list-tree': ListTree,
  diamond: Diamond, hexagon: Hexagon, triangle: Triangle, circle: Circle, square: Square, star: Star, heart: Heart,
}
