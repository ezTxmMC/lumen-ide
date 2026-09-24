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

/** Merge conflicts: the actions above each block, the commands, the merge editor. */
export default {
  de: {
    lens: {
      current: 'Aktuelle Änderung', incoming: 'Eingehende Änderung', base: 'Basis',
      acceptCurrent: 'Aktuelle übernehmen', acceptIncoming: 'Eingehende übernehmen', acceptBoth: 'Beide übernehmen',
      compare: 'Vergleichen',
    },
    cmd: {
      category: 'Merge',
      next: 'Nächster Merge-Konflikt', previous: 'Vorheriger Merge-Konflikt',
      acceptCurrent: 'Konflikt: Aktuelle Änderung übernehmen', acceptIncoming: 'Konflikt: Eingehende Änderung übernehmen',
      acceptBoth: 'Konflikt: Beide Änderungen übernehmen',
      acceptAllCurrent: 'Alle Konflikte: Aktuelle übernehmen', acceptAllIncoming: 'Alle Konflikte: Eingehende übernehmen',
      acceptAllBoth: 'Alle Konflikte: Beide übernehmen',
      openEditor: 'Im Merge-Editor lösen',
    },
    status: {
      count_one: '{count} Konflikt', count_other: '{count} Konflikte',
      title: 'Merge-Konflikte in dieser Datei — Klick springt zum nächsten',
    },
    editor: {
      title: 'Merge-Editor', current: 'Aktuell', incoming: 'Eingehend', result: 'Ergebnis',
      progress: '{done} von {total} gelöst', previous: 'Vorheriger Konflikt', next: 'Nächster Konflikt',
      acceptAllCurrent: 'Alle aktuellen', acceptAllIncoming: 'Alle eingehenden', reset: 'Ergebnis zurücksetzen',
      cancel: 'Abbrechen', complete: 'Merge abschließen', completeAnyway: 'Trotzdem abschließen',
      unresolved_one: 'Das Ergebnis enthält noch {count} Konfliktblock.',
      unresolved_other: 'Das Ergebnis enthält noch {count} Konfliktblöcke.',
      state: {
        unresolved: 'Ungelöst', current: 'Aktuell', incoming: 'Eingehend', both: 'Aktuell + Eingehend', base: 'Keine Seite',
      },
    },
    notify: {
      merged: '{name} gemergt', staged: '{name} gemergt und vorgemerkt',
      stageFailed: '{name} gemergt, aber git add ist fehlgeschlagen: {error}',
      noConflicts: 'Keine Merge-Konflikte in dieser Datei.',
    },
  },
  en: {
    lens: {
      current: 'Current Change', incoming: 'Incoming Change', base: 'Base',
      acceptCurrent: 'Accept Current', acceptIncoming: 'Accept Incoming', acceptBoth: 'Accept Both',
      compare: 'Compare',
    },
    cmd: {
      category: 'Merge',
      next: 'Next Merge Conflict', previous: 'Previous Merge Conflict',
      acceptCurrent: 'Conflict: Accept Current Change', acceptIncoming: 'Conflict: Accept Incoming Change',
      acceptBoth: 'Conflict: Accept Both Changes',
      acceptAllCurrent: 'All Conflicts: Accept Current', acceptAllIncoming: 'All Conflicts: Accept Incoming',
      acceptAllBoth: 'All Conflicts: Accept Both',
      openEditor: 'Resolve in Merge Editor',
    },
    status: {
      count_one: '{count} conflict', count_other: '{count} conflicts',
      title: 'Merge conflicts in this file — click to go to the next one',
    },
    editor: {
      title: 'Merge Editor', current: 'Current', incoming: 'Incoming', result: 'Result',
      progress: '{done} of {total} resolved', previous: 'Previous Conflict', next: 'Next Conflict',
      acceptAllCurrent: 'All Current', acceptAllIncoming: 'All Incoming', reset: 'Reset Result',
      cancel: 'Cancel', complete: 'Complete Merge', completeAnyway: 'Complete Anyway',
      unresolved_one: 'The result still contains {count} conflict block.',
      unresolved_other: 'The result still contains {count} conflict blocks.',
      state: {
        unresolved: 'Unresolved', current: 'Current', incoming: 'Incoming', both: 'Current + Incoming', base: 'Neither side',
      },
    },
    notify: {
      merged: 'Merged {name}', staged: 'Merged and staged {name}',
      stageFailed: 'Merged {name}, but git add failed: {error}',
      noConflicts: 'No merge conflicts in this file.',
    },
  },
  es: {
    lens: {
      current: 'Cambio actual', incoming: 'Cambio entrante', base: 'Base',
      acceptCurrent: 'Aceptar actual', acceptIncoming: 'Aceptar entrante', acceptBoth: 'Aceptar ambos',
      compare: 'Comparar',
    },
    cmd: {
      category: 'Merge',
      next: 'Siguiente conflicto de merge', previous: 'Conflicto de merge anterior',
      acceptCurrent: 'Conflicto: aceptar el cambio actual', acceptIncoming: 'Conflicto: aceptar el cambio entrante',
      acceptBoth: 'Conflicto: aceptar ambos cambios',
      acceptAllCurrent: 'Todos los conflictos: aceptar actual', acceptAllIncoming: 'Todos los conflictos: aceptar entrante',
      acceptAllBoth: 'Todos los conflictos: aceptar ambos',
      openEditor: 'Resolver en el editor de merge',
    },
    status: {
      count_one: '{count} conflicto', count_other: '{count} conflictos',
      title: 'Conflictos de merge en este archivo — haz clic para ir al siguiente',
    },
    editor: {
      title: 'Editor de merge', current: 'Actual', incoming: 'Entrante', result: 'Resultado',
      progress: '{done} de {total} resueltos', previous: 'Conflicto anterior', next: 'Siguiente conflicto',
      acceptAllCurrent: 'Todos los actuales', acceptAllIncoming: 'Todos los entrantes', reset: 'Restablecer resultado',
      cancel: 'Cancelar', complete: 'Completar merge', completeAnyway: 'Completar de todos modos',
      unresolved_one: 'El resultado aún contiene {count} bloque de conflicto.',
      unresolved_other: 'El resultado aún contiene {count} bloques de conflicto.',
      state: {
        unresolved: 'Sin resolver', current: 'Actual', incoming: 'Entrante', both: 'Actual + entrante', base: 'Ningún lado',
      },
    },
    notify: {
      merged: '{name} fusionado', staged: '{name} fusionado y preparado',
      stageFailed: '{name} fusionado, pero git add falló: {error}',
      noConflicts: 'No hay conflictos de merge en este archivo.',
    },
  },
  fr: {
    lens: {
      current: 'Modification actuelle', incoming: 'Modification entrante', base: 'Base',
      acceptCurrent: 'Accepter l’actuelle', acceptIncoming: 'Accepter l’entrante', acceptBoth: 'Accepter les deux',
      compare: 'Comparer',
    },
    cmd: {
      category: 'Merge',
      next: 'Conflit de merge suivant', previous: 'Conflit de merge précédent',
      acceptCurrent: 'Conflit : accepter la modification actuelle', acceptIncoming: 'Conflit : accepter la modification entrante',
      acceptBoth: 'Conflit : accepter les deux modifications',
      acceptAllCurrent: 'Tous les conflits : accepter l’actuelle', acceptAllIncoming: 'Tous les conflits : accepter l’entrante',
      acceptAllBoth: 'Tous les conflits : accepter les deux',
      openEditor: 'Résoudre dans l’éditeur de merge',
    },
    status: {
      count_one: '{count} conflit', count_other: '{count} conflits',
      title: 'Conflits de merge dans ce fichier — cliquer pour aller au suivant',
    },
    editor: {
      title: 'Éditeur de merge', current: 'Actuel', incoming: 'Entrant', result: 'Résultat',
      progress: '{done} sur {total} résolus', previous: 'Conflit précédent', next: 'Conflit suivant',
      acceptAllCurrent: 'Tous les actuels', acceptAllIncoming: 'Tous les entrants', reset: 'Réinitialiser le résultat',
      cancel: 'Annuler', complete: 'Terminer le merge', completeAnyway: 'Terminer quand même',
      unresolved_one: 'Le résultat contient encore {count} bloc de conflit.',
      unresolved_other: 'Le résultat contient encore {count} blocs de conflit.',
      state: {
        unresolved: 'Non résolu', current: 'Actuel', incoming: 'Entrant', both: 'Actuel + entrant', base: 'Aucun côté',
      },
    },
    notify: {
      merged: '{name} fusionné', staged: '{name} fusionné et indexé',
      stageFailed: '{name} fusionné, mais git add a échoué : {error}',
      noConflicts: 'Aucun conflit de merge dans ce fichier.',
    },
  },
  pl: {
    lens: {
      current: 'Bieżąca zmiana', incoming: 'Przychodząca zmiana', base: 'Baza',
      acceptCurrent: 'Przyjmij bieżącą', acceptIncoming: 'Przyjmij przychodzącą', acceptBoth: 'Przyjmij obie',
      compare: 'Porównaj',
    },
    cmd: {
      category: 'Merge',
      next: 'Następny konflikt scalania', previous: 'Poprzedni konflikt scalania',
      acceptCurrent: 'Konflikt: przyjmij bieżącą zmianę', acceptIncoming: 'Konflikt: przyjmij przychodzącą zmianę',
      acceptBoth: 'Konflikt: przyjmij obie zmiany',
      acceptAllCurrent: 'Wszystkie konflikty: przyjmij bieżące', acceptAllIncoming: 'Wszystkie konflikty: przyjmij przychodzące',
      acceptAllBoth: 'Wszystkie konflikty: przyjmij obie',
      openEditor: 'Rozwiąż w edytorze scalania',
    },
    status: {
      count_one: '{count} konflikt', count_few: '{count} konflikty', count_many: '{count} konfliktów', count_other: '{count} konfliktu',
      title: 'Konflikty scalania w tym pliku — kliknij, aby przejść do następnego',
    },
    editor: {
      title: 'Edytor scalania', current: 'Bieżące', incoming: 'Przychodzące', result: 'Wynik',
      progress: 'Rozwiązano {done} z {total}', previous: 'Poprzedni konflikt', next: 'Następny konflikt',
      acceptAllCurrent: 'Wszystkie bieżące', acceptAllIncoming: 'Wszystkie przychodzące', reset: 'Resetuj wynik',
      cancel: 'Anuluj', complete: 'Zakończ scalanie', completeAnyway: 'Zakończ mimo to',
      unresolved_one: 'Wynik nadal zawiera {count} blok konfliktu.',
      unresolved_few: 'Wynik nadal zawiera {count} bloki konfliktu.',
      unresolved_many: 'Wynik nadal zawiera {count} bloków konfliktu.',
      unresolved_other: 'Wynik nadal zawiera {count} bloku konfliktu.',
      state: {
        unresolved: 'Nierozwiązany', current: 'Bieżące', incoming: 'Przychodzące', both: 'Bieżące + przychodzące', base: 'Żadna strona',
      },
    },
    notify: {
      merged: 'Scalono {name}', staged: 'Scalono i dodano do indeksu {name}',
      stageFailed: 'Scalono {name}, ale git add nie powiódł się: {error}',
      noConflicts: 'Brak konfliktów scalania w tym pliku.',
    },
  },
  it: {
    lens: {
      current: 'Modifica corrente', incoming: 'Modifica in arrivo', base: 'Base',
      acceptCurrent: 'Accetta corrente', acceptIncoming: 'Accetta in arrivo', acceptBoth: 'Accetta entrambe',
      compare: 'Confronta',
    },
    cmd: {
      category: 'Merge',
      next: 'Conflitto di merge successivo', previous: 'Conflitto di merge precedente',
      acceptCurrent: 'Conflitto: accetta la modifica corrente', acceptIncoming: 'Conflitto: accetta la modifica in arrivo',
      acceptBoth: 'Conflitto: accetta entrambe le modifiche',
      acceptAllCurrent: 'Tutti i conflitti: accetta corrente', acceptAllIncoming: 'Tutti i conflitti: accetta in arrivo',
      acceptAllBoth: 'Tutti i conflitti: accetta entrambe',
      openEditor: 'Risolvi nell’editor di merge',
    },
    status: {
      count_one: '{count} conflitto', count_other: '{count} conflitti',
      title: 'Conflitti di merge in questo file — clic per andare al successivo',
    },
    editor: {
      title: 'Editor di merge', current: 'Corrente', incoming: 'In arrivo', result: 'Risultato',
      progress: '{done} di {total} risolti', previous: 'Conflitto precedente', next: 'Conflitto successivo',
      acceptAllCurrent: 'Tutti i correnti', acceptAllIncoming: 'Tutti in arrivo', reset: 'Reimposta risultato',
      cancel: 'Annulla', complete: 'Completa merge', completeAnyway: 'Completa comunque',
      unresolved_one: 'Il risultato contiene ancora {count} blocco di conflitto.',
      unresolved_other: 'Il risultato contiene ancora {count} blocchi di conflitto.',
      state: {
        unresolved: 'Non risolto', current: 'Corrente', incoming: 'In arrivo', both: 'Corrente + in arrivo', base: 'Nessun lato',
      },
    },
    notify: {
      merged: '{name} unito', staged: '{name} unito e aggiunto all’indice',
      stageFailed: '{name} unito, ma git add non è riuscito: {error}',
      noConflicts: 'Nessun conflitto di merge in questo file.',
    },
  },
  pt: {
    lens: {
      current: 'Alteração atual', incoming: 'Alteração recebida', base: 'Base',
      acceptCurrent: 'Aceitar atual', acceptIncoming: 'Aceitar recebida', acceptBoth: 'Aceitar ambas',
      compare: 'Comparar',
    },
    cmd: {
      category: 'Merge',
      next: 'Próximo conflito de merge', previous: 'Conflito de merge anterior',
      acceptCurrent: 'Conflito: aceitar a alteração atual', acceptIncoming: 'Conflito: aceitar a alteração recebida',
      acceptBoth: 'Conflito: aceitar ambas as alterações',
      acceptAllCurrent: 'Todos os conflitos: aceitar atual', acceptAllIncoming: 'Todos os conflitos: aceitar recebida',
      acceptAllBoth: 'Todos os conflitos: aceitar ambas',
      openEditor: 'Resolver no editor de merge',
    },
    status: {
      count_one: '{count} conflito', count_other: '{count} conflitos',
      title: 'Conflitos de merge neste arquivo — clique para ir ao próximo',
    },
    editor: {
      title: 'Editor de merge', current: 'Atual', incoming: 'Recebida', result: 'Resultado',
      progress: '{done} de {total} resolvidos', previous: 'Conflito anterior', next: 'Próximo conflito',
      acceptAllCurrent: 'Todas as atuais', acceptAllIncoming: 'Todas as recebidas', reset: 'Redefinir resultado',
      cancel: 'Cancelar', complete: 'Concluir merge', completeAnyway: 'Concluir mesmo assim',
      unresolved_one: 'O resultado ainda contém {count} bloco de conflito.',
      unresolved_other: 'O resultado ainda contém {count} blocos de conflito.',
      state: {
        unresolved: 'Não resolvido', current: 'Atual', incoming: 'Recebida', both: 'Atual + recebida', base: 'Nenhum lado',
      },
    },
    notify: {
      merged: '{name} mesclado', staged: '{name} mesclado e preparado',
      stageFailed: '{name} mesclado, mas git add falhou: {error}',
      noConflicts: 'Nenhum conflito de merge neste arquivo.',
    },
  },
  nl: {
    lens: {
      current: 'Huidige wijziging', incoming: 'Inkomende wijziging', base: 'Basis',
      acceptCurrent: 'Huidige accepteren', acceptIncoming: 'Inkomende accepteren', acceptBoth: 'Beide accepteren',
      compare: 'Vergelijken',
    },
    cmd: {
      category: 'Merge',
      next: 'Volgend mergeconflict', previous: 'Vorig mergeconflict',
      acceptCurrent: 'Conflict: huidige wijziging accepteren', acceptIncoming: 'Conflict: inkomende wijziging accepteren',
      acceptBoth: 'Conflict: beide wijzigingen accepteren',
      acceptAllCurrent: 'Alle conflicten: huidige accepteren', acceptAllIncoming: 'Alle conflicten: inkomende accepteren',
      acceptAllBoth: 'Alle conflicten: beide accepteren',
      openEditor: 'Oplossen in de merge-editor',
    },
    status: {
      count_one: '{count} conflict', count_other: '{count} conflicten',
      title: 'Mergeconflicten in dit bestand — klik om naar het volgende te gaan',
    },
    editor: {
      title: 'Merge-editor', current: 'Huidig', incoming: 'Inkomend', result: 'Resultaat',
      progress: '{done} van {total} opgelost', previous: 'Vorig conflict', next: 'Volgend conflict',
      acceptAllCurrent: 'Alle huidige', acceptAllIncoming: 'Alle inkomende', reset: 'Resultaat herstellen',
      cancel: 'Annuleren', complete: 'Merge voltooien', completeAnyway: 'Toch voltooien',
      unresolved_one: 'Het resultaat bevat nog {count} conflictblok.',
      unresolved_other: 'Het resultaat bevat nog {count} conflictblokken.',
      state: {
        unresolved: 'Onopgelost', current: 'Huidig', incoming: 'Inkomend', both: 'Huidig + inkomend', base: 'Geen van beide',
      },
    },
    notify: {
      merged: '{name} samengevoegd', staged: '{name} samengevoegd en gestaged',
      stageFailed: '{name} samengevoegd, maar git add is mislukt: {error}',
      noConflicts: 'Geen mergeconflicten in dit bestand.',
    },
  },
} satisfies NamespaceMessages;
