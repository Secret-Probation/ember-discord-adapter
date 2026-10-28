# CP-6 — Rollups (cited + share)

| Field | Value |
|-------|--------|
| **Repo** | `secret-probation` |
| **Branch** | `feat/discord-rollups` |
| **PR title** | `feat(discord-cp): episode rollups and share endpoint` |
| **Depends on** | **CP-4 merged** |
| **Blocks** | AD-6, CP-8b |
| **SPEC** | §14 |

## Task prompt

Hook cited increments from fan-query success path (shared helper called from CP-4 route or internal handler — land helper in this PR and wire CP-4 call in same PR **or** follow-up commit on main immediately after; prefer **one PR** if CP-4 already merged without hook: add call in CP-6). Implement `POST /api/internal/discord/share` (reject PII fields per §7). Implement `GET /api/shows/{projectId}/discord/rollups` (Clerk, view show). Storage on `discord_episode_rollups` per §7.2. No Discord user id on rows.

## Acceptance checklist

- [ ] Cited: distinct `job_id` per interaction, no timestamp/speaker on cited rows.
- [ ] Share: requires `job_id`, optional playback/speaker; rejects question text / discord_user_id.
- [ ] Rollups GET: no fan identity; episode titles from catalog at read time.

## SPEC §19 test ownership

| §19 CP bullet | Owner |
|---------------|--------|
| Cited rows per distinct `job_id`, no timestamp/speaker on cited | **CP-6** |
| Share body rejects PII; stored share row has no `interaction_id` | **CP-6** |
| Rollup read returns no fan identity | **CP-6** |
| Fan-query integration **without** rollup side effects | **CP-4** |

Wire cited increments from the fan-query success path (helper in this PR; call from handler invoked by CP-4 route after CP-6 merges, or include handler hook in CP-6 that patches call site on `main`).

## Test plan

- [ ] §19 rollup bullets only (not fan-query core — see CP-4).
