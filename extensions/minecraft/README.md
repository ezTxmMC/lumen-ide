# Minecraft Development

New plugins and mods for every Minecraft version from 1.7.10 to the newest,
with the versions picked live from the official sources — and project kinds
that recognise existing Minecraft projects with their build and run tasks.

> Brings program code for Lumen's window: Lumen asks before installing it. It
> only fetches version lists (Mojang, FabricMC, QuiltMC, NeoForged, Forge,
> PaperMC, SpigotMC, Architectury, Modrinth, Gradle) and writes nothing outside
> the new project.

## Templates

| Template | Minecraft versions | Build |
| --- | --- | --- |
| **Fabric** mod | 1.14.4 – newest, snapshots on request | Fabric Loom (`fabric-loom-remap`, from 26.1 `fabric-loom` without mappings), Mojang or Yarn mappings |
| **NeoForge** mod | 1.20.1, 1.20.4 – newest | ModDevGradle; 1.20.1 through ModDevGradle Legacy (`net.neoforged:forge`); optional Parchment |
| **Forge** mod | 1.7.10, 1.12.2, 1.16.5, 1.18.2, 1.19.2, 1.19.4, 1.20 – newest | as the official MDK: RetroFuturaGradle, ForgeGradle 6 (Gradle 8) or ForgeGradle 7 (Gradle 9) |
| **Quilt** mod | 1.18.2 – 1.21.11 | Quilt Loom, Quilted Fabric API or Fabric API |
| **Architectury** mod | every version of Architectury's generator (1.16.5 – newest) | Architectury Loom, architectury-plugin, Shadow |
| **Paper**, **Folia**, **Purpur**, **Leaf** plugin | every version with a published API (Paper from 1.16.5) | Gradle (Kotlin/Groovy) or Maven, run-paper |
| **Spigot** plugin | 1.8 – newest | Gradle or Maven, run-paper |
| **Velocity** plugin | every velocity-api release | Gradle or Maven, run-velocity |
| **BungeeCord** plugin | every bungeecord-api release | Gradle or Maven, run-waterfall |

Every version field is a searchable list for the chosen Minecraft version,
newest first, with its badge — *recommended* and *latest* for Forge's
promotions, *beta* for NeoForge's betas, the channel of a Paper build.

- **Java** follows Mojang: 8 up to 1.16.5, 16 for 1.17, 17 up to 1.20.4, 21 up
  to 1.21.11, 25 from 26.1.
- **Gradle** is the version the official template ships for that toolchain;
  newer releases of the same major version are offered next to it.
- **Paper and its forks from 26.1** name builds `26.2.build.128-stable`. The
  first choice, *Latest 26.2 build*, keeps the dependency on the newest build
  of that version: `[26.2.build,26.2.1)` in Maven, `26.2.build.+` in Gradle (the
  form PaperMC documents). The open range `[26.2.build,)` from Paper's docs is
  deliberately capped — Maven would otherwise resolve it to a 26.3 pre-release.

### Why some versions are missing

- **Forge 1.8 – 1.12.1, 1.13.2 – 1.16.4, 1.17.1, 1.18/1.18.1, 1.19/1.19.1/1.19.3**:
  their MDKs need ForgeGradle 1–5 and Gradle 2–7, which no current JDK runs.
  1.7.10 and 1.12.2 build with RetroFuturaGradle instead (Forge 10.13.4.1614 and
  14.23.5.2847, pinned by RFG).
- **NeoForge 1.20.2/1.20.3**: they only ever had NeoGradle MDKs.
- **Fabric before 1.14.4**: Mojang published no mappings, Fabric's generator
  stops there too.
- **Quilt 26.x**: Quilt Loom cannot build the unobfuscated versions.
- **Paper before 1.16.5**: no API artifacts are published any more.

## Project kinds

Fabric, Quilt, NeoForge, Forge (ForgeGradle and RetroFuturaGradle),
Architectury, the Bukkit family, Velocity and BungeeCord projects are
recognised by their build files; the project panel then offers *Build*,
*Run client*, *Run server*, *Generate data*, *Generate sources* and the jars.

## Commands

- **Minecraft: Update Versions** — fetches all version lists afresh.
- **Minecraft: Clear Version Cache** — forgets the stored lists.
- **Minecraft: Insert Snippet…** — listeners, commands, mixins and more for
  Java and Kotlin; in the completion they carry the prefix `mc-`.

## Settings

- **Cache version lists (hours)** — how long a loaded list counts as current
  (default 12). Offline, the last lists serve, and on a first start without
  network a small built-in set.
- **Show snapshots by default** — the Fabric template lists snapshots too.
