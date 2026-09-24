# Databases

Browse and edit databases directly in Lumen — files and servers:

| | |
| --- | --- |
| **SQLite** | `.db`, `.sqlite`, `.sqlite3`, `.db3` — works on the file itself, no copy |
| **H2** | `.mv.db` — needs Java 11+; the H2 driver is downloaded from Maven Central on first open |
| **MariaDB / MySQL** | all databases of the server as schemas |
| **PostgreSQL** | schemas, tables, views |
| **SQL Server** | also with an ADO.NET connection string |
| **Redis** | search keys, edit values per type (string, hash, list, set, sorted set, stream), TTL |
| **MongoDB** | databases, collections, documents as Extended JSON with filter and sort |

## How to use it

- The **Databases** view on the left: add connections (`+`), open a file, connect.
  A database file in the explorer can also be opened directly — Lumen asks whether it should go
  into the database view.
- Clicking a table opens its data as a **tab in the editor area**: paged,
  sortable by clicking the column headers, filterable with a SQL condition.
- **Editing**: double-click a cell, add rows, delete rows — everything stays marked as a
  pending change until you click **Commit**. Then everything runs in one
  transaction; if a statement fails, nothing is written. *Show SQL* shows the
  statements beforehand.
- **SQL console**: Ctrl+Enter runs the script (or only the selection), statement by
  statement; the results appear below.
- **Export** a table or a result as CSV or JSON.

Passwords are stored encrypted in the system keychain, never in the settings. If you prefer not
to save a password, you are asked for it when connecting.

## Settings

Rows per page, confirmation before committing, CSV separator, maximum rows shown for a
query, query timeout, keys per Redis search, path to Java and the H2 version.

## Notes

- Tables without a primary key are read-only — except in SQLite (`rowid`) and PostgreSQL
  (`ctid`), which can address every row that way.
- SQLite runs in a small helper process: a long query does not block Lumen and can
  be cancelled through the timeout.
- H2 locks the file while the connection is open; *Disconnect* releases it.

This extension ships executable code (the drivers are bundled in it) and is shown for approval
before installation.
