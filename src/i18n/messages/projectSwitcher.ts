import type { NamespaceMessages } from '@/i18n'

/** The project switcher in the title bar, the “this window or a new one?” question and its setting. */
export default {
  de: {
    title: 'Projekt wechseln', noProject: 'Kein Projekt', search: 'Zuletzt verwendete Projekte durchsuchen…',
    recent: 'Zuletzt verwendet', empty: 'Noch keine zuletzt verwendeten Projekte', noMatch: 'Kein Projekt passt zu „{query}“',
    missing: 'Ordner nicht gefunden', current: 'In diesem Fenster geöffnet',
    openFolder: 'Ordner öffnen…', newProject: 'Neues Projekt…', newWindow: 'Neues Fenster', chooseFolder: 'Projektordner öffnen',
    choice: {
      title: '„{name}“ öffnen', message: 'Soll das Projekt in diesem Fenster oder in einem neuen geöffnet werden?',
      this: 'Dieses Fenster', thisHint: 'Ersetzt das aktuelle Projekt',
      new: 'Neues Fenster', newHint: 'Das aktuelle Projekt bleibt offen',
      remember: 'Auswahl merken', rememberHint: 'Änderbar unter Einstellungen › Allgemein.', cancel: 'Abbrechen',
    },
    setting: {
      label: 'Projekte öffnen in',
      hint: 'Wo ein Projekt aus dem Projektwechsler der Titelleiste geöffnet wird. Hier lässt sich auch eine gemerkte Auswahl zurücksetzen.',
      ask: 'Jedes Mal fragen', this: 'Diesem Fenster', new: 'Neuem Fenster',
    },
  },
  en: {
    title: 'Switch Project', noProject: 'No Project', search: 'Search recent projects…',
    recent: 'Recently used', empty: 'No recent projects yet', noMatch: 'No project matches “{query}”',
    missing: 'Folder not found', current: 'Open in this window',
    openFolder: 'Open Folder…', newProject: 'New Project…', newWindow: 'New Window', chooseFolder: 'Open Project Folder',
    choice: {
      title: 'Open “{name}”', message: 'Open the project in this window or in a new one?',
      this: 'This Window', thisHint: 'Replaces the current project',
      new: 'New Window', newHint: 'Keeps the current project open',
      remember: 'Remember my choice', rememberHint: 'You can change this under Settings › General.', cancel: 'Cancel',
    },
    setting: {
      label: 'Open projects in',
      hint: 'Where a project picked in the title bar’s project switcher opens. This is also where a remembered choice is reset.',
      ask: 'Ask every time', this: 'This window', new: 'New window',
    },
  },
  es: {
    title: 'Cambiar de proyecto', noProject: 'Sin proyecto', search: 'Buscar proyectos recientes…',
    recent: 'Usados recientemente', empty: 'Aún no hay proyectos recientes', noMatch: 'Ningún proyecto coincide con «{query}»',
    missing: 'Carpeta no encontrada', current: 'Abierto en esta ventana',
    openFolder: 'Abrir carpeta…', newProject: 'Nuevo proyecto…', newWindow: 'Nueva ventana', chooseFolder: 'Abrir carpeta del proyecto',
    choice: {
      title: 'Abrir «{name}»', message: '¿Abrir el proyecto en esta ventana o en una nueva?',
      this: 'Esta ventana', thisHint: 'Sustituye el proyecto actual',
      new: 'Nueva ventana', newHint: 'El proyecto actual sigue abierto',
      remember: 'Recordar mi elección', rememberHint: 'Se puede cambiar en Configuración › General.', cancel: 'Cancelar',
    },
    setting: {
      label: 'Abrir proyectos en',
      hint: 'Dónde se abre un proyecto elegido en el selector de proyectos de la barra de título. Aquí también se restablece una elección recordada.',
      ask: 'Preguntar cada vez', this: 'Esta ventana', new: 'Una ventana nueva',
    },
  },
  fr: {
    title: 'Changer de projet', noProject: 'Aucun projet', search: 'Rechercher dans les projets récents…',
    recent: 'Utilisés récemment', empty: 'Pas encore de projets récents', noMatch: 'Aucun projet ne correspond à « {query} »',
    missing: 'Dossier introuvable', current: 'Ouvert dans cette fenêtre',
    openFolder: 'Ouvrir un dossier…', newProject: 'Nouveau projet…', newWindow: 'Nouvelle fenêtre', chooseFolder: 'Ouvrir le dossier du projet',
    choice: {
      title: 'Ouvrir « {name} »', message: 'Ouvrir le projet dans cette fenêtre ou dans une nouvelle ?',
      this: 'Cette fenêtre', thisHint: 'Remplace le projet actuel',
      new: 'Nouvelle fenêtre', newHint: 'Le projet actuel reste ouvert',
      remember: 'Mémoriser mon choix', rememberHint: 'Modifiable dans Paramètres › Général.', cancel: 'Annuler',
    },
    setting: {
      label: 'Ouvrir les projets dans',
      hint: 'Où s’ouvre un projet choisi dans le sélecteur de projets de la barre de titre. C’est aussi ici qu’un choix mémorisé se réinitialise.',
      ask: 'Demander à chaque fois', this: 'Cette fenêtre', new: 'Une nouvelle fenêtre',
    },
  },
  pl: {
    title: 'Przełącz projekt', noProject: 'Brak projektu', search: 'Szukaj w ostatnich projektach…',
    recent: 'Ostatnio używane', empty: 'Brak ostatnich projektów', noMatch: 'Żaden projekt nie pasuje do „{query}”',
    missing: 'Nie znaleziono folderu', current: 'Otwarty w tym oknie',
    openFolder: 'Otwórz folder…', newProject: 'Nowy projekt…', newWindow: 'Nowe okno', chooseFolder: 'Otwórz folder projektu',
    choice: {
      title: 'Otwórz „{name}”', message: 'Otworzyć projekt w tym oknie czy w nowym?',
      this: 'To okno', thisHint: 'Zastępuje bieżący projekt',
      new: 'Nowe okno', newHint: 'Bieżący projekt pozostaje otwarty',
      remember: 'Zapamiętaj mój wybór', rememberHint: 'Można to zmienić w Ustawienia › Ogólne.', cancel: 'Anuluj',
    },
    setting: {
      label: 'Otwieraj projekty w',
      hint: 'Gdzie otwiera się projekt wybrany w przełączniku projektów na pasku tytułu. Tutaj też resetuje się zapamiętany wybór.',
      ask: 'Pytaj za każdym razem', this: 'Tym oknie', new: 'Nowym oknie',
    },
  },
  it: {
    title: 'Cambia progetto', noProject: 'Nessun progetto', search: 'Cerca nei progetti recenti…',
    recent: 'Usati di recente', empty: 'Ancora nessun progetto recente', noMatch: 'Nessun progetto corrisponde a «{query}»',
    missing: 'Cartella non trovata', current: 'Aperto in questa finestra',
    openFolder: 'Apri cartella…', newProject: 'Nuovo progetto…', newWindow: 'Nuova finestra', chooseFolder: 'Apri cartella del progetto',
    choice: {
      title: 'Apri «{name}»', message: 'Aprire il progetto in questa finestra o in una nuova?',
      this: 'Questa finestra', thisHint: 'Sostituisce il progetto attuale',
      new: 'Nuova finestra', newHint: 'Il progetto attuale resta aperto',
      remember: 'Ricorda la mia scelta', rememberHint: 'Modificabile in Impostazioni › Generali.', cancel: 'Annulla',
    },
    setting: {
      label: 'Apri i progetti in',
      hint: 'Dove si apre un progetto scelto nel selettore di progetti della barra del titolo. Qui si reimposta anche una scelta ricordata.',
      ask: 'Chiedi ogni volta', this: 'Questa finestra', new: 'Una nuova finestra',
    },
  },
  pt: {
    title: 'Mudar de projeto', noProject: 'Nenhum projeto', search: 'Pesquisar projetos recentes…',
    recent: 'Usados recentemente', empty: 'Ainda não há projetos recentes', noMatch: 'Nenhum projeto corresponde a “{query}”',
    missing: 'Pasta não encontrada', current: 'Aberto nesta janela',
    openFolder: 'Abrir pasta…', newProject: 'Novo projeto…', newWindow: 'Nova janela', chooseFolder: 'Abrir pasta do projeto',
    choice: {
      title: 'Abrir “{name}”', message: 'Abrir o projeto nesta janela ou numa nova?',
      this: 'Esta janela', thisHint: 'Substitui o projeto atual',
      new: 'Nova janela', newHint: 'O projeto atual continua aberto',
      remember: 'Lembrar a minha escolha', rememberHint: 'Pode ser alterado em Definições › Geral.', cancel: 'Cancelar',
    },
    setting: {
      label: 'Abrir projetos em',
      hint: 'Onde abre um projeto escolhido no seletor de projetos da barra de título. É também aqui que se repõe uma escolha lembrada.',
      ask: 'Perguntar sempre', this: 'Esta janela', new: 'Uma nova janela',
    },
  },
  nl: {
    title: 'Project wisselen', noProject: 'Geen project', search: 'Recente projecten doorzoeken…',
    recent: 'Recent gebruikt', empty: 'Nog geen recente projecten', noMatch: 'Geen project komt overeen met ‘{query}’',
    missing: 'Map niet gevonden', current: 'Geopend in dit venster',
    openFolder: 'Map openen…', newProject: 'Nieuw project…', newWindow: 'Nieuw venster', chooseFolder: 'Projectmap openen',
    choice: {
      title: '‘{name}’ openen', message: 'Het project in dit venster of in een nieuw venster openen?',
      this: 'Dit venster', thisHint: 'Vervangt het huidige project',
      new: 'Nieuw venster', newHint: 'Het huidige project blijft open',
      remember: 'Mijn keuze onthouden', rememberHint: 'Te wijzigen onder Instellingen › Algemeen.', cancel: 'Annuleren',
    },
    setting: {
      label: 'Projecten openen in',
      hint: 'Waar een project opent dat je in de projectwisselaar van de titelbalk kiest. Hier zet je ook een onthouden keuze terug.',
      ask: 'Elke keer vragen', this: 'Dit venster', new: 'Een nieuw venster',
    },
  },
} satisfies NamespaceMessages
