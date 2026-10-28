import { describe, expect, it } from "vitest";

import {
  clipText,
  EMBED_FIELD_MAX,
  isAllowedWatchUrl,
  sanitizeFanText,
} from "../src/format/sanitize.js";

describe("sanitizeFanText", () => {
  it("strips mentions and invite links", () => {
    const out = sanitizeFanText("Hello @everyone join discord.gg/foo <@123>");
    expect(out).not.toContain("@everyone");
    expect(out).not.toContain("discord.gg/");
    expect(out).not.toContain("<@123>");
  });
});

describe("clipText", () => {
  it("clips to embed field max", () => {
    const long = "a".repeat(EMBED_FIELD_MAX + 50);
    expect(clipText(long, EMBED_FIELD_MAX).length).toBeLessThanOrEqual(EMBED_FIELD_MAX);
  });
});

describe("isAllowedWatchUrl", () => {
  it("allows https youtube hosts", () => {
    expect(isAllowedWatchUrl("https://www.youtube.com/watch?v=abc")).toBe(true);
    expect(isAllowedWatchUrl("https://youtu.be/abc")).toBe(true);
  });

  it("rejects http and javascript", () => {
    expect(isAllowedWatchUrl("http://youtube.com/x")).toBe(false);
    expect(isAllowedWatchUrl("javascript:alert(1)")).toBe(false);
  });
});
