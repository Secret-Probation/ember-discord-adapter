import { describe, expect, it, vi, beforeEach } from "vitest";

import { createConfig } from "../src/config.js";
import type { ControlPlaneClient, DiscordShareInput, FanQueryInput, FanQueryResult } from "../src/cp/client.js";
import { postCustomId } from "../src/format/embed.js";
import {
  POST_CACHE_MISS_MESSAGE,
  POST_CHANNEL_FORBIDDEN_MESSAGE,
  createInteractionHandler,
} from "../src/interactions/handler.js";
import { InteractionIdempotency } from "../src/interactions/idempotency.js";
import { PostToChannelCache } from "../src/interactions/post-cache.js";
import type { InteractionPayload } from "../src/interactions/types.js";
import { postToChannelTotal } from "../src/observability/metrics.js";
import { FixedWindowBucket, GuildRateLimiter, ProcessRpsLimiter } from "../src/rate-limit/buckets.js";
import type { WebhookMessagePayload } from "../src/discord/webhook.js";

const guildId = "9876543210987654321";
const sourceInteractionId = "5555555555555555555";
const invokerUserId = "111";
const applicationId = "417719114458901252";

function componentClick(userId: string, componentInteractionId: string): InteractionPayload {
  return {
    type: 3,
    id: componentInteractionId,
    token: "component-token",
    guild_id: guildId,
    data: {
      custom_id: postCustomId(sourceInteractionId),
      component_type: 2,
    },
    member: { roles: [], user: { id: userId } },
  };
}

function handlerWithCache(
  postCache: PostToChannelCache,
  shareCalls: DiscordShareInput[],
  fetchImpl: typeof fetch,
) {
  const cp: ControlPlaneClient = {
    async fanQuery(_input: FanQueryInput): Promise<FanQueryResult> {
      throw new Error("fan-query not used");
    },
    async pollAskJob() {
      throw new Error("poll not used");
    },
    async recordDiscordShare(input: DiscordShareInput) {
      shareCalls.push(input);
      return { ok: true };
    },
  };

  return createInteractionHandler({
    config: createConfig({
      discordApplicationId: applicationId,
      guildLimitPerMin: 1000,
      guildBurst: 1000,
      processRps: 1000,
    }),
    cp,
    unsignedIpBucket: new FixedWindowBucket(1000, 60_000),
    guildLimiter: new GuildRateLimiter(1000, 1000),
    processLimiter: new ProcessRpsLimiter(1000),
    idempotency: new InteractionIdempotency(60_000),
    postCache,
    fetchImpl,
  });
}

describe("post to channel MESSAGE_COMPONENT", () => {
  beforeEach(() => {
    postToChannelTotal.resetForTests();
  });

  it("defers with type 6 then posts via webhook follow-up and calls CP share", async () => {
    const shareCalls: DiscordShareInput[] = [];
    const postCache = new PostToChannelCache();
    const publicPayload: WebhookMessagePayload = {
      embeds: [{ title: "Search results", footer: { text: "Ember · released episodes only" } }],
      allowed_mentions: { parse: [] },
    };
    postCache.set(sourceInteractionId, invokerUserId, guildId, publicPayload, {
      jobId: "job-abc",
      playbackStartSeconds: 42,
      speaker: "Host",
    });

    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST" && url.includes(`/webhooks/${applicationId}/component-token`)) {
        return new Response("{}", { status: 200 });
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch;

    const handle = handlerWithCache(postCache, shareCalls, fetchImpl);
    const result = await handle({
      rawBody: Buffer.from("{}"),
      clientIp: "127.0.0.1",
      parsed: componentClick(invokerUserId, "6666666666666666666"),
    });

    const json = JSON.parse(result.body) as { type: number; data?: Record<string, unknown> };
    expect(json.type).toBe(6);
    await vi.waitFor(() => expect(postToChannelTotal.getValueForTests()).toBe(1));
    await vi.waitFor(() =>
      expect(shareCalls).toEqual([
        {
          guildId,
          interactionId: sourceInteractionId,
          jobId: "job-abc",
          playbackStartSeconds: 42,
          speaker: "Host",
        },
      ]),
    );
  });

  it("replies ephemeral when webhook follow-up returns 403", async () => {
    const shareCalls: DiscordShareInput[] = [];
    const postCache = new PostToChannelCache();
    postCache.set(
      sourceInteractionId,
      invokerUserId,
      guildId,
      { content: "public", allowed_mentions: { parse: [] } },
      { jobId: "job-1", playbackStartSeconds: 0 },
    );

    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST" && url.includes("/webhooks/")) {
        return new Response("forbidden", { status: 403 });
      }
      if (init?.method === "PATCH" && url.includes("/messages/@original")) {
        const body = JSON.parse(String(init.body)) as { content?: string; flags?: number };
        expect(body.content).toBe(POST_CHANNEL_FORBIDDEN_MESSAGE);
        expect(body.flags).toBe(64);
        return new Response("{}", { status: 200 });
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch;

    const handle = handlerWithCache(postCache, shareCalls, fetchImpl);
    const result = await handle({
      rawBody: Buffer.from("{}"),
      clientIp: "127.0.0.1",
      parsed: componentClick(invokerUserId, "6666666666666666666"),
    });

    expect(JSON.parse(result.body).type).toBe(6);
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalled());
    expect(shareCalls).toHaveLength(0);
    expect(postToChannelTotal.getValueForTests()).toBe(0);
  });

  it("ignores clicks from a different user", async () => {
    const shareCalls: DiscordShareInput[] = [];
    const postCache = new PostToChannelCache();
    postCache.set(
      sourceInteractionId,
      invokerUserId,
      guildId,
      { content: "public", allowed_mentions: { parse: [] } },
      { jobId: "job-1", playbackStartSeconds: 0 },
    );

    const fetchImpl = vi.fn() as typeof fetch;
    const handle = handlerWithCache(postCache, shareCalls, fetchImpl);
    const result = await handle({
      rawBody: Buffer.from("{}"),
      clientIp: "127.0.0.1",
      parsed: componentClick("222", "7777777777777777777"),
    });

    const json = JSON.parse(result.body) as { type: number };
    expect(json.type).toBe(6);
    expect(shareCalls).toHaveLength(0);
    expect(postToChannelTotal.getValueForTests()).toBe(0);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns ephemeral cache miss when payload expired", async () => {
    const shareCalls: DiscordShareInput[] = [];
    const postCache = new PostToChannelCache();
    const fetchImpl = vi.fn() as typeof fetch;
    const handle = handlerWithCache(postCache, shareCalls, fetchImpl);

    const result = await handle({
      rawBody: Buffer.from("{}"),
      clientIp: "127.0.0.1",
      parsed: componentClick(invokerUserId, "8888888888888888888"),
    });

    const json = JSON.parse(result.body) as { type: number; data?: { content?: string; flags?: number } };
    expect(json.type).toBe(4);
    expect(json.data?.flags).toBe(64);
    expect(json.data?.content).toBe(POST_CACHE_MISS_MESSAGE);
    expect(shareCalls).toHaveLength(0);
  });
});
