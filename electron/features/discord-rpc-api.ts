/** The preload bridge for Discord rich presence. */

import { invoke, subscribe } from './ipc'
import type { DiscordActivity, DiscordStatus } from './discord-ipc'

export type { DiscordActivity, DiscordStatus }

export const discordApi = {
  /** Set the activity; `null` or an empty client id clears it and disconnects. */
  set: (clientId: string, activity: DiscordActivity | null): Promise<DiscordStatus> =>
    invoke('discord:set', clientId, activity),
  status: (): Promise<DiscordStatus> => invoke('discord:status'),
  reconnect: (): Promise<DiscordStatus> => invoke('discord:reconnect'),
  onStatus: (cb: (status: DiscordStatus) => void) => subscribe('discord:status', cb),
}
