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
  view: { connections: 'Bazy danych' },
  toolbar: { add: 'Dodaj połączenie', openFile: 'Otwórz plik bazy danych', refresh: 'Odśwież' },
  type: {
    sqlite: 'SQLite', h2: 'H2', postgres: 'PostgreSQL', mysql: 'MariaDB / MySQL', mssql: 'SQL Server', redis: 'Redis', mongo: 'MongoDB',
  },
  typeDetail: {
    sqlite: 'Plik bazy danych (.db, .sqlite)', h2: 'Plik bazy danych H2 (.mv.db) — wymaga Javy',
    postgres: 'Połączenie z serwerem', mysql: 'Połączenie z serwerem', mssql: 'Microsoft SQL Server lub Azure SQL',
    redis: 'Klucze i wartości', mongo: 'Dokumenty i kolekcje',
  },
  status: { idle: 'Nie połączono', connecting: 'Łączenie …', connected: 'Połączono', error: 'Nie udało się połączyć' },
  field: {
    name: 'Nazwa', file: 'Plik', fileHint: 'Ścieżka bezwzględna lub względna wobec otwartego folderu.', host: 'Host', port: 'Port',
    user: 'Użytkownik', password: 'Hasło', passwordKeep: 'bez zmian', database: 'Baza danych',
    databasePlaceholder: {
      postgres: 'postgres', mysql: 'wszystkie bazy', mssql: 'domyślna baza', redis: '0', mongo: 'wszystkie bazy',
    },
    url: 'Ciąg połączenia',
    urlPlaceholder: {
      postgres: 'postgres://user@host:5432/db', mysql: 'mysql://user@host:3306/db', mssql: 'Server=host,1433;Database=db;User Id=sa',
      redis: 'redis://user@host:6379/0', mongo: 'mongodb+srv://user@cluster.example.net/db',
    },
    urlHint: 'Opcjonalnie — zastępuje pola powyżej, które zawiera. Hasło pozostaje w polu hasła.',
    ssl: 'TLS', sslMode: { off: 'Wyłączone', require: 'Szyfrowane, bez sprawdzania certyfikatu', verify: 'Szyfrowane i sprawdzane' },
    sslCa: 'Certyfikat CA (plik)', readOnly: 'Tylko do odczytu', savePassword: 'Zapisz hasło w pęku kluczy systemu',
  },
  connection: {
    pickType: 'Rodzaj bazy danych', addTitle: 'Nowe połączenie {type}', editTitle: 'Edytuj „{name}”', save: 'Zapisz',
    testFailedTitle: 'Nie udało się połączyć', testFailed: 'Nie udało się nawiązać połączenia:\n\n{error}\n\nZapisać mimo to?',
    saveAnyway: 'Zapisz mimo to', copyName: '{name} (kopia)',
    removeTitle: 'Usunąć połączenie?', removeBody: '„{name}” i zapisane hasło zostaną usunięte. Sama baza danych pozostaje nietknięta.',
    remove: 'Usuń',
  },
  connect: { passwordTitle: 'Hasło dla „{name}”', submit: 'Połącz' },
  file: {
    openTitle: 'Otwórz plik bazy danych', open: 'Otwórz',
    unknownType: '{name} nie wygląda na plik bazy danych — próba jako SQLite.',
  },
  tree: {
    emptyTitle: 'Brak połączeń', emptyHint: 'Dodaj serwer lub otwórz plik .db / .sqlite / .mv.db z eksploratora.',
    connect: 'Połącz', connecting: 'Łączenie …', disconnect: 'Rozłącz', refresh: 'Odśwież', edit: 'Edytuj …',
    duplicate: 'Duplikuj', remove: 'Usuń …', newQuery: 'Nowa konsola SQL', openData: 'Otwórz dane', structure: 'Struktura',
    selectQuery: 'Zapytaj w konsoli', noTables: 'Brak tabel', keys: 'Klucze: {count}', openKeys: 'Przeglądaj klucze',
    newCollection: 'Nowa kolekcja …', noCollections: 'Brak kolekcji', openCollection: 'Otwórz kolekcję',
    dropCollection: 'Usuń kolekcję', dropCollectionConfirm: 'Usunąć kolekcję „{name}” wraz ze wszystkimi dokumentami? Tej operacji nie można cofnąć.',
  },
  tab: { gone: 'Ta karta należy do wcześniejszej sesji', goneHint: 'Otwórz tabelę ponownie z widoku Bazy danych.' },
  table: {
    filterPlaceholder: 'WHERE … (warunek SQL, np. age > 30)', applyFilter: 'Filtruj', clearFilter: 'Wyczyść filtr',
    loading: 'Wczytywanie …', empty: 'Brak wierszy', sort: 'Sortuj', edit: 'Edytuj', page: 'Strona', refresh: 'Odśwież',
    addRow: 'Dodaj wiersz', deleteRows: 'Usuń wiersze', export: 'Eksportuj …', default: 'DEFAULT',
    readOnlyNoKey: 'Tylko do odczytu: tabela nie ma klucza głównego, którym można wskazać jej wiersze.',
    pending: 'Oczekujące zmiany: {count}', commit: 'Zatwierdź', rollback: 'Odrzuć', showSql: 'Pokaż SQL',
    commitTitle: 'Wykonać instrukcje ({count})?', moreStatements: 'i {count} więcej',
    committed: 'Zatwierdzono: instrukcje {count}, zmienione wiersze {affected}.', commitFailed: 'Nic nie zostało zapisane — {error}',
    selectRows: 'Najpierw zaznacz wiersze do usunięcia.',
  },
  structure: {
    tabTitle: '{table} (struktura)', columns: 'Kolumny', indexes: 'Indeksy', name: 'Nazwa', type: 'Typ', nullable: 'Dopuszcza NULL',
    default: 'Wartość domyślna', primaryKey: 'Klucz główny', generated: 'Generowana', unique: 'Unikalny', yes: 'tak', noIndexes: 'Brak indeksów',
  },
  query: {
    tabTitle: 'SQL {number} · {name}', title: 'SQL · {name}', placeholder: 'SELECT … — Ctrl+Enter uruchamia skrypt lub zaznaczenie',
    run: 'Uruchom', stopWaiting: 'Przestań czekać', clear: 'Wyczyść wyniki', hint: 'Ctrl+Enter uruchamia skrypt lub tylko zaznaczony tekst.',
    running: 'Wykonywanie …', result: 'Wynik',
    rows: 'Wiersze: {count} · {time}', rowsTruncated: 'Pierwsze {count} wierszy · {time} — jest ich więcej (zob. ustawienie „maksymalna liczba wierszy”)',
    affected: 'Zmienione wiersze: {count} · {time}', done: 'Gotowe · {time}', failed: 'Błąd: {error}', noRows: 'Brak wierszy',
  },
  export: {
    title: 'Eksport', format: 'Format', file: 'Plik', fileHint: 'Ścieżka bezwzględna lub względna wobec otwartego folderu.',
    submit: 'Eksportuj', rows: 'Wiersze: {count}', done: 'Zapisano wiersze ({count}) do {file}.',
  },
  redis: {
    patternPlaceholder: 'Wzorzec, np. user:*', search: 'Szukaj', newKey: 'Nowy klucz …', key: 'Klucz', type: 'Typ', ttl: 'TTL',
    found: 'Klucze: {count}', foundMore: 'Pierwsze {count} kluczy — zawęź wzorzec, aby zobaczyć inne',
    noKeys: 'Brak pasujących kluczy', open: 'Otwórz', setTtl: 'Ustaw wygaśnięcie …', ttlSeconds: 'Sekundy', ttlHint: '0 lub puste: nigdy nie wygasa.',
    delete: 'Usuń', deleteTitle: 'Usunąć klucze?', deleteBody: 'Klucze ({count}), zaczynając od „{first}”, zostaną trwale usunięte.',
    commandPlaceholder: 'Polecenie Redis, np. INFO memory', run: 'Uruchom',
    firstValue: 'Pierwsza wartość', firstValueHint: 'Dla hasha nazwa pierwszego pola, dla streamu wartość jego pola „field”.',
    create: 'Utwórz', exists: 'Klucz „{key}” już istnieje.',
  },
  redisKey: {
    save: 'Zapisz', saved: 'Zapisano.', field: 'Pole', value: 'Wartość', member: 'Element', score: 'Wynik', fields: 'Pola',
    add: 'Dodaj', edit: 'Edytuj', remove: 'Usuń', pushLeft: 'Dodaj na początku', pushRight: 'Dodaj na końcu',
    streamPlaceholder: 'pole wartość pole wartość …', noExpiry: 'nigdy nie wygasa', size: 'Rozmiar',
    truncated: 'Pokazano {shown} z {total}.', gone: 'Klucz nie istnieje (już)', goneHint: 'Mógł wygasnąć lub zostać usunięty.',
    unsupported: 'Wartości typu {type} nie mogą być wyświetlone.', rename: 'Zmień nazwę …', deleteKey: 'Usuń klucz',
    badScore: 'Wynik musi być liczbą.', badStream: 'Podaj pary pola i wartości: pole wartość pole wartość …',
  },
  mongo: {
    filterPlaceholder: 'Filtr, np. { "age": { "$gt": 30 } }', sortPlaceholder: 'Sortowanie, np. { "_id": -1 }', find: 'Szukaj',
    newDocument: 'Nowy dokument', edit: 'Edytuj', duplicate: 'Duplikuj', delete: 'Usuń', noDocuments: 'Brak dokumentów',
    editingNew: 'Nowy dokument — Ctrl+Enter go wstawia', editingDocument: 'Dokument (Extended JSON) — Ctrl+Enter go zapisuje',
    save: 'Zapisz', insert: 'Wstaw', close: 'Zamknij', saved: 'Dokument zapisany.', inserted: 'Dokument wstawiony.',
    notFound: 'Nie znaleziono już dokumentu — nic nie zapisano.', invalidJson: 'Nieprawidłowy JSON: {error}',
    deleteTitle: 'Usunąć dokumenty?', deleteBody: 'Dokumenty ({count}) zostaną trwale usunięte.', deleted: 'Usunięte dokumenty: {count}.',
  },
  command: { noSqlConnection: 'Nie ma jeszcze żadnego połączenia SQL.', pickConnection: 'Połączenie dla konsoli' },
  error: {
    unknown: 'Nieznany błąd', cancelled: 'Anulowano.', noConnection: 'Połączenie już nie istnieje.',
    noFile: 'Nie podano pliku bazy danych.', fileMissing: 'Plik {file} nie istnieje.',
    noSqlite: 'Ten Lumen nie ma wbudowanego SQLite (Node {version}); SQLite wymaga Node 22.5 lub nowszego.',
    workerGone: 'Worker SQLite zakończył działanie. Następne zapytanie uruchomi go ponownie.',
    timeout: 'Zapytanie trwało dłużej niż {seconds} s i zostało przerwane (ustawienie „limit czasu zapytań”).',
    noJava: 'H2 wymaga Javy 11 lub nowszej. Zainstaluj JDK/JRE, ustaw JAVA_HOME lub wskaż java w ustawieniach rozszerzenia.',
    h2Download: 'Nie udało się pobrać sterownika H2: {error}',
    redisSelect: 'SELECT nie jest tu dostępne — otwórz drugą bazę z drzewa.',
    keyExists: 'Klucz „{key}” już istnieje.',
  },
};
