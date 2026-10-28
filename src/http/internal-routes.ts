import type http from "node:http";

import type { AdapterConfig } from "../config.js";
import type { DiscordBotRest } from "../discord/bot-rest.js";
import { timingSafeBearerMatch } from "../security/bearer-auth.js";

const GUILD_SNOWFLAKE = /^\d{17,20}$/;

const LEAVE_PATH = /^\/internal\/guilds\/(\d{17,20})\/leave$/;
const ROLES_PATH = /^\/internal\/guilds\/(\d{17,20})\/roles$/;

function json(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function authorizeInternal(req: http.IncomingMessage, config: AdapterConfig): boolean {
  const authHeader = req.headers.authorization?.toString() ?? null;
  if (!config.adapterInternalToken) {
    return false;
  }
  return timingSafeBearerMatch(authHeader, config.adapterInternalToken);
}

/** Handle CP→adapter internal routes (docker network listener only). */
export async function handleInternalRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: string,
  config: AdapterConfig,
  bot: DiscordBotRest | undefined,
): Promise<boolean> {
  if (!url.startsWith("/internal/")) {
    return false;
  }

  if (!authorizeInternal(req, config)) {
    json(res, 401, { error: "unauthorized" });
    return true;
  }

  if (!bot) {
    json(res, 503, { error: "bot_not_configured" });
    return true;
  }

  const leaveMatch = url.match(LEAVE_PATH);
  if (req.method === "POST" && leaveMatch) {
    const guildId = leaveMatch[1]!;
    if (!GUILD_SNOWFLAKE.test(guildId)) {
      json(res, 400, { error: "invalid_guild_id" });
      return true;
    }
    const result = await bot.leaveGuild(guildId);
    if (result.ok) {
      json(res, 200, { ok: true });
      return true;
    }
    json(res, result.status === 404 ? 404 : 502, { error: "discord_leave_failed", status: result.status });
    return true;
  }

  const rolesMatch = url.match(ROLES_PATH);
  if (req.method === "GET" && rolesMatch) {
    const guildId = rolesMatch[1]!;
    if (!GUILD_SNOWFLAKE.test(guildId)) {
      json(res, 400, { error: "invalid_guild_id" });
      return true;
    }
    const result = await bot.listGuildRoles(guildId);
    if (result.ok) {
      json(res, 200, { roles: result.roles });
      return true;
    }
    json(res, result.status === 404 ? 404 : 502, { error: "discord_roles_failed", status: result.status });
    return true;
  }

  json(res, 404, { error: "not_found" });
  return true;
}
