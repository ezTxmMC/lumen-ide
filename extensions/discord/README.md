# Discord Rich Presence

Shows in your Discord profile what you are working on in Lumen — *Editing
Main.java*, *in my-project*, the language as an image and how long you have
been at it.

The extension talks to the Discord client running on your machine directly
(its local IPC socket `discord-ipc-N`, Flatpak and Snap included, or the named
pipe on Windows). Nothing is sent anywhere else. Discord accepts about one
update every 15 seconds; changes in between are gathered, and with Discord
closed the extension quietly tries again later.

> Brings program code: Lumen asks before installing it and runs it in its main
> process.

## Setup

It works out of the box with Lumen's own Discord application. To show a name
of your own (“Playing …”), create an application at
[discord.com/developers](https://discord.com/developers/applications) and put
its *Application ID* into *Settings → Extensions → Discord Rich Presence*.
Upload art assets named after the language ids (`java`, `typescript`,
`python` …) and one called `lumen`.

## Settings

| Setting | What it does |
| --- | --- |
| Client ID | The Discord application; empty means no connection |
| File name, project, language, elapsed time | Each can be switched off |
| Count time from | Lumen's start, opening the project or switching to the file |
| “View repository” button | Links the project's `origin` remote, credentials stripped — for public repositories only |
| Idle after (minutes) | Minutes without window focus until Lumen counts as idle; `0` turns it off |
| When idle | Show the idle text, or clear the presence altogether |
| Idle text | Shown when idle or when no file is open |
| In private projects | Hide file and project names, or show nothing at all |
| Private folders | Absolute paths, one per line; projects inside count as private |

## Commands

- **Discord: Reconnect** — rebuilds the connection at once (also a click on
  the *Discord* entry in the status bar, which shows whether it is connected).
- **Discord: Enable / Disable / Toggle Rich Presence** — remembered across
  restarts.
- **Discord: Toggle Private Project** — marks the open project as private (or
  not). In private projects no names and no repository link reach Discord.

## Formerly built in

Lumen used to ship Discord Rich Presence as a bundled add-on (`tool.discord`).
It now lives here; its settings do not carry over — the defaults match the old
ones.
