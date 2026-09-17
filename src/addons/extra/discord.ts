/**
 * Discord rich presence: shows in Discord what is being worked on (the file,
 * the project, the language, how long). The connection to the local Discord
 * client is held by the main process (`electron/features/discord-rpc.ts`).
 *
 * Off by default, because data goes to a third party. Discord needs an
 * application of its own (discord.com/developers) — its id goes into the
 * add-on's settings, and the images are named after the language ids plus
 * `lumen`.
 */

import type { Addon, AddonContext, Command, FormValues } from "@/core/types";
import { t } from "@/i18n";
import type {
  DiscordActivity,
  DiscordStatus,
} from "../../../electron/features/discord-ipc";

const CATEGORY = "Discord";
/** A short rest, so that typing or switching tabs quickly does not send every time. */
const DEBOUNCE_MS = 600;

interface DiscordSettings {
  clientId: string;
  showFileName: boolean;
  showProject: boolean;
  showLanguage: boolean;
  showElapsed: boolean;
  idleText: string;
}

const DEFAULTS: DiscordSettings = {
  clientId: "1550197013260275863",
  showFileName: true,
  showProject: true,
  showLanguage: true,
  showElapsed: true,
  idleText: "",
};

type StoreModule = typeof import("@/state/store");
type StoreState = ReturnType<StoreModule["useStore"]["getState"]>;

/* ------------------------------------------------------------------ *
 * Settings
 * ------------------------------------------------------------------ */

function loadSettings(ctx: AddonContext): DiscordSettings {
  const read = <K extends keyof DiscordSettings>(
    key: K,
  ): DiscordSettings[K] => {
    const value = ctx.storage.get<unknown>(key, DEFAULTS[key]);
    if (typeof value !== typeof DEFAULTS[key]) return DEFAULTS[key];
    return value as DiscordSettings[K];
  };
  return {
    clientId: read("clientId").trim(),
    showFileName: read("showFileName"),
    showProject: read("showProject"),
    showLanguage: read("showLanguage"),
    showElapsed: read("showElapsed"),
    idleText: read("idleText"),
  };
}

function saveSettings(ctx: AddonContext, settings: DiscordSettings) {
  for (const key of Object.keys(settings) as (keyof DiscordSettings)[]) {
    ctx.storage.set(key, settings[key]);
  }
}

/* ------------------------------------------------------------------ *
 * The activity
 * ------------------------------------------------------------------ */

const baseName = (dir: string) =>
  dir.split(/[\\/]/).filter(Boolean).pop() ?? dir;

/** A Discord asset key: lower case, letters, digits and `_` alone. */
const assetKey = (id: string) => id.toLowerCase().replace(/[^a-z0-9_]/g, "_");

function projectName(state: StoreState): string | null {
  if (state.project?.name) return state.project.name;
  if (state.workspace) return baseName(state.workspace);
  return null;
}

function buildActivity(
  state: StoreState,
  settings: DiscordSettings,
  version: string,
  start: number,
): DiscordActivity {
  const tab = state.activeTab();
  const activity: DiscordActivity = {};
  const lumenText = t("discord.activity.version", { version });

  activity.details = settings.idleText.trim() || t("discord.activity.idle");
  if (tab && settings.showFileName) {
    activity.details = t("discord.activity.editing", { file: tab.name });
  }
  if (tab && !settings.showFileName) {
    activity.details = t("discord.activity.editingHidden");
  }

  const project = projectName(state);
  if (project && settings.showProject) {
    activity.state = t("discord.activity.project", { project });
  }
  if (settings.showElapsed) activity.timestamps = { start };

  activity.assets = { large_image: "lumen", large_text: lumenText };
  const language = tab && settings.showLanguage ? state.languageFor(tab) : null;
  if (!language) return activity;
  activity.assets = {
    large_image: assetKey(language.id),
    large_text: language.name,
    small_image: "lumen",
    small_text: lumenText,
  };
  return activity;
}

/* ------------------------------------------------------------------ *
 * The add-on
 * ------------------------------------------------------------------ */

class Presence {
  private settings: DiscordSettings;
  private readonly startedAt = Date.now();
  private version = "";
  private store: StoreModule["useStore"] | null = null;
  private lastJson: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private cleanups: (() => void)[] = [];
  /** Does the next connection announce itself in a toast (after a command or a save)? */
  private announce = false;
  private lastError = "";
  private hintShown = false;
  private status: DiscordStatus = { state: "disconnected" };

  constructor(private readonly ctx: AddonContext) {
    this.settings = loadSettings(ctx);
  }

  private get bridge() {
    return typeof window === "undefined" ? undefined : window.lumen?.discord;
  }

  async start() {
    const bridge = this.bridge;
    if (!bridge) return;
    this.cleanups.push(bridge.onStatus((status) => this.onStatus(status)));
    const [{ useStore }, info] = await Promise.all([
      // Load only here: the store imports the add-on directory itself.
      import("@/state/store"),
      window.lumen.app.info().catch(() => null),
    ]);
    if (this.disposed) return;
    this.version = info?.version ?? "";
    this.store = useStore;
    this.cleanups.push(useStore.subscribe(() => this.schedule()));
    this.push();
  }

  dispose() {
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
    for (const cleanup of this.cleanups) cleanup();
    this.cleanups = [];
    void this.bridge?.set("", null).catch(() => {});
  }

  current(): DiscordSettings {
    return this.settings;
  }

  update(settings: DiscordSettings) {
    saveSettings(this.ctx, settings);
    this.settings = settings;
    // Where the connection already stands, no new “connected” arrives — then announce nothing.
    this.announce = this.status.state !== "connected";
    this.lastError = "";
    this.push(true);
  }

