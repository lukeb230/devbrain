#!/bin/zsh
# ============================================================================
# Can one team reach another team's data? Two real dev tokens from two
# different teams, against the live API.
#
#   tools/isolation-test.sh <tokenA> <repoA> <tokenB> <repoB> [server]
#
# Every cross pairing below must be refused. Each team's own repo must work,
# so a refusal can never be a false pass (a broken URL would fail both ways).
# ============================================================================
set -eu
TA="${1:?tokenA}"; RA="${2:?repoA owner/name}"; TB="${3:?tokenB}"; RB="${4:?repoB owner/name}"
SERVER="${5:-https://devbrain-seven.vercel.app}"
pass=0; fail=0

hit() { # method path token body → prints the HTTP status
  local m="$1" p="$2" t="$3" b="${4:-}"
  if [ -n "$b" ]; then
    curl -s -o /tmp/iso.out -w "%{http_code}" -X "$m" -H "Authorization: Bearer $t" -H "Content-Type: application/json" -d "$b" "$SERVER$p"
  else
    curl -s -o /tmp/iso.out -w "%{http_code}" -X "$m" -H "Authorization: Bearer $t" "$SERVER$p"
  fi
}
want() { # label expected-status actual-status
  if [ "$2" = "$3" ]; then print -r -- "  ✓ $1 → $3"; pass=$((pass+1))
  else print -r -- "  ✗ $1 → $3 (expected $2): $(head -c 150 /tmp/iso.out)"; fail=$((fail+1)); fi
}
enc() { print -r -- "$1" | sed 's|/|%2F|g'; }

print -r -- "\n── each team reads its OWN repo (control) ──────────"
want "A → its own context"  200 "$(hit GET "/api/v1/context?repo=$(enc "$RA")" "$TA")"
want "B → its own context"  200 "$(hit GET "/api/v1/context?repo=$(enc "$RB")" "$TB")"
want "A → its own tasks"    200 "$(hit GET "/api/v1/tasks?repo=$(enc "$RA")" "$TA")"
want "B → its own tasks"    200 "$(hit GET "/api/v1/tasks?repo=$(enc "$RB")" "$TB")"

print -r -- "\n── across the boundary: every one must be refused ──"
want "A → B's context"      404 "$(hit GET "/api/v1/context?repo=$(enc "$RB")" "$TA")"
want "B → A's context"      404 "$(hit GET "/api/v1/context?repo=$(enc "$RA")" "$TB")"
want "A → B's tasks"        404 "$(hit GET "/api/v1/tasks?repo=$(enc "$RB")" "$TA")"
want "B → A's tasks"        404 "$(hit GET "/api/v1/tasks?repo=$(enc "$RA")" "$TB")"
want "A writes a task in B" 404 "$(hit POST "/api/v1/tasks" "$TA" "{\"repo\":\"$RB\",\"action\":\"create\",\"title\":\"isolation probe — should never exist\"}")"
want "A opens a session in B" 404 "$(hit POST "/api/v1/ingest" "$TA" "{\"repo\":\"$RB\",\"kind\":\"session_start\",\"branch\":\"main\"}")"
want "A broadcasts into B"  404 "$(hit POST "/api/v1/broadcasts" "$TA" "{\"repo\":\"$RB\",\"text\":\"isolation probe\"}")"
want "A claims in B"        404 "$(hit POST "/api/v1/claims" "$TA" "{\"repo\":\"$RB\",\"paths\":[\"src/**\"]}")"
want "A reads B's memory"   404 "$(hit GET "/api/v1/memory?repo=$(enc "$RB")&q=sla" "$TA")"

print -r -- "\n── a revoked and a forged token ───────────────────"
want "garbage token"        401 "$(hit GET "/api/v1/context?repo=$(enc "$RA")" "dbk_0000000000000000000000000000000000000000000000")"
want "no token"             401 "$(curl -s -o /tmp/iso.out -w '%{http_code}' "$SERVER/api/v1/context?repo=$(enc "$RA")")"

print -r -- "\n$pass passed, $fail failed"
exit $(( fail > 0 ))
