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

/** Updates: settings, the status bar, commands and hints. */
export default {
  de: {
    category: 'Updates',
    title: 'Updates',
    command: {
      check: 'Nach Updates suchen', install: 'Update einspielen und neu starten', openDownload: 'Update herunterladen (Browser)',
    },
    status: {
      idle: 'Noch nicht geprüft.', checking: 'Suche nach Updates…', current: 'Lumen {version} ist aktuell.',
      available: 'Version {version} ist verfügbar.', availableManual: 'Version {version} ist verfügbar — diese Installation lässt sich nicht selbst aktualisieren.',
      downloading: 'Version {version} wird geladen… {percent} %', ready: 'Version {version} ist bereit. Wird beim Beenden eingespielt.',
      unsupported: 'Für dieses System gibt es keine Updates.', error: 'Update fehlgeschlagen: {error}',
    },
    action: {
      check: 'Jetzt prüfen', download: 'Herunterladen', install: 'Neu starten', openDownload: 'Im Browser laden',
    },
    auto: 'Automatisch aktualisieren',
    autoHint: 'Sucht im Hintergrund nach neuen Versionen, lädt sie und spielt sie beim Beenden ein.',
    badge: {
      available: 'Update {version}', downloading: 'Update {percent} %', ready: 'Neu starten für {version}',
      title: 'Klick: Update-Einstellungen',
    },
    toast: {
      ready: 'Lumen {version} ist geladen und wird beim Beenden eingespielt.',
      available: 'Lumen {version} ist verfügbar.',
      current: 'Lumen {version} ist aktuell.',
      failed: 'Update fehlgeschlagen: {error}',
    },
  },
  en: {
    category: 'Updates',
    title: 'Updates',
    command: {
      check: 'Check for Updates', install: 'Install Update and Restart', openDownload: 'Download Update (Browser)',
    },
    status: {
      idle: 'Not checked yet.', checking: 'Checking for updates…', current: 'Lumen {version} is up to date.',
      available: 'Version {version} is available.', availableManual: 'Version {version} is available — this installation cannot update itself.',
      downloading: 'Downloading version {version}… {percent}%', ready: 'Version {version} is ready. It will be installed on quit.',
      unsupported: 'No updates are available for this system.', error: 'Update failed: {error}',
    },
    action: {
      check: 'Check Now', download: 'Download', install: 'Restart', openDownload: 'Download in Browser',
    },
    auto: 'Update automatically',
    autoHint: 'Looks for new versions in the background, downloads them and installs them on quit.',
    badge: {
      available: 'Update {version}', downloading: 'Update {percent}%', ready: 'Restart for {version}',
      title: 'Click: update settings',
    },
    toast: {
      ready: 'Lumen {version} has been downloaded and will be installed on quit.',
      available: 'Lumen {version} is available.',
      current: 'Lumen {version} is up to date.',
      failed: 'Update failed: {error}',
    },
  },
  es: {
    category: 'Actualizaciones',
    title: 'Actualizaciones',
    command: {
      check: 'Buscar actualizaciones', install: 'Instalar actualización y reiniciar', openDownload: 'Descargar actualización (navegador)',
    },
    status: {
      idle: 'Aún no comprobado.', checking: 'Buscando actualizaciones…', current: 'Lumen {version} está actualizado.',
      available: 'La versión {version} está disponible.', availableManual: 'La versión {version} está disponible; esta instalación no puede actualizarse sola.',
      downloading: 'Descargando la versión {version}… {percent} %', ready: 'La versión {version} está lista. Se instalará al salir.',
      unsupported: 'No hay actualizaciones para este sistema.', error: 'Error de actualización: {error}',
    },
    action: {
      check: 'Comprobar ahora', download: 'Descargar', install: 'Reiniciar', openDownload: 'Descargar en el navegador',
    },
    auto: 'Actualizar automáticamente',
    autoHint: 'Busca nuevas versiones en segundo plano, las descarga y las instala al salir.',
    badge: {
      available: 'Actualización {version}', downloading: 'Actualización {percent} %', ready: 'Reiniciar para {version}',
      title: 'Clic: ajustes de actualización',
    },
    toast: {
      ready: 'Lumen {version} se ha descargado y se instalará al salir.',
      available: 'Lumen {version} está disponible.',
      current: 'Lumen {version} está actualizado.',
      failed: 'Error de actualización: {error}',
    },
  },
  fr: {
    category: 'Mises à jour',
    title: 'Mises à jour',
    command: {
      check: 'Rechercher des mises à jour', install: 'Installer la mise à jour et redémarrer', openDownload: 'Télécharger la mise à jour (navigateur)',
    },
    status: {
      idle: 'Pas encore vérifié.', checking: 'Recherche de mises à jour…', current: 'Lumen {version} est à jour.',
      available: 'La version {version} est disponible.', availableManual: 'La version {version} est disponible — cette installation ne peut pas se mettre à jour seule.',
      downloading: 'Téléchargement de la version {version}… {percent} %', ready: 'La version {version} est prête. Elle sera installée à la fermeture.',
      unsupported: 'Aucune mise à jour pour ce système.', error: 'Échec de la mise à jour : {error}',
    },
    action: {
      check: 'Vérifier', download: 'Télécharger', install: 'Redémarrer', openDownload: 'Télécharger dans le navigateur',
    },
    auto: 'Mettre à jour automatiquement',
    autoHint: 'Recherche les nouvelles versions en arrière-plan, les télécharge et les installe à la fermeture.',
    badge: {
      available: 'Mise à jour {version}', downloading: 'Mise à jour {percent} %', ready: 'Redémarrer pour {version}',
      title: 'Clic : paramètres de mise à jour',
    },
    toast: {
      ready: 'Lumen {version} est téléchargé et sera installé à la fermeture.',
      available: 'Lumen {version} est disponible.',
      current: 'Lumen {version} est à jour.',
      failed: 'Échec de la mise à jour : {error}',
    },
  },
  pl: {
    category: 'Aktualizacje',
    title: 'Aktualizacje',
    command: {
      check: 'Sprawdź aktualizacje', install: 'Zainstaluj aktualizację i uruchom ponownie', openDownload: 'Pobierz aktualizację (przeglądarka)',
    },
    status: {
      idle: 'Jeszcze nie sprawdzono.', checking: 'Szukanie aktualizacji…', current: 'Lumen {version} jest aktualny.',
      available: 'Dostępna jest wersja {version}.', availableManual: 'Dostępna jest wersja {version} — ta instalacja nie może zaktualizować się sama.',
      downloading: 'Pobieranie wersji {version}… {percent}%', ready: 'Wersja {version} jest gotowa. Zostanie zainstalowana przy zamknięciu.',
      unsupported: 'Brak aktualizacji dla tego systemu.', error: 'Aktualizacja nie powiodła się: {error}',
    },
    action: {
      check: 'Sprawdź teraz', download: 'Pobierz', install: 'Uruchom ponownie', openDownload: 'Pobierz w przeglądarce',
    },
    auto: 'Aktualizuj automatycznie',
    autoHint: 'Szuka nowych wersji w tle, pobiera je i instaluje przy zamknięciu.',
    badge: {
      available: 'Aktualizacja {version}', downloading: 'Aktualizacja {percent}%', ready: 'Uruchom ponownie dla {version}',
      title: 'Kliknij: ustawienia aktualizacji',
    },
    toast: {
      ready: 'Lumen {version} został pobrany i zostanie zainstalowany przy zamknięciu.',
      available: 'Dostępny jest Lumen {version}.',
      current: 'Lumen {version} jest aktualny.',
      failed: 'Aktualizacja nie powiodła się: {error}',
    },
  },
  it: {
    category: 'Aggiornamenti',
    title: 'Aggiornamenti',
    command: {
      check: 'Cerca aggiornamenti', install: 'Installa aggiornamento e riavvia', openDownload: 'Scarica aggiornamento (browser)',
    },
    status: {
      idle: 'Non ancora controllato.', checking: 'Ricerca aggiornamenti…', current: 'Lumen {version} è aggiornato.',
      available: 'È disponibile la versione {version}.', availableManual: 'È disponibile la versione {version} — questa installazione non può aggiornarsi da sola.',
      downloading: 'Download della versione {version}… {percent}%', ready: 'La versione {version} è pronta. Verrà installata alla chiusura.',
      unsupported: 'Nessun aggiornamento per questo sistema.', error: 'Aggiornamento non riuscito: {error}',
    },
    action: {
      check: 'Controlla ora', download: 'Scarica', install: 'Riavvia', openDownload: 'Scarica nel browser',
    },
    auto: 'Aggiorna automaticamente',
    autoHint: 'Cerca nuove versioni in background, le scarica e le installa alla chiusura.',
    badge: {
      available: 'Aggiornamento {version}', downloading: 'Aggiornamento {percent}%', ready: 'Riavvia per {version}',
      title: 'Clic: impostazioni aggiornamenti',
    },
    toast: {
      ready: 'Lumen {version} è stato scaricato e verrà installato alla chiusura.',
      available: 'È disponibile Lumen {version}.',
      current: 'Lumen {version} è aggiornato.',
      failed: 'Aggiornamento non riuscito: {error}',
    },
  },
  pt: {
    category: 'Atualizações',
    title: 'Atualizações',
    command: {
      check: 'Verificar atualizações', install: 'Instalar atualização e reiniciar', openDownload: 'Baixar atualização (navegador)',
    },
    status: {
      idle: 'Ainda não verificado.', checking: 'Procurando atualizações…', current: 'O Lumen {version} está atualizado.',
      available: 'A versão {version} está disponível.', availableManual: 'A versão {version} está disponível — esta instalação não pode se atualizar sozinha.',
      downloading: 'Baixando a versão {version}… {percent}%', ready: 'A versão {version} está pronta. Será instalada ao sair.',
      unsupported: 'Não há atualizações para este sistema.', error: 'Falha na atualização: {error}',
    },
    action: {
      check: 'Verificar agora', download: 'Baixar', install: 'Reiniciar', openDownload: 'Baixar no navegador',
    },
    auto: 'Atualizar automaticamente',
    autoHint: 'Procura novas versões em segundo plano, baixa-as e instala-as ao sair.',
    badge: {
      available: 'Atualização {version}', downloading: 'Atualização {percent}%', ready: 'Reiniciar para {version}',
      title: 'Clique: configurações de atualização',
    },
    toast: {
      ready: 'O Lumen {version} foi baixado e será instalado ao sair.',
      available: 'O Lumen {version} está disponível.',
      current: 'O Lumen {version} está atualizado.',
      failed: 'Falha na atualização: {error}',
    },
  },
  nl: {
    category: 'Updates',
    title: 'Updates',
    command: {
      check: 'Naar updates zoeken', install: 'Update installeren en herstarten', openDownload: 'Update downloaden (browser)',
    },
    status: {
      idle: 'Nog niet gecontroleerd.', checking: 'Zoeken naar updates…', current: 'Lumen {version} is up-to-date.',
      available: 'Versie {version} is beschikbaar.', availableManual: 'Versie {version} is beschikbaar — deze installatie kan zichzelf niet bijwerken.',
      downloading: 'Versie {version} downloaden… {percent}%', ready: 'Versie {version} is klaar en wordt bij afsluiten geïnstalleerd.',
      unsupported: 'Er zijn geen updates voor dit systeem.', error: 'Update mislukt: {error}',
    },
    action: {
      check: 'Nu controleren', download: 'Downloaden', install: 'Herstarten', openDownload: 'Downloaden in browser',
    },
    auto: 'Automatisch bijwerken',
    autoHint: 'Zoekt op de achtergrond naar nieuwe versies, downloadt ze en installeert ze bij afsluiten.',
    badge: {
      available: 'Update {version}', downloading: 'Update {percent}%', ready: 'Herstarten voor {version}',
      title: 'Klik: update-instellingen',
    },
    toast: {
      ready: 'Lumen {version} is gedownload en wordt bij afsluiten geïnstalleerd.',
      available: 'Lumen {version} is beschikbaar.',
      current: 'Lumen {version} is up-to-date.',
      failed: 'Update mislukt: {error}',
    },
  },
} satisfies NamespaceMessages;
