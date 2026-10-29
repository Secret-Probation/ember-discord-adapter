#!/usr/bin/env bash
# Hybrid Discord smoke — BenSpark → controlplane .206 (CP + optional adapter).
#
# Host: BenSpark (192.168.0.66) — ~/ember-discord-adapter
# Secrets: ~/.config/voxen/discord-206-smoke.env (see discord-206-smoke.env.example)
#
# Does not require a live Discord guild. Fan-query with unbound guild expects 404.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${DISCORD_206_ENV:-${HOME}/.config/voxen/discord-206-smoke.env}"

if [[ -f "${ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +a
fi

CP_BASE="${CP_BASE_URL:-http://192.168.0.206:3010}"
CP_BASE="${CP_BASE%/}"
ADAPTER_PUBLIC="${ADAPTER_PUBLIC_URL:-}"
BEARER="${EMBER_DISCORD_SERVICE_BEARER:-}"
GUILD="${SMOKE_GUILD_ID:-9876543210987654321}"
SSH_HOST="${SSH_HOST:-digitize@192.168.0.206}"
ADAPTER_CONTAINER="${ADAPTER_CONTAINER:-ember-discord-adapter}"
CURL=(curl -sS --connect-timeout 8 --max-time 30)

fail() {
  echo "206-smoke FAIL: $*" >&2
  exit 1
}

warn() {
  echo "206-smoke WARN: $*" >&2
}

ok() {
  echo "206-smoke OK: $*"
}

echo "=== Ember Discord hybrid .206 smoke ==="
echo "env file: ${ENV_FILE} ($([[ -f ${ENV_FILE} ]] && echo present || echo missing))"
echo "CP_BASE=${CP_BASE}"
echo "ADAPTER_PUBLIC=${ADAPTER_PUBLIC:-<skip adapter public>}"
echo ""

echo "[1] Control plane web reachable"
cp_root_code="$("${CURL[@]}" -o /dev/null -w '%{http_code}' "${CP_BASE}/" || echo "000")"
case "${cp_root_code}" in
  000) fail "cannot reach ${CP_BASE} (network/DNS/firewall)" ;;
  2??|3??|4??|5??) ok "CP HTTP ${cp_root_code} at ${CP_BASE}/" ;;
  *) fail "unexpected CP HTTP ${cp_root_code}" ;;
esac

if [[ -z "${BEARER}" ]]; then
  warn "EMBER_DISCORD_SERVICE_BEARER unset — skipping CP internal Discord routes"
else
  echo "[2] CP GET /api/internal/discord/health (service bearer)"
  health_code="$("${CURL[@]}" -o /tmp/discord_206_cp_health.json -w '%{http_code}' \
    -H "Authorization: Bearer ${BEARER}" \
    "${CP_BASE}/api/internal/discord/health")"
  case "${health_code}" in
    200)
      grep -q '"ok"' /tmp/discord_206_cp_health.json || fail "health body missing ok"
      ok "discord health 200"
      ;;
    404)
      warn "discord health 404 — EMBER_DISCORD_ENABLED likely off on .206"
      ;;
    401) fail "discord health 401 — bearer mismatch with .206 CP" ;;
    *) fail "discord health HTTP ${health_code}" ;;
  esac

  echo "[3] CP POST /api/internal/discord/fan-query (mode=about, guild=${GUILD})"
  fq_code="$("${CURL[@]}" -o /tmp/discord_206_fan_query.json -w '%{http_code}' \
    -X POST "${CP_BASE}/api/internal/discord/fan-query" \
    -H "Authorization: Bearer ${BEARER}" \
    -H "Content-Type: application/json" \
    -d "{\"guild_id\":\"${GUILD}\",\"discord_user_id\":\"2222222222222222222\",\"interaction_id\":\"3333333333333333333\",\"mode\":\"about\",\"query\":\"\",\"member_role_ids\":[]}")"
  case "${fq_code}" in
    200) ok "fan-query about 200 (guild bound)" ;;
    404) ok "fan-query 404 discord_not_linked (expected with no binding)" ;;
    403) ok "fan-query 403 (entitlement/role — check org)" ;;
    401) fail "fan-query 401 — bearer wrong" ;;
    503) warn "fan-query 503 — Redis/DB backend on .206?" ;;
    *) warn "fan-query HTTP ${fq_code} — body: $(head -c 200 /tmp/discord_206_fan_query.json)" ;;
  esac
fi

if [[ -n "${ADAPTER_PUBLIC}" ]]; then
  ADAPTER_PUBLIC="${ADAPTER_PUBLIC%/}"
  echo "[4] Adapter GET ${ADAPTER_PUBLIC}/health"
  a_health="$("${CURL[@]}" -o /tmp/discord_206_adapter_health.json -w '%{http_code}' \
    "${ADAPTER_PUBLIC}/health" || echo "000")"
  [[ "${a_health}" == "200" ]] || fail "adapter health HTTP ${a_health}"
  ok "adapter health 200"

  if [[ -n "${DISCORD_PUBLIC_KEY:-}" ]]; then
    echo "[5] Adapter signed interaction smoke (production public key)"
    export ADAPTER_BASE_URL="${ADAPTER_PUBLIC}"
    export EMBER_DISCORD_CP_BASE_URL="${CP_BASE}"
    export EMBER_DISCORD_SERVICE_BEARER="${BEARER}"
    bash "${ROOT}/scripts/discord_adapter_smoke.sh"
  else
    warn "DISCORD_PUBLIC_KEY unset — skip signed /interactions (set portal key in env file)"
  fi
else
  warn "ADAPTER_PUBLIC_URL unset — skip public adapter checks"
fi

if [[ "${RUN_SSH_CHECKS:-0}" == "1" ]]; then
  echo "[6] SSH checks on .206 (internal adapter metrics)"
  ssh -o BatchMode=yes "${SSH_HOST}" bash <<REMOTE || fail "SSH checks failed (RUN_SSH_CHECKS=1)"
set -euo pipefail
if docker ps --format '{{.Names}}' | grep -qx '${ADAPTER_CONTAINER}'; then
  docker exec '${ADAPTER_CONTAINER}' curl -sf http://127.0.0.1:8788/metrics | head -n 5
  echo "... metrics OK (first lines)"
else
  echo "container ${ADAPTER_CONTAINER} not running — skip metrics"
fi
REMOTE
  ok "SSH docker metrics probe"
fi

echo ""
echo "=== 206-smoke finished ==="
