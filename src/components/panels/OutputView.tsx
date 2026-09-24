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
 * The output of tasks and runners: coloured by severity, with clickable
 * file:line references, and a toolbar to build, test and pick what to run.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, FlaskConical, Hammer, Play, Square, Trash2 } from 'lucide-react';
import { useStore } from '@/state/store';
import { runWithConfig, runTask, stopRun, defaultTask } from '@/lib/run';
import { t, tr, useT } from '@/i18n';
import { formatBindingsFor } from '@/core/keybindings';
import { Button, Empty } from '../ui';
import { ContextMenu, menuBelow, type MenuItem } from '../ui/ContextMenu';

export function OutputToolbar() {
  const t = useT();
  const running = useStore((s) => s.runningId !== null);
  const runningLabel = useStore((s) => s.runningLabel);
  const clearOutput = useStore((s) => s.clearOutput);
  const tab = useStore((s) => s.tabs.find((open) => open.id === s.activeTabId) ?? null);
  const language = useStore((s) => s.languageFor(tab));
  const project = useStore((s) => s.project);
  const config = useStore((s) => s.projectConfig);
  const [menu, setMenu] = useState<{ x: number; y: number; } | null>(null);

  const runners = language?.run ?? [];
  const build = defaultTask('build');
  const test = defaultTask('test');
  const allTasks = [...config.tasks, ...(project?.tasks ?? [])];

  const items: MenuItem[] = [
    ...(runners.length ? [{ header: t('panels.output.fileSection', { name: language?.name ?? '' }) }] : []),
    ...runners.map<MenuItem>((cfg) => ({
      label: tr(cfg.label), icon: Play, detail: `${cfg.command} ${cfg.args.join(' ')}`, run: () => void runWithConfig(cfg),
    })),
    ...(allTasks.length ? [{ header: t('panels.output.projectSection', { name: project?.name ?? '' }) }] : []),
    ...allTasks.map<MenuItem>((task) => ({
      label: tr(task.label), icon: Play, detail: `${task.command} ${task.args.join(' ')}`, run: () => void runTask(task),
    })),
  ];

  if (running) {
    return (
      <>
        <Button size="sm" variant="danger" onClick={stopRun} title={t('project.cancelRun', { label: tr(runningLabel ?? '') })}>
          <Square size={11} className="fill-current" />
          <span className="max-w-[160px] truncate">{runningLabel ? tr(runningLabel) : t('panels.output.stop')}</span>
        </Button>
        <Button size="sm" title={t('panels.output.clear')} onClick={clearOutput}>
          <Trash2 size={12} />
        </Button>
      </>
    );
  }

  return (
    <>
      {build && (
        <Button size="sm" onClick={() => void runTask(build)} title={t('panels.output.buildNamed', { label: tr(build.label) })}>
          <Hammer size={11} />
        </Button>
      )}
      {test && (
        <Button size="sm" onClick={() => void runTask(test)} title={t('panels.output.testNamed', { label: tr(test.label) })}>
          <FlaskConical size={11} />
        </Button>
      )}
      {items.length > 0 && (
        <span onClick={(e) => setMenu(menuBelow(e.currentTarget))}>
          <Button size="sm" title={t('panels.output.chooseRunner')}>
            <Play size={11} />
            <span className="max-w-[140px] truncate">{runners[0] ? tr(runners[0].label) : t('project.groups.run')}</span>
            <ChevronDown size={11} />
          </Button>
        </span>
      )}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={items} onClose={() => setMenu(null)} />}
      <Button size="sm" title={t('panels.output.clear')} onClick={clearOutput}>
        <Trash2 size={12} />
      </Button>
    </>
  );
}

const STREAM_TONE: Record<'stdout' | 'stderr' | 'system', string> = {
  stdout: 'text-muted',
  stderr: 'text-bad',
  system: 'text-accent',
};

/**
 * Compilers write everything to stderr — errors, warnings *and* notes. Without
 * reading the line, a run of pure warnings would come out entirely red. The
 * kind is recognised for gcc/clang (`file:1:2: warning: …`) and MSVC
 * (`C4101:`).
 */
const SEVERITY_TONE: [RegExp, string][] = [
  [/\berrors?\s+generated\b|\b(?:fatal error|error|Fehler)\b\s*(?:[A-Z]+\d+\s*)?:/i, 'text-bad'],
  [/\bwarnings?\s+generated\b|\b(?:warning|Warnung)\b\s*(?:[A-Z]+\d+\s*)?:/i, 'text-warn'],
  [/\b(?:note|Hinweis|remark)\b\s*:/i, 'text-subtle'],
];

