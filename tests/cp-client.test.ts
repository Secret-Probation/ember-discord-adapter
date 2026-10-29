import { describe, expect, it, vi } from "vitest";

import { HttpControlPlaneClient } from "../src/cp/client.js";

describe("HttpControlPlaneClient.pollAskJob", () => {
  it("GETs ask job with guild_id and interaction_id query params", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ status: "queued", ask_job_id: "job-1" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchImpl);

    const client = new HttpControlPlaneClient("https://cp.example", "secret-bearer");
    const result = await client.pollAskJob({
      askJobId: "job-1",
      guildId: "guild-9",
      interactionId: "ix-1",
    });

    expect(result).toEqual({ ok: true, status: "queued", body: { status: "queued", ask_job_id: "job-1" } });
    const calledUrl = String(fetchImpl.mock.calls[0]?.[0]);
    expect(calledUrl).toContain("/api/internal/discord/ask/jobs/job-1");
    expect(calledUrl).toContain("guild_id=guild-9");
    expect(calledUrl).toContain("interaction_id=ix-1");
    expect(fetchImpl.mock.calls[0]?.[1]?.headers).toMatchObject({
      Authorization: "Bearer secret-bearer",
    });

    vi.unstubAllGlobals();
  });
});

describe("HttpControlPlaneClient.recordDiscordShare", () => {
  it("POSTs share rollup body to internal discord share", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response("", { status: 200 }));
    const client = new HttpControlPlaneClient("https://cp.example", "secret-bearer");
    const result = await client.recordDiscordShare(
      {
        guildId: "guild-9",
        interactionId: "ix-1",
        jobId: "job-1",
        playbackStartSeconds: 90,
        speaker: "Host",
      },
      fetchImpl,
    );

    expect(result).toEqual({ ok: true });
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe("https://cp.example/api/internal/discord/share");
    const body = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body));
    expect(body).toEqual({
      guild_id: "guild-9",
      interaction_id: "ix-1",
      job_id: "job-1",
      playback_start_seconds: 90,
      speaker: "Host",
    });
  });
});
