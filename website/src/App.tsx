/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { Route, Routes } from 'react-router';
import { Layout } from './components/Layout';
import { Home } from './pages/Home';
import { Download } from './pages/Download';
import { NotFound } from './pages/NotFound';

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="download" element={<Download />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
