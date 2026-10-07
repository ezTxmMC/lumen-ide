/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import type { Snippet } from '@/core/types';

/** The snippets of `.nv` that carry a translated description (`addons.snippets.novus.*`). */
export const NOVUS_SNIPPETS: Snippet[] = [
  {
    label: 'main',
    detail: 'addons.snippets.novus.main',
    body: 'package main\n\nmethod main {\n    println "$0"\n}',
  },
  {
    label: 'mainargs',
    detail: 'addons.snippets.novus.mainargs',
    body: 'method main(array<string> args) {\n    $0\n}',
  },
  {
    label: 'method',
    detail: 'addons.snippets.novus.method',
    body: 'method ${name}(${integer n}): ${integer} {\n    $0\n}',
  },
  {
    label: 'class',
    detail: 'addons.snippets.novus.class',
    body:
      'define class ${Name} {\n' +
      '    private final ${string} ${feld}: get, set\n\n' +
      '    construct(${string} ${feld}) {\n' +
      '        this.${feld} = ${feld}\n    }$0\n}',
  },
  {
    label: 'interface',
    detail: 'Interface',
    body: 'define interface ${IName} {\n    ${methode}()$0\n}',
  },
  {
    label: 'enum',
    detail: 'addons.snippets.novus.enum',
    body:
      'define enum ${Name} {\n    ${EINS}("${text}"),\n    ${ZWEI}("${text}");\n\n' +
      '    private final str text: get\n\n' +
      '    private construct(str text) {\n        this.text = text;\n    }$0\n}',
  },
  {
    label: 'abstract',
    detail: 'addons.snippets.novus.abstract',
    body: 'define abstract ${Name} {\n    abstract method ${buy}(): ${bool}$0\n}',
  },
  { label: 'for', detail: 'for..in', body: 'for (${element} in ${liste}) {\n    $0\n}' },
  { label: 'while', detail: 'while', body: 'while (${bedingung}) {\n    $0\n}' },
  {
    label: 'async',
    detail: 'addons.snippets.novus.async',
    body: 'async method ${name}(${string arg}): ${string} {\n    return $0\n}',
  },
  { label: 'sync', detail: 'addons.snippets.novus.sync', body: 'sync {\n    $0\n}' },
];

/** The snippets of `.nvh`. */
export const NVH_SNIPPETS: Snippet[] = [
  {
    label: 'component',
    detail: 'addons.snippets.nvh.component',
    body: '<?nv\nprop string label = "${Count}"\nref integer count = 0\n\nmethod add(integer by) {\n    count = count + by\n}\n?>\n<div>\n    <button @click="add(-1)">-</button>\n    <span>{label}: {count}</span>\n    <button @click="add(1)">+</button>\n</div>\n<style>\n$0\n</style>',
  },
  { label: 'if', detail: '{#if}', body: '{#if ${bedingung}}\n    $0\n{:else}\n    \n{/if}', scope: ['nvh_template'] },
  { label: 'for', detail: '{#for}', body: '{#for ${x}, ${i} in ${liste}}\n    $0\n{/for}', scope: ['nvh_template'] },
  { label: 'html', detail: '{@html}', body: '{@html ${ausdruck}}$0', scope: ['nvh_template'] },
  { label: 'nv', detail: '<?nv ?>', body: '<?nv\n$0\n?>' },
];

/**
 * The `project.nv` snippets of the language server (lsp/services/snippets/
 * catalogue_files.nv). The server offers them only inside a manifest; the
 * word-list editor tells by the file name (`Snippet.files`), so these are
 * offered in `project.nv` only — and the other snippets nowhere in it.
 */
export const MANIFEST_SNIPPETS: Snippet[] = [
  {
    label: 'project',
    detail: 'project.nv header',
    body: 'project "${1:github.com/user/app}"\nversion "${2:0.1.0}"\nmain "${3:main.nv}"\noutput "${4:app}"',
  },
  { label: 'lib', detail: 'project.nv: entry file when imported as a dependency', body: 'lib "${1:lib.nv}"' },
  {
    label: 'manifest',
    detail: 'project.nv header',
    body: 'project "${1:github.com/user/app}"\nversion "${2:0.1.0}"\nmain "${3:main.nv}"\noutput "${4:app}"',
  },
  {
    label: 'require',
    detail: 'project.nv: dependency (git tag, branch, commit or latest)',
    body: 'require "${1:github.com/user/lib}" "${2:latest}"',
  },
  {
    label: 'replace',
    detail: 'project.nv: use a local checkout instead of fetching (relative path)',
    body: 'replace "${1:github.com/user/lib}" "${2:../lib}"',
  },
  { label: 'mainfile', detail: 'project.nv: entry file of the program', body: 'main "${1:main.nv}"' },
  {
    label: 'manifestfull',
    detail: 'Complete project.nv with a dependency',
    body: 'project "${1:github.com/user/app}"\nversion "${2:0.1.0}"\nmain "main.nv"\noutput "${3:app}"\n\nrequire "${4:github.com/user/lib}" "${5:latest}"\n$0',
  },
  {
    label: 'projectfull',
    detail: 'Complete project.nv with a dependency',
    body: 'project "${1:github.com/user/app}"\nversion "${2:0.1.0}"\nmain "main.nv"\noutput "${3:app}"\n\nrequire "${4:github.com/user/lib}" "${5:latest}"\n$0',
  },
];

/** The component parts of the language server's catalogue (same file), for `.nvh`. */
export const NVH_PART_SNIPPETS: Snippet[] = [
  { label: 'nvh', detail: 'Component with a prop, state and a handler', body: '<?nv\nprop string ${1:label} = "${2:Count}"\nref integer ${3:count} = 0\n\nmethod ${4:increment}() {\n    $3 = $3 + 1\n}\n?>\n<div class="${5:counter}">\n    <button @click="$4()">${6:+}</button>\n    <span>{$1}: {$3}</span>\n</div>\n$0' },
  { label: 'prop', detail: 'Property set by the parent or the URL', body: 'prop ${1:string} ${2:name} = "${3:value}"', scope: ['nvh_block'] },
  { label: 'ref', detail: 'Reactive state of the component', body: 'ref ${1:integer} ${2:count} = ${3:0}', scope: ['nvh_block'] },
  { label: 'nvif', detail: 'Conditional template block (inside an element)', body: '{#if ${1:condition}}\n    $0\n{:else}\n    ${2}\n{/if}', scope: ['nvh_template'] },
  { label: 'nvfor', detail: 'Loop in the template (inside an element)', body: '{#for ${1:item}, ${2:i} in ${3:items}}\n    <li>{$1}</li>\n{/for}', scope: ['nvh_template'] },
  { label: 'click', detail: 'Click handler attribute', body: '@click="${1:handler}()"', scope: ['nvh_tag'] },
  { label: '@click', detail: 'Click handler attribute', body: '@click="${1:handler}()"', scope: ['nvh_tag'] },
  { label: 'bind', detail: 'Two-way binding to a ref', body: 'bind="${1:name}"', scope: ['nvh_tag'] },
  { label: '@html', detail: 'Unescaped HTML expression', body: '{@html ${1:expression}}', scope: ['nvh_template'] },
];
