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
 * Lumen's own views. They register like any extension's — the docks do not
 * know them by name, and each can be dragged anywhere.
 */

import { lsp } from "@/core/lsp/manager";
import { type ViewDef, viewRegistry } from "@/core/views";
import { t } from "@/i18n";
import { terminals } from "@/lib/terminals";
import { useStore } from "@/state/store";
import {
  Bug,
  CircleAlert,
  Files,
  FolderKanban,
  Link2,
  ListTree,
  Search,
  SquareTerminal,
  TerminalSquare,
  Zap,
} from "lucide-react";
import { DebugPanel } from "../panels/DebugPanel";
import { DebugSidebar } from "../panels/DebugSidebar";
import { Explorer } from "../panels/Explorer";
import { LspPanel } from "../panels/LspPanel";
import { OutlinePanel } from "../panels/OutlinePanel";
import { OutputBody, OutputToolbar } from "../panels/OutputView";
import { ProblemsPanel } from "../panels/ProblemsPanel";
import { ProjectPanel } from "../panels/ProjectPanel";
import { ReferencesPanel } from "../panels/ReferencesPanel";
import { SearchPanel } from "../panels/SearchPanel";
import { TerminalPanel, TerminalToolbar } from "../panels/TerminalPanel";

/** A dot rather than a number — “something is going on here”. */
export const DOT = "•";

const state = () => useStore.getState();

const VIEWS: ViewDef[] = [
  {
    id: "explorer",
    defaultDock: "left",
    order: 10,
    icon: Files,
    command: "view.explorer",
    title: () => t("shell.view.explorer"),
    render: () => <Explorer />,
  },
  {
    id: "search",
    defaultDock: "left",
    order: 20,
    icon: Search,
    command: "view.search",
    title: () => t("shell.view.search"),
    render: () => <SearchPanel />,
  },
  {
    id: "project",
    defaultDock: "left",
    order: 30,
    icon: FolderKanban,
    command: "project.panel",
    title: () => t("shell.view.project"),
    render: () => <ProjectPanel />,
    badge:
      () => (state().project?.primary
        ? { text: DOT, tone: "text-accent" }
        : null),
  },
  {
    id: "outline",
    defaultDock: "left",
    order: 40,
    icon: ListTree,
    command: "view.outline",
    title: () => t("shell.view.outline"),
    render: () => <OutlinePanel />,
  },
  {
    id: "debug",
    defaultDock: "left",
    order: 50,
    icon: Bug,
    command: "view.debug",
    title: () => t("shell.view.debug"),
    render: () => <DebugSidebar />,
    badge:
      () => (state().debugActive ? { text: DOT, tone: "text-warn" } : null),
  },
  {
    id: "output",
    defaultDock: "bottom",
    order: 20,
    icon: TerminalSquare,
    command: "view.output",
    title: () => t("panels.tabs.output"),
    render: () => <OutputBody />,
    toolbar: () => <OutputToolbar />,
    badge:
      () => (state().runningId ? { text: DOT, tone: "text-accent" } : null),
  },
  {
    id: "debug-console",
    defaultDock: "bottom",
    order: 30,
    icon: Bug,
    title: () => t("panels.tabs.debug"),
    render: () => <DebugPanel />,
    badge:
      () => (state().debugActive ? { text: DOT, tone: "text-warn" } : null),
  },
  {
    id: "problems",
    defaultDock: "bottom",
    order: 40,
    icon: CircleAlert,
    command: "view.problems",
    title: () => t("panels.tabs.problems"),
    render: () => <ProblemsPanel />,
    badge: () => {
      const counts = lsp.diagnosticCounts();
      const total = counts.errors + counts.warnings;
      if (!total) {
        return null;
      }
      return {
        text: String(total),
        tone: counts.errors > 0 ? "text-bad" : "text-warn",
      };
    },
  },
  {
    id: "lsp",
    defaultDock: "bottom",
    order: 50,
    icon: Zap,
    command: "view.lsp",
    title: () => t("panels.tabs.lsp"),
    render: () => <LspPanel />,
    badge: () => {
      const ready =
        lsp.list().filter((server) => server.status === "ready").length;
      return ready ? { text: String(ready), tone: "text-ok" } : null;
    },
  },
  {
    id: "references",
    defaultDock: "bottom",
    order: 60,
    icon: Link2,
    command: "view.references",
    title: () => t("panels.tabs.references"),
    render: () => <ReferencesPanel />,
    badge: () => {
      const hits = state().references?.hits.length;
      return hits ? { text: String(hits) } : null;
    },
  },
  {
    id: "terminal",
    defaultDock: "bottom",
    order: 70,
    icon: SquareTerminal,
    command: "terminal.toggle",
    title: () => t("panels.tabs.terminal"),
    render: () => <TerminalPanel />,
    toolbar: () => <TerminalToolbar />,
    badge: () => {
      const count = terminals.list().length;
      return count ? { text: String(count), tone: "text-ok" } : null;
    },
  },
];

let registered = false;

/** Once, before the first dock renders. */
export function registerBuiltinViews() {
  if (registered) {
    return;
  }
  registered = true;
  for (const view of VIEWS) {
    viewRegistry.register(view);
  }
}
