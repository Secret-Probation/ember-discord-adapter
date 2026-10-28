# CP-1 — Discord CP foundation

| Field | Value |
|-------|--------|
| **Repo** | `Secret-Probation/Bens-control-plane` (`~/secret-probation`) |
| **Base branch** | `main` |
| **Feature branch** | `feat/discord-cp-foundation` |
| **PR title** | `feat(discord-cp): schema, feature flag, service bearer` |
| **Depends on** | — |
| **Blocks** | CP-2, CP-3, CP-4, CP-7, AD-5 (token contract) |
| **SPEC** | §7.2, §8, §7 (bearer paragraph) |

## Task prompt

Implement **CP-1** in `secret-probation`. Add Postgres schema for Discord (§7.2), `EMBER_DISCORD_ENABLED` (§8), and shared **service bearer** auth for future `apps/web/src/app/api/internal/discord/**` routes using `EMBER_DISCORD_SERVICE_BEARER` + `timingSafeBearerMatch`. No fan-query or UI yet. Follow existing Drizzle migration numbering (`apps/web/drizzle/0037_*.sql`). Export tables from `schema.ts`. Do not store bot token. No GTM doc edits.

## Scope

1. **Tables** (§7.2): `discord_oauth_states`, `discord_guild_bindings`, `discord_guild_leave_outbox`, `discord_episode_rollups` with columns as spec.
2. **`emberDiscordEnabled()`** in `apps/web/src/lib/ember/discord/config.ts` (mirror public archive flag pattern).
3. **`assertEmberDiscordServiceBearer(request)`** — returns 401 if bearer wrong; reuse `timingSafeBearerMatch` from `bearer-auth.ts`.
4. **Placeholder route mount** optional: empty `app/api/internal/discord/health/route.ts` returning 404 when flag off, 200 `{ok:true}` when flag on + auth — proves wiring only.
5. **`.env.example`**: `EMBER_DISCORD_ENABLED=0`, `EMBER_DISCORD_SERVICE_BEARER=`, `DISCORD_GUILD_CAP=40`.

## Likely touchpoints

- `apps/web/src/lib/db/schema.ts`
- `apps/web/drizzle/0037_discord_foundation.sql`
- `apps/web/src/lib/ember/discord/config.ts` (new)
- `apps/web/src/lib/ember/discord/service-auth.ts` (new)
- `apps/web/src/lib/ember/discord/service-auth.test.ts` (new)

## Out of scope

- Fan-query, install, OAuth, rollups logic.
- Adapter repo changes.
- Public vhost exposure of internal routes.

## Acceptance checklist

- [ ] Migration applies cleanly on dev DB.
- [ ] Unique constraints: one active binding per `guild_id` and per show (`project_id`) as spec implies.
- [ ] Wrong/missing bearer → 401 on internal discord health stub.
- [ ] Flag off → discord health returns 404 or not_found behavior documented in code.
- [ ] `.env.example` updated.

## Test plan

- [ ] Unit tests for bearer match (valid / invalid / missing).
- [ ] `npm test` / vitest for new files in `apps/web`.