  async reconnect() {
    const bridge = this.bridge;
    if (!bridge) return;
    if (!this.settings.clientId) {
      this.ctx.notify(t("discord.toast.missingClientId"), "info");
      return;
    }
    this.announce = true;
    this.lastError = "";
    this.ctx.notify(t("discord.toast.connecting"), "info");
    this.push(true);
    await bridge.reconnect().catch(() => {});
  }

  private schedule() {
    if (this.timer || this.disposed) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.push();
    }, DEBOUNCE_MS);
  }

  private push(force = false) {
    const bridge = this.bridge;
    if (!bridge || !this.store || this.disposed) return;
    if (!this.settings.clientId) {
      if (this.lastJson === "" && !force) return;
      // Empty text = the display has been cleared.
      this.lastJson = "";
      void bridge.set("", null).catch(() => {});
      if (this.hintShown) return;
      this.hintShown = true;
      this.ctx.notify(t("discord.toast.missingClientId"), "info");
      return;
    }
    const activity = buildActivity(
      this.store.getState(),
      this.settings,
      this.version,
      this.startedAt,
    );
    const json = JSON.stringify(activity);
    if (json === this.lastJson && !force) return;
    this.lastJson = json;
    void bridge.set(this.settings.clientId, activity).catch(() => {});
  }

  private onStatus(status: DiscordStatus) {
    if (this.disposed) return;
    this.status = status;
    if (status.state === "connected" && this.announce) {
      this.announce = false;
      this.ctx.notify(
        t(
          status.user ? "discord.toast.connectedAs" : "discord.toast.connected",
          { user: status.user ?? "" },
        ),
        "success",
      );
      return;
    }
    if (
      status.state !== "error" || !status.message ||
      status.message === this.lastError
    ) return;
    this.lastError = status.message;
    this.ctx.notify(
      t("discord.toast.error", { message: status.message }),
      "warning",
    );
  }
}

/* ------------------------------------------------------------------ *
 * Commands
 * ------------------------------------------------------------------ */

const bool = (value: string | undefined) => value === "true";

function settingsCommand(presence: Presence): Command {
  return {
    id: "discord.settings",
    get title() {
      return t("discord.command.settings");
    },
    category: CATEGORY,
    async run() {
      const { useStore } = await import("@/state/store");
      const settings = presence.current();
      const initial: FormValues = {
        clientId: settings.clientId,
        showFileName: String(settings.showFileName),
        showProject: String(settings.showProject),
        showLanguage: String(settings.showLanguage),
        showElapsed: String(settings.showElapsed),
        idleText: settings.idleText,
      };
      useStore.getState().openForm({
        title: t("discord.form.title"),
        description: t("discord.form.description"),
        submitLabel: t("discord.form.submit"),
        initial,
        fields: [
          {
            id: "clientId",
            label: t("discord.form.clientId"),
            hint: t("discord.form.clientIdHint"),
            placeholder: "123456789012345678",
            pattern: "\\d{15,22}",
            patternHint: t("discord.form.clientIdInvalid"),
            required: false,
            mono: true,
          },
          {
            id: "showFileName",
            label: t("discord.form.showFileName"),
            type: "toggle",
            section: t("discord.form.privacy"),
          },
          {
            id: "showProject",
            label: t("discord.form.showProject"),
            type: "toggle",
            section: t("discord.form.privacy"),
          },
          {
            id: "showLanguage",
            label: t("discord.form.showLanguage"),
            type: "toggle",
            section: t("discord.form.privacy"),
          },
          {
            id: "showElapsed",
            label: t("discord.form.showElapsed"),
            type: "toggle",
            section: t("discord.form.privacy"),
          },
          {
            id: "idleText",
            label: t("discord.form.idleText"),
            placeholder: t("discord.activity.idle"),
            hint: t("discord.form.idleTextHint"),
            required: false,
          },
        ],
        onSubmit(values) {
          presence.update({
            clientId: (values.clientId ?? "").trim(),
            showFileName: bool(values.showFileName),
            showProject: bool(values.showProject),
            showLanguage: bool(values.showLanguage),
            showElapsed: bool(values.showElapsed),
            idleText: (values.idleText ?? "").trim(),
          });
        },
      });
    },
  };
}

function reconnectCommand(presence: Presence): Command {
  return {
    id: "discord.reconnect",
    get title() {
      return t("discord.command.reconnect");
    },
    category: CATEGORY,
    run: () => presence.reconnect(),
  };
}

function toggleFileNamesCommand(
  ctx: AddonContext,
  presence: Presence,
): Command {
  return {
    id: "discord.toggleFileNames",
    get title() {
      if (presence.current().showFileName) {
        return t("discord.command.hideFileNames");
      }
      return t("discord.command.showFileNames");
    },
    category: CATEGORY,
    run() {
      const settings = presence.current();
      const showFileName = !settings.showFileName;
      presence.update({ ...settings, showFileName });
      ctx.notify(
        t(
          showFileName
            ? "discord.toast.fileNamesShown"
            : "discord.toast.fileNamesHidden",
        ),
        "info",
      );
    },
  };
}

export const discordAddon: Addon = {
  id: "tool.discord",
  name: "Discord Rich Presence",
  version: "1.0.0",
  get description() {
    return t("discord.addon.description");
  },
  author: "Lumen",
  icon: "DC",
  category: "tool",
  activate(ctx) {
    const presence = new Presence(ctx);
    ctx.registerCommand(settingsCommand(presence));
    ctx.registerCommand(reconnectCommand(presence));
    ctx.registerCommand(toggleFileNamesCommand(ctx, presence));
    void presence.start();
    return () => presence.dispose();
  },
};
