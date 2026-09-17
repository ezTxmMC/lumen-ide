import type { NamespaceMessages } from '@/i18n'

/** Search in the folder; the match count is used by the references panel too. */
export default {
  de: {
    placeholder: 'Im Ordner suchen…',
    hits_one: '{count} Treffer', hits_other: '{count} Treffer',
    inFiles_one: 'in {count} Datei', inFiles_other: 'in {count} Dateien',
    noHits: 'Keine Treffer', noHitsHint: 'Nichts gefunden für „{query}“.',
  },
  en: {
    placeholder: 'Search in folder…',
    hits_one: '{count} result', hits_other: '{count} results',
    inFiles_one: 'in {count} file', inFiles_other: 'in {count} files',
    noHits: 'No results', noHitsHint: 'Nothing found for “{query}”.',
  },
  es: {
    placeholder: 'Buscar en la carpeta…',
    hits_one: '{count} resultado', hits_other: '{count} resultados',
    inFiles_one: 'en {count} archivo', inFiles_other: 'en {count} archivos',
    noHits: 'Sin resultados', noHitsHint: 'No se encontró nada para «{query}».',
  },
  fr: {
    placeholder: 'Rechercher dans le dossier…',
    hits_one: '{count} résultat', hits_other: '{count} résultats',
    inFiles_one: 'dans {count} fichier', inFiles_other: 'dans {count} fichiers',
    noHits: 'Aucun résultat', noHitsHint: 'Aucun résultat pour « {query} ».',
  },
  pl: {
    placeholder: 'Szukaj w folderze…',
    hits_one: '{count} wynik', hits_few: '{count} wyniki', hits_many: '{count} wyników', hits_other: '{count} wyniku',
    inFiles_one: 'w {count} pliku', inFiles_few: 'w {count} plikach', inFiles_many: 'w {count} plikach', inFiles_other: 'w {count} pliku',
    noHits: 'Brak wyników', noHitsHint: 'Nic nie znaleziono dla „{query}”.',
  },
  it: {
    placeholder: 'Cerca nella cartella…',
    hits_one: '{count} risultato', hits_other: '{count} risultati',
    inFiles_one: 'in {count} file', inFiles_other: 'in {count} file',
    noHits: 'Nessun risultato', noHitsHint: 'Nessun risultato per “{query}”.',
  },
  pt: {
    placeholder: 'Pesquisar na pasta…',
    hits_one: '{count} resultado', hits_other: '{count} resultados',
    inFiles_one: 'em {count} arquivo', inFiles_other: 'em {count} arquivos',
    noHits: 'Nenhum resultado', noHitsHint: 'Nada encontrado para “{query}”.',
  },
  nl: {
    placeholder: 'Zoeken in map…',
    hits_one: '{count} resultaat', hits_other: '{count} resultaten',
    inFiles_one: 'in {count} bestand', inFiles_other: 'in {count} bestanden',
    noHits: 'Geen resultaten', noHitsHint: 'Niets gevonden voor “{query}”.',
  },
} satisfies NamespaceMessages
