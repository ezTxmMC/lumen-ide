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

/** The outline of the active file. */
export default {
  de: {
    line: 'Zeile {line}', collapse: 'Einklappen', expand: 'Ausklappen',
    hintNoServer: 'Für diese Sprache ist kein Language-Server konfiguriert.',
    hintNoSymbols: 'Der Server hat für diese Datei keine Symbole geliefert.',
    hintNotInstalled: '{label} ist nicht installiert.',
    hintWaiting: 'Die Gliederung erscheint, sobald der Language-Server bereit ist.',
    noFile: 'Keine Datei geöffnet', filterPlaceholder: 'Symbole filtern…',
    symbols_one: '{count} Symbol', symbols_other: '{count} Symbole',
    noSymbols: 'Keine Symbole', noOutline: 'Keine Gliederung',
  },
  en: {
    line: 'Line {line}', collapse: 'Collapse', expand: 'Expand',
    hintNoServer: 'No language server is configured for this language.',
    hintNoSymbols: 'The server returned no symbols for this file.',
    hintNotInstalled: '{label} is not installed.',
    hintWaiting: 'The outline appears as soon as the language server is ready.',
    noFile: 'No file open', filterPlaceholder: 'Filter symbols…',
    symbols_one: '{count} symbol', symbols_other: '{count} symbols',
    noSymbols: 'No symbols', noOutline: 'No outline',
  },
  es: {
    line: 'Línea {line}', collapse: 'Contraer', expand: 'Expandir',
    hintNoServer: 'No hay ningún servidor de lenguaje configurado para este lenguaje.',
    hintNoSymbols: 'El servidor no devolvió símbolos para este archivo.',
    hintNotInstalled: '{label} no está instalado.',
    hintWaiting: 'El esquema aparecerá en cuanto el servidor de lenguaje esté listo.',
    noFile: 'No hay ningún archivo abierto', filterPlaceholder: 'Filtrar símbolos…',
    symbols_one: '{count} símbolo', symbols_other: '{count} símbolos',
    noSymbols: 'Sin símbolos', noOutline: 'Sin esquema',
  },
  fr: {
    line: 'Ligne {line}', collapse: 'Réduire', expand: 'Développer',
    hintNoServer: 'Aucun serveur de langage n’est configuré pour ce langage.',
    hintNoSymbols: 'Le serveur n’a renvoyé aucun symbole pour ce fichier.',
    hintNotInstalled: '{label} n’est pas installé.',
    hintWaiting: 'La structure apparaîtra dès que le serveur de langage sera prêt.',
    noFile: 'Aucun fichier ouvert', filterPlaceholder: 'Filtrer les symboles…',
    symbols_one: '{count} symbole', symbols_other: '{count} symboles',
    noSymbols: 'Aucun symbole', noOutline: 'Aucune structure',
  },
  pl: {
    line: 'Wiersz {line}', collapse: 'Zwiń', expand: 'Rozwiń',
    hintNoServer: 'Dla tego języka nie skonfigurowano serwera języka.',
    hintNoSymbols: 'Serwer nie zwrócił symboli dla tego pliku.',
    hintNotInstalled: '{label} nie jest zainstalowany.',
    hintWaiting: 'Konspekt pojawi się, gdy serwer języka będzie gotowy.',
    noFile: 'Nie otwarto pliku', filterPlaceholder: 'Filtruj symbole…',
    symbols_one: '{count} symbol', symbols_few: '{count} symbole', symbols_many: '{count} symboli', symbols_other: '{count} symbolu',
    noSymbols: 'Brak symboli', noOutline: 'Brak konspektu',
  },
  it: {
    line: 'Riga {line}', collapse: 'Comprimi', expand: 'Espandi',
    hintNoServer: 'Nessun language server configurato per questo linguaggio.',
    hintNoSymbols: 'Il server non ha restituito simboli per questo file.',
    hintNotInstalled: '{label} non è installato.',
    hintWaiting: 'La struttura apparirà non appena il language server sarà pronto.',
    noFile: 'Nessun file aperto', filterPlaceholder: 'Filtra simboli…',
    symbols_one: '{count} simbolo', symbols_other: '{count} simboli',
    noSymbols: 'Nessun simbolo', noOutline: 'Nessuna struttura',
  },
  pt: {
    line: 'Linha {line}', collapse: 'Recolher', expand: 'Expandir',
    hintNoServer: 'Nenhum servidor de linguagem configurado para esta linguagem.',
    hintNoSymbols: 'O servidor não retornou símbolos para este arquivo.',
    hintNotInstalled: '{label} não está instalado.',
    hintWaiting: 'A estrutura aparecerá assim que o servidor de linguagem estiver pronto.',
    noFile: 'Nenhum arquivo aberto', filterPlaceholder: 'Filtrar símbolos…',
    symbols_one: '{count} símbolo', symbols_other: '{count} símbolos',
    noSymbols: 'Nenhum símbolo', noOutline: 'Nenhuma estrutura',
  },
  nl: {
    line: 'Regel {line}', collapse: 'Samenvouwen', expand: 'Uitvouwen',
    hintNoServer: 'Voor deze taal is geen language server geconfigureerd.',
    hintNoSymbols: 'De server heeft voor dit bestand geen symbolen geleverd.',
    hintNotInstalled: '{label} is niet geïnstalleerd.',
    hintWaiting: 'Het overzicht verschijnt zodra de language server gereed is.',
    noFile: 'Geen bestand geopend', filterPlaceholder: 'Symbolen filteren…',
    symbols_one: '{count} symbool', symbols_other: '{count} symbolen',
    noSymbols: 'Geen symbolen', noOutline: 'Geen overzicht',
  },
} satisfies NamespaceMessages;
