/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

/**
 * The texts of the Discord extension in English, Spanish, French, Polish,
 * Italian, Portuguese and Dutch. The
 * interface language comes from `ctx.locale()`; anything else falls back to
 * English.
 */

const MESSAGES = {
  en: {
    activity: {
      editing: 'Editing {file}',
      editingHidden: 'Editing a file',
      idle: 'Idle',
      project: 'in {project}',
      privateProject: 'in a private project',
      version: 'Lumen {version}',
      repoButton: 'View repository',
    },
    status: {
      connected: 'Discord: connected',
      connectedAs: 'Discord: connected as {user}',
      connecting: 'Discord: connecting…',
      disconnected: 'Discord: not connected (is Discord running?)',
      error: 'Discord: error — {message}',
      disabled: 'Discord Rich Presence is off — click to turn it on',
      noClientId: 'Discord: no client ID set',
      click: 'Click to reconnect',
    },
    toast: {
      missingClientId:
        'Discord Rich Presence needs a client ID: create an application at discord.com/developers and enter its ID in the extension’s settings.',
      connecting: 'Connecting to Discord…',
      connected: 'Connected to Discord',
      connectedAs: 'Connected to Discord as {user}',
      error: 'Discord: {message}',
      enabled: 'Discord Rich Presence is on',
      disabled: 'Discord Rich Presence is off',
      privateOn: '“{project}” is now private — names no longer appear in Discord',
      privateOff: '“{project}” is no longer private',
      noProject: 'No project is open.',
    },
  },
  es: {
    activity: {
      editing: 'Editando {file}',
      editingHidden: 'Editando un archivo',
      idle: 'Inactivo',
      project: 'en {project}',
      privateProject: 'en un proyecto privado',
      version: 'Lumen {version}',
      repoButton: 'Ver repositorio',
    },
    status: {
      connected: 'Discord: conectado',
      connectedAs: 'Discord: conectado como {user}',
      connecting: 'Discord: conectando…',
      disconnected: 'Discord: sin conexión (¿está abierto Discord?)',
      error: 'Discord: error — {message}',
      disabled: 'Discord Rich Presence está desactivado — haz clic para activarlo',
      noClientId: 'Discord: no hay ID de cliente',
      click: 'Haz clic para reconectar',
    },
    toast: {
      missingClientId:
        'Discord Rich Presence necesita un ID de cliente: crea una aplicación en discord.com/developers e introduce su ID en los ajustes de la extensión.',
      connecting: 'Conectando con Discord…',
      connected: 'Conectado a Discord',
      connectedAs: 'Conectado a Discord como {user}',
      error: 'Discord: {message}',
      enabled: 'Discord Rich Presence está activado',
      disabled: 'Discord Rich Presence está desactivado',
      privateOn: '«{project}» ahora es privado: los nombres ya no aparecen en Discord',
      privateOff: '«{project}» ya no es privado',
      noProject: 'No hay ningún proyecto abierto.',
    },
  },
  fr: {
    activity: {
      editing: 'Modifie {file}',
      editingHidden: 'Modifie un fichier',
      idle: 'Inactif',
      project: 'dans {project}',
      privateProject: 'dans un projet privé',
      version: 'Lumen {version}',
      repoButton: 'Voir le dépôt',
    },
    status: {
      connected: 'Discord : connecté',
      connectedAs: 'Discord : connecté en tant que {user}',
      connecting: 'Discord : connexion…',
      disconnected: 'Discord : non connecté (Discord est-il lancé ?)',
      error: 'Discord : erreur — {message}',
      disabled: 'Discord Rich Presence est désactivé — cliquez pour l’activer',
      noClientId: 'Discord : aucun ID client défini',
      click: 'Cliquez pour vous reconnecter',
    },
    toast: {
      missingClientId:
        'Discord Rich Presence nécessite un ID client : créez une application sur discord.com/developers et saisissez son ID dans les paramètres de l’extension.',
      connecting: 'Connexion à Discord…',
      connected: 'Connecté à Discord',
      connectedAs: 'Connecté à Discord en tant que {user}',
      error: 'Discord : {message}',
      enabled: 'Discord Rich Presence est activé',
      disabled: 'Discord Rich Presence est désactivé',
      privateOn: '« {project} » est désormais privé — les noms n’apparaissent plus dans Discord',
      privateOff: '« {project} » n’est plus privé',
      noProject: 'Aucun projet ouvert.',
    },
  },
  pl: {
    activity: {
      editing: 'Edytuje {file}',
      editingHidden: 'Edytuje plik',
      idle: 'Bezczynny',
      project: 'w {project}',
      privateProject: 'w prywatnym projekcie',
      version: 'Lumen {version}',
      repoButton: 'Zobacz repozytorium',
    },
    status: {
      connected: 'Discord: połączono',
      connectedAs: 'Discord: połączono jako {user}',
      connecting: 'Discord: łączenie…',
      disconnected: 'Discord: brak połączenia (czy Discord działa?)',
      error: 'Discord: błąd — {message}',
      disabled: 'Discord Rich Presence jest wyłączony — kliknij, aby włączyć',
      noClientId: 'Discord: nie ustawiono ID klienta',
      click: 'Kliknij, aby połączyć ponownie',
    },
    toast: {
      missingClientId:
        'Discord Rich Presence wymaga ID klienta: utwórz aplikację na discord.com/developers i wpisz jej ID w ustawieniach rozszerzenia.',
      connecting: 'Łączenie z Discordem…',
      connected: 'Połączono z Discordem',
      connectedAs: 'Połączono z Discordem jako {user}',
      error: 'Discord: {message}',
      enabled: 'Discord Rich Presence jest włączony',
      disabled: 'Discord Rich Presence jest wyłączony',
      privateOn: '„{project}” jest teraz prywatny — nazwy nie pojawiają się w Discordzie',
      privateOff: '„{project}” nie jest już prywatny',
      noProject: 'Nie otwarto żadnego projektu.',
    },
  },
  it: {
    activity: {
      editing: 'Modifica {file}',
      editingHidden: 'Modifica un file',
      idle: 'Inattivo',
      project: 'in {project}',
      privateProject: 'in un progetto privato',
      version: 'Lumen {version}',
      repoButton: 'Vedi repository',
    },
    status: {
      connected: 'Discord: connesso',
      connectedAs: 'Discord: connesso come {user}',
      connecting: 'Discord: connessione…',
      disconnected: 'Discord: non connesso (Discord è in esecuzione?)',
      error: 'Discord: errore — {message}',
      disabled: 'Discord Rich Presence è disattivato — fai clic per attivarlo',
      noClientId: 'Discord: nessun ID client impostato',
      click: 'Fai clic per riconnettere',
    },
    toast: {
      missingClientId:
        'Discord Rich Presence richiede un ID client: crea un’applicazione su discord.com/developers e inserisci il suo ID nelle impostazioni dell’estensione.',
      connecting: 'Connessione a Discord…',
      connected: 'Connesso a Discord',
      connectedAs: 'Connesso a Discord come {user}',
      error: 'Discord: {message}',
      enabled: 'Discord Rich Presence è attivo',
      disabled: 'Discord Rich Presence è disattivato',
      privateOn: '“{project}” ora è privato: i nomi non compaiono più su Discord',
      privateOff: '“{project}” non è più privato',
      noProject: 'Nessun progetto aperto.',
    },
  },
  pt: {
    activity: {
      editing: 'Editando {file}',
      editingHidden: 'Editando um arquivo',
      idle: 'Ocioso',
      project: 'em {project}',
      privateProject: 'em um projeto privado',
      version: 'Lumen {version}',
      repoButton: 'Ver repositório',
    },
    status: {
      connected: 'Discord: conectado',
      connectedAs: 'Discord: conectado como {user}',
      connecting: 'Discord: conectando…',
      disconnected: 'Discord: desconectado (o Discord está aberto?)',
      error: 'Discord: erro — {message}',
      disabled: 'O Discord Rich Presence está desligado — clique para ligar',
      noClientId: 'Discord: nenhum ID do cliente definido',
      click: 'Clique para reconectar',
    },
    toast: {
      missingClientId:
        'O Discord Rich Presence precisa de um ID do cliente: crie uma aplicação em discord.com/developers e informe o ID nas configurações da extensão.',
      connecting: 'Conectando ao Discord…',
      connected: 'Conectado ao Discord',
      connectedAs: 'Conectado ao Discord como {user}',
      error: 'Discord: {message}',
      enabled: 'O Discord Rich Presence está ligado',
      disabled: 'O Discord Rich Presence está desligado',
      privateOn: '“{project}” agora é privado — os nomes não aparecem mais no Discord',
      privateOff: '“{project}” não é mais privado',
      noProject: 'Nenhum projeto aberto.',
    },
  },
  nl: {
    activity: {
      editing: 'Bewerkt {file}',
      editingHidden: 'Bewerkt een bestand',
      idle: 'Inactief',
      project: 'in {project}',
      privateProject: 'in een privéproject',
      version: 'Lumen {version}',
      repoButton: 'Repository bekijken',
    },
    status: {
      connected: 'Discord: verbonden',
      connectedAs: 'Discord: verbonden als {user}',
      connecting: 'Discord: verbinden…',
      disconnected: 'Discord: niet verbonden (draait Discord?)',
      error: 'Discord: fout — {message}',
      disabled: 'Discord Rich Presence staat uit — klik om het aan te zetten',
      noClientId: 'Discord: geen client-ID ingesteld',
      click: 'Klik om opnieuw te verbinden',
    },
    toast: {
      missingClientId:
        'Discord Rich Presence heeft een client-ID nodig: maak een applicatie aan op discord.com/developers en vul de ID in bij de instellingen van de extensie.',
      connecting: 'Verbinden met Discord…',
      connected: 'Verbonden met Discord',
      connectedAs: 'Verbonden met Discord als {user}',
      error: 'Discord: {message}',
      enabled: 'Discord Rich Presence staat aan',
      disabled: 'Discord Rich Presence staat uit',
      privateOn: '„{project}” is nu privé — namen verschijnen niet meer in Discord',
      privateOff: '„{project}” is niet langer privé',
      noProject: 'Geen project geopend.',
    },
  },
};

export const LANGUAGES = Object.keys(MESSAGES);

function lookup(table, key) {
  let node = table;
  for (const part of key.split('.')) {
    if (!node || typeof node !== 'object') {
      return undefined;
    }
    node = node[part];
  }
  return typeof node === 'string' ? node : undefined;
}

function languageOf(ctx) {
  const locale = String(ctx.locale?.() ?? 'en');
  if (MESSAGES[locale]) {
    return locale;
  }
  const base = locale.split('-')[0];
  return MESSAGES[base] ? base : 'en';
}

/** `t(key, params)` in the interface language, with English as the fallback. */
export function createT(ctx) {
  return (key, params = {}) => {
    const text = lookup(MESSAGES[languageOf(ctx)], key) ?? lookup(MESSAGES.en, key) ?? key;
    return String(text).replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
  };
}

/** For the tests: every key of a language, flattened. */
export function keysOf(language) {
  const out = [];
  const walk = (node, prefix) => {
    for (const [key, value] of Object.entries(node)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (typeof value === 'string') {
        out.push(path);
      }
      if (typeof value !== 'string') {
        walk(value, path);
      }
    }
  };
  walk(MESSAGES[language] ?? {}, '');
  return out;
}
