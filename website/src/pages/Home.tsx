import { useState, type ReactNode } from "react";
import { DownloadCta } from "@/components/DownloadCta";
import { EditorWindow, WINDOW_HEIGHT, WINDOW_WIDTH } from "@/editor/EditorWindow";
import { Scaled } from "@/editor/Scaled";
import { lumenDark, lumenLight, syntaxColor, syntaxStyle, THEMES, type Theme } from "@/editor/themes";
import { tokenize } from "@/editor/tokenize";
import { formatDate, useRelease } from "@/lib/release";
import { useSiteTheme } from "@/lib/theme";

const FACTS = [
  ["35", "languages"],
  ["20", "project kinds"],
  ["16", "package managers"],
  ["30", "templates"],
  ["18", "extensions"],
  ["8", "interface languages"],
];

const SHOT_FRAME = "rounded-[10px] shadow-[0_0_0_1px_rgb(255_255_255/0.08),0_30px_70px_-30px_rgb(0_0_0/0.85)]";

function Wrap({ children, className = "", id }: { children: ReactNode; className?: string; id?: string }) {
  return (
    <div id={id} className={`mx-auto max-w-[1248px] px-4 sm:px-6 ${className}`}>
      {children}
    </div>
  );
}

function Head({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return (
    <div className="grid max-w-[68ch] gap-4">
      <span className="eyebrow text-accent">{eyebrow}</span>
      <h2 className="text-[clamp(27px,3.6vw,40px)] font-bold">{title}</h2>
      <p className="text-[17.5px] text-muted">{children}</p>
    </div>
  );
}

function Point({ title, tag, children }: { title: string; tag?: string; children: ReactNode }) {
  return (
    <div className="grid max-w-[48ch] gap-1.5">
      <h3 className="flex items-baseline gap-2.5 text-[19px] font-semibold tracking-[-0.02em]">
        {title}
        {tag && <em className="font-mono text-[11.5px] font-medium tracking-[0.04em] text-accent not-italic">{tag}</em>}
      </h3>
      <p className="text-[15.5px] text-muted">{children}</p>
    </div>
  );
}

function Section({ id, children, ruled = true }: { id: string; children: ReactNode; ruled?: boolean }) {
  return (
    <section id={id} className={`scroll-mt-[62px] ${ruled ? "border-t border-edge" : ""}`}>
      <Wrap className="py-[clamp(58px,8vw,96px)]">{children}</Wrap>
    </section>
  );
}

export function Home() {
  const { release } = useRelease();
  return (
    <>
      <Hero version={release?.version} />
      <Facts />
      <Editing />
      <Projects />
      <Themes />
      <Addons />
      <GetIt version={release?.version} date={release?.releaseDate} notes={release?.notes} />
    </>
  );
}

/* ------------------------------------------------------------------ */

function Hero({ version }: { version?: string }) {
  return (
    <div className="field relative">
      <Wrap className="grid justify-items-center gap-[30px] pt-[clamp(56px,9vw,104px)] text-center">
        <span className="eyebrow text-[#9aa8d8]">{version ? `Version ${version} · ` : ""}Linux · Windows · macOS</span>
        <h1 className="max-w-[15ch] text-[clamp(38px,6.4vw,68px)] font-bold">
          The IDE you can <span className="text-[#a9b3ff]">read the whole of</span>.
        </h1>
        <p className="max-w-[58ch] text-[clamp(17px,2vw,19.5px)] text-[#aab2c6]">Language servers, debuggers, project templates and package managers for every language you work in — and an add-on system so small that adding a language is one object in one file.</p>
        <DownloadCta secondary={{ to: "/#addons", label: "See how add-ons work" }} />

        <Scaled width={WINDOW_WIDTH} height={WINDOW_HEIGHT} className="mt-3 -mb-[90px] max-md:-mb-[50px]" frameClassName={SHOT_FRAME}>
          <EditorWindow theme={lumenDark} />
        </Scaled>
      </Wrap>
    </div>
  );
}

function Facts() {
  return (
    <div className="border-b border-edge bg-surface pt-[118px] pb-[26px] max-md:pt-[78px]">
      <Wrap className="flex flex-wrap justify-center gap-x-11 gap-y-3.5">
        {FACTS.map(([value, label]) => (
          <span key={label} className="flex items-baseline gap-2">
            <b className="font-display text-[25px] font-bold tracking-[-0.03em] tabular-nums">{value}</b>
            <span className="text-[14.5px] text-muted">{label}</span>
          </span>
        ))}
      </Wrap>
    </div>
  );
}

function Editing() {
  return (
    <Section id="editing" ruled={false}>
      <Head eyebrow="Editing" title="Completion that ranks, not just filters.">
        Matching survives your typos. What comes back is then weighed by where it came from, how recently you accepted it, and how close the word sits to your cursor — so the entry you meant is at the top, not alphabetically in the middle.
      </Head>
      <div className="mt-[34px] grid gap-5 md:grid-cols-2 md:gap-x-16">
        <Point title="Language servers" tag="LSP">
          Diagnostics, go to definition, find references, rename, formatting, inlay hints and signature help. Lumen finds the server on your PATH — and offers to install it when it is missing, falling back to its own completion until then.
        </Point>
        <Point title="Syntax from data" tag="35 languages">
          A language is a list of keywords and a few regexes. The half-dozen that need more — Markdown, JSX, the markup of Vue, Astro and Angular — name a tokenizer that ships with the editor.
        </Point>
        <Point title="Everything behind one shortcut" tag="Shift Shift">
          Files, symbols, actions, tasks and full text in a single palette. Split the editor, follow the outline, walk the references. Every binding is yours to change, chords included.
        </Point>
        <Point title="The debugger your toolchain already uses" tag="DAP">
          delve, debugpy, js-debug, lldb-dap, gdb-dap, codelldb, java-debug, kotlin-debug, netcoredbg and php-debug. Breakpoints, call stack, variables and watches — and child sessions attach on their own.
        </Point>
      </div>
    </Section>
  );
}

function Tile({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="grid content-start gap-2 rounded-[14px] border border-edge bg-surface p-6">
      <h3 className="text-[19px] font-semibold tracking-[-0.02em]">{title}</h3>
      <p className="text-[15px] text-muted">{children}</p>
    </div>
  );
}

function Projects() {
  return (
    <Section id="projects">
      <Head eyebrow="Projects" title="It reads the build file you already have.">
        Open a folder. Lumen works out what it is from what is in it — a <code>pom.xml</code>, a <code>Cargo.toml</code>, a <code>package.json</code> next to a lockfile — and the tasks that kind of project has are simply there.
      </Head>
      <div className="mt-10 grid gap-[22px] [grid-template-columns:repeat(auto-fit,minmax(250px,1fr))]">
        <Tile title="Build, run, test">Maven and Gradle use the wrapper when there is one. Makefile targets, Composer scripts and Shards targets become tasks. Output lands in the panel with file and line made clickable.</Tile>
        <Tile title="Add a dependency">
          npm, pnpm, Yarn, Bun, Deno, Maven, Gradle, pip, uv, Poetry, Cargo, Go modules, Composer, NuGet, Shards, vcpkg and Conan. What already sits in your <code>~/.m2</code> or Gradle cache comes up as a suggestion.
        </Tile>
        <Tile title="Start something new">Thirty templates, each a short form: package manager, test framework, language variant. What comes out builds on the first try, because every combination is tested before release.</Tile>
      </div>
    </Section>
  );
}

function Swatch({ theme, active, onPick }: { theme: Theme; active: boolean; onPick: () => void }) {
  const { ui } = theme;
  const strip = [ui.bg, ui.bgElevated, ui.accent, ...(["keyword", "string", "function", "number", "control"] as const).map((kind) => syntaxColor(theme, kind))];
  return (
    <button type="button" onClick={onPick} aria-pressed={active} className={["cursor-pointer overflow-hidden rounded-xl border bg-surface text-left transition-colors", active ? "border-accent ring-1 ring-accent" : "border-edge hover:border-edge-strong"].join(" ")}>
      <span className="flex items-center justify-between gap-3 px-4 py-2.5">
        <b className="font-display text-[15px] tracking-[-0.02em]">{theme.name}</b>
        <span className="font-mono text-[11px] text-subtle">{theme.type}</span>
      </span>
      <span className="flex h-6" aria-hidden>
        {strip.map((color, index) => (
          <i key={index} className="block flex-1" style={{ background: color }} />
        ))}
      </span>
    </button>
  );
}

function Themes() {
  const [theme, setTheme] = useState<Theme>(lumenLight);
  return (
    <Section id="themes">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-end">
        <Head eyebrow="Appearance" title="Colour treated as arithmetic.">
          Six themes ship with the editor. Edit one and it is copied for you — then the studio checks WCAG contrast as you go, mirrors a dark theme into a light one, and previews how it reads to colour-blind eyes.
        </Head>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {THEMES.map((candidate) => (
            <Swatch key={candidate.id} theme={candidate} active={candidate.id === theme.id} onPick={() => setTheme(candidate)} />
          ))}
        </div>
      </div>

      <Scaled width={WINDOW_WIDTH} height={WINDOW_HEIGHT} className="mx-auto mt-10" frameClassName="rounded-[10px] shadow-[0_0_0_1px_var(--c-border-strong),0_24px_60px_-28px_rgb(0_0_0/0.5)]">
        <EditorWindow theme={theme} />
      </Scaled>

      <div className="mt-12 grid gap-5 md:grid-cols-2 md:gap-x-16">
        <Point title="Every flourish has a switch">Frosted glass, accent glow, shadows, corner radius, density, animation level and speed, ligatures, caret style and blink. Turn them all off and what is left is flat and quiet.</Point>
        <Point title="Icons as letters or shapes">Lumen draws file icons as coloured abbreviations, with shapes for build tools, lockfiles and folders with a role. Build your own pack by file name, extension or language.</Point>
      </div>
    </Section>
  );
}

const ADDON_SOURCE = `import type { Addon } from '@/core/types'

export const luaAddon: Addon = {
  id: 'lang.lua',
  name: 'Lua',
  version: '1.0.0',
  languages: [{
    id: 'lua',
    extensions: ['.lua'],
    icon: 'Lu',
    color: '#51a0cf',
    comments: { line: '--' },
    keywords: ['local', 'function', 'end'],
    lsp: [{ command: 'lua-language-server' }],
  }],
}`;

const ADDON_LINES = tokenize(ADDON_SOURCE);

function Snippet() {
  const { dark } = useSiteTheme();
  const theme = dark ? lumenDark : lumenLight;
  return (
    <div className="overflow-hidden rounded-[14px] border border-edge bg-surface">
      <div className="flex justify-between gap-3 border-b border-edge px-4 py-2 font-mono text-[11.5px] text-subtle">
        <span>src/addons/lua.ts</span>
        <span>TypeScript</span>
      </div>
      <pre className="m-0 overflow-x-auto p-4 font-mono text-[13px] leading-[1.6]">
        <code>
          {ADDON_LINES.map((line, index) => (
            <span key={index} className="block min-h-[1lh]">
              {line.map((token, t) => (
                <span key={t} style={token.kind ? syntaxStyle(theme, token.kind) : undefined}>
                  {token.text}
                </span>
              ))}
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
}

const CATALOGUE = [
  { glyph: "Go", bg: "#00add8", fg: "#fff", name: "Go", detail: "ext.go · gopls, Delve" },
  { glyph: "Rs", bg: "#dea584", fg: "#2b1d10", name: "Rust", detail: "ext.rust · rust-analyzer, CodeLLDB" },
  { glyph: "⚛", bg: "#61dafb", fg: "#06202b", name: "React", detail: "ext.react · JSX tokenizer, Vite template" },
  { glyph: "V", bg: "#42b883", fg: "#fff", name: "Vue", detail: "ext.vue · SFC highlighting" },
  { glyph: "⌘", bg: "#cbcb41", fg: "#1d1d05", name: "Essentials", detail: "ext.essentials · JSON, YAML, TOML, Markdown, Shell, SQL" },
];

function Addons() {
  return (
    <Section id="addons">
      <div className="grid items-center gap-[clamp(32px,5vw,64px)] lg:grid-cols-2">
        <div>
          <Head eyebrow="Add-ons" title="A language is one object.">
            No plugin API, no lifecycle, nothing to register. An add-on is an object with optional fields — languages, project kinds, templates, themes, icon packs, snippets, commands. Put it in a list and it is there.
          </Head>
          <div className="mt-[34px] grid gap-5">
            <Point title="Or draw it instead">The add-on studio edits the same model as JSON and wires commands as node graphs: branches, loops, variables, text and shell steps, run by an interpreter with a step limit.</Point>
            <Point title="Nothing built in has a privilege yours does not">The languages that ship with Lumen are written exactly this way. There is no second, richer interface reserved for the editor's own.</Point>
          </div>
        </div>
        <Snippet />
      </div>

      <div className="mt-[clamp(46px,6vw,76px)] grid items-center gap-[clamp(32px,5vw,64px)] lg:grid-cols-2">
        <div className="order-2 grid gap-2.5 lg:order-1">
          {CATALOGUE.map((ext) => (
            <div key={ext.name} className="grid grid-cols-[34px_minmax(0,1fr)] items-center gap-3 rounded-xl border border-edge bg-surface px-4 py-3">
              <i className="grid size-[34px] place-items-center rounded-lg font-display text-[13px] font-bold not-italic" style={{ background: ext.bg, color: ext.fg }}>
                {ext.glyph}
              </i>
              <span className="min-w-0">
                <b className="block text-[15.5px] font-semibold">{ext.name}</b>
                <small className="block truncate font-mono text-[11.5px] text-subtle">{ext.detail}</small>
              </span>
            </div>
          ))}
        </div>
        <div className="order-1 lg:order-2">
          <Head eyebrow="Extensions" title="Data, never code.">
            Extensions come from a server as a manifest. A hostile one can define a language badly or ship an ugly page — it cannot reach your files, your network or your shell, because there is no code in it to run.
          </Head>
          <div className="mt-[34px] grid gap-5">
            <Point title="One vetted server, and any you add">
              Eighteen extensions are published at{" "}
              <a className="text-accent underline-offset-2 hover:underline" href="https://lumen-extensions.eztxm.de">
                lumen-extensions.eztxm.de
              </a>
              . Point Lumen at another and it names the host before anything is installed.
            </Point>
            <Point title="Run your own in one command">The server is Node and no dependencies at all — no database, no web server in front. Without a token it stays read-only, so nothing you start to try it out is open to strangers.</Point>
          </div>
        </div>
      </div>
    </Section>
  );
}

function GetIt({ version, date, notes }: { version?: string; date?: string; notes?: string }) {
  return (
    <div className="field">
      <Wrap className="grid justify-items-center gap-5 py-[clamp(58px,8vw,90px)] text-center">
        <span className="eyebrow text-[#9aa8d8]">Download</span>
        <h2 className="text-[clamp(27px,3.6vw,40px)] font-bold text-[#f2f4fa]">{version ? `Lumen ${version}` : "Lumen"}</h2>
        <p className="max-w-[56ch] text-[#aab2c6]">Free, no account, and it keeps itself up to date — a new AppImage is swapped in beside the running one, the Windows installer runs quietly, and on macOS the bundle is replaced once you quit.</p>
        {(date || notes) && (
          <p className="flex flex-wrap justify-center gap-x-4 gap-y-1 font-mono text-[12px] text-[#737d9c]">
            {date && <span>Released {formatDate(date)}</span>}
            {notes && <span>{notes}</span>}
          </p>
        )}
        <div className="mt-2">
          <DownloadCta secondary={{ to: "/download", label: "All packages & checksums" }} />
        </div>
      </Wrap>
    </div>
  );
}
