/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { useT } from '@/i18n';
import { PIN_COLORS, canConnect, categoryColor, choiceLabel, nodeTitle, pinLabel, settingLabel, type NodeDef, type PinDef } from '@/core/user-addons/catalog';
import type { GraphNode } from '@/core/user-addons/schema';
import { BODY_PADDING, HEADER_HEIGHT, NODE_WIDTH, ROW_HEIGHT, SETTING_HEIGHT } from './state/geometry';
import type { PendingPin } from './NodePalette';

function nodeBorder(error: boolean, selected: boolean) {
  if (error) {
    return 'var(--c-danger)';
  }
  if (selected) {
    return 'var(--c-accent)';
  }
  return 'var(--c-border-strong)';
}

function nodeShadow(hot: boolean, selected: boolean) {
  if (hot) {
    return '0 0 0 2px var(--c-accent), 0 0 18px rgb(var(--c-accent-rgb) / 55%)';
  }
  if (selected) {
    return '0 0 0 1px var(--c-accent)';
  }
  return undefined;
}

const inlineClass = 'h-[18px] min-w-0 flex-1 rounded-[3px] border border-edge bg-input px-1 font-mono text-[10.5px] text-fg outline-none focus:border-accent';

interface PinHandleProps {
  node: GraphNode;
  pin: PinDef;
  side: 'in' | 'out';
  connected: Set<string>;
  pinValues?: Record<string, string>;
  pending: PendingPin | null;
  onPinDown: (event: React.MouseEvent, pin: PinDef, side: 'in' | 'out') => void;
}

function PinHandle({
  node, pin, side, connected, pinValues, pending, onPinDown,
}: PinHandleProps) {
  const t = useT();
  const isConnected = connected.has(`${node.id}:${side}:${pin.id}`);
  const value = pinValues?.[`${node.id}:${pin.id}`];
  const compatible = !pending || (pending.node !== node.id && pending.side !== side
    && (pending.side === 'out' ? canConnect(pending.type, pin.type) : canConnect(pin.type, pending.type)));
  const pinColor = PIN_COLORS[pin.type];
  return (
    <span
      data-pin
      data-node={node.id}
      data-pin-id={pin.id}
      data-type={pin.type}
      data-side={side}
      title={value === undefined ? `${pinLabel(pin)} · ${t(`addonStudio.pinType.${pin.type}`)}` : `${pinLabel(pin)} = ${value}`}
      onMouseDown={(e) => onPinDown(e, pin, side)}
      className="absolute top-1/2 z-10 flex size-4 -translate-y-1/2 cursor-crosshair items-center justify-center"
      style={{ [side === 'in' ? 'left' : 'right']: -8, opacity: compatible ? 1 : 0.25 }}
    >
      {pin.type === 'exec' && (
        <svg width="10" height="10" viewBox="0 0 10 10">
          <path d="M1 1 H5 L9 5 L5 9 H1 Z" fill={isConnected ? pinColor : 'var(--c-bg-overlay)'} stroke={pinColor} strokeWidth="1.4" />
        </svg>
      )}
      {pin.type !== 'exec' && (
        <span
          className="block size-[9px] rounded-full border-2"
          style={{ borderColor: pinColor, background: isConnected ? pinColor : 'var(--c-bg-overlay)' }}
        />
      )}
    </span>
  );
}

function InlineEditor({
  node, pin, connected, onValue,
}: {
  node: GraphNode;
  pin: PinDef;
  connected: Set<string>;
  onValue: (key: string, value: string | number | boolean) => void;
}) {
  if (pin.type === 'exec' || connected.has(`${node.id}:in:${pin.id}`)) {
    return null;
  }
  const raw = node.values?.[pin.id] ?? pin.default ?? '';
  if (pin.type === 'boolean') {
    return (
      <input
        type="checkbox"
        checked={raw === true || raw === 'true'}
        onMouseDown={(e) => e.stopPropagation()}
        onChange={(e) => onValue(pin.id, e.target.checked)}
        className="accent-[var(--c-accent)]"
      />
    );
  }
  return (
    <input
      value={String(raw)}
      spellCheck={false}
      placeholder={pin.type === 'list' ? 'a, b, c' : undefined}
      onMouseDown={(e) => e.stopPropagation()}
      onChange={(e) => onValue(pin.id, pin.type === 'number' && e.target.value.trim() !== '' && Number.isFinite(Number(e.target.value)) ? Number(e.target.value) : e.target.value)}
      className={inlineClass}
    />
  );
}

