# Merge gate G2a — dev proof (no live Discord guild)

**Requires merged:** CP-1..5, AD-2, AD-3.

## What G2a proves

1. **Control plane** resolves an **active** `discord_guild_bindings` row and runs fan-query (router stubbed; binding is real Postgres).
2. **Adapter** turns a sync CP search body into a **Discord webhook embed** (mocked fetch; no Discord API).

**G2b** still needs **G3** (CP-8 + AD-4 live install) or manual prod binding.

## CI

| Repo | Test | Job |
|------|------|-----|
| Bens-control-plane | `src/lib/ember/discord/discord-g2a.db.test.ts` | **Compliance DB integration** (`test:compliance-db`) |
| ember-discord-adapter | `tests/g2a-fan-query-flow.test.ts` | `npm test` (every run) |

Stable fixture IDs: `apps/web/src/lib/ember/discord/g2a-fixtures.ts` (CP).

## Local (optional)

```text
Host: BenSpark — ~/secret-probation — Bens-control-plane (main)
```

```bash
# Postgres with migrations applied (same as compliance-db CI)
export DATABASE_URL=postgresql://control_plane_app:control_plane_app@localhost:5432/control_plane
export CP_RLS_DB_TEST=1
export CP_RLS_ENABLED=true
npm run test:compliance-db -w @secretprobation/web
```

```text
Host: BenSpark — ~/ember-discord-adapter — ember-discord-adapter (main)
```

```bash
npm test -- tests/g2a-fan-query-flow.test.ts
```

Hybrid compose proof (adapter ↔ CP on docker network) remains **CP-9 / AD-7** optional; G2a is satisfied by the tests above.

## Next gates

| Gate | Needs |
|------|--------|
| **G3** | CP-8 creator UI + AD-4 OAuth (+ CP-7 merged) |
| **G2b** | G2a + G3 + real test guild |
