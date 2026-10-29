import { describe, expect, it } from "vitest";

import { CP_ERROR_COPY, fanQueryErrorMessage } from "../src/cp/error-map.js";
import {
  POST_CUSTOM_ID_PREFIX,
  combinedEmbedCharCount,
  finalizeFanQueryEphemeralPayload,
  formatFanQueryResponse,
} from "../src/format/embed.js";
import { PostToChannelCache } from "../src/interactions/post-cache.js";
import { EMBED_FIELD_MAX, sanitizeFanText } from "../src/format/sanitize.js";

describe("fanQueryErrorMessage", () => {
  it("maps CP codes to fixed copy", () => {
    expect(
      fanQueryErrorMessage({
        ok: false,
        status: 404,
        code: "discord_not_linked",
        message: "x",
      }),
    ).toBe(CP_ERROR_COPY.discord_not_linked);

    expect(
      fanQueryErrorMessage({
        ok: false,
        status: 402,
        code: "creator_credits_exhausted",
        message: "x",
      }),
    ).toBe(CP_ERROR_COPY.creator_credits_exhausted);

    expect(
      fanQueryErrorMessage({
        ok: false,
        status: 403,
        code: "discord_ask_role_required",
        message: "x",
      }),
    ).toBe(CP_ERROR_COPY.discord_ask_role_required);

    expect(
      fanQueryErrorMessage({
        ok: false,
        status: 403,
        code: "ember_not_entitled",
        message: "x",
      }),
    ).toBe(CP_ERROR_COPY.ember_not_entitled);

    expect(
      fanQueryErrorMessage({
        ok: false,
        status: 429,
        code: "public_daily_ask_cap",
        message: "x",
      }),
    ).toBe(CP_ERROR_COPY.public_daily_ask_cap);
  });

  it("falls back to HTTP status when code is unknown", () => {
    expect(
      fanQueryErrorMessage({
        ok: false,
        status: 403,
        code: "unknown",
        message: "x",
      }),
    ).toBe("Ember can't complete that request in this server.");

    expect(
      fanQueryErrorMessage({
        ok: false,
        status: 429,
        code: "unknown",
        message: "x",
      }),
    ).toBe(CP_ERROR_COPY.public_daily_ask_cap);

    expect(
      fanQueryErrorMessage({
        ok: false,
        status: 404,
        code: "unknown",
        message: "x",
      }),
    ).toBe(CP_ERROR_COPY.discord_not_linked);
  });
});

describe("formatFanQueryResponse search", () => {
  it("renders up to five moments with sanitized snippets and watch buttons", () => {
    const jobId = "1234567890123456789";
    const body = {
      search: {
        hits: [
          {
            job_id: jobId,
            episode_title: "Episode @everyone",
            speaker: "Host",
            playback_start_seconds: 125,
            snippet: "discord.gg/secret <@999>",
            watch_url: "https://www.youtube.com/watch?v=abc&t=125",
          },
          {
            job_id: "2",
            episode_title: "Ep 2",
            speaker: "Guest",
            playback_start_seconds: 10,
            snippet: "text",
            watch_url: "http://youtube.com/bad",
          },
        ],
      },
    };

    const payload = formatFanQueryResponse("search", body);
    expect(payload.allowed_mentions).toEqual({ parse: [] });
    expect(payload.embeds?.[0]?.fields).toHaveLength(2);
    const fieldValue = payload.embeds?.[0]?.fields?.[0]?.value ?? "";
    expect(fieldValue).toContain("2:05");
    expect(fieldValue).not.toContain("discord.gg/");
    expect(fieldValue).not.toContain("<@999>");
    expect(sanitizeFanText("Episode @everyone")).toContain("@ everyone");

    expect(payload.components).toHaveLength(1);
    expect(payload.components?.[0]?.components[0]?.url).toContain("youtube.com");
    expect(typeof body.search.hits[0].job_id).toBe("string");
    expect(body.search.hits[0].job_id).toBe(jobId);
  });

  it("stays within combined embed cap when many long fields are present", () => {
    const hits = Array.from({ length: 5 }, (_, i) => ({
      episode_title: `Ep ${i}`,
      speaker: "Host",
      playback_start_seconds: i,
      snippet: "x".repeat(EMBED_FIELD_MAX),
      watch_url: "https://www.youtube.com/watch?v=abc",
    }));
    const payload = formatFanQueryResponse("search", { search: { hits } });
    const count = combinedEmbedCharCount(payload.embeds ?? []);
    expect(count).toBeLessThanOrEqual(6000);
    const fieldCount = payload.embeds?.[0]?.fields?.length ?? 0;
    expect(payload.components?.length ?? 0).toBeLessThanOrEqual(fieldCount);
  });
});

