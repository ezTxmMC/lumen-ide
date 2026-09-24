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
 * The interpreter for node graphs.
 *
 * The renderer's CSP forbids `eval`, so user add-ons are not run as JavaScript
 * but interpreted here, node by node:
 *
 * - Execution follows the exec edges, starting from an event node.
 * - Data pins are read only when needed. Pure nodes, the ones without exec
 *   pins, compute at most once per executed exec node (memoised).
 * - A step limit and an AbortSignal prevent endless loops.
 * - Errors carry the id of the node they arose in.
 *
 * Everything touching the IDE goes through `GraphHost`; the tests put a stand-in
 * there (scripts/check-addons.ts).
 */

import { t } from '@/i18n';
import type { Graph, GraphEdge, GraphNode } from './schema';
import { NODE_CATALOG, type NodeDef, type PinDef } from './catalog';
import { coerce, GraphError, StopSignal } from './values';

export { coerce, GraphError, StopSignal, toText } from './values';

/* ------------------------------------------------------------------ *
 * Host
 * ------------------------------------------------------------------ */

export interface ShellResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** The interface to the IDE — `runtime.ts` in the renderer, a stand-in in tests. */
export interface GraphHost {
  selection(): string;
  replaceSelection(text: string): void;
  insert(text: string): void;
  documentText(): string;
  currentLine(): { text: string; number: number; };
  filePath(): string;
  languageId(): string;
  cursor(): { line: number; column: number; };
  gotoLine(line: number): void;

  notify(message: string, kind: 'info' | 'success' | 'warning' | 'error'): void;
  prompt(title: string, label: string, initial: string): Promise<string | null>;
  pick(title: string, items: string[]): Promise<string | null>;
  output(text: string): void;

  openFile(path: string): Promise<void>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  shell(addonId: string, command: string): Promise<ShellResult>;
  runTask(id: string): Promise<boolean>;

  runCommand(id: string): boolean;
  setTheme(id: string): void;
  toggleSetting(key: string, mode: string): void;
}

/* ------------------------------------------------------------------ *
 * Context for a node
 * ------------------------------------------------------------------ */

export interface NodeContext {
  node: GraphNode;
  host: GraphHost;
  addonId: string;
  /** Graph-local variables of this run. */
  vars: Map<string, unknown>;
  /** Data of the triggering event (a path, and so on). */
  payload: Record<string, unknown>;
  signal: AbortSignal;
  /** An input's value, already coerced to the pin's type. */
  input(pin: string): Promise<unknown>;
  /** A setting's value (a choice, a variable name …). */
  setting(id: string): string;
}

export interface ExecContext extends NodeContext {
  /** Set an output value, readable by the nodes that follow. */
  output(pin: string, value: unknown): void;
  /** Run the flow hanging off an exec output and wait for it. */
  follow(pin: string): Promise<void>;
}

