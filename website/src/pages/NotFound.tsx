/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { Link } from 'react-router';

export function NotFound() {
  return (
    <div className="mx-auto grid max-w-[1248px] justify-items-start gap-4 px-4 py-24 sm:px-6">
      <span className="eyebrow text-accent">404</span>
      <h1 className="text-[clamp(32px,5vw,48px)] font-bold">Nothing at this address.</h1>
      <p className="text-muted">The page may have moved — the start page and the downloads are still where they were.</p>
      <div className="flex gap-3">
        <Link to="/" className="rounded-[10px] bg-accent px-4 py-2 font-semibold text-accent-fg">Start page</Link>
        <Link to="/download" className="rounded-[10px] border border-edge px-4 py-2 font-semibold hover:bg-hover">Downloads</Link>
      </div>
    </div>
  );
}
