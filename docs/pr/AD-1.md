# AD-1 — Interactions skeleton (done)

| Field | Value |
|-------|--------|
| **Repo** | `ember-discord-adapter` |
| **Status** | **Merged** on `main` (§22.2) |
| **PR** | Initial + `feat: HTTP interactions server` commits |

## Delivered

- Raw-body Ed25519 verify (async `verifyKey`)
- PING, deferred ack type 5 + flag 64
- Rate limits §12
- Interaction idempotency (adapter-side before CP)
- Stub `ControlPlaneClient`
- Basic sanitize helpers + vitest

## Follow-ups

- **AD-2** webhook + formatter
- **AD-3** poll loop after CP-5
