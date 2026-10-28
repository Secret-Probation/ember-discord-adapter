/** Control-plane fan-query client (SPEC §7). Stubbed in §22.2 until CP routes ship. */

export type FanQueryMode = "search" | "ask" | "about";

export type FanQueryInput = {
  guildId: string;
  discordUserId: string;
  interactionId: string;
  mode: FanQueryMode;
  query: string;
  memberRoleIds: string[];
};

export type FanQueryResult =
  | { ok: true; status: 200; body: unknown }
  | { ok: true; status: 202; askJobId: string }
  | { ok: false; status: number; code: string; message: string };

export interface ControlPlaneClient {
  fanQuery(input: FanQueryInput): Promise<FanQueryResult>;
}

export class StubControlPlaneClient implements ControlPlaneClient {
  readonly calls: FanQueryInput[] = [];

  async fanQuery(input: FanQueryInput): Promise<FanQueryResult> {
    this.calls.push(input);
    return {
      ok: true,
      status: 200,
      body: { stub: true, mode: input.mode },
    };
  }
}

export class HttpControlPlaneClient implements ControlPlaneClient {
  constructor(
    private readonly baseUrl: string,
    private readonly bearer: string,
  ) {}

  async fanQuery(input: FanQueryInput): Promise<FanQueryResult> {
    const res = await fetch(`${this.baseUrl.replace(/\/$/, "")}/api/internal/discord/fan-query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.bearer}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        guild_id: input.guildId,
        discord_user_id: input.discordUserId,
        interaction_id: input.interactionId,
        mode: input.mode,
        query: input.query,
        member_role_ids: input.memberRoleIds,
      }),
    });

    if (res.status === 202) {
      const json = (await res.json()) as { ask_job_id?: string };
      if (!json.ask_job_id) {
        return { ok: false, status: 502, code: "invalid_cp_response", message: "Missing ask_job_id" };
      }
      return { ok: true, status: 202, askJobId: json.ask_job_id };
    }

    const json = (await res.json()) as { error?: string; message?: string };
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        code: json.error ?? "cp_error",
        message: json.message ?? "Control plane error",
      };
    }
    return { ok: true, status: 200, body: json };
  }
}
