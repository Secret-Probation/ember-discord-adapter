/** Discord REST calls that require the bot token (SPEC §6, §7.2). */

const DISCORD_API = "https://discord.com/api/v10";

export type GuildRoleSummary = {
  id: string;
  name: string;
};

export type DiscordBotRest = {
  leaveGuild(guildId: string): Promise<{ ok: true } | { ok: false; status: number }>;
  listGuildRoles(
    guildId: string,
  ): Promise<{ ok: true; roles: GuildRoleSummary[] } | { ok: false; status: number }>;
};

type DiscordRolePayload = {
  id: string;
  name: string;
};

function botHeaders(botToken: string): HeadersInit {
  return {
    Authorization: `Bot ${botToken}`,
    "User-Agent": "ember-discord-adapter (Secret Probation)",
  };
}

/** Live Discord bot REST client. */
export function createDiscordBotRest(botToken: string, fetchImpl: typeof fetch = fetch): DiscordBotRest {
  return {
    async leaveGuild(guildId: string) {
      const res = await fetchImpl(`${DISCORD_API}/users/@me/guilds/${guildId}`, {
        method: "DELETE",
        headers: botHeaders(botToken),
      });
      if (res.status === 204 || res.status === 200) {
        return { ok: true };
      }
      return { ok: false, status: res.status };
    },

    async listGuildRoles(guildId: string) {
      const res = await fetchImpl(`${DISCORD_API}/guilds/${guildId}/roles`, {
        method: "GET",
        headers: botHeaders(botToken),
      });
      if (!res.ok) {
        return { ok: false, status: res.status };
      }
      const raw = (await res.json()) as DiscordRolePayload[];
      const roles = raw.map((r) => ({ id: String(r.id), name: String(r.name) }));
      return { ok: true, roles };
    },
  };
}
