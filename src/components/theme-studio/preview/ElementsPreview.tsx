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
import type { Theme } from '@/core/types';
import { uses } from '../keys';
import {
  BadgesCard, ButtonsCard, CompletionCard, ControlsCard, DiagnosticsCard, DialogCard, EditorMarksCard, InputsCard, PaletteCard, ToastsCard, TooltipCard,
} from './element-cards';
import { makeKit } from './element-kit';

/** Interface elements in every state, drawn with the draft's colours. */
export function ElementsPreview({ theme }: { theme: Theme; }) {
  const t = useT();
  const ui = theme.ui;
  const kit = makeKit(theme, t);

  return (
    <div
      {...uses('ui:bg')}
      className="grid h-full content-start gap-3 overflow-auto rounded-lumen border p-3 text-[12px] [grid-template-columns:repeat(auto-fill,minmax(250px,1fr))]"
      style={{ background: ui.bg, borderColor: ui.border, color: ui.text }}
    >
      <ButtonsCard kit={kit} />
      <InputsCard kit={kit} />
      <ControlsCard kit={kit} />
      <PaletteCard kit={kit} />
      <ToastsCard kit={kit} />
      <DialogCard kit={kit} />
      <TooltipCard kit={kit} />
      <CompletionCard kit={kit} />
      <DiagnosticsCard kit={kit} />
      <EditorMarksCard kit={kit} />
      <BadgesCard kit={kit} />
    </div>
  );
}
