# CP-7 — Show API, OAuth CP side, leave outbox

| Field | Value |
|-------|--------|
| **Repo** | `secret-probation` |
| **Branch** | `feat/discord-show-api` |
| **PR title** | `feat(discord-cp): install, confirm, bindings, unlink, guild cap` |
| **Depends on** | **CP-1 merged** |
| **Blocks** | AD-4, CP-8, Gate **G3** |
| **SPEC** | §6, §7 API table, §7.2 leave outbox |

## Task prompt

Clerk routes: `POST …/discord/install`, `POST …/confirm`, `GET/PATCH/DELETE …/discord`. Internal:

- `GET /api/internal/discord/oauth/state/{state}` — valid unused unexpired row → **200** `{ "valid": true }`; else **404** (§6 step 2, AD-4).
- `POST …/discord/bindings` (service bearer).

Enforce Owner/Admin, guild cap `DISCORD_GUILD_CAP`, one guild / one show conflicts. Unlink → delete binding + insert leave outbox + call adapter leave (adapter may 503 — outbox retry). `GET …/discord/roles` proxies to adapter when binding active; if adapter unreachable → **503** with retry message (§7.2). Audit log fields per §6.

## Likely touchpoints

- `apps/web/src/app/api/shows/[projectId]/discord/**`
- `apps/web/src/app/api/internal/discord/bindings/route.ts`
- `apps/web/src/lib/ember/discord/bindings-store.ts`
- `apps/web/src/lib/ember/discord/leave-outbox.ts` + cron or existing job runner pattern

## Out of scope

- Full creator UI (CP-8).
- Adapter OAuth HTTP (AD-4).

## Acceptance checklist

- [ ] Editor denied on install.
- [ ] Install returns `{ state, oauth_start_url }`.
- [ ] Confirm requires same Clerk user as state.
- [ ] Pending does not answer fan-query (CP-4 integration).
- [ ] DELETE is Clerk-only on show route.
- [ ] Leave outbox retry documented.
- [ ] `GET …/oauth/state/{state}`: unused valid → 200; used/expired/missing → 404; wrong bearer → 401.
- [ ] `GET …/discord/roles`: adapter down → **503** (not 500 with stack trace).

## Test plan

- [ ] §19 install/confirm/conflict/unlink bullets.
