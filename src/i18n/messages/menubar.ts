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

/** The menu bar in the title bar and the commands it brought along. */
export default {
  de: {
    menu: {
      file: 'Datei', edit: 'Bearbeiten', selection: 'Auswahl', view: 'Ansicht', go: 'Gehe zu',
      run: 'Ausführen', terminal: 'Terminal', help: 'Hilfe', application: 'Anwendungsmenü',
    },
    item: {
      openRecent: 'Zuletzt geöffnet', noRecent: 'Keine zuletzt geöffneten Projekte', moreRecent: 'Weitere…',
      closeEditor: 'Editor schließen', exit: 'Beenden', findInFiles: 'In Dateien suchen',
      appearance: 'Darstellung', editorLayout: 'Editor-Layout', wordWrap: 'Zeilenumbruch', minimap: 'Minimap',
      glass: 'Milchglas', glow: 'Akzent-Leuchten', animations: 'Animationen', inlayHints: 'Inlay-Hinweise',
      zoomIn: 'Vergrößern', zoomOut: 'Verkleinern', zoomReset: 'Zoom zurücksetzen', views: 'Ansichten',
      nextEditor: 'Nächster Editor', previousEditor: 'Vorheriger Editor', gotoFile: 'Gehe zu Datei…',
      startDebugging: 'Debuggen starten', runWithoutDebugging: 'Ohne Debuggen ausführen',
      stopDebugging: 'Debuggen beenden', restartDebugging: 'Debuggen neu starten',
    },
    cmd: {
      newWindow: 'Neues Fenster', saveAs: 'Speichern unter…', closeWindow: 'Fenster schließen', exit: 'Beenden',
      cut: 'Ausschneiden', copy: 'Kopieren', paste: 'Einfügen', selectAll: 'Alles auswählen',
      shrinkSelection: 'Auswahl verkleinern', back: 'Zurück', forward: 'Vorwärts',
      switchProject: 'Projekt wechseln…', clearRecent: 'Zuletzt geöffnete Projekte leeren',
      docs: 'Dokumentation', website: 'Website', reportIssue: 'Problem melden', about: 'Über Lumen',
      devTools: 'Entwicklertools umschalten',
    },
  },
  en: {
    menu: {
      file: 'File', edit: 'Edit', selection: 'Selection', view: 'View', go: 'Go',
      run: 'Run', terminal: 'Terminal', help: 'Help', application: 'Application Menu',
    },
    item: {
      openRecent: 'Open Recent', noRecent: 'No recently opened projects', moreRecent: 'More…',
      closeEditor: 'Close Editor', exit: 'Exit', findInFiles: 'Find in Files',
      appearance: 'Appearance', editorLayout: 'Editor Layout', wordWrap: 'Word Wrap', minimap: 'Minimap',
      glass: 'Frosted Glass', glow: 'Accent Glow', animations: 'Animations', inlayHints: 'Inlay Hints',
      zoomIn: 'Zoom In', zoomOut: 'Zoom Out', zoomReset: 'Reset Zoom', views: 'Views',
      nextEditor: 'Next Editor', previousEditor: 'Previous Editor', gotoFile: 'Go to File…',
      startDebugging: 'Start Debugging', runWithoutDebugging: 'Run Without Debugging',
      stopDebugging: 'Stop Debugging', restartDebugging: 'Restart Debugging',
    },
    cmd: {
      newWindow: 'New Window', saveAs: 'Save As…', closeWindow: 'Close Window', exit: 'Exit',
      cut: 'Cut', copy: 'Copy', paste: 'Paste', selectAll: 'Select All',
      shrinkSelection: 'Shrink Selection', back: 'Go Back', forward: 'Go Forward',
      switchProject: 'Switch Project…', clearRecent: 'Clear Recently Opened Projects',
      docs: 'Documentation', website: 'Website', reportIssue: 'Report Issue', about: 'About Lumen',
      devTools: 'Toggle Developer Tools',
    },
  },
  es: {
    menu: {
      file: 'Archivo', edit: 'Editar', selection: 'Selección', view: 'Ver', go: 'Ir',
      run: 'Ejecutar', terminal: 'Terminal', help: 'Ayuda', application: 'Menú de la aplicación',
    },
    item: {
      openRecent: 'Abrir recientes', noRecent: 'No hay proyectos abiertos recientemente', moreRecent: 'Más…',
      closeEditor: 'Cerrar editor', exit: 'Salir', findInFiles: 'Buscar en archivos',
      appearance: 'Apariencia', editorLayout: 'Diseño del editor', wordWrap: 'Ajuste de línea', minimap: 'Minimapa',
      glass: 'Vidrio esmerilado', glow: 'Brillo de acento', animations: 'Animaciones', inlayHints: 'Sugerencias insertadas',
      zoomIn: 'Acercar', zoomOut: 'Alejar', zoomReset: 'Restablecer zoom', views: 'Vistas',
      nextEditor: 'Editor siguiente', previousEditor: 'Editor anterior', gotoFile: 'Ir al archivo…',
      startDebugging: 'Iniciar depuración', runWithoutDebugging: 'Ejecutar sin depuración',
      stopDebugging: 'Detener depuración', restartDebugging: 'Reiniciar depuración',
    },
    cmd: {
      newWindow: 'Nueva ventana', saveAs: 'Guardar como…', closeWindow: 'Cerrar ventana', exit: 'Salir',
      cut: 'Cortar', copy: 'Copiar', paste: 'Pegar', selectAll: 'Seleccionar todo',
      shrinkSelection: 'Reducir selección', back: 'Atrás', forward: 'Adelante',
      switchProject: 'Cambiar de proyecto…', clearRecent: 'Borrar proyectos abiertos recientemente',
      docs: 'Documentación', website: 'Sitio web', reportIssue: 'Informar de un problema', about: 'Acerca de Lumen',
      devTools: 'Alternar herramientas de desarrollo',
    },
  },
  fr: {
    menu: {
      file: 'Fichier', edit: 'Modifier', selection: 'Sélection', view: 'Affichage', go: 'Atteindre',
      run: 'Exécuter', terminal: 'Terminal', help: 'Aide', application: 'Menu de l’application',
    },
    item: {
      openRecent: 'Ouvrir les éléments récents', noRecent: 'Aucun projet ouvert récemment', moreRecent: 'Plus…',
      closeEditor: 'Fermer l’éditeur', exit: 'Quitter', findInFiles: 'Rechercher dans les fichiers',
      appearance: 'Apparence', editorLayout: 'Disposition de l’éditeur', wordWrap: 'Retour automatique à la ligne', minimap: 'Minimap',
      glass: 'Verre dépoli', glow: 'Lueur d’accent', animations: 'Animations', inlayHints: 'Indicateurs incrustés',
      zoomIn: 'Zoom avant', zoomOut: 'Zoom arrière', zoomReset: 'Réinitialiser le zoom', views: 'Vues',
      nextEditor: 'Éditeur suivant', previousEditor: 'Éditeur précédent', gotoFile: 'Atteindre le fichier…',
      startDebugging: 'Démarrer le débogage', runWithoutDebugging: 'Exécuter sans débogage',
      stopDebugging: 'Arrêter le débogage', restartDebugging: 'Redémarrer le débogage',
    },
    cmd: {
      newWindow: 'Nouvelle fenêtre', saveAs: 'Enregistrer sous…', closeWindow: 'Fermer la fenêtre', exit: 'Quitter',
      cut: 'Couper', copy: 'Copier', paste: 'Coller', selectAll: 'Tout sélectionner',
      shrinkSelection: 'Réduire la sélection', back: 'Précédent', forward: 'Suivant',
      switchProject: 'Changer de projet…', clearRecent: 'Effacer les projets ouverts récemment',
      docs: 'Documentation', website: 'Site web', reportIssue: 'Signaler un problème', about: 'À propos de Lumen',
      devTools: 'Afficher/masquer les outils de développement',
    },
  },
  pl: {
    menu: {
      file: 'Plik', edit: 'Edycja', selection: 'Zaznaczenie', view: 'Widok', go: 'Przejdź',
      run: 'Uruchom', terminal: 'Terminal', help: 'Pomoc', application: 'Menu aplikacji',
    },
    item: {
      openRecent: 'Otwórz ostatnie', noRecent: 'Brak ostatnio otwartych projektów', moreRecent: 'Więcej…',
      closeEditor: 'Zamknij edytor', exit: 'Zakończ', findInFiles: 'Znajdź w plikach',
      appearance: 'Wygląd', editorLayout: 'Układ edytora', wordWrap: 'Zawijanie wierszy', minimap: 'Minimapa',
      glass: 'Matowe szkło', glow: 'Poświata akcentu', animations: 'Animacje', inlayHints: 'Wskazówki wbudowane',
      zoomIn: 'Powiększ', zoomOut: 'Pomniejsz', zoomReset: 'Resetuj powiększenie', views: 'Widoki',
      nextEditor: 'Następny edytor', previousEditor: 'Poprzedni edytor', gotoFile: 'Przejdź do pliku…',
      startDebugging: 'Rozpocznij debugowanie', runWithoutDebugging: 'Uruchom bez debugowania',
      stopDebugging: 'Zatrzymaj debugowanie', restartDebugging: 'Uruchom debugowanie ponownie',
    },
    cmd: {
      newWindow: 'Nowe okno', saveAs: 'Zapisz jako…', closeWindow: 'Zamknij okno', exit: 'Zakończ',
      cut: 'Wytnij', copy: 'Kopiuj', paste: 'Wklej', selectAll: 'Zaznacz wszystko',
      shrinkSelection: 'Zmniejsz zaznaczenie', back: 'Wstecz', forward: 'Dalej',
      switchProject: 'Przełącz projekt…', clearRecent: 'Wyczyść ostatnio otwarte projekty',
      docs: 'Dokumentacja', website: 'Strona internetowa', reportIssue: 'Zgłoś problem', about: 'O Lumen',
      devTools: 'Przełącz narzędzia deweloperskie',
    },
  },
  it: {
    menu: {
      file: 'File', edit: 'Modifica', selection: 'Selezione', view: 'Visualizza', go: 'Vai',
      run: 'Esegui', terminal: 'Terminale', help: 'Guida', application: 'Menu dell’applicazione',
    },
    item: {
      openRecent: 'Apri recenti', noRecent: 'Nessun progetto aperto di recente', moreRecent: 'Altro…',
      closeEditor: 'Chiudi editor', exit: 'Esci', findInFiles: 'Cerca nei file',
      appearance: 'Aspetto', editorLayout: 'Layout editor', wordWrap: 'A capo automatico', minimap: 'Minimappa',
      glass: 'Vetro smerigliato', glow: 'Bagliore d’accento', animations: 'Animazioni', inlayHints: 'Suggerimenti inline',
      zoomIn: 'Aumenta zoom', zoomOut: 'Riduci zoom', zoomReset: 'Reimposta zoom', views: 'Viste',
      nextEditor: 'Editor successivo', previousEditor: 'Editor precedente', gotoFile: 'Vai al file…',
      startDebugging: 'Avvia debug', runWithoutDebugging: 'Esegui senza debug',
      stopDebugging: 'Arresta debug', restartDebugging: 'Riavvia debug',
    },
    cmd: {
      newWindow: 'Nuova finestra', saveAs: 'Salva con nome…', closeWindow: 'Chiudi finestra', exit: 'Esci',
      cut: 'Taglia', copy: 'Copia', paste: 'Incolla', selectAll: 'Seleziona tutto',
      shrinkSelection: 'Riduci selezione', back: 'Indietro', forward: 'Avanti',
      switchProject: 'Cambia progetto…', clearRecent: 'Cancella progetti aperti di recente',
      docs: 'Documentazione', website: 'Sito web', reportIssue: 'Segnala un problema', about: 'Informazioni su Lumen',
      devTools: 'Attiva/disattiva strumenti di sviluppo',
    },
  },
  pt: {
    menu: {
      file: 'Ficheiro', edit: 'Editar', selection: 'Seleção', view: 'Ver', go: 'Ir',
      run: 'Executar', terminal: 'Terminal', help: 'Ajuda', application: 'Menu da aplicação',
    },
    item: {
      openRecent: 'Abrir recentes', noRecent: 'Nenhum projeto aberto recentemente', moreRecent: 'Mais…',
      closeEditor: 'Fechar editor', exit: 'Sair', findInFiles: 'Procurar nos ficheiros',
      appearance: 'Aspeto', editorLayout: 'Esquema do editor', wordWrap: 'Quebra de linha', minimap: 'Minimapa',
      glass: 'Vidro fosco', glow: 'Brilho de destaque', animations: 'Animações', inlayHints: 'Dicas embutidas',
      zoomIn: 'Ampliar', zoomOut: 'Reduzir', zoomReset: 'Repor zoom', views: 'Vistas',
      nextEditor: 'Editor seguinte', previousEditor: 'Editor anterior', gotoFile: 'Ir para ficheiro…',
      startDebugging: 'Iniciar depuração', runWithoutDebugging: 'Executar sem depuração',
      stopDebugging: 'Parar depuração', restartDebugging: 'Reiniciar depuração',
    },
    cmd: {
      newWindow: 'Nova janela', saveAs: 'Guardar como…', closeWindow: 'Fechar janela', exit: 'Sair',
      cut: 'Cortar', copy: 'Copiar', paste: 'Colar', selectAll: 'Selecionar tudo',
      shrinkSelection: 'Reduzir seleção', back: 'Voltar', forward: 'Avançar',
      switchProject: 'Mudar de projeto…', clearRecent: 'Limpar projetos abertos recentemente',
      docs: 'Documentação', website: 'Website', reportIssue: 'Comunicar um problema', about: 'Acerca do Lumen',
      devTools: 'Alternar ferramentas de programador',
    },
  },
  nl: {
    menu: {
      file: 'Bestand', edit: 'Bewerken', selection: 'Selectie', view: 'Beeld', go: 'Ga',
      run: 'Uitvoeren', terminal: 'Terminal', help: 'Help', application: 'Toepassingsmenu',
    },
    item: {
      openRecent: 'Recent geopend', noRecent: 'Geen recent geopende projecten', moreRecent: 'Meer…',
      closeEditor: 'Editor sluiten', exit: 'Afsluiten', findInFiles: 'Zoeken in bestanden',
      appearance: 'Weergave', editorLayout: 'Editorindeling', wordWrap: 'Regelterugloop', minimap: 'Minimap',
      glass: 'Matglas', glow: 'Accentgloed', animations: 'Animaties', inlayHints: 'Inlay-hints',
      zoomIn: 'Inzoomen', zoomOut: 'Uitzoomen', zoomReset: 'Zoom herstellen', views: 'Weergaven',
      nextEditor: 'Volgende editor', previousEditor: 'Vorige editor', gotoFile: 'Ga naar bestand…',
      startDebugging: 'Foutopsporing starten', runWithoutDebugging: 'Uitvoeren zonder foutopsporing',
      stopDebugging: 'Foutopsporing stoppen', restartDebugging: 'Foutopsporing opnieuw starten',
    },
    cmd: {
      newWindow: 'Nieuw venster', saveAs: 'Opslaan als…', closeWindow: 'Venster sluiten', exit: 'Afsluiten',
      cut: 'Knippen', copy: 'Kopiëren', paste: 'Plakken', selectAll: 'Alles selecteren',
      shrinkSelection: 'Selectie verkleinen', back: 'Terug', forward: 'Vooruit',
      switchProject: 'Project wisselen…', clearRecent: 'Recent geopende projecten wissen',
      docs: 'Documentatie', website: 'Website', reportIssue: 'Probleem melden', about: 'Over Lumen',
      devTools: 'Ontwikkelhulpmiddelen in-/uitschakelen',
    },
  },
} satisfies NamespaceMessages;
