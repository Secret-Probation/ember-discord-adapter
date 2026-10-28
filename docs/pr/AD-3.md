# AD-3 — Ask poll loop

| Field | Value |
|-------|--------|
| **Repo** | `ember-discord-adapter` |
| **Branch** | `feat/discord-ask-poll-loop` |
| **PR title** | `feat(discord): async Ask poll via CP internal route` |
| **Depends on** | **AD-2 merged**, **CP-4 + CP-5 merged** |
| **Blocks** | Gate **G2** (full ask) |
| **SPEC** | §11 timing, §7 poll |

## Task prompt

Extend `HttpControlPlaneClient` with poll GET. On fan-query 202, loop poll until completed/failed or ~90s “still working” edit, hard-stop before 15m token expiry. Edit via AD-2 webhook client. Idempotency remains on adapter + CP claim.

## Acceptance checklist

- [ ] Poll uses guild_id + interaction_id query params.
- [ ] Completed ask renders formatter output; failed ask shows safe error.

## Test plan

- [ ] Mock CP sequence queued → processing → completed in vitest.
