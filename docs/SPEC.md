# SPEC — Ember Discord adapter

**Status:** Accepted (2026-10-28) — no implementation yet (§20).  
**Normative home:** this file (`Secret-Probation/ember-discord-adapter`). Voxen carries a pointer only: [SPEC-EMBER-DISCORD.md](https://github.com/Secret-Probation/Voxen/blob/master/docs/specs/SPEC-EMBER-DISCORD.md).  
**Parents (Voxen):** [SPEC-EMBER-PUBLIC-ARCHIVE-LINK.md](https://github.com/Secret-Probation/Voxen/blob/master/docs/specs/SPEC-EMBER-PUBLIC-ARCHIVE-LINK.md) · [SPEC-EMBER-ASK-OUTPUT-CONTRACT.md](https://github.com/Secret-Probation/Voxen/blob/master/docs/specs/SPEC-EMBER-ASK-OUTPUT-CONTRACT.md) · [V1_ARCHITECTURE_LOCKED.md](https://github.com/Secret-Probation/Voxen/blob/master/docs/V1_ARCHITECTURE_LOCKED.md)  
**Discord policy:** [Developer Policy](https://support-dev.discord.com/hc/en-us/articles/8563934450327-Discord-Developer-Policy) (effective 2024-07-08) · [Developer Terms](https://support-dev.discord.com/hc/en-us/articles/8562894815383-Discord-Developer-Terms-of-Service). Re-read both before the first install.

This document is the accepted contract. It is not a scaffold. Accept does not by itself create a repository, a Discord application, a container, or a control-plane change — see §20 and §22.

---

## 1. Problem

A podcaster needs Ember inside their own Discord server. Members search and ask that show’s **released** archive without a Secret Probation account. The creator pays for Ask. The bot must not call Spark2, Voxen, or the public Turnstile URL.

---

## 2. Goals

| ID | Requirement |
|----|-------------|
| G1 | One official Ember Discord application. Many guilds, one app. Customers do not run their own bot. |
| G2 | One guild bound to one show. Owner or Admin connects. Editor cannot. |
| G3 | `/ember search`, `/ember ask`, `/ember about` over released episodes only. |
| G4 | Search is free. A completed Ask debits one creator `ember_query`. Fans are not billed. |
| G5 | Discord Ask and public-archive Ask share one daily cap per show (default 100). |
| G6 | v1 entitlement is `hasActiveEmberEntitlement` only. |
| G7 | Discord protocol, formatting, and the bot token live in the adapter. Tenancy and billing live in the control plane. |
| G8 | API Data is used only to run this app, then deleted on the schedule in §15. |
| G9 | Each show keeps a rollup of cited episodes (counts only) and shared moments (playback grain), with no Discord identity on either. |

---

## 3. Non-goals (v1)

- Gateway, message content, presence, member-list intent, voice, auto-reply, scheduled posts, DMs, user-install, Discord Activities.
- A Discord-only paid SKU or any price, upgrade, or checkout inside Discord.
- Fan accounts, fan Stripe, a multi-show picker, customer-hosted bots.
- Plan-tier gates (`fan_module_not_in_plan`, Studio search-only, Trial blocked). Those ship only when they ship for every fan surface, in the same change. See §8.
- A daily kick-prune (`GET /users/@me/guilds`). Stale bindings are accepted in v1.
- A second adapter replica. In-memory rate buckets and the post-to-channel cache are accepted for the design-partner launch.
- Any change to Voxen workers or to Ember `/v1/search` and `/v1/ask`.
- An edit to `secret-probation/docs/gtm/FAN_ENGAGEMENT_AND_EMBER_MODULES.md`. Phase **B″** (between public archive and per-link modules) is context only.
- YouTube click-through as a first-party metric. v1 does not wrap `watch_url`.

---

## 4. Repos and credentials

| Piece | Owns |
|-------|------|
| `ember-discord-adapter` (this repo) | HTTP interactions, OAuth callback, command registration, Ed25519, defer/edit, embeds, post-to-channel cache, bot token |
| Control plane (`secret-probation`) | Guild binding, confirm, binary entitlement, released-episode allowlist, daily cap, `ember_query` debit. No Discord SDK, no embed builder, no Ed25519, no bot token |
| Voxen | Pointer only. No runtime code |
| Ember on Spark2 | Unchanged. The adapter never sees a collection name or an `ember-engine` assertion |

[SPEC-1.2](./SPEC-1.2-assertion-spec.md) JWTs go from the control plane **to** an engine. They are the wrong credential for this hop. The adapter authenticates to the control plane with a dedicated bearer for `service:ember-discord`, compared with `timingSafeBearerMatch` in `secret-probation/apps/web/src/lib/security/bearer-auth.ts`. A wrong secret is **401**.

The adapter calls the control plane on the docker network or localhost. The public vhost does not route `/api/internal/*`.

Deploy the adapter container on the control-plane host (`.206`). Discord must reach a public HTTPS URL. It cannot call `192.168.0.206`. Local dev tunnels to the adapter only.

Pilot interactions hostname (placeholder until DNS exists): `https://discord.dev.doublesecretprobationstudios.com/interactions`. OAuth callback on the same host under `/oauth/callback`. The adapter listens on a private port; the edge vhost terminates TLS and forwards only adapter paths. Keep **min replicas = 1** on the interactions service (no scale-to-zero); Discord’s 3-second window and cold starts do not mix.

The adapter’s private routes (`POST /internal/guilds/{guild_id}/leave`, `GET /internal/guilds/{guild_id}/roles`, etc.) bind to the docker network only. They require `Authorization: Bearer` matching `EMBER_DISCORD_ADAPTER_INTERNAL_TOKEN`, compared with `timingSafeBearerMatch`. The public internet must not reach them.

Do not reuse a public archive token, a Voxen `X-API-Key`, or Turnstile.

---

## 5. Commands

One global chat-input command, name `ember`, API **v10**, three subcommands. A command with subcommands cannot be invoked bare. The `register` script is the only writer. `PUT /applications/{app_id}/commands` replaces the entire global command set. It does not run on process start.

| Subcommand | Option | Behavior |
|------------|--------|----------|
| `search` | `query` string, required, `min_length` 1, `max_length` 2000 | Free. Mode `search`. At most 5 moments. |
| `ask` | same | Debited. Mode `ask`. |
| `about` | none | Show name, whether Ask is available, public archive URL when a link exists. Does not mint a link. |

Registration:

- `integration_types`: `[0]` (guild install only). `contexts`: `[0]` (guild only). Do not use deprecated `dm_permission`.
- No `USER_INSTALL`. Drop any interaction whose `authorizing_integration_owners` has no guild install.
- No autocomplete. English only. `default_member_permissions` unset, so server admins can hide the command in Discord’s own settings.
- Optional Ask role is a product gate on top of that. Empty means any member who can see the command may ask. When set, the control plane compares the guild’s configured role id to `member.roles` on the interaction payload (Discord-supplied only). Store the configured id on the active binding row as `ask_role_id` (nullable snowflake string). Owner or Admin sets or clears it in show settings (`PATCH /api/shows/{projectId}/discord`). Do not store fan role ids.

Install URL permission bitfield **19456** = View Channel (`1 << 10`) + Send Messages (`1 << 11`) + Embed Links (`1 << 14`). No Administrator. No Message Content intent. No privileged intents. If the creator unchecks Embed Links, still allow the binding and fall back to plain content under 2,000 characters.

Every command defers (§11). Ignore autocomplete (`type` 4). Do not handle modal submissions in v1. The deferred ack uses response callback type **5** (§11), which is not a modal submit. User-install and DM contexts are rejected.

---

## 6. Install and confirm

Owner or Admin only. Same bar as minting a public archive link. Editor is **403**.

Scopes: `bot` and `applications.commands` only. Do not request `identify` or `email`. Discard the OAuth access token. Do not store a per-guild bot token, a Discord username, or an avatar.

The adapter host has no Clerk cookie. A stolen state nonce must not activate a binding.

1. Owner or Admin calls `POST /api/shows/{projectId}/discord/install` (Clerk). Control plane mints a single-use `state`, 10 minutes, bound to that Clerk user and `project_id`. Response: `{ "state": "<nonce>", "oauth_start_url": "https://<adapter-host>/oauth/start?state=<nonce>" }`. Requires `EMBER_DISCORD_ENABLED` and entitlement; enforces guild cap before minting.
2. Browser opens `oauth_start_url`. Adapter `GET /oauth/start` calls control plane `GET /api/internal/discord/oauth/state/{state}` (service bearer). **200** only when the row exists, is unused, and is unexpired; then redirect to `https://discord.com/oauth2/authorize` with the exact registered redirect URI. Any other case → **400**, no redirect to Discord. The adapter does not cache OAuth state locally in v1.
3. Callback exchanges the code. The adapter fetches the guild name with the bot token, then `POST`s `{ state, guild_id, guild_name, permissions }` to the control plane. The control plane marks the state used and stores a **pending** row. It does not activate. The bot token never leaves the adapter.
4. The browser is sent to one fixed control-plane confirm URL. That page requires the same Clerk user. Confirm activates. Reject deletes the pending row.
5. Reused, expired, or unknown state is **400**. Denying Discord’s screen creates nothing.

One guild, one show. A guild that is already bound returns a conflict until an Owner or Admin unlinks it. Pending rows do not answer fan-query.

Audit start, confirm, reject, and unlink with the Clerk user id. The connect screen requires the admin to confirm they have the rights to show that show’s released quotes and YouTube links in the server, and that those quotes are held to Discord’s Community Guidelines.

**Creator UI (v1).** On the show dashboard (same area as `FanArchiveLinkPanel`): Connect Discord (`POST .../discord/install` then redirect to `oauth_start_url`), confirm pending install, show connected guild name, optional Ask role picker (`GET .../discord/roles` — §7.2), unlink, and a read-only link or embedded summary of rollups (`GET .../discord/rollups`). Rollups may be JSON-only in v1 if no chart ships; the API is required.

Unlink deletes the binding, then the control plane calls the adapter’s private `POST /internal/guilds/{guild_id}/leave` (service bearer on the adapter). The adapter calls `DELETE /users/@me/guilds/{guild_id}`. If the adapter is down, the binding is still gone. Persist a `discord_guild_leave_outbox` row (guild id, attempts, next_retry_at) and retry leave until success or manual ops. There is no Gateway, so a kick does not auto-delete. Commands stop because Discord stops delivering interactions. The deletion URL still wipes the row.

Rotating or revoking `/archive/{token}` does not disconnect Discord. Disconnecting Discord does not revoke the public link. The public archive token is never placed in Discord, command options, or logs.

`DISCORD_GUILD_CAP` (default **40**) rejects a new binding until an operator records that Discord verification succeeded. The 41st attempt returns a clear Admin error. Pending rows count toward the cap.

---

## 7. Control-plane API

Client-supplied `project_id`, `force_agentic`, collection, and `job_ids` are **rejected**, not ignored.

**Service bearer (adapter → CP).** `Authorization: Bearer` value from `EMBER_DISCORD_SERVICE_BEARER`, compared with `timingSafeBearerMatch` in `secret-probation/apps/web/src/lib/security/bearer-auth.ts`. Wrong or missing → **401**. This is not a SPEC-1.2 engine JWT.

| Call | Auth | Effect |
|------|------|--------|
| `POST /api/shows/{projectId}/discord/install` | Clerk, Owner or Admin | Mint OAuth `state`; return `oauth_start_url` (§6) |
| `GET /api/internal/discord/oauth/state/{state}` | service bearer | Pre-flight for `/oauth/start`: valid unused state → **200** `{ "valid": true }`; else **404** |
| `POST /api/internal/discord/bindings` | service bearer | Pending row from OAuth. Does not activate |
| `POST /api/shows/{projectId}/discord/confirm` | Clerk, Owner or Admin, same user as the state | Activate or reject pending |
| `GET /api/shows/{projectId}/discord` | Clerk, can view show | Active/pending status, guild name, `ask_role_id`, cap hint |
| `GET /api/shows/{projectId}/discord/roles` | Clerk, Owner or Admin | Guild role list for Ask-role picker (§7.2) |
| `PATCH /api/shows/{projectId}/discord` | Clerk, Owner or Admin | Set or clear `ask_role_id` only (no guild swap) |
| `DELETE /api/shows/{projectId}/discord` | Clerk, Owner or Admin | Delete binding, outbox leave, audit |
| `POST /api/internal/discord/fan-query` | service bearer | Fan query by `guild_id` (§7.1) |
| `GET /api/internal/discord/ask/jobs/{askJobId}` | service bearer | Poll async Ask (§7.1) |
| `POST /api/internal/discord/share` | service bearer | Shared-moment rollup after public post (§14) |
| `GET /api/shows/{projectId}/discord/rollups` | Clerk, can view show | Creator analytics (§14) |

Fan-query body: `guild_id`, `discord_user_id`, `interaction_id`, `mode` (`search` \| `ask` \| `about`), `query`, `member_role_ids`.

Poll query params: `guild_id`, `interaction_id` (must match the job’s `query_id`).

Share body: `guild_id`, `interaction_id`, `job_id`, `playback_start_seconds`, optional `speaker`. Reject `discord_user_id`, `query`, or snippet fields with **400**.

`discord_user_id` and `member_role_ids` are used for the cooldown and the Ask-role check. They are not stored on the billing record and are not forwarded to Spark2. The question text is forwarded to Ember because it is the question. It is flagged so it is not written into a training set, fine-tune corpus, eval set, or the archive index.

| Condition | HTTP | Code |
|-----------|------|------|
| Feature off | 404 | `not_found` |
| Guild not active | 404 | `discord_not_linked` |
| Ask role required and missing | 403 | `discord_ask_role_required` |
| Org lacks Ember | 403 | `ember_not_entitled` |
| Creator wallet empty | 402 | `creator_credits_exhausted` |
| Show daily cap exhausted | 429 | `public_daily_ask_cap` |
| Ask queued | 202 | `{ "status": "queued", "ask_job_id": "<uuid>" }` — no public `poll_url` |
| Duplicate interaction | 409 | `discord_interaction_replay` |

`fan_module_not_in_plan` is not returned in v1.

`about` returns the show name and whether Ask is available. When a public link is enabled, it also returns the full `/archive/{token}` URL. Log that about ran. Do not log the token or the URL.

### 7.1 Fan-query pipeline (normative)

Resolve the **active** guild binding → `orgId`, `projectId`, optional `ask_role_id`. If `!emberDiscordEnabled()` (§8), **404**. Pending bindings do not answer.

1. **Ask role.** If `ask_role_id` is set and not in `member_role_ids`, **403** `discord_ask_role_required`.
2. **Entitlement.** `hasActiveEmberEntitlement(orgId)` or **403** `ember_not_entitled`.
3. **Idempotency (Ask only).** Atomically claim `discord:{interaction_id}` for ≥24h before any Ember work. Replay → **409** `discord_interaction_replay` (adapter maps to a single ephemeral outcome, no second debit).
4. **Per-user cooldown (Ask only).** ~30s keyed by `discord_user_id` (§10).
5. **Classify** with `classifyArchiveQuery` (same as public archive). `about` skips the router and returns show metadata.
6. **Daily cap (Ask only).** After classification resolves to Ask mode, call `consumeFanAskDailySlot(orgId, projectId)` (§9) **before** `routeArchiveQuery`, matching `POST /api/archive/{token}/query` order. Cap failure → **429** `public_daily_ask_cap`.
7. **Membership.** `buildDiscordFanMembership(orgId)` — same shape as `buildPublicArchiveMembership` in `secret-probation/apps/web/src/lib/ember/public-archive/membership-context.ts`, with `clerkUserId: "discord-fan"`.
8. **Router.** `routeArchiveQuery({ surface: "public", membership, projectId, query, mode, discoverOrigin: "discord_guild", fixedQueryId: "discord:{interaction_id}" })`. Add `fixedQueryId` to `ArchiveQueryRouterInput` in the same change. Only the fan-query handler may set it; public archive and staff routes **400** if the field is present. When set, both sync and async Ask paths use it as `queryId` (instead of `randomUUID()` in `runProjectAsk` / `submitAsyncEmberAsk`). Do **not** pass `publicArchiveToken`. Reject any client `force_agentic` on this path (already forbidden for `surface: "public"`).
9. **Async Ask.** When the router queues Ask, forward `fixedQueryId` into `submitAsyncEmberAsk` as `queryId` (that helper already accepts optional `queryId`). Jobs use queue surface **`public`** (`ember-ask-public`). Do not return `poll_url` to the adapter; return only `ask_job_id`. The adapter polls `GET /api/internal/discord/ask/jobs/{askJobId}?guild_id=&interaction_id=`.
10. **Poll auth.** Load the job scoped to binding `orgId` + `projectId` + surface `public`. Require `query_id === discord:{interaction_id}` and guild still active. Sanitize with `sanitizePublicAskJobStoredResult` / `sanitizePublicArchiveQueryResponse` (same fan-safe fields as the public archive).
11. **Sync responses.** Sanitize like the public archive BFF. Increment cited rollups (§14) from the rendered citation/search set.
12. **Metering.** On completed Ask (sync or async worker), `emitEmberQueryUsage` with `queryId: discord:{interaction_id}` and `surface: "discord"` (§10). Router/archive events may still record `surface: "public"` for queue routing; billing and usage analytics use **`discord`** for this path.

Extend `DiscoverQueryOrigin` with `"discord_guild"` in the same change. Extend `EmberBffSurface` / Prometheus labels with `"discord"` for fan-query and poll routes (`withEmberBffMetrics` pattern in `metrics-prometheus.ts`).

### 7.2 Persistence (control plane)

Postgres tables (Drizzle names illustrative; columns are normative):

**`discord_oauth_states`**

| Column | Notes |
|--------|--------|
| `state` | Primary key, opaque nonce |
| `org_id`, `project_id` | Show scope |
| `clerk_user_id` | Installer who minted the state |
| `expires_at` | 10 minutes from mint |
| `used_at` | Set when adapter `POST .../bindings` succeeds; reuse → **400** |
| `created_at` | Audit |

**`discord_guild_bindings`**

| Column | Notes |
|--------|--------|
| `id` | UUID primary key |
| `org_id`, `project_id` | One **active** binding per show; one **active** binding per `guild_id` globally |
| `guild_id` | Discord snowflake string |
| `guild_name` | Display name at install time; refresh optional v1.1 |
| `status` | `pending` \| `active` |
| `ask_role_id` | Nullable snowflake; null = no extra Ask gate |
| `installed_by_clerk_user_id` | Last Owner/Admin who confirmed (or started pending) |
| `oauth_state` | FK to `discord_oauth_states.state` while pending; cleared on activate |
| `created_at`, `activated_at`, `deleted_at` | Soft-delete on unlink; fan-query ignores non-active |

**`discord_guild_leave_outbox`**

| Column | Notes |
|--------|--------|
| `guild_id` | Primary key while row is open |
| `org_id`, `project_id` | Audit |
| `attempts` | Incremented each failed leave |
| `next_retry_at` | Backoff schedule |
| `last_error` | Truncated message for ops |
| `created_at`, `completed_at` | Row deleted or marked complete after successful leave |

**`discord_episode_rollups`** (§14)

| Column | Notes |
|--------|--------|
| `org_id`, `project_id`, `job_id`, `kind` | `kind` = `cited` \| `shared`; composite unique key |
| `count` | Increment on each qualifying event |
| `playback_start_seconds`, `speaker` | **Shared** rows only; null for **cited** |

**Redis (not Postgres)**

| Key | TTL | Purpose |
|-----|-----|---------|
| `fan-ask-daily:${orgId}:${projectId}:${utcDay}` | UTC midnight | Shared daily Ask cap (§9) |
| `discord:interaction-claim:${interaction_id}` | ≥24h | Ask idempotency before Ember (§7.1) |
| `discord:post:${guildId}` / `discord:poll:${guildId}` | 60s windows | Burst/poll abuse brakes (§9) |

Per-user Ask cooldown (§10) may use Redis or Postgres with 72h TTL; not stored on rollups or meter events.

**Ask role picker.** `GET /api/shows/{projectId}/discord/roles` requires an **active** binding. Control plane calls adapter `GET /internal/guilds/{guild_id}/roles` with `EMBER_DISCORD_ADAPTER_INTERNAL_TOKEN`. Adapter uses the bot token and returns `{ "roles": [{ "id": "<snowflake>", "name": "<string>" }] }` (guild roles only; no members). No long-lived CP cache in v1 — fetch when the settings panel opens. If the adapter is down, return **503** with a retry message; do not expose the bot token to the browser.

---

## 8. Entitlement and feature flag

**Feature flag.** `EMBER_DISCORD_ENABLED` (default off), same truthy parsing as `EMBER_PUBLIC_ARCHIVE_ENABLED` in `secret-probation/apps/web/src/lib/ember/public-archive/config.ts`. When off: hide Connect UI, return **404** on fan-query, poll, share, and rollups. OAuth start may still 404 at the adapter if the CP binding endpoint is disabled.

**Entitlement.** v1 calls `hasActiveEmberEntitlement(orgId)` and nothing finer. That is what the public archive enforces today. `EMBER_PUBLIC_TIER_GATES_ENABLED` is not implemented. An entitled org can connect and can Ask, subject to the wallet and the show daily cap. Sales must not promise Studio-only or tier-gated Discord Ask until tier gates ship for every fan surface.

---

## 9. Daily Ask cap

Today `consumePublicArchiveDailyAskSlot(tokenHash)` in `secret-probation/apps/web/src/lib/ember/public-archive/daily-cap.ts` uses Redis key `public-archive:ask-daily:${tokenHash}:${utcDay}`. Discord has no token hash. A Discord-only show would have no cap, and a show with both surfaces would not share one.

Refactor to **`consumeFanAskDailySlot(orgId, projectId)`** with Redis key `fan-ask-daily:${orgId}:${projectId}:${utcDay}`. The public archive route and fan-query both call it when entering the Ask path **after** classification resolves to Ask and **before** `routeArchiveQuery`, same order as `apps/web/src/app/api/archive/[token]/query/route.ts`. The 101st Ask on either surface returns **429** `public_daily_ask_cap`. Failed or queued Asks still consume a slot once the cap call succeeds (same as public archive today).

Cap limit env: keep **`EMBER_PUBLIC_ARCHIVE_DAILY_ASK_CAP`** as the single knob (default 100) unless renamed in the same PR to `EMBER_FAN_ASK_DAILY_CAP` with backward-compatible read of the old name.

Burst and poll limits stay per surface: `public-archive:post:` / `public-archive:poll:` for token hash + IP; add `discord:post:${guildId}` and `discord:poll:${guildId}` for fan-query and internal poll (guild-scoped, no IP on signed adapter traffic).

Migrate in the same control-plane change. For each active public link, if today’s token-hash key exists, seed the show key with that count so the UTC day does not reset. Afterward, rotating the public token does not reset the day’s count. Do not invent a synthetic token hash. Do not keep a second cap.

---

## 10. Billing

`emitEmberQueryUsage` (`secret-probation/apps/web/src/lib/billing/meter.ts`) takes `orgId`, `queryId`, `projectId`, and `emittedAt`. This work adds optional `surface` (`discord` \| `public` \| `staff`) on `EmberQueryMeterInput` and on the usage-event `properties`. Public-archive call sites pass `public` in the same change. The debit still succeeds if the meter ignores an unknown property.

Discord `queryId` is `discord:{interaction.id}`. Claim it atomically before Ember is called (§7.1). Keep it unique for at least 24 hours. Two deliveries of the same interaction must not both start an Ask or both debit. The event carries org, project, `surface: "discord"`, and credit amount. It does not carry a Discord user id.

Debit one `ember_query` when Ask completes (sync router path or async worker completion). When `query_id` on the job starts with `discord:`, the worker passes `surface: "discord"` into `emitEmberQueryUsage`. A Discord edit failure after completion does not reverse the credit. Search, metrics, and about are not debited.

Per-user Ask cooldown is about 30 seconds, keyed by the invoking Discord user id, then that id is dropped when the 72-hour window ends (§15).

---

## 11. Interaction protocol

Normative Discord docs: [Interactions overview](https://docs.discord.com/developers/interactions/overview), [Receiving and Responding](https://docs.discord.com/developers/interactions/receiving-and-responding).

Verify `X-Signature-Ed25519` over `X-Signature-Timestamp` concatenated with the **raw** body, using `discord-interactions` `verifyKey`. Do not mount `express.json()`, a Fastify JSON parser, or any other body parser on `POST /interactions`. Read the raw buffer, verify, then `JSON.parse`. Reject `Content-Length` above 256 KiB before reading. Missing headers or a bad signature → **401**. Also reject a timestamp skewed more than 5 minutes. Do not log the body on failure.

Repeated verification failures cause Discord to remove the Interactions Endpoint URL and to email and DM the developer. A string of 401s from Discord’s own validation is an incident.

| Request | Response |
|---------|----------|
| PING (`type` 1) | HTTP 200, `Content-Type: application/json`, body `{"type":1}`. Do not call the control plane. Do not dedupe PINGs |
| Slash command | HTTP 200, callback type **5**, `data.flags` = **64** (ephemeral). Do not 202 and then POST the callback |
| Edit the thinking message | `PATCH /webhooks/{application_id}/{token}/messages/@original` using the interaction token, not the bot token |
| Hard-stop if that edit failed | One `POST /webhooks/{application_id}/{token}` while the token is valid. Retry the edit twice first |
| Post to channel | Callback type **4** without flag 64. A new message. The ephemeral original stays |

Flag 64 cannot be cleared later. Do not use callback type 6. Do not set `channel_id`. Discord targets the interaction channel, including a thread. If Discord returns 403 on the public post, reply ephemeral: “Ember can’t post in this channel.”

Do not wrap this in `discord.js`. In that library, `followUp()` after `deferReply()` can edit the original instead of posting. The handler says so in a comment.

`custom_id` is `post:{interaction_id}` (max 100). The formatted public payload sits in memory for 15 minutes, keyed with the invoking user id. A click from any other user is ignored. Cache miss → ephemeral “Run the command again.” Do not put the question text in `custom_id`. The button is omitted on 402, 429, 403, and not-linked replies.

At 90 seconds still queued, edit to say it is still working or to retry. Hard-stop with an error edit before the 15-minute token dies.

`allowed_mentions` is `{ "parse": [] }` on every message.

Snowflake ids stay strings. Never coerce with `Number()`.

On SIGTERM, stop accepting and wait up to 20 seconds for in-flight edits. A kill during an Ask can leave the thinking message. The credit rule is unchanged.

`GET /health` is unauthenticated, returns only status, and is not the interactions URL.

---

## 12. Adapter rate ceiling

Do not IP-limit requests that carry both signature headers. Discord delivers interactions from its own IPs. An IP ceiling there would throttle real commands and the URL-validation PING.

1. Missing signature headers → **401**, counted toward a per-IP bucket (default 60/minute). Excess → **429** without verify.
2. Bad signature → **401**, same IP bucket. Valid signature outside the 5-minute window → **401**, no control-plane call.
3. Good signature → per-guild bucket (default 30/minute, burst 10) and a process-wide cap (default 50/second). Over either cap, ephemeral “Ember is busy — try again in a minute.” Do not call the control plane. Do not defer and then hang.
4. Only then call fan-query. The cooldown and the show daily cap still apply.

PING is not in the guild bucket. A validation PING must succeed. Respect Discord `429` `retry_after` on the way out. Do not retry a Discord **401**.

OAuth routes (browsers) are limited per IP, default 20/minute. Health is excluded.

Environment: `DISCORD_UNSIGNED_IP_LIMIT_PER_MIN`, `DISCORD_GUILD_LIMIT_PER_MIN`, `DISCORD_GUILD_BURST`, `DISCORD_PROCESS_RPS`.

v1 is one container. Restart clears buckets and the post-to-channel cache. That is accepted. A second replica must move both to Redis.

---

## 13. Formatter

Discord limits: content 2,000; up to 10 embeds; description 4,096; field value 1,024; combined embed text 6,000. Ask prose caps in [SPEC-EMBER-ASK-OUTPUT-CONTRACT.md](./SPEC-EMBER-ASK-OUTPUT-CONTRACT.md) are about 500–900 characters.

- Search: at most 5 moments. Episode title, speaker, timestamp from `playback_start_seconds`, snippet clipped to the field limit.
- Link button (style 5) only when `watch_url` is `https` and the host is `youtube.com`, `www.youtube.com`, `youtu.be`, or the configured archive host. Drop `http`, `javascript`, and IP literals. Do not invent a watch link. Ask citations often lack `watch_url` and `episode_title`. Render speaker and timestamp anyway.
- Ask: answer plus up to 3 citation fields.
- Strip `@everyone`, `@here`, `<@`, `<@&`, `discord.gg/`, and `discord.com/invite` from snippets and answers before send.
- Footer: `Ember · released episodes only`.
- Fixed ephemeral copy for not linked, Ask-role denial, missing entitlement, empty wallet, and daily cap. No Stripe. No Studio-only string in v1.

Count each successful public post (`ember_discord_post_to_channel_total`) next to command counts by mode and guild installs. These counts must not be tieable back to a Discord user. Episode and moment detail is §14, not these counters.

**Observability.** Adapter exposes Prometheus counters/histograms: signature verify outcomes, defer latency, control-plane fan-query latency, Discord webhook 429/403, post-to-channel. Control plane uses `withEmberBffMetrics` on internal discord routes with `surface: "discord"`. Alert on sustained interaction 401s (Discord will drop the endpoint URL).

---

## 14. Show rollups

The creator value is which of their episodes Discord fans used, and which moment a fan actually posted into the channel. Discord Developer Policy item 15 allows API Data to be kept for the app’s stated function when it is aggregated so it cannot identify a person. These rows are that aggregate. They are not a fan log, and they are not a claim that the data was never obtained through Discord.

The control plane writes them. The adapter does not store them. Idempotency uses the existing `discord:{interaction.id}` claim (§10). That claim is not copied onto the rollup row. After the claim expires, the count remains and the interaction id does not.

**Cited.** When search or ask is shown to the fan, count each distinct `job_id` in the rendered set only (at most 5 search hits, at most 3 ask citations). Five hits in one episode count once for that command. Skip a hit with no `job_id`. Do not store `start_seconds`, `playback_start_seconds`, `speaker`, or snippet on a cited row. A single ephemeral search must not be reconstructable as one fan’s moment. Do not count the engine’s full candidate list, `about`, errors, empty retrieval, or a retried interaction.

**Shared.** After Discord accepts the public post, the adapter calls `POST /api/internal/discord/share` with `guild_id`, `interaction_id` (idempotency only), `job_id`, and `playback_start_seconds` (whole seconds; use `start_seconds` only when playback start is missing). Optional `speaker` is the archive speaker label, not a Discord user. No `discord_user_id`, role ids, or question text. Skip a post with no `job_id`. One share per interaction. This grain is allowed because that moment is already the bot’s public message in the server. Cited rows do not use it.

Each stored row is `org_id`, `project_id`, `job_id`, `kind` (`cited` or `shared`), and `count`. A shared row also has `playback_start_seconds` and may have `speaker`. The same key from many fans increments `count`. Do not store snippet text, question text, `guild_id`, `interaction_id`, or any Discord user id.

Rows live with the show. Unlink does not delete them. Deleting the project does. There is no per-user key, so a Discord deletion request cannot subtract one fan from a count. The privacy policy says that, in the same place it describes the 72-hour raw-question window.

`GET /api/shows/{projectId}/discord/rollups` requires a Clerk session that can view the show. It returns command totals, top cited episodes (`job_id` and count), and top shared moments (`job_id`, playback start, speaker, count). It returns no fan identity. Episode titles are read from the show’s catalog at read time, not stored as a copy of Discord text.

---

## 15. API Data

Anything received through Discord’s API is API Data: guild id, guild display name, invoking user id, role ids, slash-command text, interaction tokens, OAuth tokens, and the bot token. Developer credentials are API Data. They stay out of git. They are not embedded in an open-source tree.

| Field | Stops |
|-------|--------|
| Interaction token, OAuth access token | Memory only. Never disk or logs |
| Invoking Discord user id | Cooldown, then **72 hours**, then delete. Not on the meter event. Not sent to Spark2 |
| Role ids | Compared on the request. Not stored |
| Slash-command text | Sent to Ember as the question. Not trained on. Not written into the index. **72 hours**, then delete, including Ember prompt logs for `surface=discord` |
| Guild id, guild display name, Clerk installer id | Kept while the binding exists. Deleted on unlink. A deletion request deletes backup copies on the next backup cycle |

Show rollups (§14) are the aggregated form Policy item 15 allows. They are not a second copy of this table. Raw interaction payloads, user ids, and question text are not kept on them.

Stored API Data is encrypted at rest. The privacy policy states 72 hours and names Secret Probation as the operator.

Users get a deletion URL on the Discord application profile and in `/ember about`. Unlink deletes the binding. A deletion request deletes rows keyed by that Discord user id even if the bot was already kicked. An incident that exposes API Data is reported to Discord and to affected users, as the Developer Terms require.

Do not use API Data to profile fans, build a CRM, target ads, or decide eligibility. Do not send it to an ad network, a data broker, or Metronome as an identity. Do not contact users outside Discord using API Data. Do not DM. Do not post on join. Do not post on a schedule. Do not send marketing in command replies.

The application is **age-restricted (18+)**. One app cannot be all-ages in one server and adult in another. It is not directed at anyone under 13. The bot is named Ember. The description states that it is a Secret Probation application and is not Discord.

A report URL is on the application profile and in `/ember about`. Reports are reviewed.

---

## 16. Verification clock

Re-check Discord’s current server-count threshold in the Developer Portal before launch. The historical line is 75 servers. There is no review SLA. Do not put a calendar date on approval. The cap, not the calendar, stops the next server.

Privileged-intent review (message content, member list, presence; 10,000-user threshold in Discord’s 2026 note) does not apply. This app requests none.

- Before the first design-partner install: privacy policy URL, terms URL, report URL, deletion URL, 18+ label, and a data inventory that matches §15. The inventory also describes §14 as aggregated counts with no Discord user id, and says a deletion request cannot subtract one fan from those counts.
- At 25 connected guilds: submit verification. Do not wait for 70.
- Self-serve install stays off until verification is approved **and** counsel has confirmed §17. Design-partner installs are the only path under the cap.

---

## 17. Premium Apps boundary

v1 sells no Discord-specific SKU. Fans are not charged inside Discord. Ask follows the creator’s existing Ember plan, bought on Secret Probation’s site for the archive. No price and no upgrade button appear in Discord.

The October 2024 Developer Policy requires Premium Apps, at no higher price, when a developer sells a paid feature of the Application in a region where Discord offers that. A later Discord-specific paid add-on has to go through Premium Apps before it is sold. v1 does not create that add-on.

Counsel confirms this boundary before self-serve install. That confirmation does not block accepting this spec. The guild cap stays until both counsel and Discord verification are done.

---

## 18. Secrets

Public key, OAuth client secret, and the control-plane bearer are on the adapter server. The bot token is on the adapter for `register`, guild-name fetch, and leave. The interaction hot path does not need the bot token. The control plane never stores it.

Rotating the bot token is a portal reset, an adapter restart, and one deliberate `register` run. Public-key rotation is a portal change plus a restart. Do not commit any of them.

---

## 19. Tests

**PR ownership:** fan-query core → **CP-4**; cited/share rollups → **CP-6** only. See [docs/pr/CP-4.md](./pr/CP-4.md) and [docs/pr/CP-6.md](./pr/CP-6.md).

Adapter, with the control-plane client stubbed:

- Valid and invalid signatures, including a re-serialized body, which must fail.
- PING returns type 1 with `Content-Type: application/json` and does not call the client.
- A second delivery of the same `interaction.id` does not call fan-query twice.
- A 19-digit snowflake survives as a string.
- Formatter stays inside the embed caps and the 2,000-character fallback.
- Post to channel is type 4 without flag 64. Error replies omit the button. A click whose user id does not match the cached invoker does not post.
- Over guild cap or process cap returns the busy string and does not call the client. Missing signature headers over the IP cap return 429 before verify. A request that has both signature headers is not IP-limited.
- A signature outside the 5-minute window does not call the client.
- 404 / 402 / 429 / 403 map to the fixed copy.
- A `watch_url` off the allowlist is omitted. Snippets lose `@everyone` and invite links.
- `/oauth/start` with an unknown state does not redirect to Discord. The callback redirect target is the one configured confirm URL.

Control plane, without importing the adapter:

- Editor denied. `POST .../discord/install` denied for Editor. Pending state does not answer fan-query. State reuse rejected. Binding conflict.
- `POST .../discord/install` returns `oauth_start_url`; expired state does not redirect from adapter `/oauth/start`.
- Client `project_id` and client `fixedQueryId` rejected on public/staff routes.
- `EMBER_DISCORD_ENABLED=0` → 404 on fan-query.
- Show-level daily cap via `consumeFanAskDailySlot`, including a seeded migration off today’s token-hash key. Cap consumed before router on Ask, including failed downstream Ask.
- Unique `discord:{interaction.id}` claim. Wrong service credential → 401.
- Fan-query integration test: `buildDiscordFanMembership` + `routeArchiveQuery` stubbed engine, cited rollups on search.
- Queued Ask returns `ask_job_id` only; poll requires matching `interaction_id` and returns sanitized payload.
- `surface: "discord"` on the usage event when `query_id` is `discord:*`. No Discord user id on that event.
- A completed search increments one cited row per distinct `job_id` in the rendered set, once per interaction. A hit with no `job_id` is skipped. A cited row has no timestamp and no speaker. A share body that includes `discord_user_id` or question text is rejected. The stored share row has no `interaction_id`. The rollup read returns no fan identity.
- Unlink enqueues leave outbox; `DELETE` is Clerk-only on `/api/shows/{projectId}/discord`.
- `/api/internal/*` is absent from the public vhost.

Adapter smoke (after deploy): `scripts/discord_adapter_smoke.sh` — PING, bad signature 401, stubbed fan-query with service bearer (run on `.206` or BenSpark against pilot URL).

---

## 20. Not yet

These block a design-partner install. They do not block accepting this spec, and they are not open design questions.

- No GitHub repo, package, or Dockerfile.
- No Discord application in the developer portal.
- No public hostname, tunnel, or bot token.
- No control-plane route, schema, or meter change.
- No GTM doc edit.
- Counsel has not confirmed §17.
- Privacy policy, terms, report URL, and deletion URL do not exist yet.

---

## 21. Acceptance

- [x] A reader who was not in the design thread can implement §5–§19 without guessing.
- [x] Fan-query (§7.1) reuses `routeArchiveQuery` with synthetic membership, `surface: "public"` for queue/sanitize, and `fixedQueryId` for idempotent Ask.
- [x] Daily cap is per show via `consumeFanAskDailySlot`, with migration that does not zero out the current UTC day; cap timing matches public archive.
- [x] `EMBER_DISCORD_ENABLED` gates connect, fan-query, and rollups.
- [x] v1 does not return `fan_module_not_in_plan`.
- [x] Confirm requires the same Clerk user who minted the state. The bot token stays in the adapter.
- [x] Internal routes include fan-query, poll, and share; unlink is Clerk `DELETE` on the show, not on `/api/internal/*`.
- [x] Show rollups (§14) count cited episodes and public shared moments, keep no Discord user id, snippet, question text, or interaction id, and do not store a timestamp on cited rows.
- [x] API Data inventory in §15 matches what the privacy policy will say.
- [x] §20 is still true at accept time.

A change after accept amends this spec first.

---

## 22. Build order (after accept only)

**Multi-agent PR plan:** [BUILD_PHASES.md](./BUILD_PHASES.md) · **One PR per agent:** [docs/pr/README.md](./pr/README.md)

1. ~~Create `Secret-Probation/ember-discord-adapter` with this spec as `docs/SPEC.md`.~~ Done. Voxen pointer: [EMBER_DISCORD_POINTER.md](https://github.com/Secret-Probation/Voxen/blob/master/docs/EMBER_DISCORD_POINTER.md).
2. ~~Interactions server (AD-1):~~ verify, PING, deferred ack, rate ceiling, stub CP — **merged**. Remaining adapter work: **AD-2…AD-7** in `docs/pr/`.
3. Control plane: **CP-1…CP-8** in `docs/pr/` (schema, cap, fan-query, install UI, rollups).
4. OAuth + confirm: **AD-4**, **CP-7**, **CP-8**.
5. Live search/ask: **CP-4**, **CP-5**, **AD-2**, **AD-3**.
6. Post-to-channel, metrics, deploy: **CP-6**, **AD-6**, **AD-7**.

Pilot on the SWTS show after the public archive path is already on. The interactions URL is the adapter’s public hostname.
