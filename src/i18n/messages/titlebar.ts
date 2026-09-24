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

/** The title bar: the tool buttons and the window controls. */
export default {
  de: {
    toggleSecondary: 'Zweite Seitenleiste umschalten',
    toggleSidebar: 'Seitenleiste umschalten', openFolder: 'Ordner öffnen', newProject: 'Neues Projekt…',
    stop: 'Abbrechen: {label}', build: 'Bauen: {label}', noBuild: 'Keine Build-Aufgabe im Projekt',
    run: 'Ausführen: {label}', runFile: 'Datei ausführen', test: 'Testen: {label}', noTest: 'Keine Test-Aufgabe im Projekt',
    terminal: 'Terminal', togglePanel: 'Panel umschalten', commandPalette: 'Befehlspalette', searchEverywhere: 'Überall suchen',
    minimize: 'Minimieren', maximize: 'Maximieren', restore: 'Wiederherstellen',
  },
  en: {
    toggleSecondary: 'Toggle Secondary Sidebar',
    toggleSidebar: 'Toggle Sidebar', openFolder: 'Open Folder', newProject: 'New Project…',
    stop: 'Cancel: {label}', build: 'Build: {label}', noBuild: 'No build task in project',
    run: 'Run: {label}', runFile: 'Run File', test: 'Test: {label}', noTest: 'No test task in project',
    terminal: 'Terminal', togglePanel: 'Toggle Panel', commandPalette: 'Command Palette', searchEverywhere: 'Search Everywhere',
    minimize: 'Minimize', maximize: 'Maximize', restore: 'Restore',
  },
  es: {
    toggleSecondary: 'Alternar barra lateral secundaria',
    toggleSidebar: 'Alternar barra lateral', openFolder: 'Abrir carpeta', newProject: 'Nuevo proyecto…',
    stop: 'Cancelar: {label}', build: 'Compilar: {label}', noBuild: 'No hay tarea de compilación en el proyecto',
    run: 'Ejecutar: {label}', runFile: 'Ejecutar archivo', test: 'Probar: {label}', noTest: 'No hay tarea de pruebas en el proyecto',
    terminal: 'Terminal', togglePanel: 'Alternar panel', commandPalette: 'Paleta de comandos', searchEverywhere: 'Buscar en todo',
    minimize: 'Minimizar', maximize: 'Maximizar', restore: 'Restaurar',
  },
  fr: {
    toggleSecondary: 'Afficher/masquer la barre latérale secondaire',
    toggleSidebar: 'Afficher/masquer la barre latérale', openFolder: 'Ouvrir un dossier', newProject: 'Nouveau projet…',
    stop: 'Annuler : {label}', build: 'Compiler : {label}', noBuild: 'Aucune tâche de compilation dans le projet',
    run: 'Exécuter : {label}', runFile: 'Exécuter le fichier', test: 'Tester : {label}', noTest: 'Aucune tâche de test dans le projet',
    terminal: 'Terminal', togglePanel: 'Afficher/masquer le panneau', commandPalette: 'Palette de commandes', searchEverywhere: 'Rechercher partout',
    minimize: 'Réduire', maximize: 'Agrandir', restore: 'Restaurer',
  },
  pl: {
    toggleSecondary: 'Przełącz drugi pasek boczny',
    toggleSidebar: 'Przełącz pasek boczny', openFolder: 'Otwórz folder', newProject: 'Nowy projekt…',
    stop: 'Anuluj: {label}', build: 'Zbuduj: {label}', noBuild: 'Brak zadania budowania w projekcie',
    run: 'Uruchom: {label}', runFile: 'Uruchom plik', test: 'Testuj: {label}', noTest: 'Brak zadania testów w projekcie',
    terminal: 'Terminal', togglePanel: 'Przełącz panel', commandPalette: 'Paleta poleceń', searchEverywhere: 'Szukaj wszędzie',
    minimize: 'Minimalizuj', maximize: 'Maksymalizuj', restore: 'Przywróć',
  },
  it: {
    toggleSecondary: 'Mostra/nascondi barra laterale secondaria',
    toggleSidebar: 'Mostra/nascondi barra laterale', openFolder: 'Apri cartella', newProject: 'Nuovo progetto…',
    stop: 'Annulla: {label}', build: 'Compila: {label}', noBuild: 'Nessuna attività di compilazione nel progetto',
    run: 'Esegui: {label}', runFile: 'Esegui file', test: 'Testa: {label}', noTest: 'Nessuna attività di test nel progetto',
    terminal: 'Terminale', togglePanel: 'Mostra/nascondi pannello', commandPalette: 'Tavolozza comandi', searchEverywhere: 'Cerca ovunque',
    minimize: 'Riduci a icona', maximize: 'Ingrandisci', restore: 'Ripristina',
  },
  pt: {
    toggleSecondary: 'Alternar barra lateral secundária',
    toggleSidebar: 'Alternar barra lateral', openFolder: 'Abrir pasta', newProject: 'Novo projeto…',
    stop: 'Cancelar: {label}', build: 'Compilar: {label}', noBuild: 'Nenhuma tarefa de compilação no projeto',
    run: 'Executar: {label}', runFile: 'Executar arquivo', test: 'Testar: {label}', noTest: 'Nenhuma tarefa de teste no projeto',
    terminal: 'Terminal', togglePanel: 'Alternar painel', commandPalette: 'Paleta de comandos', searchEverywhere: 'Pesquisar em tudo',
    minimize: 'Minimizar', maximize: 'Maximizar', restore: 'Restaurar',
  },
  nl: {
    toggleSecondary: 'Tweede zijbalk in-/uitschakelen',
    toggleSidebar: 'Zijbalk in-/uitschakelen', openFolder: 'Map openen', newProject: 'Nieuw project…',
    stop: 'Annuleren: {label}', build: 'Bouwen: {label}', noBuild: 'Geen bouwtaak in project',
    run: 'Uitvoeren: {label}', runFile: 'Bestand uitvoeren', test: 'Testen: {label}', noTest: 'Geen testtaak in project',
    terminal: 'Terminal', togglePanel: 'Paneel in-/uitschakelen', commandPalette: 'Opdrachtenpalet', searchEverywhere: 'Overal zoeken',
    minimize: 'Minimaliseren', maximize: 'Maximaliseren', restore: 'Herstellen',
  },
} satisfies NamespaceMessages;
