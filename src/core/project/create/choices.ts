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
 * Choices of select and combobox fields: fixed (`choices`), computed from the
 * other fields (`choicesFor`) or fetched (`loadChoices`).
 *
 * `ChoiceLoader` runs the fetches. It is plain TypeScript, not React, so the
 * forms, the project page and the check scripts share one behaviour:
 *
 * - a field loads once when it first becomes visible, and again whenever a
 *   field named in `dependsOn` changes;
 * - a load that has been overtaken is aborted and its result dropped;
 * - a field waits while a field it depends on is still loading — otherwise it
 *   would fetch for a value that is about to be replaced. Dependent fields
 *   therefore settle in order: A loads, A's value settles, then B loads.
 */

import type { FieldChoice, FormField, FormValues } from '@/core/types';

export type ChoiceStatus = 'loading' | 'ready' | 'error';

export interface ChoiceState {
  status: ChoiceStatus;
  /** The last list that arrived — kept while a reload runs. */
  choices: FieldChoice[];
  error?: string;
  /** The dependency values the list belongs to. */
  key: string;
}

/** Load state per field id. Fields without `loadChoices` never appear. */
export type LoadedChoices = Readonly<Record<string, ChoiceState>>;

/** A reload after a dependency changed waits this long, so typing does not fire a fetch per key. */
export const RELOAD_DELAY_MS = 180;

export function isChoiceField(field: FormField): boolean {
  return field.type === 'select' || field.type === 'combobox';
}

/** The choices a field offers at the given values. */
export function fieldChoices(field: FormField, values: FormValues, loaded: LoadedChoices = {}): FieldChoice[] {
  const state = field.loadChoices ? loaded[field.id] : undefined;
  if (state && state.choices.length) {
    return state.choices;
  }
  if (field.choicesFor) {
    return safeChoicesFor(field, values);
  }
  return field.choices ?? [];
}

function safeChoicesFor(field: FormField, values: FormValues): FieldChoice[] {
  try {
    return field.choicesFor?.(values) ?? [];
  } catch {
    return field.choices ?? [];
  }
}

/**
 * Whether a field's list is final at these values. A field that fetches is
 * final once its load for the current dependencies arrived; until then the
 * value it holds is left alone rather than bent to a stale list.
 */
export function choicesSettled(field: FormField, values: FormValues, loaded: LoadedChoices = {}): boolean {
  if (!field.loadChoices) {
    return true;
  }
  const state = loaded[field.id];
  return state?.status === 'ready' && state.key === dependencyKey(field, values);
}

/** The values a load depends on, as a comparable string. */
export function dependencyKey(field: FormField, values: FormValues): string {
  return JSON.stringify((field.dependsOn ?? []).map((id) => values[id] ?? ''));
}

/** Groups in order of first appearance; choices without a group come first under `''`. */
export function groupChoices(choices: FieldChoice[]): { group: string; choices: FieldChoice[]; }[] {
  const groups = new Map<string, FieldChoice[]>();
  for (const choice of choices) {
    const key = choice.group ?? '';
    groups.set(key, [...(groups.get(key) ?? []), choice]);
  }
  const ungrouped = groups.get('');
  const rest = [...groups.entries()].filter(([group]) => group !== '');
  return [
    ...(ungrouped ? [{ group: '', choices: ungrouped }] : []),
    ...rest.map(([group, list]) => ({ group, choices: list })),
  ];
}

