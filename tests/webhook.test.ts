import { describe, expect, it, vi } from "vitest";

import { editOriginalInteractionMessage } from "../src/discord/webhook.js";

describe("editOriginalInteractionMessage", () => {
  it("PATCHes @original with allowed_mentions and retries before POST fallback", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    fetchImpl
      .mockResolvedValueOnce(new Response("", { status: 500 }))
      .mockResolvedValueOnce(new Response("", { status: 500 }))
      .mockResolvedValueOnce(new Response("", { status: 500 }))
      .mockResolvedValueOnce(new Response("", { status: 200 }));

    const ok = await editOriginalInteractionMessage({
      applicationId: "417719114458901252",
      token: "interaction-token",
      payload: { content: "done", allowed_mentions: { parse: [] } },
      fetchImpl,
    });

    expect(ok.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(4);

    const patchUrl =
      "https://discord.com/api/v10/webhooks/417719114458901252/interaction-token/messages/@original";
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(patchUrl);
    expect(fetchImpl.mock.calls[0]?.[1]?.method).toBe("PATCH");

    const postUrl = "https://discord.com/api/v10/webhooks/417719114458901252/interaction-token";
    expect(fetchImpl.mock.calls[3]?.[0]).toBe(postUrl);
    expect(fetchImpl.mock.calls[3]?.[1]?.method).toBe("POST");

    const body = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body));
    expect(body.allowed_mentions).toEqual({ parse: [] });
    expect(body.content).toBe("done");
  });

  it("does not retry after Discord 401 on PATCH", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    fetchImpl.mockResolvedValueOnce(new Response("", { status: 401 }));

    const ok = await editOriginalInteractionMessage({
      applicationId: "1",
      token: "t",
      payload: { content: "x", allowed_mentions: { parse: [] } },
      fetchImpl,
    });

    expect(ok.ok).toBe(false);
    expect(ok.status).toBe(401);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
