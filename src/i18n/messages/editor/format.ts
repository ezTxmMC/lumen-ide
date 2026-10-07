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

/** Formatting: what Format Document says when no formatter does the work. */
export default {
  de: {
    none: 'Für diese Datei gibt es keinen Formatter. Das Formatter-Add-on installieren oder einen Language-Server starten.',
    failed: 'Der Formatter ist fehlgeschlagen ({message}) — der Language-Server übernimmt.',
  },
  en: {
    none: 'No formatter handles this file. Install the formatter add-on or start a language server.',
    failed: 'The formatter failed ({message}) — the language server takes over.',
  },
  es: {
    none: 'Ningún formateador se encarga de este archivo. Instala el complemento de formato o inicia un servidor de lenguaje.',
    failed: 'El formateador falló ({message}); lo asume el servidor de lenguaje.',
  },
  fr: {
    none: 'Aucun formateur ne prend ce fichier en charge. Installez l’extension de formatage ou lancez un serveur de langage.',
    failed: 'Le formateur a échoué ({message}) — le serveur de langage prend le relais.',
  },
  pl: {
    none: 'Żaden formater nie obsługuje tego pliku. Zainstaluj dodatek formatujący lub uruchom serwer języka.',
    failed: 'Formater zawiódł ({message}) — przejmuje go serwer języka.',
  },
  it: {
    none: 'Nessun formattatore gestisce questo file. Installa il componente di formattazione o avvia un language server.',
    failed: 'Il formattatore non è riuscito ({message}): subentra il language server.',
  },
  pt: {
    none: 'Nenhum formatador trata este arquivo. Instale o complemento de formatação ou inicie um servidor de linguagem.',
    failed: 'O formatador falhou ({message}); o servidor de linguagem assume.',
  },
  nl: {
    none: 'Geen formatter verwerkt dit bestand. Installeer de formatter-add-on of start een language server.',
    failed: 'De formatter is mislukt ({message}) — de language server neemt het over.',
  },
} satisfies NamespaceMessages;
