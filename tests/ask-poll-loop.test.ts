import { describe, expect, it, vi } from "vitest";

import { createConfig } from "../src/config.js";
import type { AskPollInput, AskPollResult, ControlPlaneClient, FanQueryInput, FanQueryResult } from "../src/cp/client.js";
import { FAN_QUERY_GENERIC_ERROR } from "../src/cp/error-map.js";
import {
  ASK_INITIAL_THINKING,
  ASK_POLL_INTERVAL_MS,
  ASK_STILL_WORKING,
  ASK_STILL_WORKING_AT_MS,
  runAskPollLoop,
} from "../src/interactions/ask-poll-loop.js";
import { PostToChannelCache } from "../src/interactions/post-cache.js";

const applicationId = "417719114458901252";
const guildId = "9876543210987654321";
const interactionId = "3333333333333333333";
const askJobId = "a1b2c3d4-e5f6-4789-a012-3456789abcde";

function pollSequence(statuses: AskPollResult[]): ControlPlaneClient {
  let pollIndex = 0;
  return {
    async fanQuery(_input: FanQueryInput): Promise<FanQueryResult> {
      return { ok: true, status: 202, askJobId };
    },
    async pollAskJob(input: AskPollInput): Promise<AskPollResult> {
      expect(input).toEqual({ askJobId, guildId, interactionId });
      const next = statuses[pollIndex];
      pollIndex += 1;
      if (!next) {
        throw new Error("unexpected extra poll");
      }
      return next;
    },
    async recordDiscordShare() {
      return { ok: true };
    },
  };
}

const invokerUserId = "111";

describe("runAskPollLoop", () => {
  it("edits thinking then formatted ask when poll goes queued → processing → completed", async () => {
    const cp = pollSequence([
      { ok: true, status: "queued", body: { status: "queued" } },
      { ok: true, status: "processing", body: { status: "processing" } },
      {
        ok: true,
        status: "completed",
        body: {
          status: "completed",
          answer: "The answer from Ember.",
          citations: [{ speaker: "Host", playback_start_seconds: 12, snippet: "moment" }],
        },
      },
    ]);

    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response("", { status: 200 }));
    let now = 0;
    const sleepMs = vi.fn(async (ms: number) => {
      now += ms;
    });

    await runAskPollLoop({
      deps: {
        config: createConfig({ discordApplicationId: applicationId }),
        cp,
        postCache: new PostToChannelCache(),
        fetchImpl,
        nowMs: () => now,
        sleepMs,
      },
      mode: "ask",
      guildId,
      interactionId,
      invokerUserId,
      applicationId,
      token: "interaction-token",
      askJobId,
      startedAtMs: 0,
    });

    expect(sleepMs).toHaveBeenCalledTimes(2);
    expect(sleepMs).toHaveBeenCalledWith(ASK_POLL_INTERVAL_MS);

    const bodies = fetchImpl.mock.calls.map((call) => JSON.parse(String(call[1]?.body)));
    expect(bodies[0]?.content).toBe(ASK_INITIAL_THINKING);
    expect(bodies.at(-1)?.embeds?.[0]?.description).toContain("The answer from Ember.");
    expect(bodies.at(-1)?.embeds?.[0]?.fields).toHaveLength(1);
  });

  it("shows safe error when poll returns failed", async () => {
    const cp = pollSequence([{ ok: true, status: "failed", body: { status: "failed", error_code: "x" } }]);
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response("", { status: 200 }));

    await runAskPollLoop({
      deps: {
        config: createConfig({ discordApplicationId: applicationId }),
        cp,
        postCache: new PostToChannelCache(),
        fetchImpl,
        nowMs: () => 0,
        sleepMs: async () => {},
      },
      mode: "ask",
      guildId,
      interactionId,
      invokerUserId,
      applicationId,
      token: "interaction-token",
      askJobId,
      startedAtMs: 0,
    });

    const bodies = fetchImpl.mock.calls.map((call) => JSON.parse(String(call[1]?.body)));
    expect(bodies.at(-1)?.content).toBe(FAN_QUERY_GENERIC_ERROR);
  });

  it("edits still-working copy after ~90s while polling continues", async () => {
    const cp = pollSequence([
      { ok: true, status: "queued", body: { status: "queued" } },
      { ok: true, status: "processing", body: { status: "processing" } },
      {
        ok: true,
        status: "completed",
        body: { status: "completed", answer: "done", citations: [] },
      },
    ]);

    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response("", { status: 200 }));
    let now = ASK_STILL_WORKING_AT_MS - 500;
    const sleepMs = vi.fn(async (ms: number) => {
      now += ms;
    });

    await runAskPollLoop({
      deps: {
        config: createConfig({ discordApplicationId: applicationId }),
        cp,
        postCache: new PostToChannelCache(),
        fetchImpl,
        nowMs: () => now,
        sleepMs,
      },
      mode: "ask",
      guildId,
      interactionId,
      invokerUserId,
      applicationId,
      token: "interaction-token",
      askJobId,
      startedAtMs: 0,
    });

    const bodies = fetchImpl.mock.calls.map((call) => JSON.parse(String(call[1]?.body)));
    expect(bodies.some((b) => b.content === ASK_STILL_WORKING)).toBe(true);
    expect(bodies.at(-1)?.embeds?.[0]?.description).toContain("done");
  });
});
