# CP-2 — Router primitives for Discord fan-query

| Field | Value |
|-------|--------|
| **Repo** | `secret-probation` |
| **Branch** | `feat/discord-router-primitives` |
| **PR title** | `feat(discord-cp): fixedQueryId, discord_guild origin, meter surface` |
| **Depends on** | **CP-1 merged** |
| **Blocks** | CP-4 |
| **SPEC** | §7.1 steps 7–8, 12; §10 |

## Task prompt

Wire archive router for Discord: `fixedQueryId` on `ArchiveQueryRouterInput` (internal-only), `buildDiscordFanMembership`, `DiscoverQueryOrigin` `"discord_guild"`, propagate `fixedQueryId` to sync/async Ask as `queryId`, worker meters with `surface: "discord"` when `query_id` starts with `discord:`. Extend `EmberBffSurface` with `"discord"`. Reject `fixedQueryId` on staff and public archive HTTP routes with **400**.

## Scope

- `apps/web/src/lib/ember/public-archive/membership-context.ts` → add `buildDiscordFanMembership` (or `discord/membership-context.ts`).
- `archive-query-router.ts` + `runProjectAsk` / `submitAsyncEmberAsk` path.
- Ask worker completion path that calls `emitEmberQueryUsage` — add optional `surface` to `EmberQueryMeterInput` if not present.
- `apps/web/src/lib/ember/discover/types.ts` — `"discord_guild"`.
- `metrics-prometheus.ts` — `EmberBffSurface` includes `"discord"`.

## Out of scope

- HTTP fan-query route (CP-4).
- Daily cap (CP-3).

## Acceptance checklist

- [ ] Staff `/api/ember/archive/query` (or equivalent) rejects body with `fixedQueryId`.
- [ ] Public archive route rejects `fixedQueryId`.
- [ ] Unit test: async ask with `fixedQueryId` stores that `queryId` on job row.
- [ ] Worker test or unit: `discord:foo` → meter event includes `surface: "discord"`.

## Test plan

- [ ] Extend `archive-query-router` tests.
- [ ] No adapter import in CP tests.
