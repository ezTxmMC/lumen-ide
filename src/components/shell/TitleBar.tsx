/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { formatBindingsFor } from "@/core/keybindings";
import { useT } from "@/i18n";
import { defaultTask, runDefault, stopRun } from "@/lib/run";
import { isProjectsWindow } from "@/lib/window-mode";
import { useStore } from "@/state/store";
import {
  Command,
  Copy,
  FlaskConical,
  Hammer,
  Minus,
  PanelBottom,
  PanelLeft,
  PanelRight,
  Play,
  Search,
  Square,
  Square as StopIcon,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "../ui";
import { MenuBar } from "./menubar/MenuBar";
import { ProjectSwitcher } from "./ProjectSwitcher";

/** A label with the command's shortcut, when it has one. */
function withKeys(label: string, commandId: string) {
  const keys = formatBindingsFor(commandId);
  if (!keys) {
    return label;
  }
  return `${label} (${keys})`;
}

/**
 * The title bar: the menu bar and the project switcher on the left, the run
 * buttons, the title (which opens the command palette) in the middle, the
 * dock toggles and the window buttons on the right.
 *
 * macOS keeps its native application menu at the top of the screen — the
 * menu bar here would only repeat it, so it is left out there.
 */
export function TitleBar() {
  return isProjectsWindow ? <ProjectsTitleBar /> : <MainTitleBar />;
}

/** The small project-screen window: a name to drag by, and minimize and close. */
function ProjectsTitleBar() {
  const isMac = useStore((s) => s.platform) === "darwin";
  return (
    <header
      className="lm-transition flex h-9 shrink-0 items-center gap-1 border-b border-edge bg-surface px-2"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      {isMac && <div className="w-16 shrink-0" />}
      <span className="flex-1 px-2 text-[12px] text-subtle">Lumen</span>
      {!isMac && <WindowControls maximized={false} resizable={false} />}
    </header>
  );
}

function MainTitleBar() {
  const [maximized, setMaximized] = useState(false);
  const platform = useStore((s) => s.platform);

  useEffect(() => {
    void window.lumen.window.isMaximized().then(setMaximized);
    return window.lumen.window.onState((s) => {
      if (typeof s.maximized === "boolean") {
        setMaximized(s.maximized);
      }
    });
  }, []);

  const isMac = platform === "darwin";

  return (
    <header
      className="lm-transition flex h-9 shrink-0 items-center gap-1 border-b border-edge bg-surface px-2"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      {isMac && <div className="w-18 shrink-0" />}

      {!isMac && <MenuBar />}
      {!isMac && <span className="mx-1 h-4 w-px shrink-0 bg-edge" />}

      <ProjectSwitcher />

      <span className="flex-1"></span>

      <RunButtons />

      <span className="mx-1 h-4 w-px shrink-0 bg-edge" />

      <DockToggles />

      {!isMac && <WindowControls maximized={maximized} />}
    </header>
  );
}

function RunButtons() {
  const t = useT();
  const running = useStore((s) => s.runningId !== null);
  const runningLabel = useStore((s) => s.runningLabel);
  // The labels depend on the project and its configuration.
  useStore((s) => s.project);
  useStore((s) => s.projectConfig);
  const build = defaultTask("build");
  const run = defaultTask("run");
  const test = defaultTask("test");
  return (
    <div
      className="ml-1 flex items-center gap-0.5"
      style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
    >
      {running
        ? (
          <Button
            onClick={stopRun}
            title={t("titlebar.stop", { label: runningLabel ?? "" })}
            size="sm"
            variant="danger"
          >
            <StopIcon size={13} className="fill-current" />
          </Button>
        )
        : (
          <>
            <Button
              onClick={() => runDefault("run")}
              title={withKeys(
                run
                  ? t("titlebar.run", { label: run.label })
                  : t("titlebar.runFile"),
                "project.run",
              )}
              size="sm"
            >
              <Play size={14} />
            </Button>
            <Button
              onClick={() => runDefault("test")}
              title={test
                ? withKeys(
                  t("titlebar.test", { label: test.label }),
                  "project.test",
                )
                : t("titlebar.noTest")}
              size="sm"
              disabled={!test}
            >
              <FlaskConical size={14} />
            </Button>
            <Button
              onClick={() => runDefault("build")}
              title={build
                ? withKeys(
                  t("titlebar.build", { label: build.label }),
                  "project.build",
                )
                : t("titlebar.noBuild")}
              size="sm"
              disabled={!build}
            >
              <Hammer size={14} />
            </Button>
          </>
        )}
    </div>
  );
}

function TitleSearch({ title }: { title: string }) {
  const t = useT();
  const setPalette = useStore((s) => s.setPalette);
  return (
    <div className="flex min-w-0 flex-1 items-center justify-center overflow-hidden px-2">
      <button
        onClick={() => setPalette("commands")}
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        className="lm-transition group flex h-6 max-w-[440px] min-w-0 flex-1 items-center gap-2 rounded-lumen-sm border border-transparent px-2 text-[12px] text-subtle hover:border-edge hover:bg-hover"
        title={withKeys(t("titlebar.commandPalette"), "view.commandPalette")}
      >
        <Command size={11} className="shrink-0 opacity-60" />
        <span className="truncate">{title}</span>
      </button>
      <button
        onClick={() => useStore.getState().openEverywhere("all")}
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        className="lm-transition ml-1 flex h-6 shrink-0 items-center gap-1 rounded-lumen-sm px-1.5 text-[11px] text-subtle hover:bg-hover hover:text-fg"
        title={withKeys(t("titlebar.searchEverywhere"), "search.everywhere")}
      >
        <Search size={12} />
        <span className="font-mono text-[10px] opacity-70">⇧⇧</span>
      </button>
    </div>
  );
}

function DockToggles() {
  const t = useT();
  const layout = useStore((s) => s.layout);
  const toggleDock = useStore((s) => s.toggleDock);
  const secondary = layout.navSide === "left" ? "right" : "left";
  return (
    <div
      className="flex items-center gap-0.5"
      style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
    >
      <Button
        onClick={() => toggleDock(layout.navSide)}
        className={layout[layout.navSide].open ? "text-accent" : ""}
        title={withKeys(t("titlebar.toggleSidebar"), "view.sidebar")}
        size="sm"
      >
        {layout.navSide === "left"
          ? <PanelLeft size={14} />
          : <PanelRight size={14} />}
      </Button>
      <Button
        onClick={() => toggleDock("bottom")}
        title={withKeys(t("titlebar.togglePanel"), "view.panel")}
        size="sm"
        className={layout.bottom.open ? "text-accent" : ""}
      >
        <PanelBottom size={14} />
      </Button>
      <Button
        onClick={() => toggleDock(secondary)}
        title={withKeys(t("titlebar.toggleSecondary"), "view.secondarySidebar")}
        size="sm"
        className={layout[secondary].open ? "text-accent" : ""}
      >
        {secondary === "right"
          ? <PanelRight size={14} />
          : <PanelLeft size={14} />}
      </Button>
    </div>
  );
}

function WindowControls(
  { maximized, resizable = true }: { maximized: boolean; resizable?: boolean },
) {
  const t = useT();
  return (
    <div
      className="ml-1 flex items-center"
      style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
    >
      <WindowButton
        onClick={() => void window.lumen.window.minimize()}
        label={t("titlebar.minimize")}
      >
        <Minus size={13} />
      </WindowButton>
      {resizable && (
        <WindowButton
          onClick={() => void window.lumen.window.toggleMaximize()}
          label={t(maximized ? "titlebar.restore" : "titlebar.maximize")}
        >
          {maximized ? <Copy size={11} /> : <Square size={11} />}
        </WindowButton>
      )}
      <WindowButton
        onClick={() => void window.lumen.window.close()}
        label={t("common.close")}
        danger
      >
        <X size={14} />
      </WindowButton>
    </div>
  );
}

function WindowButton({
  children,
  onClick,
  label,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={[
        "lm-transition flex h-7 w-10 items-center justify-center rounded-lumen-sm text-muted",
        danger
          ? "hover:bg-bad hover:text-white"
          : "hover:bg-hover hover:text-fg",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
