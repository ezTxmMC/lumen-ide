/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

export const CLIENT_CAPABILITIES = {
  textDocument: {
    synchronization: { dynamicRegistration: false, didSave: true, willSave: false },
    publishDiagnostics: {
      relatedInformation: true,
      versionSupport: true,
      tagSupport: { valueSet: [1, 2] },
      codeDescriptionSupport: true,
      dataSupport: true,
    },
    completion: {
      dynamicRegistration: false,
      contextSupport: true,
      completionItem: {
        snippetSupport: true,
        commitCharactersSupport: true,
        insertTextModeSupport: { valueSet: [1] },
        documentationFormat: ['markdown', 'plaintext'],
        insertReplaceSupport: true,
        deprecatedSupport: true,
        preselectSupport: true,
        labelDetailsSupport: true,
        tagSupport: { valueSet: [1] },
        resolveSupport: { properties: ['documentation', 'detail', 'additionalTextEdits', 'textEdit'] },
      },
      // `applyItemDefaults` writes them into every item as it arrives. Text goes in as sent (mode 1) — nothing re-indents it.
      completionList: { itemDefaults: ['commitCharacters', 'editRange', 'insertTextFormat', 'insertTextMode', 'data'] },
      insertTextMode: 1,
      completionItemKind: { valueSet: Array.from({ length: 25 }, (_, i) => i + 1) },
    },
    hover: { dynamicRegistration: false, contentFormat: ['markdown', 'plaintext'] },
    signatureHelp: {
      dynamicRegistration: false,
      contextSupport: true,
      signatureInformation: {
        documentationFormat: ['markdown', 'plaintext'],
        parameterInformation: { labelOffsetSupport: true },
        activeParameterSupport: true,
      },
    },
    definition: { dynamicRegistration: false, linkSupport: true },
    declaration: { dynamicRegistration: false, linkSupport: true },
    typeDefinition: { dynamicRegistration: false, linkSupport: true },
    implementation: { dynamicRegistration: false, linkSupport: true },
    references: { dynamicRegistration: false },
    documentHighlight: { dynamicRegistration: false },
    documentSymbol: {
      dynamicRegistration: false,
      hierarchicalDocumentSymbolSupport: true,
      symbolKind: { valueSet: Array.from({ length: 26 }, (_, i) => i + 1) },
      tagSupport: { valueSet: [1] },
    },
    codeAction: {
      dynamicRegistration: false,
      isPreferredSupport: true,
      disabledSupport: true,
      dataSupport: true,
      resolveSupport: { properties: ['edit'] },
      codeActionLiteralSupport: {
        codeActionKind: {
          valueSet: [
            '', 'quickfix', 'refactor', 'refactor.extract', 'refactor.inline',
            'refactor.rewrite', 'source', 'source.organizeImports', 'source.fixAll',
          ],
        },
      },
    },
    formatting: { dynamicRegistration: false },
    rangeFormatting: { dynamicRegistration: false },
    rename: { dynamicRegistration: false, prepareSupport: true, honorsChangeAnnotations: false },
    inlayHint: { dynamicRegistration: false, resolveSupport: { properties: ['tooltip', 'label.tooltip'] } },
    semanticTokens: {
      dynamicRegistration: false,
      requests: { range: true, full: { delta: true } },
      tokenTypes: [
        'namespace', 'type', 'class', 'enum', 'interface', 'struct', 'typeParameter', 'parameter', 'variable',
        'property', 'enumMember', 'event', 'function', 'method', 'macro', 'keyword', 'modifier', 'comment',
        'string', 'number', 'regexp', 'operator', 'decorator',
      ],
      tokenModifiers: [
        'declaration', 'definition', 'readonly', 'static', 'deprecated', 'abstract', 'async', 'modification',
        'documentation', 'defaultLibrary',
      ],
      formats: ['relative'],
      overlappingTokenSupport: false,
      multilineTokenSupport: false,
      serverCancelSupport: false,
      augmentsSyntaxTokens: true,
    },
    foldingRange: { dynamicRegistration: false, lineFoldingOnly: true },
    documentLink: { dynamicRegistration: false, tooltipSupport: true },
  },
  workspace: {
    applyEdit: true,
    workspaceEdit: {
      documentChanges: true,
      resourceOperations: ['create', 'rename', 'delete'],
      failureHandling: 'abort',
    },
    workspaceFolders: true,
    fileOperations: { willRename: true },
    configuration: true,
    symbol: {
      dynamicRegistration: false,
      symbolKind: { valueSet: Array.from({ length: 26 }, (_, i) => i + 1) },
    },
    didChangeConfiguration: { dynamicRegistration: false },
    didChangeWatchedFiles: { dynamicRegistration: true, relativePatternSupport: false },
    executeCommand: { dynamicRegistration: false },
    inlayHint: { refreshSupport: true },
    semanticTokens: { refreshSupport: true },
  },
  window: {
    workDoneProgress: true,
    showMessage: { messageActionItem: { additionalPropertiesSupport: false } },
    showDocument: { support: true },
  },
  general: {
    positionEncodings: ['utf-16'],
    markdown: { parser: 'lumen', version: '1.0' },
  },
  // jdtls-specific extensions (opening Java classes out of jars).
  experimental: {},
};
