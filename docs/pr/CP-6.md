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

## Test plan

- [ ] §19 rollup bullets.
