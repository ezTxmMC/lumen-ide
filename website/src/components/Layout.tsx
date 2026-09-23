import { useEffect } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router";
import { useSiteTheme } from "@/lib/theme";
import { RELEASE_URL, useRelease } from "@/lib/release";
import { Logo } from "./Logo";

const SECTIONS = [
  { hash: "#editing", label: "Editing" },
  { hash: "#workbench", label: "Workbench" },
  { hash: "#projects", label: "Projects" },
  { hash: "#themes", label: "Themes" },
  { hash: "#addons", label: "Add-ons" },
];

/** On navigation: to the anchor when there is one, otherwise to the top. */
function useScrollOnNavigate() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (!hash) {
      window.scrollTo(0, 0);
      return;
    }
    const target = document.getElementById(hash.slice(1));
    target?.scrollIntoView();
  }, [pathname, hash]);
}

export function Layout() {
  useScrollOnNavigate();
  const { dark, toggle } = useSiteTheme();
  const { release } = useRelease();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky z-30 border-b border-edge backdrop-blur-md" style={{ top: "env(safe-area-inset-top, 0px)", background: "color-mix(in srgb, var(--c-bg) 88%, transparent)" }}>
        <div className="mx-auto flex h-[62px] max-w-[1248px] items-center gap-6 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5 font-display text-[19px] font-bold tracking-[-0.03em] no-underline">
            <Logo />
            Lumen
          </Link>
          <nav className="ml-auto hidden items-center gap-[22px] text-[15px] text-muted md:flex">
            {SECTIONS.map((section) => (
              <Link key={section.hash} to={{ pathname: "/", hash: section.hash }} className="hover:text-fg">
                {section.label}
              </Link>
            ))}
            <NavLink to="/download" className={({ isActive }) => (isActive ? "text-fg" : "hover:text-fg")}>
              Download
            </NavLink>
          </nav>
          <Link to="/download" className="ml-auto rounded-lg bg-accent px-3 py-1.5 text-[14px] font-semibold text-accent-fg md:hidden">
            Download
          </Link>
          <button type="button" onClick={toggle} className="cursor-pointer rounded-full border border-edge-strong px-3 py-1 font-mono text-[11.5px] text-muted hover:border-accent hover:text-fg" aria-label={`Switch to the ${dark ? "light" : "dark"} theme`}>
            {dark ? "Dark" : "Light"}
          </button>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-edge bg-bg" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        <div className="mx-auto flex max-w-[1248px] flex-wrap items-center gap-x-5 gap-y-2 px-4 py-6 font-mono text-[12px] text-subtle sm:px-6">
          <span>Lumen {release?.version ?? ""}</span>
          <span>Electron · CodeMirror 6 · React</span>
          <a className="text-muted hover:text-fg" href="https://lumen-extensions.eztxm.de">
            Extensions
          </a>
          <a className="text-muted hover:text-fg" href={RELEASE_URL}>
            latest.json
          </a>
          <span className="sm:ml-auto">by ezTxmMC · AGPL-3.0</span>
        </div>
      </footer>
    </div>
  );
}