/** Inline value of an unconnected pin; lists arrive as comma-separated text. */
function inlineValue(node: GraphNode, pin: PinDef): unknown {
  const raw = node.values?.[pin.id] ?? pin.default;
  if (pin.type !== 'list') {
    return coerce(raw ?? '', pin.type);
  }
  if (Array.isArray(raw)) {
    return raw;
  }
  return String(raw ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}

/* ------------------------------------------------------------------ *
 * Running
 * ------------------------------------------------------------------ */

export interface GraphTrace {
  /** A node is being executed or computed. */
  visit?(nodeId: string): void;
  /** A pin has received a value. */
  value?(nodeId: string, pin: string, value: unknown): void;
  /** Awaited before every exec node (slow motion in a test run). */
  step?(nodeId: string): Promise<void> | void;
}

export interface RunOptions {
  /** Id of the starting node, usually an event node. */
  entry: string;
  host: GraphHost;
  addonId: string;
  payload?: Record<string, unknown>;
  signal?: AbortSignal;
  /** Maximum number of nodes executed or computed. Defaults to 10,000. */
  maxSteps?: number;
  trace?: GraphTrace;
  catalog?: Map<string, NodeDef>;
}

export interface RunResult {
  steps: number;
  /** Ended by a stop node. */
  stopped: boolean;
}

export const DEFAULT_MAX_STEPS = 10_000;

const key = (node: string, pin: string) => `${node}:${pin}`;

export const isExecNode = (def: NodeDef) =>
  def.inputs.some((p) => p.type === 'exec') || def.outputs.some((p) => p.type === 'exec');

/** The wiring of a graph: which edge feeds a pin, and where an exec pin leads. */
function indexEdges(graph: Graph) {
  const incoming = new Map<string, GraphEdge>();
  const outgoing = new Map<string, GraphEdge[]>();
  for (const edge of graph.edges) {
    incoming.set(key(edge.to.node, edge.to.pin), edge);
    const list = outgoing.get(key(edge.from.node, edge.from.pin)) ?? [];
    list.push(edge);
    outgoing.set(key(edge.from.node, edge.from.pin), list);
  }
  return { incoming, outgoing };
}

const wrapError = (err: unknown, nodeId: string): Error => {
  if (err instanceof GraphError || err instanceof StopSignal) {
    return err;
  }
  return new GraphError((err as Error)?.message ?? String(err), nodeId);
};

/** One run of a graph: the state it needs while nodes execute and pure nodes compute. */
class GraphRun {
  private readonly catalog: Map<string, NodeDef>;
  private readonly maxSteps: number;
  private readonly signal: AbortSignal;
  private readonly trace: GraphTrace;
  private readonly payload: Record<string, unknown>;
  private readonly vars = new Map<string, unknown>();
  private readonly nodes: Map<string, GraphNode>;
  private readonly incoming: Map<string, GraphEdge>;
  private readonly outgoing: Map<string, GraphEdge[]>;
  /** Outputs of exec nodes that have already run. */
  private readonly outputs = new Map<string, unknown>();
  /** Results of pure nodes — valid for the exec node currently running. */
  private pureCache = new Map<string, Record<string, unknown>>();
  private readonly evaluating = new Set<string>();
  steps = 0;

  private readonly options: RunOptions;

  constructor(graph: Graph, options: RunOptions) {
    this.options = options;
    this.catalog = options.catalog ?? NODE_CATALOG;
    this.maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;
    this.signal = options.signal ?? new AbortController().signal;
    this.trace = options.trace ?? {};
    this.payload = options.payload ?? {};
    this.nodes = new Map(graph.nodes.map((n) => [n.id, n]));
    const edges = indexEdges(graph);
    this.incoming = edges.incoming;
    this.outgoing = edges.outgoing;
  }

  hasNode(id: string): boolean {
    return this.nodes.has(id);
  }

  private defOf(node: GraphNode): NodeDef {
    const def = this.catalog.get(node.type);
    if (!def) {
      throw new GraphError(t('addonStudio.run.unknownNode', { type: node.type }), node.id);
    }
    return def;
  }

  private tick(nodeId: string) {
    if (this.signal.aborted) {
      throw new GraphError(t('addonStudio.run.aborted'), nodeId);
    }
    this.steps++;
    if (this.steps > this.maxSteps) {
      throw new GraphError(t('addonStudio.run.stepLimit', { count: this.maxSteps }), nodeId);
    }
    this.trace.visit?.(nodeId);
  }

  private async readInput(node: GraphNode, pinId: string): Promise<unknown> {
    const def = this.defOf(node);
    const pin = def.inputs.find((p) => p.id === pinId);
    if (!pin) {
      throw new GraphError(t('addonStudio.run.unknownPin', { pin: pinId }), node.id);
    }
    const edge = this.incoming.get(key(node.id, pinId));
    if (!edge) {
      return inlineValue(node, pin);
    }

    const source = this.nodes.get(edge.from.node);
    if (!source) {
      return inlineValue(node, pin);
    }
    const sourceDef = this.defOf(source);
    if (isExecNode(sourceDef)) {
      return coerce(this.outputs.get(key(source.id, edge.from.pin)), pin.type);
    }

    const computed = await this.computePure(source, sourceDef);
    return coerce(computed[edge.from.pin], pin.type);
  }

  private async computePure(node: GraphNode, def: NodeDef): Promise<Record<string, unknown>> {
    const cached = this.pureCache.get(node.id);
    if (cached) {
      return cached;
    }
    if (this.evaluating.has(node.id)) {
      throw new GraphError(t('addonStudio.run.cycle'), node.id);
    }
    if (!def.compute) {
      return {};
    }
    this.evaluating.add(node.id);
    this.tick(node.id);
    try {
      const result = await def.compute(this.baseContext(node));
      this.pureCache.set(node.id, result);
      for (const [pin, value] of Object.entries(result)) {
        this.trace.value?.(node.id, pin, value);
      }
      return result;
    } catch (err) {
      throw wrapError(err, node.id);
    } finally {
      this.evaluating.delete(node.id);
    }
  }

  private baseContext(node: GraphNode): NodeContext {
    return {
      node,
      host: this.options.host,
      addonId: this.options.addonId,
      vars: this.vars,
      payload: this.payload,
      signal: this.signal,
      input: (pin) => this.readInput(node, pin),
      setting: (id) => {
        const def = this.catalog.get(node.type);
        const fallback = def?.settings?.find((s) => s.id === id)?.default ?? '';
        return String(node.values?.[id] ?? fallback);
      },
    };
  }

  private nextNode(nodeId: string, pin: string): string | null {
    return this.outgoing.get(key(nodeId, pin))?.[0]?.to.node ?? null;
  }

  private execContext(node: GraphNode): ExecContext {
    return {
      ...this.baseContext(node),
      output: (pin, value) => {
        this.outputs.set(key(node.id, pin), value);
        this.trace.value?.(node.id, pin, value);
      },
      follow: async (pin) => {
        const target = this.nextNode(node.id, pin);
        if (target) {
          await this.execute(target);
        }
      },
    };
  }

  async execute(startId: string): Promise<void> {
    let current: string | null = startId;
    while (current) {
      const node = this.nodes.get(current);
      if (!node) {
        return;
      }
      const def = this.defOf(node);
      if (!def.run) {
        throw new GraphError(t('addonStudio.run.notExecutable'), node.id);
      }
      this.tick(node.id);
      if (this.trace.step) {
        await this.trace.step(node.id);
      }
      this.pureCache = new Map();
      const ctx = this.execContext(node);
      let next: string | null | void;
      try {
        next = await def.run(ctx);
      } catch (err) {
        throw wrapError(err, node.id);
      }
      if (!next) {
        return;
      }
      current = this.nextNode(node.id, next);
    }
  }
}

export async function runGraph(graph: Graph, options: RunOptions): Promise<RunResult> {
  const run = new GraphRun(graph, options);
  if (!run.hasNode(options.entry)) {
    throw new GraphError(t('addonStudio.run.noEntry'));
  }
  try {
    await run.execute(options.entry);
  } catch (err) {
    if (err instanceof StopSignal) {
      return { steps: run.steps, stopped: true };
    }
    throw err;
  }
  return { steps: run.steps, stopped: false };
}

/** Event nodes of a graph, optionally of one kind only. */
export function eventNodes(graph: Graph, event?: string, catalog = NODE_CATALOG): GraphNode[] {
  return graph.nodes.filter((node) => {
    const def = catalog.get(node.type);
    if (!def?.event) {
      return false;
    }
    return !event || def.event === event;
  });
}
