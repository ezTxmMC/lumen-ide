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

/** The security scanner: findings, questions before dangerous commands, project and extension checks. */
export default {
  de: {
    category: 'Sicherheit',
    cmd: { scanProject: 'Projekt auf Schadsoftware prüfen' },
    severity: { critical: 'Kritisch', high: 'Hoch', medium: 'Mittel', low: 'Niedrig', info: 'Hinweis' },
    project: {
      title: 'Auffälligkeiten in „{name}“',
      body: '{count} Auffälligkeiten in Manifesten, Skripten oder Hooks. Lumen hat nichts davon ausgeführt — prüfe die Stellen, bevor du Installationsskripte, Aufgaben oder Hooks laufen lässt.',
      clean: 'Keine Auffälligkeiten in „{name}“.',
      scanning: 'Projekt wird geprüft…',
      acknowledge: 'Verstanden, nicht mehr melden',
      acknowledged: 'Die Meldungen bleiben für dieses Projekt stumm.',
      close: 'Schließen',
    },
    command: {
      title: 'Gefährlicher Befehl',
      body: '„{label}“ enthält Muster, die Daten zerstören, Code aus dem Netz ausführen oder Zugangsdaten abgreifen können.',
      run: 'Trotzdem ausführen',
      cancel: 'Abbrechen',
    },
    paste: {
      title: 'Gefährlicher Text im Terminal',
      body: 'Der eingefügte Text enthält Befehle, die Schaden anrichten können. Er wurde noch nicht an das Terminal gesendet.',
      send: 'Trotzdem einfügen',
    },
    extension: {
      blocked: '„{name}“ wurde blockiert: {finding} ({id}).',
      findings: 'Sicherheitsprüfung: {count} Auffälligkeiten, zuerst: {finding} ({id}).',
    },
    hint: 'Sicherheitshinweis: {finding} ({id}) in {where}.',
    badge: { clean: 'Sicherheitsprüfung des Servers: unauffällig', warn: 'Sicherheitsprüfung des Servers: {count} Warnungen' },
    where: '{file}:{line}',
  },
  en: {
    category: 'Security',
    cmd: { scanProject: 'Scan Project for Malware' },
    severity: { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low', info: 'Note' },
    project: {
      title: 'Findings in “{name}”',
      body: '{count} findings in manifests, scripts or hooks. Lumen ran none of them — check the places before you let install scripts, tasks or hooks run.',
      clean: 'No findings in “{name}”.',
      scanning: 'Scanning the project…',
      acknowledge: 'Understood, stop reporting',
      acknowledged: 'These findings stay quiet for this project.',
      close: 'Close',
    },
    command: {
      title: 'Dangerous command',
      body: '“{label}” contains patterns that can destroy data, run code from the network or steal credentials.',
      run: 'Run anyway',
      cancel: 'Cancel',
    },
    paste: {
      title: 'Dangerous text in the terminal',
      body: 'The pasted text contains commands that can do harm. It has not been sent to the terminal yet.',
      send: 'Paste anyway',
    },
    extension: {
      blocked: '“{name}” was blocked: {finding} ({id}).',
      findings: 'Security scan: {count} findings, first: {finding} ({id}).',
    },
    hint: 'Security note: {finding} ({id}) in {where}.',
    badge: { clean: 'Server security scan: clean', warn: 'Server security scan: {count} warnings' },
    where: '{file}:{line}',
  },
  es: {
    category: 'Seguridad',
    cmd: { scanProject: 'Analizar el proyecto en busca de malware' },
    severity: { critical: 'Crítico', high: 'Alto', medium: 'Medio', low: 'Bajo', info: 'Aviso' },
    project: {
      title: 'Hallazgos en «{name}»',
      body: '{count} hallazgos en manifiestos, scripts o hooks. Lumen no ejecutó nada: revisa esos puntos antes de permitir scripts de instalación, tareas o hooks.',
      clean: 'Sin hallazgos en «{name}».',
      scanning: 'Analizando el proyecto…',
      acknowledge: 'Entendido, no avisar más',
      acknowledged: 'Estos avisos quedan en silencio para este proyecto.',
      close: 'Cerrar',
    },
    command: {
      title: 'Comando peligroso',
      body: '«{label}» contiene patrones que pueden destruir datos, ejecutar código de la red o robar credenciales.',
      run: 'Ejecutar de todos modos',
      cancel: 'Cancelar',
    },
    paste: {
      title: 'Texto peligroso en el terminal',
      body: 'El texto pegado contiene comandos que pueden causar daño. Todavía no se envió al terminal.',
      send: 'Pegar de todos modos',
    },
    extension: {
      blocked: '«{name}» fue bloqueada: {finding} ({id}).',
      findings: 'Análisis de seguridad: {count} hallazgos, el primero: {finding} ({id}).',
    },
    hint: 'Aviso de seguridad: {finding} ({id}) en {where}.',
    badge: { clean: 'Análisis de seguridad del servidor: sin hallazgos', warn: 'Análisis de seguridad del servidor: {count} avisos' },
    where: '{file}:{line}',
  },
  fr: {
    category: 'Sécurité',
    cmd: { scanProject: 'Analyser le projet à la recherche de logiciels malveillants' },
    severity: { critical: 'Critique', high: 'Élevée', medium: 'Moyenne', low: 'Faible', info: 'Remarque' },
    project: {
      title: 'Anomalies dans « {name} »',
      body: '{count} anomalies dans des manifestes, scripts ou hooks. Lumen n’a rien exécuté — vérifiez ces endroits avant de laisser tourner scripts d’installation, tâches ou hooks.',
      clean: 'Aucune anomalie dans « {name} ».',
      scanning: 'Analyse du projet…',
      acknowledge: 'Compris, ne plus signaler',
      acknowledged: 'Ces alertes restent muettes pour ce projet.',
      close: 'Fermer',
    },
    command: {
      title: 'Commande dangereuse',
      body: '« {label} » contient des motifs qui peuvent détruire des données, exécuter du code distant ou voler des identifiants.',
      run: 'Exécuter quand même',
      cancel: 'Annuler',
    },
    paste: {
      title: 'Texte dangereux dans le terminal',
      body: 'Le texte collé contient des commandes pouvant causer des dégâts. Il n’a pas encore été envoyé au terminal.',
      send: 'Coller quand même',
    },
    extension: {
      blocked: '« {name} » a été bloquée : {finding} ({id}).',
      findings: 'Analyse de sécurité : {count} anomalies, la première : {finding} ({id}).',
    },
    hint: 'Alerte de sécurité : {finding} ({id}) dans {where}.',
    badge: { clean: 'Analyse de sécurité du serveur : rien à signaler', warn: 'Analyse de sécurité du serveur : {count} avertissements' },
    where: '{file}:{line}',
  },
  pl: {
    category: 'Bezpieczeństwo',
    cmd: { scanProject: 'Przeskanuj projekt pod kątem złośliwego oprogramowania' },
    severity: { critical: 'Krytyczne', high: 'Wysokie', medium: 'Średnie', low: 'Niskie', info: 'Uwaga' },
    project: {
      title: 'Znaleziska w „{name}”',
      body: '{count} znalezisk w manifestach, skryptach lub hookach. Lumen niczego nie uruchomił — sprawdź te miejsca, zanim pozwolisz działać skryptom instalacji, zadaniom lub hookom.',
      clean: 'Brak znalezisk w „{name}”.',
      scanning: 'Skanowanie projektu…',
      acknowledge: 'Rozumiem, nie zgłaszaj więcej',
      acknowledged: 'Te zgłoszenia pozostaną wyciszone dla tego projektu.',
      close: 'Zamknij',
    },
    command: {
      title: 'Niebezpieczne polecenie',
      body: '„{label}” zawiera wzorce, które mogą niszczyć dane, uruchamiać kod z sieci lub wykradać poświadczenia.',
      run: 'Uruchom mimo to',
      cancel: 'Anuluj',
    },
    paste: {
      title: 'Niebezpieczny tekst w terminalu',
      body: 'Wklejony tekst zawiera polecenia, które mogą wyrządzić szkodę. Nie został jeszcze wysłany do terminala.',
      send: 'Wklej mimo to',
    },
    extension: {
      blocked: 'Zablokowano „{name}”: {finding} ({id}).',
      findings: 'Skan bezpieczeństwa: {count} znalezisk, pierwsze: {finding} ({id}).',
    },
    hint: 'Uwaga dotycząca bezpieczeństwa: {finding} ({id}) w {where}.',
    badge: { clean: 'Skan bezpieczeństwa serwera: bez uwag', warn: 'Skan bezpieczeństwa serwera: {count} ostrzeżeń' },
    where: '{file}:{line}',
  },
  it: {
    category: 'Sicurezza',
    cmd: { scanProject: 'Analizza il progetto in cerca di malware' },
    severity: { critical: 'Critico', high: 'Alto', medium: 'Medio', low: 'Basso', info: 'Nota' },
    project: {
      title: 'Rilevamenti in «{name}»',
      body: '{count} rilevamenti in manifest, script o hook. Lumen non ha eseguito nulla: controlla questi punti prima di far girare script di installazione, attività o hook.',
      clean: 'Nessun rilevamento in «{name}».',
      scanning: 'Analisi del progetto…',
      acknowledge: 'Capito, non segnalare più',
      acknowledged: 'Queste segnalazioni restano mute per questo progetto.',
      close: 'Chiudi',
    },
    command: {
      title: 'Comando pericoloso',
      body: '«{label}» contiene schemi che possono distruggere dati, eseguire codice dalla rete o rubare credenziali.',
      run: 'Esegui comunque',
      cancel: 'Annulla',
    },
    paste: {
      title: 'Testo pericoloso nel terminale',
      body: 'Il testo incollato contiene comandi che possono causare danni. Non è ancora stato inviato al terminale.',
      send: 'Incolla comunque',
    },
    extension: {
      blocked: '«{name}» è stata bloccata: {finding} ({id}).',
      findings: 'Analisi di sicurezza: {count} rilevamenti, il primo: {finding} ({id}).',
    },
    hint: 'Avviso di sicurezza: {finding} ({id}) in {where}.',
    badge: { clean: 'Analisi di sicurezza del server: nessun rilevamento', warn: 'Analisi di sicurezza del server: {count} avvisi' },
    where: '{file}:{line}',
  },
  pt: {
    category: 'Segurança',
    cmd: { scanProject: 'Verificar o projeto em busca de malware' },
    severity: { critical: 'Crítico', high: 'Alto', medium: 'Médio', low: 'Baixo', info: 'Aviso' },
    project: {
      title: 'Achados em “{name}”',
      body: '{count} achados em manifestos, scripts ou hooks. O Lumen não executou nada — confira esses pontos antes de deixar rodar scripts de instalação, tarefas ou hooks.',
      clean: 'Nenhum achado em “{name}”.',
      scanning: 'Verificando o projeto…',
      acknowledge: 'Entendi, não avisar mais',
      acknowledged: 'Esses avisos ficam silenciosos neste projeto.',
      close: 'Fechar',
    },
    command: {
      title: 'Comando perigoso',
      body: '“{label}” contém padrões que podem destruir dados, executar código da rede ou roubar credenciais.',
      run: 'Executar mesmo assim',
      cancel: 'Cancelar',
    },
    paste: {
      title: 'Texto perigoso no terminal',
      body: 'O texto colado contém comandos que podem causar danos. Ele ainda não foi enviado ao terminal.',
      send: 'Colar mesmo assim',
    },
    extension: {
      blocked: '“{name}” foi bloqueada: {finding} ({id}).',
      findings: 'Verificação de segurança: {count} achados, o primeiro: {finding} ({id}).',
    },
    hint: 'Aviso de segurança: {finding} ({id}) em {where}.',
    badge: { clean: 'Verificação de segurança do servidor: sem achados', warn: 'Verificação de segurança do servidor: {count} avisos' },
    where: '{file}:{line}',
  },
  nl: {
    category: 'Beveiliging',
    cmd: { scanProject: 'Project op malware controleren' },
    severity: { critical: 'Kritiek', high: 'Hoog', medium: 'Middel', low: 'Laag', info: 'Opmerking' },
    project: {
      title: 'Bevindingen in “{name}”',
      body: '{count} bevindingen in manifesten, scripts of hooks. Lumen heeft niets uitgevoerd — controleer die plekken voordat je installatiescripts, taken of hooks laat draaien.',
      clean: 'Geen bevindingen in “{name}”.',
      scanning: 'Project wordt gecontroleerd…',
      acknowledge: 'Begrepen, niet meer melden',
      acknowledged: 'Deze meldingen blijven stil voor dit project.',
      close: 'Sluiten',
    },
    command: {
      title: 'Gevaarlijke opdracht',
      body: '“{label}” bevat patronen die gegevens kunnen vernietigen, code van het netwerk kunnen uitvoeren of inloggegevens kunnen stelen.',
      run: 'Toch uitvoeren',
      cancel: 'Annuleren',
    },
    paste: {
      title: 'Gevaarlijke tekst in de terminal',
      body: 'De geplakte tekst bevat opdrachten die schade kunnen aanrichten. Hij is nog niet naar de terminal gestuurd.',
      send: 'Toch plakken',
    },
    extension: {
      blocked: '“{name}” is geblokkeerd: {finding} ({id}).',
      findings: 'Beveiligingscontrole: {count} bevindingen, eerste: {finding} ({id}).',
    },
    hint: 'Beveiligingsmelding: {finding} ({id}) in {where}.',
    badge: { clean: 'Beveiligingscontrole van de server: geen bevindingen', warn: 'Beveiligingscontrole van de server: {count} waarschuwingen' },
    where: '{file}:{line}',
  },
} satisfies NamespaceMessages;
