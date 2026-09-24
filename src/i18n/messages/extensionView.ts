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

/** Views drawn for extension code: the grid, and “open with” for files an extension handles. */
export default {
  de: {
    grid: {
      null: 'NULL', empty: 'Keine Zeilen', edit: 'Bearbeiten', setNull: 'Auf NULL setzen',
      copyValue: 'Wert kopieren', copyRows: 'Zeilen kopieren',
      range: '{from}–{to}', rangeOf: '{from}–{to} von {total}',
      first: 'Erste Seite', previous: 'Vorherige Seite', next: 'Nächste Seite', last: 'Letzte Seite',
    },
    openWith: {
      title: '„{name}“ öffnen', label: 'Öffnen mit', textEditor: 'Texteditor', menu: 'Öffnen mit: {title}',
    },
  },
  en: {
    grid: {
      null: 'NULL', empty: 'No rows', edit: 'Edit', setNull: 'Set to NULL',
      copyValue: 'Copy Value', copyRows: 'Copy Rows',
      range: '{from}–{to}', rangeOf: '{from}–{to} of {total}',
      first: 'First Page', previous: 'Previous Page', next: 'Next Page', last: 'Last Page',
    },
    openWith: {
      title: 'Open “{name}”', label: 'Open with', textEditor: 'Text Editor', menu: 'Open with: {title}',
    },
  },
  es: {
    grid: {
      null: 'NULL', empty: 'Sin filas', edit: 'Editar', setNull: 'Establecer en NULL',
      copyValue: 'Copiar valor', copyRows: 'Copiar filas',
      range: '{from}–{to}', rangeOf: '{from}–{to} de {total}',
      first: 'Primera página', previous: 'Página anterior', next: 'Página siguiente', last: 'Última página',
    },
    openWith: {
      title: 'Abrir «{name}»', label: 'Abrir con', textEditor: 'Editor de texto', menu: 'Abrir con: {title}',
    },
  },
  fr: {
    grid: {
      null: 'NULL', empty: 'Aucune ligne', edit: 'Modifier', setNull: 'Définir à NULL',
      copyValue: 'Copier la valeur', copyRows: 'Copier les lignes',
      range: '{from}–{to}', rangeOf: '{from}–{to} sur {total}',
      first: 'Première page', previous: 'Page précédente', next: 'Page suivante', last: 'Dernière page',
    },
    openWith: {
      title: 'Ouvrir « {name} »', label: 'Ouvrir avec', textEditor: 'Éditeur de texte', menu: 'Ouvrir avec : {title}',
    },
  },
  pl: {
    grid: {
      null: 'NULL', empty: 'Brak wierszy', edit: 'Edytuj', setNull: 'Ustaw na NULL',
      copyValue: 'Kopiuj wartość', copyRows: 'Kopiuj wiersze',
      range: '{from}–{to}', rangeOf: '{from}–{to} z {total}',
      first: 'Pierwsza strona', previous: 'Poprzednia strona', next: 'Następna strona', last: 'Ostatnia strona',
    },
    openWith: {
      title: 'Otwórz „{name}”', label: 'Otwórz za pomocą', textEditor: 'Edytor tekstu', menu: 'Otwórz za pomocą: {title}',
    },
  },
  it: {
    grid: {
      null: 'NULL', empty: 'Nessuna riga', edit: 'Modifica', setNull: 'Imposta a NULL',
      copyValue: 'Copia valore', copyRows: 'Copia righe',
      range: '{from}–{to}', rangeOf: '{from}–{to} di {total}',
      first: 'Prima pagina', previous: 'Pagina precedente', next: 'Pagina successiva', last: 'Ultima pagina',
    },
    openWith: {
      title: 'Apri «{name}»', label: 'Apri con', textEditor: 'Editor di testo', menu: 'Apri con: {title}',
    },
  },
  pt: {
    grid: {
      null: 'NULL', empty: 'Sem linhas', edit: 'Editar', setNull: 'Definir como NULL',
      copyValue: 'Copiar valor', copyRows: 'Copiar linhas',
      range: '{from}–{to}', rangeOf: '{from}–{to} de {total}',
      first: 'Primeira página', previous: 'Página anterior', next: 'Próxima página', last: 'Última página',
    },
    openWith: {
      title: 'Abrir “{name}”', label: 'Abrir com', textEditor: 'Editor de texto', menu: 'Abrir com: {title}',
    },
  },
  nl: {
    grid: {
      null: 'NULL', empty: 'Geen rijen', edit: 'Bewerken', setNull: 'Op NULL zetten',
      copyValue: 'Waarde kopiëren', copyRows: 'Rijen kopiëren',
      range: '{from}–{to}', rangeOf: '{from}–{to} van {total}',
      first: 'Eerste pagina', previous: 'Vorige pagina', next: 'Volgende pagina', last: 'Laatste pagina',
    },
    openWith: {
      title: '“{name}” openen', label: 'Openen met', textEditor: 'Teksteditor', menu: 'Openen met: {title}',
    },
  },
} satisfies NamespaceMessages;
