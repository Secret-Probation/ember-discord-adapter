# AD-7 — Deploy, register, smoke, metrics

| Field | Value |
|-------|--------|
| **Repo** | `ember-discord-adapter` |
| **Branch** | `feat/discord-deploy-metrics` |
| **PR title** | `feat(discord): Dockerfile, register script, smoke, Prometheus` |
| **Depends on** | **AD-2 merged** (minimal useful deploy) |
| **Blocks** | Phase 5 ops |
| **SPEC** | §5 register, §13 observability, §19 smoke |

## Task prompt

Add `Dockerfile`, example compose service for `.206` sidecar, `scripts/register.ts` (`PUT /applications/{id}/commands` v10, full command list §5), `scripts/discord_adapter_smoke.sh`, Prometheus `/metrics` or documented port with counters from §13. Document pilot hostname §4. Min replicas 1.

## Out of scope

- CP deploy changes (separate ops PR on secret-probation deploy repo).

## Acceptance checklist

- [ ] `register` not on container boot.
- [ ] Smoke: PING, bad sig 401, fan-query with bearer (CP stub or real).
- [ ] SIGTERM grace 20s wired (verify in `index.ts`).

## Test plan

- [ ] CI runs `npm test` + `npm run build`.
- [ ] Manual smoke note in PR.
