/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import type { ProjectTemplate } from '@/core/types';
import { GITIGNORE } from '@/core/project/create/scaffold';
import { versionField } from '../fields';

/** A web app of `.nvh` components, laid out like examples/web of Novus v0.1.0-pre.alpha.8. */
export const novusWebTemplate: ProjectTemplate = {
  id: 'novus-web',
  name: 'templates.lang.novusWebName',
  description: 'templates.lang.novusWebDescription',
  languageId: 'nvh',
  kindId: 'novus',
  icon: 'Nv',
  color: '#7c5cff',
  fields: [
    { id: 'module', label: 'templates.fields.modulePath', default: (v) => `github.com/benutzer/${v.slug ?? 'webapp'}`, pattern: String.raw`[\w.\-/]+`, mono: true, section: 'templates.sections.project' },
    versionField(),
    { id: 'output', label: 'templates.lang.outputName', default: (v) => v.slug ?? 'webapp', pattern: String.raw`[\w.-]+`, mono: true, section: 'templates.sections.build' },
  ],
  open: 'pages/Home.nvh',
  files({ values, name }) {
    return {
      'project.nv': [
        `project "${values.module}"`,
        `version "${values.version}"`,
        'main "main.nv"',
        `output "${values.output}"`,
        '',
      ].join('\n'),
      'main.nv': [
        'package main',
        '',
        'import web',
        'import pages                         // pages/Home.nvh, ...',
        '',
        'method main {',
        '    web.page("/", Home())',
        '    web.files("/public", "public")',
        '    web.serve(web.port(8080))         // novusc run, then open http://localhost:8080',
        '}',
        '',
      ].join('\n'),
      'pages/Home.nvh': [
        '<Layout title="' + name + '">',
        '    <p>This page is a <code>.nvh</code> file: HTML with Novus in it, rendered on the server.</p>',
        '    <Counter label="Clicks" />',
        '</Layout>',
        '',
      ].join('\n'),
      'components/Layout.nvh': [
        '<?nv',
        'prop string title = "Novus"',
        '?>',
        '<head>',
        '    <title>{title}</title>',
        '    <link rel="stylesheet" href="/public/app.css">',
        '</head>',
        '<main class="page">',
        '    <h1>{title}</h1>',
        '    <slot/>',
        '</main>',
        '',
      ].join('\n'),
      'components/Counter.nvh': [
        '<?nv',
        'prop string label = "Count"',
        'ref integer count = 0',
        '',
        'method change(integer by) {',
        '    count = count + by',
        '    emit("change", count)',
        '}',
        '?>',
        '<div class="counter">',
        '    <button @click="change(-1)" disabled={count <= 0}>-</button>',
        '    <span class:high={count >= 10}>{label}: <b>{count}</b></span>',
        '    <button @click="change(1)">+</button>',
        '</div>',
        '',
      ].join('\n'),
      'public/app.css': [
        ':root { color-scheme: light dark; font-family: system-ui, sans-serif }',
        '.page { max-width: 42rem; margin: 0 auto; padding: 1rem 1.25rem 3rem }',
        '.counter { display: flex; align-items: center; gap: .6rem }',
        '.counter .high b { color: #c0392b }',
        '',
      ].join('\n'),
      '.gitignore': GITIGNORE.novus,
    };
  },
};