describe("formatFanQueryResponse ask", () => {
  it("includes answer and up to three citation fields", () => {
    const citations = Array.from({ length: 5 }, (_, i) => ({
      speaker: `Sp ${i}`,
      playback_start_seconds: i * 60,
      snippet: `cite ${i}`,
    }));
    const payload = formatFanQueryResponse("ask", {
      ask: { answer: "Here is the answer.", citations },
    });
    expect(payload.embeds?.[0]?.description).toContain("Here is the answer.");
    expect(payload.embeds?.[0]?.fields).toHaveLength(3);
    expect(payload.embeds?.[0]?.footer?.text).toBe("Ember · released episodes only");
  });
});

describe("post to channel button", () => {
  it("adds post button on successful search and omits it from public payload", () => {
    const body = {
      search: {
        hits: [
          {
            job_id: "job-1",
            episode_title: "Ep",
            speaker: "Host",
            playback_start_seconds: 10,
            snippet: "hi",
          },
        ],
      },
    };
    const formatted = formatFanQueryResponse("search", body);
    const postCache = new PostToChannelCache();
    const ephemeral = finalizeFanQueryEphemeralPayload({
      mode: "search",
      body,
      sourceInteractionId: "9999999999999999999",
      invokerUserId: "111",
      guildId: "guild",
      formatted,
      postCache,
    });

    const postRow = ephemeral.components?.find((row) =>
      row.components.some(
        (c) => "custom_id" in c && c.custom_id === `${POST_CUSTOM_ID_PREFIX}9999999999999999999`,
      ),
    );
    expect(postRow).toBeDefined();

    const cached = postCache.get("9999999999999999999");
    expect(cached?.share?.jobId).toBe("job-1");
    const publicHasPostButton =
      cached?.publicPayload.components?.some((row) =>
        row.components.some((c) => "custom_id" in c && c.custom_id.startsWith(POST_CUSTOM_ID_PREFIX)),
      ) ?? false;
    expect(publicHasPostButton).toBe(false);
  });

  it("stays within Discord five action row cap with post button and five watch links", () => {
    const hits = Array.from({ length: 5 }, (_, i) => ({
      job_id: `job-${i}`,
      episode_title: `Ep ${i}`,
      speaker: "Host",
      playback_start_seconds: i,
      snippet: "snippet",
      watch_url: "https://www.youtube.com/watch?v=abc",
    }));
    const body = { search: { hits } };
    const formatted = formatFanQueryResponse("search", body);
    const ephemeral = finalizeFanQueryEphemeralPayload({
      mode: "search",
      body,
      sourceInteractionId: "9999999999999999999",
      invokerUserId: "111",
      guildId: "guild",
      formatted,
      postCache: new PostToChannelCache(),
    });
    expect(ephemeral.components?.length ?? 0).toBeLessThanOrEqual(5);
    expect(ephemeral.components?.length).toBe(2);
  });
});

describe("formatFanQueryResponse about", () => {
  it("renders show name and ask availability", () => {
    const payload = formatFanQueryResponse("about", {
      show_name: "Star Wars Time Show",
      ask_available: true,
      archive_url: "https://example.com/archive/token",
    });
    expect(payload.embeds?.[0]?.title).toBe("Star Wars Time Show");
    expect((payload.embeds?.[0]?.title ?? "").length).toBeLessThanOrEqual(256);
    expect(payload.embeds?.[0]?.description).toContain("Ask is available");
    expect(payload.embeds?.[0]?.description).toContain("https://example.com/archive/token");
  });

  it("clips long show titles to Discord embed title limit", () => {
    const payload = formatFanQueryResponse("about", {
      show_name: "S".repeat(300),
      ask_available: true,
    });
    expect(payload.embeds?.[0]?.title?.length).toBeLessThanOrEqual(256);
    expect(payload.embeds?.[0]?.title?.endsWith("…")).toBe(true);
  });
});
