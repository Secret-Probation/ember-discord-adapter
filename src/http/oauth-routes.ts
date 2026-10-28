import type http from "node:http";

import type { AdapterConfig } from "../config.js";
import type { ControlPlaneClient } from "../cp/client.js";
import type { DiscordBotRest } from "../discord/bot-rest.js";
import { buildDiscordAuthorizeUrl, exchangeOAuthCode } from "../discord/oauth.js";
import type { FixedWindowBucket } from "../rate-limit/buckets.js";

export type OAuthRouteDeps = {
  config: AdapterConfig;
  cp: ControlPlaneClient;
  bot: DiscordBotRest;
  oauthIpBucket: FixedWindowBucket;
  clientIp: (req: http.IncomingMessage) => string;
  fetchImpl?: typeof fetch;
};

function parseQuery(req: http.IncomingMessage): URLSearchParams {
  const raw = req.url ?? "";
  const qIndex = raw.indexOf("?");
  if (qIndex === -1) {
    return new URLSearchParams();
  }
  return new URLSearchParams(raw.slice(qIndex + 1));
}

function oauthRateLimit(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  bucket: FixedWindowBucket,
  clientIp: (req: http.IncomingMessage) => string,
): boolean {
  const cap = bucket.consume(clientIp(req));
  if (!cap.allowed) {
    res.writeHead(429, {
      "Content-Type": "application/json",
      "Retry-After": String(cap.retryAfterSec),
    });
    res.end(JSON.stringify({ error: "rate_limited" }));
    return false;
  }
  return true;
}

function badRequest(res: http.ServerResponse, message: string): void {
  res.writeHead(400, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "invalid_oauth", message }));
}

/** GET /oauth/start — CP pre-flight then redirect to Discord (SPEC §6 step 2). */
export async function handleOAuthStart(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  deps: OAuthRouteDeps,
): Promise<void> {
  if (!oauthRateLimit(req, res, deps.oauthIpBucket, deps.clientIp)) {
    return;
  }

  const state = parseQuery(req).get("state")?.trim() ?? "";
  if (!state) {
    badRequest(res, "Missing state");
    return;
  }

  if (!deps.config.discordOAuthRedirectUri || !deps.config.discordApplicationId) {
    badRequest(res, "OAuth is not configured");
    return;
  }

  const validated = await deps.cp.validateOAuthState(state, deps.fetchImpl);
  if (!validated.ok) {
    badRequest(res, validated.message);
    return;
  }

  const location = buildDiscordAuthorizeUrl({
    clientId: deps.config.discordApplicationId,
    redirectUri: deps.config.discordOAuthRedirectUri,
    state,
  });
  res.writeHead(302, { Location: location });
  res.end();
}

/** GET /oauth/callback — exchange code, pending binding, redirect to CP confirm (SPEC §6 step 3). */
export async function handleOAuthCallback(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  deps: OAuthRouteDeps,
): Promise<void> {
  if (!oauthRateLimit(req, res, deps.oauthIpBucket, deps.clientIp)) {
    return;
  }

  const query = parseQuery(req);
  if (query.get("error")) {
    badRequest(res, "Discord authorization was denied");
    return;
  }

  const state = query.get("state")?.trim() ?? "";
  const code = query.get("code")?.trim() ?? "";
  const guildId = query.get("guild_id")?.trim() ?? "";
  const permissions = query.get("permissions")?.trim() ?? "";

  if (!state || !code || !guildId) {
    badRequest(res, "Missing OAuth callback parameters");
    return;
  }

  if (!deps.config.discordOAuthConfirmUrl) {
    badRequest(res, "OAuth confirm URL is not configured");
    return;
  }

  if (
    !deps.config.discordClientSecret ||
    !deps.config.discordOAuthRedirectUri ||
    !deps.config.discordApplicationId
  ) {
    badRequest(res, "OAuth is not configured");
    return;
  }

  const tokenResult = await exchangeOAuthCode({
    clientId: deps.config.discordApplicationId,
    clientSecret: deps.config.discordClientSecret,
    redirectUri: deps.config.discordOAuthRedirectUri,
    code,
    fetchImpl: deps.fetchImpl,
  });
  if (!tokenResult.ok) {
    badRequest(res, "Failed to exchange authorization code");
    return;
  }
  // Discard access token immediately — guild name uses bot token only (SPEC §6).
  void tokenResult.accessToken;

  const guild = await deps.bot.getGuild(guildId);
  if (!guild.ok) {
    badRequest(res, "Failed to load guild name from Discord");
    return;
  }

  const binding = await deps.cp.createPendingBinding(
    {
      state,
      guildId,
      guildName: guild.name,
      permissions: permissions || undefined,
    },
    deps.fetchImpl,
  );
  if (!binding.ok) {
    badRequest(res, binding.message);
    return;
  }

  res.writeHead(302, { Location: deps.config.discordOAuthConfirmUrl });
  res.end();
}
