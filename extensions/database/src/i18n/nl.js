/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

export default {
  view: { connections: 'Databases' },
  toolbar: { add: 'Verbinding toevoegen', openFile: 'Databasebestand openen', refresh: 'Vernieuwen' },
  type: {
    sqlite: 'SQLite', h2: 'H2', postgres: 'PostgreSQL', mysql: 'MariaDB / MySQL', mssql: 'SQL Server', redis: 'Redis', mongo: 'MongoDB',
  },
  typeDetail: {
    sqlite: 'Een databasebestand (.db, .sqlite)', h2: 'Een H2-databasebestand (.mv.db) — vereist Java',
    postgres: 'Serververbinding', mysql: 'Serververbinding', mssql: 'Microsoft SQL Server of Azure SQL',
    redis: 'Sleutels en waarden', mongo: 'Documenten en collecties',
  },
  status: { idle: 'Niet verbonden', connecting: 'Verbinden …', connected: 'Verbonden', error: 'Verbinding mislukt' },
  field: {
    name: 'Naam', file: 'Bestand', fileHint: 'Absoluut pad, of relatief ten opzichte van de geopende map.', host: 'Host', port: 'Poort',
    user: 'Gebruiker', password: 'Wachtwoord', passwordKeep: 'ongewijzigd', database: 'Database',
    databasePlaceholder: {
      postgres: 'postgres', mysql: 'alle databases', mssql: 'standaarddatabase', redis: '0', mongo: 'alle databases',
    },
    url: 'Verbindingsreeks',
    urlPlaceholder: {
      postgres: 'postgres://user@host:5432/db', mysql: 'mysql://user@host:3306/db', mssql: 'Server=host,1433;Database=db;User Id=sa',
      redis: 'redis://user@host:6379/0', mongo: 'mongodb+srv://user@cluster.example.net/db',
    },
    urlHint: 'Optioneel — vervangt de velden hierboven die erin voorkomen. Het wachtwoord blijft in het wachtwoordveld.',
    ssl: 'TLS', sslMode: { off: 'Uit', require: 'Versleuteld, certificaat niet gecontroleerd', verify: 'Versleuteld en gecontroleerd' },
    sslCa: 'CA-certificaat (bestand)', readOnly: 'Alleen-lezen', savePassword: 'Wachtwoord opslaan in de sleutelbos van het systeem',
  },
  connection: {
    pickType: 'Soort database', addTitle: 'Nieuwe {type}-verbinding', editTitle: '“{name}” bewerken', save: 'Opslaan',
    testFailedTitle: 'Verbinding mislukt', testFailed: 'De verbinding kon niet worden gemaakt:\n\n{error}\n\nToch opslaan?',
    saveAnyway: 'Toch opslaan', copyName: '{name} (kopie)',
    removeTitle: 'Verbinding verwijderen?', removeBody: '“{name}” en het opgeslagen wachtwoord worden verwijderd. De database zelf blijft ongemoeid.',
    remove: 'Verwijderen',
  },
  connect: { passwordTitle: 'Wachtwoord voor “{name}”', submit: 'Verbinden' },
  file: {
    openTitle: 'Een databasebestand openen', open: 'Openen',
    unknownType: '{name} lijkt geen databasebestand — SQLite wordt geprobeerd.',
  },
  tree: {
    emptyTitle: 'Nog geen verbindingen', emptyHint: 'Voeg een server toe, of open een .db-/.sqlite-/.mv.db-bestand vanuit de verkenner.',
    connect: 'Verbinden', connecting: 'Verbinden …', disconnect: 'Verbinding verbreken', refresh: 'Vernieuwen', edit: 'Bewerken …',
    duplicate: 'Dupliceren', remove: 'Verwijderen …', newQuery: 'Nieuwe SQL-console', openData: 'Gegevens openen', structure: 'Structuur',
    selectQuery: 'Opvragen in de console', noTables: 'Geen tabellen', keys: '{count} sleutels', openKeys: 'Sleutels bekijken',
    newCollection: 'Nieuwe collectie …', noCollections: 'Geen collecties', openCollection: 'Collectie openen',
    dropCollection: 'Collectie verwijderen', dropCollectionConfirm: 'De collectie “{name}” met al haar documenten verwijderen? Dit kan niet ongedaan worden gemaakt.',
  },
  tab: { gone: 'Dit tabblad hoort bij een eerdere sessie', goneHint: 'Open de tabel opnieuw vanuit de weergave Databases.' },
  table: {
    filterPlaceholder: 'WHERE … (een SQL-voorwaarde, bijv. age > 30)', applyFilter: 'Filteren', clearFilter: 'Filter wissen',
    loading: 'Laden …', empty: 'Geen rijen', sort: 'Sorteren', edit: 'Bewerken', page: 'Pagina', refresh: 'Vernieuwen',
    addRow: 'Rij toevoegen', deleteRows: 'Rijen verwijderen', export: 'Exporteren …', default: 'DEFAULT',
    readOnlyNoKey: 'Alleen-lezen: de tabel heeft geen primaire sleutel om haar rijen mee aan te wijzen.',
    pending: '{count} openstaande wijziging(en)', commit: 'Doorvoeren', rollback: 'Verwerpen', showSql: 'SQL tonen',
    commitTitle: '{count} opdracht(en) uitvoeren?', moreStatements: 'nog {count}',
    committed: 'Doorgevoerd: {count} opdracht(en), {affected} rij(en) gewijzigd.', commitFailed: 'Er is niets geschreven — {error}',
    selectRows: 'Selecteer eerst de rijen die verwijderd moeten worden.',
  },
  structure: {
    tabTitle: '{table} (structuur)', columns: 'Kolommen', indexes: 'Indexen', name: 'Naam', type: 'Type', nullable: 'Nullable',
    default: 'Standaardwaarde', primaryKey: 'Primaire sleutel', generated: 'Gegenereerd', unique: 'Uniek', yes: 'ja', noIndexes: 'Geen indexen',
  },
  query: {
    tabTitle: 'SQL {number} · {name}', title: 'SQL · {name}', placeholder: 'SELECT … — Ctrl+Enter voert het script of de selectie uit',
    run: 'Uitvoeren', stopWaiting: 'Niet meer wachten', clear: 'Resultaten wissen', hint: 'Ctrl+Enter voert het script uit, of alleen de geselecteerde tekst.',
    running: 'Bezig …', result: 'Resultaat',
    rows: '{count} rij(en) · {time}', rowsTruncated: 'Eerste {count} rijen · {time} — er zijn er meer (zie de instelling “maximaal aantal rijen”)',
    affected: '{count} rij(en) gewijzigd · {time}', done: 'Klaar · {time}', failed: 'Fout: {error}', noRows: 'Geen rijen',
  },
  export: {
    title: 'Exporteren', format: 'Formaat', file: 'Bestand', fileHint: 'Absoluut pad, of relatief ten opzichte van de geopende map.',
    submit: 'Exporteren', rows: '{count} rij(en)', done: '{count} rij(en) geschreven naar {file}.',
  },
  redis: {
    patternPlaceholder: 'Patroon, bijv. user:*', search: 'Zoeken', newKey: 'Nieuwe sleutel …', key: 'Sleutel', type: 'Type', ttl: 'TTL',
    found: '{count} sleutel(s)', foundMore: 'Eerste {count} sleutels — verfijn het patroon om andere te zien',
    noKeys: 'Geen overeenkomende sleutels', open: 'Openen', setTtl: 'Verloop instellen …', ttlSeconds: 'Seconden', ttlHint: '0 of leeg: verloopt nooit.',
    delete: 'Verwijderen', deleteTitle: 'Sleutels verwijderen?', deleteBody: '{count} sleutel(s), te beginnen met “{first}”, worden definitief verwijderd.',
    commandPlaceholder: 'Een Redis-commando, bijv. INFO memory', run: 'Uitvoeren',
    firstValue: 'Eerste waarde', firstValueHint: 'Voor een hash de naam van het eerste veld, voor een stream de waarde van zijn veld “field”.',
    create: 'Aanmaken', exists: 'De sleutel “{key}” bestaat al.',
  },
  redisKey: {
    save: 'Opslaan', saved: 'Opgeslagen.', field: 'Veld', value: 'Waarde', member: 'Lid', score: 'Score', fields: 'Velden',
    add: 'Toevoegen', edit: 'Bewerken', remove: 'Verwijderen', pushLeft: 'Aan het begin toevoegen', pushRight: 'Aan het einde toevoegen',
    streamPlaceholder: 'veld waarde veld waarde …', noExpiry: 'verloopt nooit', size: 'Grootte',
    truncated: '{shown} van {total} getoond.', gone: 'De sleutel bestaat niet (meer)', goneHint: 'Hij is misschien verlopen of verwijderd.',
    unsupported: 'Waarden van het type {type} kunnen niet worden getoond.', rename: 'Hernoemen …', deleteKey: 'Sleutel verwijderen',
    badScore: 'Een score moet een getal zijn.', badStream: 'Geef paren van veld en waarde: veld waarde veld waarde …',
  },
  mongo: {
    filterPlaceholder: 'Filter, bijv. { "age": { "$gt": 30 } }', sortPlaceholder: 'Sortering, bijv. { "_id": -1 }', find: 'Zoeken',
    newDocument: 'Nieuw document', edit: 'Bewerken', duplicate: 'Dupliceren', delete: 'Verwijderen', noDocuments: 'Geen documenten',
    editingNew: 'Nieuw document — Ctrl+Enter voegt het in', editingDocument: 'Document (Extended JSON) — Ctrl+Enter slaat het op',
    save: 'Opslaan', insert: 'Invoegen', close: 'Sluiten', saved: 'Document opgeslagen.', inserted: 'Document ingevoegd.',
    notFound: 'Het document is niet meer gevonden — niets opgeslagen.', invalidJson: 'Geen geldige JSON: {error}',
    deleteTitle: 'Documenten verwijderen?', deleteBody: '{count} document(en) worden definitief verwijderd.', deleted: '{count} document(en) verwijderd.',
  },
  command: { noSqlConnection: 'Er is nog geen SQL-verbinding.', pickConnection: 'Verbinding voor de console' },
  error: {
    unknown: 'Onbekende fout', cancelled: 'Geannuleerd.', noConnection: 'De verbinding bestaat niet meer.',
    noFile: 'Geen databasebestand opgegeven.', fileMissing: 'Het bestand {file} bestaat niet.',
    noSqlite: 'Deze Lumen heeft geen ingebouwde SQLite (Node {version}); SQLite vereist Node 22.5 of nieuwer.',
    workerGone: 'De SQLite-worker is gestopt. De volgende query start hem opnieuw.',
    timeout: 'De query duurde langer dan {seconds} s en is gestopt (instelling “tijdslimiet voor query’s”).',
    noJava: 'H2 vereist Java 11 of nieuwer. Installeer een JDK/JRE, stel JAVA_HOME in, of geef java op in de instellingen van de extensie.',
    h2Download: 'Het H2-stuurprogramma kon niet worden gedownload: {error}',
    redisSelect: 'SELECT is hier niet beschikbaar — open de andere database vanuit de boom.',
    keyExists: 'De sleutel “{key}” bestaat al.',
  },
};
