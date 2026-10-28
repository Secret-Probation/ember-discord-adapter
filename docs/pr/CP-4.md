# CP-4 — Internal fan-query

| Field | Value |
|-------|--------|
| **Repo** | `secret-probation` |
| **Branch** | `feat/discord-fan-query` |
| **PR title** | `feat(discord-cp): POST /api/internal/discord/fan-query` |
| **Depends on** | **CP-1, CP-2, CP-3 merged** |
| **Blocks** | CP-5, CP-6, AD-3 (live), Gate **G2** |
| **SPEC** | §7.1 (full), §7 error table |

## Task prompt

Implement `POST /api/internal/discord/fan-query` exactly per **§7.1** (all 12 steps). Service bearer only. Resolve active binding by `guild_id`. Redis: `discord:interaction-claim:${interaction_id}` (≥24h), ask cooldown ~30s. Return sanitized sync JSON; 202 with `{ status, ask_job_id }` only (no `poll_url`). Map errors to spec codes. `about` without router.

**Rollups:** Do **not** implement cited/share persistence here — **CP-6** owns all §14 writes. CP-4 may leave a TODO hook or call no-op helper exported for CP-6.

## Likely touchpoints

- `apps/web/src/app/api/internal/discord/fan-query/route.ts`
- `apps/web/src/lib/ember/discord/fan-query-handler.ts`
- `apps/web/src/lib/ember/discord/interaction-claim.ts`
- `apps/web/src/lib/ember/discord/cooldown.ts`
- Tests beside handler.

## Out of scope

- Poll route (CP-5).
- Share rollups (CP-6) unless small cited increment included.
- Creator UI.

## Acceptance checklist

- [ ] §7.1 order: cap before router on Ask; `fixedQueryId` = `discord:{interaction_id}`.
- [ ] `EMBER_DISCORD_ENABLED=0` → 404.
- [ ] Pending binding → 404 `discord_not_linked`.
- [ ] Replay interaction → 409 `discord_interaction_replay`.
- [ ] Wrong bearer → 401.
- [ ] Client `project_id` in body rejected.
- [ ] Integration test with stubbed engine / router.

## Test plan

- [ ] All applicable §19 CP bullets for fan-query.
- [ ] Confirm `/api/internal/discord/*` not in public nginx config (document in PR).
