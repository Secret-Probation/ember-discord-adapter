# CP-9 — Hybrid deploy compose (optional)

| Field | Value |
|-------|--------|
| **Repo** | `secret-probation` (`deploy/`) and/or ops notes in adapter |
| **Branch** | `feat/discord-hybrid-compose` |
| **PR title** | `feat(discord-cp): hybrid compose for adapter sidecar on .206` |
| **Depends on** | **AD-7** (Dockerfile), **CP-1** (env var names) |
| **Blocks** | Pilot deploy |
| **SPEC** | §4 deploy, §18 secrets |

## Task prompt

Document and/or add compose overlay for **controlplane `.206`**: CP `web` + **ember-discord-adapter** sidecar on docker network; public vhost → adapter `/interactions` and `/oauth/*` only; **`/api/internal/*` not on public vhost**. Wire `EMBER_DISCORD_SERVICE_BEARER`, `EMBER_DISCORD_ADAPTER_INTERNAL_TOKEN`, `EMBER_DISCORD_CP_BASE_URL`. Min replicas 1 for adapter.

## Out of scope

- Discord Developer Portal app creation (Phase 5 ops).
- Legal URLs.

## Acceptance checklist

- [ ] Internal CP routes reachable from adapter container by service name.
- [ ] Public ingress cannot hit `/api/internal/discord/*`.
- [ ] `.env.example` on both repos aligned.

## Test plan

- [ ] Manual: curl internal fan-query from adapter network namespace.