/** A context line from gcc/clang (“In function …”, “In file included from …”). */
const CONTEXT_LINE = /^(?:In file included from |\s+from )|:\s+In (?:function|member function|constructor|destructor|instantiation of|lambda function)\b/;

/** A continuation of the previous message: a source excerpt, a column marker, “ | ”. */
const CONTINUATION_LINE = /^\s*(?:\d+\s*\||\||[\s^~+-]*$)/;

/**
 * Tinting per output line. Continuation lines inherit their message's tint, so
 * a source excerpt does not look louder than the message itself.
 */
function outputTones(lines: { stream: 'stdout' | 'stderr' | 'system'; text: string; }[]): string[] {
  let carried: string | null = null;
  return lines.map((line) => {
    if (line.stream === 'system') {
      carried = null;
      return STREAM_TONE.system;
    }
    const hit = SEVERITY_TONE.find(([re]) => re.test(line.text));
    if (hit) {
      carried = hit[1];
      return hit[1];
    }
    if (CONTEXT_LINE.test(line.text)) {
      carried = null;
      return 'text-subtle';
    }
    if (carried && CONTINUATION_LINE.test(line.text)) {
      return carried;
    }
    carried = null;
    return STREAM_TONE[line.stream];
  });
}

function emptyHint(hasTasks: boolean, runner: string | undefined): string {
  const run = formatBindingsFor('project.run') ?? '—';
  if (hasTasks) {
    return t('panels.output.hintTasks', { run, build: formatBindingsFor('project.build') ?? '—' });
  }
  if (runner) {
    return t('panels.output.hintRunner', { run, runner: tr(runner) });
  }
  return t('panels.output.hintNoRunner');
}

export function OutputBody() {
  const t = useT();
  const output = useStore((s) => s.output);
  const tab = useStore((s) => s.tabs.find((t) => t.id === s.activeTabId) ?? null);
  const language = useStore((s) => s.languageFor(tab));
  const project = useStore((s) => s.project);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [output]);

  const runners = language?.run ?? [];
  const tones = useMemo(() => outputTones(output), [output]);

  return (
    <div className="h-full overflow-auto px-3 pb-2 font-mono text-[11.5px] leading-[1.55]">
      {output.length === 0 ? (
        <Empty
          title={t('panels.output.empty')}
          hint={emptyHint(Boolean(project?.tasks.length), runners[0]?.label)}
        />
      ) : (
        output.map((line, index) => (
          <div
            key={index}
            className={`whitespace-pre-wrap break-all ${tones[index]}`}
          >
            <OutputLine text={line.text} />
          </div>
        ))
      )}
      <div ref={bottom} />
    </div>
  );
}

/** Make file:line patterns in the output clickable (compiler errors). */
function OutputLine({ text }: { text: string; }) {
  const openAt = useStore((s) => s.openAt);
  const workspace = useStore((s) => s.workspace);
  const parts = useMemo(() => {
    const re = /((?:[A-Za-z]:)?[\w./\\+-]+\.(?:java|kt|kts|c|h|cpp|cc|cxx|c\+\+|hpp|hh|hxx|ipp|inl|tcc|ts|tsx|js|jsx|mjs|cjs|py|rs|go|nv))[(:](\d+)(?:[,:](\d+))?\)?/g;
    const out: { text: string; path?: string; line?: number; col?: number; }[] = [];
    let last = 0;
    for (const m of text.matchAll(re)) {
      const index = m.index ?? 0;
      if (index > last) {
        out.push({ text: text.slice(last, index) });
      }
      out.push({ text: m[0], path: m[1], line: Number(m[2]), col: m[3] ? Number(m[3]) : 1 });
      last = index + m[0].length;
    }
    if (last < text.length) {
      out.push({ text: text.slice(last) });
    }
    return out;
  }, [text]);

  if (parts.length === 1 && !parts[0].path) {
    return <>{text || ' '}</>;
  }
  return (
    <>
      {parts.map((p, i) =>
        p.path ? (
          <button
            key={i}
            className="underline decoration-dotted underline-offset-2 hover:text-fg"
            onClick={() => {
              const path = p.path!.startsWith('/') || /^[A-Za-z]:/.test(p.path!)
                ? p.path!
                : `${workspace ?? ''}/${p.path!.replace(/^\.\//, '')}`;
              void openAt(path, Math.max(0, p.line! - 1), Math.max(0, (p.col ?? 1) - 1));
            }}
          >
            {p.text}
          </button>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}
