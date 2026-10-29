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

export type AskPollInput = {
  askJobId: string;
  guildId: string;
  interactionId: string;
};

export type AskPollStatus = "queued" | "processing" | "completed" | "failed";

export type AskPollResult =
  | { ok: true; status: AskPollStatus; body: unknown }
  | { ok: false; status: number; code: string; message: string };

export type OAuthStateResult = { ok: true } | { ok: false; message: string };

export type PendingBindingInput = {
  state: string;
  guildId: string;
  guildName: string;
  permissions?: string;
};

export type PendingBindingResult = { ok: true } | { ok: false; message: string };

export type DiscordShareInput = {
  guildId: string;
  interactionId: string;
  jobId: string;
  playbackStartSeconds: number;
  speaker?: string | null;
};

export type DiscordShareResult = { ok: true } | { ok: false; status: number; message: string };

export interface ControlPlaneClient {
  fanQuery(input: FanQueryInput): Promise<FanQueryResult>;
  pollAskJob(input: AskPollInput): Promise<AskPollResult>;
  recordDiscordShare(input: DiscordShareInput): Promise<DiscordShareResult>;
  validateOAuthState(state: string, fetchImpl?: typeof fetch): Promise<OAuthStateResult>;
  createPendingBinding(
    input: PendingBindingInput,
    fetchImpl?: typeof fetch,
  ): Promise<PendingBindingResult>;
}

export class StubControlPlaneClient implements ControlPlaneClient {
  readonly calls: FanQueryInput[] = [];
  readonly pollCalls: AskPollInput[] = [];
  readonly shareCalls: DiscordShareInput[] = [];
  readonly oauthStateCalls: string[] = [];
  readonly bindingCalls: PendingBindingInput[] = [];

  /** When set, validateOAuthState returns this instead of default ok. */
  oauthStateResult: OAuthStateResult | null = null;

  /** When set, createPendingBinding returns this instead of default ok. */
  pendingBindingResult: PendingBindingResult | null = null;

  async fanQuery(input: FanQueryInput): Promise<FanQueryResult> {
    this.calls.push(input);
    return {
      ok: true,
      status: 200,
      body: { stub: true, mode: input.mode },
    };
  }

  async pollAskJob(input: AskPollInput): Promise<AskPollResult> {
    this.pollCalls.push(input);
    return {
      ok: true,
      status: "completed",
      body: { ask: { answer: "stub poll", citations: [] } },
    };
  }

  async recordDiscordShare(input: DiscordShareInput): Promise<DiscordShareResult> {
    this.shareCalls.push(input);
    return { ok: true };
  }

  async validateOAuthState(state: string): Promise<OAuthStateResult> {
    this.oauthStateCalls.push(state);
    return this.oauthStateResult ?? { ok: true };
  }

  async createPendingBinding(input: PendingBindingInput): Promise<PendingBindingResult> {
    this.bindingCalls.push(input);
    return this.pendingBindingResult ?? { ok: true };
  }
}

export class HttpControlPlaneClient implements ControlPlaneClient {
  constructor(
    private readonly baseUrl: string,
    private readonly bearer: string,
  ) {}

  private cpUrl(path: string): string {
    return `${this.baseUrl.replace(/\/$/, "")}${path}`;
  }

  private authHeaders(): HeadersInit {
    return { Authorization: `Bearer ${this.bearer}` };
  }

  async validateOAuthState(state: string, fetchImpl: typeof fetch = fetch): Promise<OAuthStateResult> {
    const url = this.cpUrl(`/api/internal/discord/oauth/state/${encodeURIComponent(state)}`);
    let res: Response;
    try {
      res = await fetchImpl(url, { method: "GET", headers: this.authHeaders() });
    } catch {
      return { ok: false, message: "Control plane unreachable" };
    }
    if (res.status === 200) {
      return { ok: true };
    }
    if (res.status === 404) {
      return { ok: false, message: "OAuth state is unknown, expired, or already used" };
    }
    return { ok: false, message: "OAuth state validation failed" };
  }

  async createPendingBinding(
    input: PendingBindingInput,
    fetchImpl: typeof fetch = fetch,
  ): Promise<PendingBindingResult> {
    const body: Record<string, string> = {
      state: input.state,
      guild_id: input.guildId,
      guild_name: input.guildName,
    };
    if (input.permissions) {
      body.permissions = input.permissions;
    }

    let res: Response;
    try {
      res = await fetchImpl(this.cpUrl("/api/internal/discord/bindings"), {
        method: "POST",
        headers: { ...this.authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      return { ok: false, message: "Control plane unreachable" };
    }

    if (res.ok) {
      return { ok: true };
    }

    const json = (await res.json().catch(() => ({}))) as { message?: string };
    return {
      ok: false,
      message: json.message ?? "Failed to create pending Discord binding",
    };
  }

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

  async recordDiscordShare(
    input: DiscordShareInput,
    fetchImpl: typeof fetch = fetch,
  ): Promise<DiscordShareResult> {
    const body: Record<string, string | number> = {
      guild_id: input.guildId,
      interaction_id: input.interactionId,
      job_id: input.jobId,
      playback_start_seconds: input.playbackStartSeconds,
    };
    if (input.speaker?.trim()) {
      body.speaker = input.speaker.trim();
    }

    let res: Response;
    try {
      res = await fetchImpl(this.cpUrl("/api/internal/discord/share"), {
        method: "POST",
        headers: { ...this.authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      return { ok: false, status: 502, message: "Control plane unreachable" };
    }

    if (res.ok) {
      return { ok: true };
    }

    const json = (await res.json().catch(() => ({}))) as { message?: string };
    return {
      ok: false,
      status: res.status,
      message: json.message ?? "Share rollup failed",
    };
  }

  async pollAskJob(input: AskPollInput): Promise<AskPollResult> {
    const base = this.baseUrl.replace(/\/$/, "");
    const url = new URL(`${base}/api/internal/discord/ask/jobs/${encodeURIComponent(input.askJobId)}`);
    url.searchParams.set("guild_id", input.guildId);
    url.searchParams.set("interaction_id", input.interactionId);

    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.bearer}`,
      },
    });

    const json = (await res.json()) as {
      status?: string;
      error?: string;
      message?: string;
    };

    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        code: json.error ?? "cp_error",
        message: json.message ?? "Control plane error",
      };
    }

    const status = json.status;
    if (status === "completed" || status === "failed" || status === "queued" || status === "processing") {
      return { ok: true, status, body: json };
    }

    return {
      ok: false,
      status: 502,
      code: "invalid_cp_response",
      message: "Missing or invalid ask poll status",
    };
  }
}