/** Choices matching a search: every word must appear in the label, value, group or badge. */
export function filterChoices(choices: FieldChoice[], query: string, label: (text: string) => string = (x) => x): FieldChoice[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) {
    return choices;
  }
  return choices.filter((choice) => {
    const haystack = `${label(choice.label)} ${choice.value} ${label(choice.group ?? '')} ${label(choice.badge ?? '')}`.toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}

export class ChoiceLoader {
  private states: Record<string, ChoiceState> = {};
  private controllers = new Map<string, AbortController>();
  private inflight = new Set<Promise<void>>();
  private listeners = new Set<() => void>();
  /** Bumped by `retry`, so the same dependencies load once more. */
  private attempts: Record<string, number> = {};
  /** The attempt each field's current state was started for. */
  private started: Record<string, number> = {};

  /** The current state; a new object after every change (for `useSyncExternalStore`). */
  snapshot = (): LoadedChoices => this.states;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Start whatever the values call for. Cheap when nothing changed. */
  sync(fields: FormField[], values: FormValues) {
    const byId = new Map(fields.map((field) => [field.id, field]));
    for (const field of fields) {
      if (!field.loadChoices) {
        continue;
      }
      if (field.when && !safeWhen(field, values)) {
        continue;
      }
      const key = dependencyKey(field, values);
      const attempt = this.attempts[field.id] ?? 0;
      const waiting = (field.dependsOn ?? []).some((id) => this.pending(byId.get(id), values));
      if (waiting) {
        this.hold(field.id);
        continue;
      }
      if (this.states[field.id]?.key === key && this.started[field.id] === attempt) {
        continue;
      }
      this.started[field.id] = attempt;
      this.start(field, values, key);
    }
  }

  /** Load a field again — after an error, say. */
  retry = (id: string) => {
    this.attempts[id] = (this.attempts[id] ?? 0) + 1;
    const state = this.states[id];
    this.set(id, { status: 'loading', choices: state?.choices ?? [], key: '' });
  };

  /** Resolves once no load is running — for tests and scripts. */
  async idle() {
    while (this.inflight.size) {
      await Promise.all([...this.inflight]);
    }
  }

  /** Abort everything. Loads that were running are forgotten, so a later `sync` starts them afresh. */
  dispose() {
    for (const controller of this.controllers.values()) {
      controller.abort();
    }
    this.controllers.clear();
    const kept = Object.entries(this.states).filter(([, state]) => state.status !== 'loading' || !state.key);
    this.states = Object.fromEntries(kept);
  }

  /** Is this field still on its way to a final list? */
  private pending(field: FormField | undefined, values: FormValues): boolean {
    if (!field?.loadChoices) {
      return false;
    }
    if (field.when && !safeWhen(field, values)) {
      return false;
    }
    const state = this.states[field.id];
    return !state || state.status === 'loading';
  }

  /** Show a spinner while a dependency loads, and drop a fetch that is now pointless. */
  private hold(id: string) {
    const state = this.states[id];
    if (state?.status === 'loading' && !state.key) {
      return;
    }
    this.controllers.get(id)?.abort();
    this.controllers.delete(id);
    this.set(id, { status: 'loading', choices: state?.choices ?? [], key: '' });
  }

  private start(field: FormField, values: FormValues, key: string) {
    this.controllers.get(field.id)?.abort();
    const controller = new AbortController();
    this.controllers.set(field.id, controller);
    const previous = this.states[field.id];
    // The first load goes out at once; reloads wait a moment for typing to stop.
    const delay = previous && previous.key && previous.status !== 'error' ? RELOAD_DELAY_MS : 0;
    this.set(field.id, { status: 'loading', choices: previous?.choices ?? [], key });

    const run = async () => {
      if (delay) {
        await wait(delay, controller.signal);
      }
      if (controller.signal.aborted) {
        return;
      }
      try {
        const choices = await field.loadChoices!(values, controller.signal);
        if (controller.signal.aborted) {
          return;
        }
        this.set(field.id, { status: 'ready', choices: Array.isArray(choices) ? choices : [], key });
      } catch (err) {
        if (controller.signal.aborted) {
          return;
        }
        const message = err instanceof Error ? err.message : String(err);
        this.set(field.id, { status: 'error', choices: previous?.choices ?? [], error: message, key });
      } finally {
        if (this.controllers.get(field.id) === controller) {
          this.controllers.delete(field.id);
        }
      }
    };
    const promise = run();
    this.inflight.add(promise);
    void promise.finally(() => this.inflight.delete(promise));
  }

  private set(id: string, state: ChoiceState) {
    this.states = { ...this.states, [id]: state };
    for (const listener of this.listeners) {
      listener();
    }
  }
}

function safeWhen(field: FormField, values: FormValues): boolean {
  try {
    return field.when?.(values) ?? true;
  } catch {
    return false;
  }
}

function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}
