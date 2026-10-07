/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import type { NamespaceMessages } from '@/i18n';

/** Completion in the editor: the abbreviations and the origin of the suggestions. */
export default {
  de: {
    snippet: 'Snippet', nameSuggestion: 'Namensvorschlag',
    badge: { lsp: 'LSP', snippet: 'Snip', document: 'Dok', tab: 'Tab' },
    origin: {
      lsp: 'Vorschlag des Language-Servers',
      snippet: 'Snippet der Sprache',
      document: 'Wort im Dokument',
      tab: 'Wort aus einem anderen Tab',
    },
  },
  en: {
    snippet: 'Snippet', nameSuggestion: 'Name suggestion',
    badge: { lsp: 'LSP', snippet: 'Snip', document: 'Doc', tab: 'Tab' },
    origin: {
      lsp: 'Language server suggestion',
      snippet: 'Language snippet',
      document: 'Word in document',
      tab: 'Word from another tab',
    },
  },
  es: {
    snippet: 'Fragmento',
    badge: { lsp: 'LSP', snippet: 'Frag', document: 'Doc', tab: 'Pest.' },
    origin: {
      lsp: 'Sugerencia del servidor de lenguaje',
      snippet: 'Fragmento del lenguaje',
      document: 'Palabra del documento',
      tab: 'Palabra de otra pestaña',
    },
  },
  fr: {
    snippet: 'Extrait',
    badge: { lsp: 'LSP', snippet: 'Extr', document: 'Doc', tab: 'Ongl.' },
    origin: {
      lsp: 'Suggestion du serveur de langage',
      snippet: 'Extrait du langage',
      document: 'Mot du document',
      tab: 'Mot d’un autre onglet',
    },
  },
  pl: {
    snippet: 'Fragment',
    badge: { lsp: 'LSP', snippet: 'Frag', document: 'Dok', tab: 'Karta' },
    origin: {
      lsp: 'Podpowiedź serwera języka',
      snippet: 'Fragment kodu języka',
      document: 'Słowo z dokumentu',
      tab: 'Słowo z innej karty',
    },
  },
  it: {
    snippet: 'Snippet',
    badge: { lsp: 'LSP', snippet: 'Snip', document: 'Doc', tab: 'Scheda' },
    origin: {
      lsp: 'Suggerimento del language server',
      snippet: 'Snippet del linguaggio',
      document: 'Parola nel documento',
      tab: 'Parola da un’altra scheda',
    },
  },
  pt: {
    snippet: 'Snippet',
    badge: { lsp: 'LSP', snippet: 'Snip', document: 'Doc', tab: 'Aba' },
    origin: {
      lsp: 'Sugestão do servidor de linguagem',
      snippet: 'Snippet da linguagem',
      document: 'Palavra no documento',
      tab: 'Palavra de outra aba',
    },
  },
  nl: {
    snippet: 'Snippet',
    badge: { lsp: 'LSP', snippet: 'Snip', document: 'Doc', tab: 'Tab' },
    origin: {
      lsp: 'Suggestie van de taalserver',
      snippet: 'Snippet van de taal',
      document: 'Woord in het document',
      tab: 'Woord uit een ander tabblad',
    },
  },
} satisfies NamespaceMessages;
