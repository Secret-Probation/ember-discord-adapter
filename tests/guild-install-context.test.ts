import { describe, expect, it } from "vitest";

import { hasGuildInstallContext, INTEGRATION_TYPE_GUILD } from "../src/interactions/types.js";

describe("hasGuildInstallContext", () => {
  it("accepts guild_id when authorizing_integration_owners is omitted", () => {
    expect(hasGuildInstallContext({ type: 2, guild_id: "123456789012345678" })).toBe(true);
  });

  it("accepts guild install owner key 0", () => {
    expect(
      hasGuildInstallContext({
        type: 2,
        guild_id: "123456789012345678",
        authorizing_integration_owners: { [INTEGRATION_TYPE_GUILD]: "123456789012345678" },
      }),
    ).toBe(true);
  });

  it("rejects user-install-only context", () => {
    expect(
      hasGuildInstallContext({
        type: 2,
        guild_id: "123456789012345678",
        authorizing_integration_owners: { "1": "999999999999999999" },
      }),
    ).toBe(false);
  });
});