type SettingDef = NonNullable<NodeDef['settings']>[number];

function SettingRow({
  node, setting, onValue,
}: {
  node: GraphNode;
  setting: SettingDef;
  onValue: (key: string, value: string | number | boolean) => void;
}) {
  const value = String(node.values?.[setting.id] ?? setting.default);
  return (
    <div className="flex items-center gap-1.5 px-2.5" style={{ height: SETTING_HEIGHT }}>
      <span className="w-[64px] shrink-0 truncate text-[10.5px] text-subtle">{settingLabel(setting)}</span>
      {setting.kind === 'select' && (
        <select
          value={value}
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => onValue(setting.id, e.target.value)}
          className="h-[20px] min-w-0 flex-1 rounded-[3px] border border-edge bg-input px-1 text-[11px] outline-none focus:border-accent"
        >
          {setting.choices?.map((choice) => (
            <option key={choice.value} value={choice.value}>{choiceLabel(choice)}</option>
          ))}
        </select>
      )}
      {setting.kind === 'text' && (
        <input
          value={value}
          spellCheck={false}
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => onValue(setting.id, e.target.value)}
          className={`${inlineClass} h-[20px]`}
        />
      )}
    </div>
  );
}

// The palette's middle pin: input pins go unlabelled when there is only one exec pin.
const showLabel = (pin: PinDef) => !(pin.type === 'exec' && (pin.id === 'in' || pin.id === 'then'));

export function NodeView({
  node, def, selected, hot, error, connected, pinValues, pending, onHeaderDown, onPinDown, onValue,
}: {
  node: GraphNode;
  def: NodeDef | undefined;
  selected: boolean;
  hot: boolean;
  error: boolean;
  connected: Set<string>;
  pinValues?: Record<string, string>;
  pending: PendingPin | null;
  onHeaderDown: (event: React.MouseEvent) => void;
  onPinDown: (event: React.MouseEvent, pin: PinDef, side: 'in' | 'out') => void;
  onValue: (key: string, value: string | number | boolean) => void;
}) {
  const t = useT();
  const color = def ? categoryColor(def.category) : '#e2554f';
  const rows = Math.max(def?.inputs.length ?? 0, def?.outputs.length ?? 0, 1);
  const pinProps = { node, connected, pinValues, pending, onPinDown };

  return (
    <div
      data-graph-node={node.id}
      className="lm-shadow absolute rounded-lumen border bg-overlay"
      style={{
        left: node.x,
        top: node.y,
        width: NODE_WIDTH,
        borderColor: nodeBorder(error, selected),
        boxShadow: nodeShadow(hot, selected),
        transition: 'box-shadow 200ms ease-out',
      }}
      onMouseDown={onHeaderDown}
    >
      <div
        className="flex cursor-move items-center gap-1.5 rounded-t-[inherit] border-b border-edge px-2"
        style={{ height: HEADER_HEIGHT, background: `linear-gradient(90deg, ${color}55, ${color}10)` }}
      >
        <span className="size-2 shrink-0 rounded-full" style={{ background: color }} />
        <span className="min-w-0 flex-1 truncate text-[11.5px] font-medium text-fg">
          {def ? nodeTitle(def.type) : t('addonStudio.graph.unknownNode', { type: node.type })}
        </span>
      </div>

      <div style={{ paddingTop: BODY_PADDING, paddingBottom: BODY_PADDING }}>
        {def?.settings?.map((setting) => (
          <SettingRow key={setting.id} node={node} setting={setting} onValue={onValue} />
        ))}

        {Array.from({ length: rows }, (_, index) => {
          const input = def?.inputs[index];
          const output = def?.outputs[index];
          return (
            <div key={index} className="relative flex items-center gap-1" style={{ height: ROW_HEIGHT }}>
              <div className="relative flex h-full min-w-0 flex-1 items-center gap-1 pl-2.5">
                {input && <PinHandle {...pinProps} pin={input} side="in" />}
                {input && showLabel(input) && (
                  <span className="max-w-[72px] shrink-0 truncate text-[11px] text-muted">{pinLabel(input)}</span>
                )}
                {input && <InlineEditor node={node} pin={input} connected={connected} onValue={onValue} />}
              </div>
              {output && (
                <div className="relative flex h-full max-w-[50%] shrink-0 items-center justify-end pr-2.5">
                  {showLabel(output) && <span className="truncate text-[11px] text-muted">{pinLabel(output)}</span>}
                  <PinHandle {...pinProps} pin={output} side="out" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
