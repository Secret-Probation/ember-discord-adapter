# CP-3 — Show-scoped daily Ask cap

| Field | Value |
|-------|--------|
| **Repo** | `secret-probation` |
| **Branch** | `feat/discord-fan-ask-daily-cap` |
| **PR title** | `feat(discord-cp): consumeFanAskDailySlot shared with public archive` |
| **Depends on** | **CP-1 merged** (can parallel **CP-2**) |
| **Blocks** | CP-4 |
| **SPEC** | §9; Voxen `SPEC-EMBER-PUBLIC-ARCHIVE-LINK` §6.1 |

## Task prompt

Refactor daily Ask cap to **`consumeFanAskDailySlot(orgId, projectId)`** with Redis key `fan-ask-daily:${orgId}:${projectId}:${utcDay}`. Switch public archive `POST /api/archive/[token]/query` to use it (same timing: after classify, before router on Ask). Add one-time **seed migration** from existing `public-archive:ask-daily:${tokenHash}:day` to show key for active links. Add Discord burst keys `discord:post:` / `discord:poll:` helpers (used in CP-4). Keep env `EMBER_PUBLIC_ARCHIVE_DAILY_ASK_CAP` (or dual-read alias per spec).

## Scope

- `apps/web/src/lib/ember/public-archive/daily-cap.ts` refactor + tests.
- Optional small migration script or startup seed documented in PR.
- Voxen spec paragraph if CP repo does not include Voxen copy — prefer commit on Voxen in same PR only if monorepo; else note in PR body for separate V-1 follow-up.

## Out of scope

- Fan-query route.
- Changing default cap value.

## Acceptance checklist

- [ ] Public archive 101st ask still 429 `public_daily_ask_cap`.
- [ ] Seed test: token-hash count carries to show key same UTC day.
- [ ] Token rotate does not reset show key next day behavior documented/tested.

## Test plan

- [ ] Extend `daily-cap.test.ts` per §19 CP bullets.
