import { describe, expect, it, vi } from "vitest";

import { createConfig } from "../src/config.js";
import type {
  AskPollInput,
  AskPollResult,
  ControlPlaneClient,
  FanQueryInput,
  FanQueryResult,
} from "../src/cp/client.js";
import { CP_ERROR_COPY, FAN_QUERY_GENERIC_ERROR } from "../src/cp/error-map.js";
import { createInteractionHandler } from "../src/interactions/handler.js";
import { InteractionIdempotency } from "../src/interactions/idempotency.js";
import { PostToChannelCache } from "../src/interactions/post-cache.js";
import type { InteractionPayload } from "../src/interactions/types.js";
import { FixedWindowBucket, GuildRateLimiter, ProcessRpsLimiter } from "../src/rate-limit/buckets.js";

function slashAskInteraction(id: string): InteractionPayload {
  return {
    type: 2,
    id,
    token: "interaction-token",
    guild_id: "9876543210987654321",
    data: {
      name: "ember",
      options: [{ name: "ask", type: 1, options: [{ name: "query", type: 3, value: "who hosts?" }] }],
    },
    member: { roles: [], user: { id: "111" } },
  };
}

function slashSearchInteraction(id: string): InteractionPayload {
  return {
    type: 2,
    id,
    token: "interaction-token",
    guild_id: "9876543210987654321",
    data: {
      name: "ember",
      options: [{ name: "search", type: 1, options: [{ name: "query", type: 3, value: "hello" }] }],
    },
    member: { roles: [], user: { id: "111" } },
  };
}

function handlerDeps(cp: ControlPlaneClient, fetchImpl: typeof fetch) {
  const config = createConfig({
    discordApplicationId: "417719114458901252",
    guildLimitPerMin: 1000,
    guildBurst: 1000,
    processRps: 1000,
  });
  return {
    config,
    cp,
    unsignedIpBucket: new FixedWindowBucket(1000, 60_000),
    guildLimiter: new GuildRateLimiter(1000, 1000),
    processLimiter: new ProcessRpsLimiter(1000),
    idempotency: new InteractionIdempotency(60_000),
    postCache: new PostToChannelCache(),
    fetchImpl,
  };
}

describe("runDeferredCommand via createInteractionHandler", () => {
  it("PATCHes not-linked copy when fan-query returns 404", async () => {
    const cp: ControlPlaneClient = {
      async fanQuery(_input: FanQueryInput): Promise<FanQueryResult> {
        return {
          ok: false,
          status: 404,
          code: "discord_not_linked",
          message: "missing binding",
        };
      },
      async pollAskJob(_input: AskPollInput): Promise<AskPollResult> {
        throw new Error("poll should not run");
      },
      async recordDiscordShare() {
        throw new Error("share should not run");
      },
    };
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response("", { status: 200 }));
    const handle = createInteractionHandler(handlerDeps(cp, fetchImpl));

    await handle({
      rawBody: Buffer.from("{}"),
      clientIp: "127.0.0.1",
      parsed: slashSearchInteraction("1111111111111111111"),
    });
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalled());

    const body = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body));
    expect(body.content).toBe(CP_ERROR_COPY.discord_not_linked);
    expect(body.allowed_mentions).toEqual({ parse: [] });
    expect(body.components).toBeUndefined();
  });

  it("PATCHes generic copy when fan-query throws", async () => {
    const cp: ControlPlaneClient = {
      async fanQuery(_input: FanQueryInput): Promise<FanQueryResult> {
        throw new Error("network down");
      },
      async pollAskJob(_input: AskPollInput): Promise<AskPollResult> {
        throw new Error("poll should not run");
      },
      async recordDiscordShare() {
        throw new Error("share should not run");
      },
    };
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response("", { status: 200 }));
    const handle = createInteractionHandler(handlerDeps(cp, fetchImpl));

    await handle({
      rawBody: Buffer.from("{}"),
      clientIp: "127.0.0.1",
      parsed: slashSearchInteraction("2222222222222222222"),
    });
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalled());

    const body = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body));
    expect(body.content).toBe(FAN_QUERY_GENERIC_ERROR);
  });

  it("polls CP after fan-query 202 and PATCHes completed ask embed", async () => {
    const cp: ControlPlaneClient = {
      async fanQuery(_input: FanQueryInput): Promise<FanQueryResult> {
        return { ok: true, status: 202, askJobId: "job-1" };
      },
      async pollAskJob(input: AskPollInput): Promise<AskPollResult> {
        expect(input.interactionId).toBe("4444444444444444444");
        return {
          ok: true,
          status: "completed",
          body: { status: "completed", answer: "Poll answer.", citations: [] },
        };
      },
      async recordDiscordShare() {
        return { ok: true };
      },
    };
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response("", { status: 200 }));
    const handle = createInteractionHandler(handlerDeps(cp, fetchImpl));

    await handle({
      rawBody: Buffer.from("{}"),
      clientIp: "127.0.0.1",
      parsed: slashAskInteraction("4444444444444444444"),
    });
    await vi.waitFor(() => expect(fetchImpl.mock.calls.length).toBeGreaterThanOrEqual(2));

    const lastBody = JSON.parse(String(fetchImpl.mock.calls.at(-1)?.[1]?.body));
    expect(lastBody.embeds?.[0]?.description).toContain("Poll answer.");
  });
});
