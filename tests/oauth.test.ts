import http from "node:http";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createConfig } from "../src/config.js";
import { HttpControlPlaneClient, StubControlPlaneClient } from "../src/cp/client.js";
import type { DiscordBotRest } from "../src/discord/bot-rest.js";
import { DISCORD_INSTALL_PERMISSIONS } from "../src/discord/oauth.js";
import { createHttpServer } from "../src/http/server.js";

const GUILD_ID = "417719114458901252";
const STATE = "oauth-state-nonce-abc";
const CONFIRM_URL = "https://app.example.com/discord/confirm";
const REDIRECT_URI = "https://adapter.example/oauth/callback";
const APP_ID = "417719114458901252";

function request(
  server: http.Server,
  opts: { method: string; path: string; headers?: Record<string, string> },
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const addr = server.address();
    if (!addr || typeof addr === "string") {
      reject(new Error("no address"));
      return;
    }
    const req = http.request(
      {
        host: "127.0.0.1",
        port: addr.port,
        method: opts.method,
        path: opts.path,
        headers: opts.headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(Buffer.from(c)));
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

describe("OAuth routes", () => {
  let server: http.Server;
  let cp: StubControlPlaneClient;
  let bot: DiscordBotRest;
  let fetchImpl: ReturnType<typeof vi.fn<typeof fetch>>;

  const config = createConfig({
    discordApplicationId: APP_ID,
    discordClientSecret: "client-secret",
    discordOAuthRedirectUri: REDIRECT_URI,
    discordOAuthConfirmUrl: CONFIRM_URL,
    discordPublicKey: "",
    cpServiceBearer: "service-bearer",
    oauthIpLimitPerMin: 100,
  });

  afterEach(() => {
    server?.close();
    vi.restoreAllMocks();
  });

  function startServer(): void {
    cp = new StubControlPlaneClient();
    bot = {
      leaveGuild: vi.fn(),
      getGuild: vi.fn().mockResolvedValue({ ok: true, name: "Podcast Guild" }),
      listGuildRoles: vi.fn(),
    };
    fetchImpl = vi.fn<typeof fetch>();
    server = createHttpServer({ config, cp, bot, fetchImpl });
    server.listen(0);
  }

  it("returns 400 and does not redirect when CP rejects OAuth state", async () => {
    startServer();
    cp.oauthStateResult = { ok: false, message: "OAuth state is unknown, expired, or already used" };

    const res = await request(server, {
      method: "GET",
      path: `/oauth/start?state=${encodeURIComponent(STATE)}`,
    });

    expect(res.status).toBe(400);
    expect(res.headers.location).toBeUndefined();
    expect(cp.oauthStateCalls).toEqual([STATE]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("redirects to Discord authorize when CP validates state", async () => {
    startServer();

    const res = await request(server, {
      method: "GET",
      path: `/oauth/start?state=${encodeURIComponent(STATE)}`,
    });

    expect(res.status).toBe(302);
    const location = String(res.headers.location);
    expect(location).toContain("https://discord.com/oauth2/authorize");
    expect(location).toContain(`client_id=${APP_ID}`);
    expect(location).toContain(`permissions=${DISCORD_INSTALL_PERMISSIONS}`);
    expect(location).toContain(encodeURIComponent(REDIRECT_URI));
    expect(location).toContain(encodeURIComponent(STATE));
    expect(cp.oauthStateCalls).toEqual([STATE]);
  });

  it("callback redirects to configured confirm URL without sending bot token to CP", async () => {
    startServer();
    fetchImpl.mockResolvedValue(
      new Response(JSON.stringify({ access_token: "discard-me" }), { status: 200 }),
    );

    const res = await request(server, {
      method: "GET",
      path: `/oauth/callback?code=auth-code&state=${encodeURIComponent(STATE)}&guild_id=${GUILD_ID}&permissions=19456`,
    });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(CONFIRM_URL);
    expect(cp.bindingCalls).toEqual([
      {
        state: STATE,
        guildId: GUILD_ID,
        guildName: "Podcast Guild",
        permissions: "19456",
      },
    ]);
    expect(bot.getGuild).toHaveBeenCalledWith(GUILD_ID);

    const bindingFetch = fetchImpl.mock.calls.find((call) =>
      String(call[0]).includes("/api/internal/discord/bindings"),
    );
    expect(bindingFetch).toBeUndefined();

    const tokenCall = fetchImpl.mock.calls[0];
    expect(String(tokenCall?.[0])).toContain("discord.com/api/oauth2/token");
    const tokenBody = String(tokenCall?.[1]?.body);
    expect(tokenBody).not.toContain("Bot ");
  });

  it("returns 400 when Discord denies authorization", async () => {
    startServer();

    const res = await request(server, {
      method: "GET",
      path: `/oauth/callback?error=access_denied&state=${encodeURIComponent(STATE)}`,
    });

    expect(res.status).toBe(400);
    expect(cp.bindingCalls).toHaveLength(0);
  });
});

describe("HttpControlPlaneClient OAuth", () => {
  it("maps CP 404 on state lookup to invalid state", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response("", { status: 404 }));
    const client = new HttpControlPlaneClient("https://cp.example", "bearer");
    const result = await client.validateOAuthState("bad-state", fetchImpl);
    expect(result).toEqual({
      ok: false,
      message: "OAuth state is unknown, expired, or already used",
    });
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain("/oauth/state/bad-state");
  });

  it("POSTs bindings without bot token", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ status: "pending" }), { status: 200 }));
    const client = new HttpControlPlaneClient("https://cp.example", "bearer");
    const result = await client.createPendingBinding(
      {
        state: "s1",
        guildId: GUILD_ID,
        guildName: "Guild",
        permissions: "19456",
      },
      fetchImpl,
    );
    expect(result).toEqual({ ok: true });
    const init = fetchImpl.mock.calls[0]?.[1];
    expect(init?.headers).toMatchObject({ Authorization: "Bearer bearer" });
    const body = JSON.parse(String(init?.body)) as Record<string, string>;
    expect(body).toEqual({
      state: "s1",
      guild_id: GUILD_ID,
      guild_name: "Guild",
      permissions: "19456",
    });
    expect(JSON.stringify(body)).not.toContain("Bot ");
  });
});
