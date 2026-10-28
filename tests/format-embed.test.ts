import { describe, expect, it } from "vitest";

import { CP_ERROR_COPY, fanQueryErrorMessage } from "../src/cp/error-map.js";
import { combinedEmbedCharCount, formatFanQueryResponse } from "../src/format/embed.js";
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
    }));
    const payload = formatFanQueryResponse("search", { search: { hits } });
    const count = combinedEmbedCharCount(payload.embeds ?? []);
    expect(count).toBeLessThanOrEqual(6000);
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

describe("formatFanQueryResponse about", () => {
  it("renders show name and ask availability", () => {
    const payload = formatFanQueryResponse("about", {
      show_name: "Star Wars Time Show",
      ask_available: true,
      archive_url: "https://example.com/archive/token",
    });
    expect(payload.embeds?.[0]?.title).toBe("Star Wars Time Show");
    expect(payload.embeds?.[0]?.description).toContain("Ask is available");
    expect(payload.embeds?.[0]?.description).toContain("https://example.com/archive/token");
  });
});
