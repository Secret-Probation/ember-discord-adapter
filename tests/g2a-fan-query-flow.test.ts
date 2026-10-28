import { describe, expect, it, vi } from "vitest";

import { createConfig } from "../src/config.js";
import type { ControlPlaneClient, FanQueryInput, FanQueryResult } from "../src/cp/client.js";
import { createInteractionHandler } from "../src/interactions/handler.js";
import { InteractionIdempotency } from "../src/interactions/idempotency.js";
import { PostToChannelCache } from "../src/interactions/post-cache.js";
import type { InteractionPayload } from "../src/interactions/types.js";
import { FixedWindowBucket, GuildRateLimiter, ProcessRpsLimiter } from "../src/rate-limit/buckets.js";

/** G2a — adapter formats CP search body into Discord webhook embed (no live guild). */

const G2A_GUILD_ID = "9876543210987654321";

function searchInteraction(id: string): InteractionPayload {
  return {
    type: 2,
    id,
    token: "g2a-interaction-token",
    guild_id: G2A_GUILD_ID,
    data: {
      name: "ember",
      options: [{ name: "search", type: 1, options: [{ name: "query", type: 3, value: "g2a" }] }],
    },
    member: { roles: [], user: { id: "111" } },
  };
}

describe("G2a fan-query → webhook embed", () => {
  it("PATCHes search embed when CP returns sync search hits", async () => {
    const cp: ControlPlaneClient = {
      async fanQuery(_input: FanQueryInput): Promise<FanQueryResult> {
        return {
          ok: true,
          status: 200,
          body: {
            search: {
              hits: [
                {
                  job_id: "1234567890123456789",
                  episode_title: "Pilot",
                  speaker: "Host",
                  playback_start_seconds: 90,
                  snippet: "proof snippet",
                  watch_url: "https://www.youtube.com/watch?v=g2a",
                },
              ],
            },
          },
        };
      },
      async pollAskJob(): Promise<FanQueryResult> {
        throw new Error("not used");
      },
      async recordDiscordShare() {
        return { ok: true };
      },
    };

    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response("", { status: 200 }));
    const config = createConfig({
      discordApplicationId: "417719114458901252",
      guildLimitPerMin: 1000,
      guildBurst: 1000,
      processRps: 1000,
    });

    const handle = createInteractionHandler({
      config,
      cp,
      unsignedIpBucket: new FixedWindowBucket(1000, 60_000),
      guildLimiter: new GuildRateLimiter(1000, 1000),
      processLimiter: new ProcessRpsLimiter(1000),
      idempotency: new InteractionIdempotency(60_000),
      postCache: new PostToChannelCache(),
      fetchImpl,
    });

    await handle({
      rawBody: Buffer.from("{}"),
      clientIp: "127.0.0.1",
      parsed: searchInteraction("4444444444444444444"),
    });

    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalled());

    const body = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body));
    expect(body.embeds?.[0]?.title).toBe("Search results");
    expect(body.embeds?.[0]?.fields?.length).toBeGreaterThan(0);
    expect(body.allowed_mentions).toEqual({ parse: [] });
  });
});
