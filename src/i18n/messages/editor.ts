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

/** Texte im Code-Editor selbst. */
export default {
  de: {
    nav: {
      kinds: {
        definition: 'Definition',
        declaration: 'Deklaration',
        typeDefinition: 'Typdefinition',
        implementation: 'Implementierung',
      },
      notFound: 'Keine {kind} gefunden',
      notFoundNamed: 'Keine {kind} gefunden für „{name}“',
      notFoundBusy: 'Keine {kind} für „{name}“ — der Language-Server ist noch beschäftigt ({busy}). Gleich noch einmal versuchen.',
      listTitle: '{kind} von „{name}“',
      noReferences: 'Keine Referenzen',
      noReferencesNamed: 'Keine Referenzen für „{name}“',
      referencesTitle: 'Referenzen von „{name}“ ({count})',
      noActions: 'Keine Aktionen verfügbar',
    },
    emptyFile: 'Leere Datei — leg los.',
    foldedLines_one: '{count} Zeile',
    foldedLines_other: '{count} Zeilen',
    foldedLines: '{count} Zeilen',
  },
  en: {
    nav: {
      kinds: {
        definition: 'definition',
        declaration: 'declaration',
        typeDefinition: 'type definition',
        implementation: 'implementation',
      },
      notFound: 'No {kind} found',
      notFoundNamed: 'No {kind} found for “{name}”',
      notFoundBusy: 'No {kind} for “{name}” — the language server is still busy ({busy}). Try again in a moment.',
      listTitle: '{kind} of “{name}”',
      noReferences: 'No references',
      noReferencesNamed: 'No references to “{name}”',
      referencesTitle: 'References to “{name}” ({count})',
      noActions: 'No actions available',
    },
    emptyFile: 'Empty file — start typing.',
    foldedLines_one: '{count} line',
    foldedLines_other: '{count} lines',
    foldedLines: '{count} lines',
  },
  es: {
    nav: {
      kinds: {
        definition: 'definición',
        declaration: 'declaración',
        typeDefinition: 'definición de tipo',
        implementation: 'implementación',
      },
      notFound: 'No se encontró {kind}',
      notFoundNamed: 'No se encontró {kind} para «{name}»',
      notFoundBusy: 'Sin {kind} para «{name}»: el servidor de lenguaje sigue ocupado ({busy}). Inténtalo de nuevo en un momento.',
      listTitle: '{kind} de «{name}»',
      noReferences: 'Sin referencias',
      noReferencesNamed: 'Sin referencias a «{name}»',
      referencesTitle: 'Referencias a «{name}» ({count})',
      noActions: 'No hay acciones disponibles',
    },
    emptyFile: 'Archivo vacío: empieza a escribir.',
    foldedLines_one: '{count} línea',
    foldedLines_other: '{count} líneas',
    foldedLines: '{count} líneas',
  },
  fr: {
    nav: {
      kinds: {
        definition: 'définition',
        declaration: 'déclaration',
        typeDefinition: 'définition de type',
        implementation: 'implémentation',
      },
      notFound: 'Aucune {kind} trouvée',
      notFoundNamed: 'Aucune {kind} trouvée pour « {name} »',
      notFoundBusy: 'Aucune {kind} pour « {name} » — le serveur de langage est encore occupé ({busy}). Réessayez dans un instant.',
      listTitle: '{kind} de « {name} »',
      noReferences: 'Aucune référence',
      noReferencesNamed: 'Aucune référence à « {name} »',
      referencesTitle: 'Références à « {name} » ({count})',
      noActions: 'Aucune action disponible',
    },
    emptyFile: 'Fichier vide — commencez à écrire.',
    foldedLines_one: '{count} ligne',
    foldedLines_other: '{count} lignes',
    foldedLines: '{count} lignes',
  },
  pl: {
    nav: {
      kinds: {
        definition: 'definicja',
        declaration: 'deklaracja',
        typeDefinition: 'definicja typu',
        implementation: 'implementacja',
      },
      notFound: 'Nie znaleziono: {kind}',
      notFoundNamed: 'Nie znaleziono: {kind} dla „{name}”',
      notFoundBusy: 'Brak: {kind} dla „{name}” — serwer języka jest jeszcze zajęty ({busy}). Spróbuj za chwilę.',
      listTitle: '{kind}: „{name}”',
      noReferences: 'Brak odwołań',
      noReferencesNamed: 'Brak odwołań do „{name}”',
      referencesTitle: 'Odwołania do „{name}” ({count})',
      noActions: 'Brak dostępnych akcji',
    },
    emptyFile: 'Pusty plik — zacznij pisać.',
    foldedLines_one: '{count} wiersz',
    foldedLines_few: '{count} wiersze',
    foldedLines_many: '{count} wierszy',
    foldedLines_other: '{count} wiersza',
    foldedLines: '{count} wierszy',
  },
  it: {
    nav: {
      kinds: {
        definition: 'definizione',
        declaration: 'dichiarazione',
        typeDefinition: 'definizione di tipo',
        implementation: 'implementazione',
      },
      notFound: 'Nessuna {kind} trovata',
      notFoundNamed: 'Nessuna {kind} trovata per «{name}»',
      notFoundBusy: 'Nessuna {kind} per «{name}»: il language server è ancora occupato ({busy}). Riprova tra un attimo.',
      listTitle: '{kind} di «{name}»',
      noReferences: 'Nessun riferimento',
      noReferencesNamed: 'Nessun riferimento a «{name}»',
      referencesTitle: 'Riferimenti a «{name}» ({count})',
      noActions: 'Nessuna azione disponibile',
    },
    emptyFile: 'File vuoto — inizia a scrivere.',
    foldedLines_one: '{count} riga',
    foldedLines_other: '{count} righe',
    foldedLines: '{count} righe',
  },
  pt: {
    nav: {
      kinds: {
        definition: 'definição',
        declaration: 'declaração',
        typeDefinition: 'definição de tipo',
        implementation: 'implementação',
      },
      notFound: 'Nenhuma {kind} encontrada',
      notFoundNamed: 'Nenhuma {kind} encontrada para «{name}»',
      notFoundBusy: 'Nenhuma {kind} para «{name}» — o servidor de linguagem ainda está ocupado ({busy}). Tente de novo em instantes.',
      listTitle: '{kind} de «{name}»',
      noReferences: 'Sem referências',
      noReferencesNamed: 'Sem referências a «{name}»',
      referencesTitle: 'Referências a «{name}» ({count})',
      noActions: 'Nenhuma ação disponível',
    },
    emptyFile: 'Arquivo vazio — comece a digitar.',
    foldedLines_one: '{count} linha',
    foldedLines_other: '{count} linhas',
    foldedLines: '{count} linhas',
  },
  nl: {
    nav: {
      kinds: {
        definition: 'definitie',
        declaration: 'declaratie',
        typeDefinition: 'typedefinitie',
        implementation: 'implementatie',
      },
      notFound: 'Geen {kind} gevonden',
      notFoundNamed: 'Geen {kind} gevonden voor ‘{name}’',
      notFoundBusy: 'Geen {kind} voor ‘{name}’ — de taalserver is nog bezig ({busy}). Probeer het zo opnieuw.',
      listTitle: '{kind} van ‘{name}’',
      noReferences: 'Geen verwijzingen',
      noReferencesNamed: 'Geen verwijzingen naar ‘{name}’',
      referencesTitle: 'Verwijzingen naar ‘{name}’ ({count})',
      noActions: 'Geen acties beschikbaar',
    },
    emptyFile: 'Leeg bestand — begin met typen.',
    foldedLines_one: '{count} regel',
    foldedLines_other: '{count} regels',
    foldedLines: '{count} regels',
  },
} satisfies NamespaceMessages;
