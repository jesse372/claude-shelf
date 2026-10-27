#!/bin/bash
# new-loop.sh — scaffold a self-healing loop from a verifiable CONTRACT.
# Usage: new-loop.sh <loop-name> "<one-line verifiable goal>"
# Creates ~/JesseOS/workspace/loops/<name>/{contract.md, run.sh, state/}
set -euo pipefail

NAME="${1:-}"
GOAL="${2:-TODO — a verifiable end-state}"
if [ -z "$NAME" ]; then
  echo "usage: new-loop.sh <loop-name> \"<one-line goal>\"" >&2; exit 2
fi

SKILL_DIR="~/.claude/skills/loop-contract"
LOOPS_DIR="$HOME/JesseOS/workspace/loops"
DEST="$LOOPS_DIR/$NAME"
TODAY="$(date +%Y-%m-%d)"

if [ -e "$DEST" ]; then
  echo "refusing to overwrite existing loop: $DEST" >&2; exit 1
fi
mkdir -p "$DEST/state"

# --- contract.md from template (simple placeholder substitution) ---
sed -e "s/{{NAME}}/$NAME/g" \
    -e "s/{{DATE}}/$TODAY/g" \
    -e "s|{{GOAL}}|$GOAL|g" \
    "$SKILL_DIR/templates/contract.md" > "$DEST/contract.md"

# --- run.sh stub: one unit of work per tick on a cheap model, deterministic verify, escalate ---
cat > "$DEST/run.sh" <<'RUNNER'
#!/bin/bash
# Loop runner — fill the TODOs, then schedule (launchd / cron / /loop).
# Design: ONE unit of work per tick -> deterministic verify -> commit/green OR circuit-break -> escalate.
set +e
LOOP_DIR="$(cd "$(dirname "$0")" && pwd)"
NAME="$(basename "$LOOP_DIR")"
STATUS="$LOOP_DIR/state/STATUS.md"
LOG="~/.claude/logs/loop-contract.log"
MAX_ITERS=10

# Generic notifier: macOS notification + append to the loop-contract log.
# To add a push channel (Slack/Telegram/email/ntfy/etc.), uncomment and fill the placeholder below.
notify(){
  local msg="$1"
  mkdir -p "$(dirname "$LOG")"
  printf '%s [%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$NAME" "$msg" >> "$LOG"
  osascript -e "display notification \"${msg//\"/\\\"}\" with title \"loop-contract: $NAME\"" 2>/dev/null
  # --- your own channel (optional) ---
  # curl -fsS -d "[$NAME] $msg" "https://your-channel.example/notify" >/dev/null 2>&1
}
escalate(){ notify "loop BLOCKED: $1"; }

# (1) VERIFIER — DETERMINISTIC. exit 0 = goal met. Replace with your real check.
verify(){
  : # TODO: e.g. (cd /path && npm test) ; or curl -fsS http://probe/health ; or schema validator
  return 1   # default: not-yet-done so the stub can't false-pass
}

# (2) WORK — one unit per tick, on a CHEAP model (never inherit a costly default).
do_work(){
  : # TODO: claude -p --model haiku --allowedTools "Edit,Bash" "<tight instruction toward the goal>"
}

# --- loop ---
if verify; then echo "$(date) ✅ already satisfied" >> "$STATUS"; exit 0; fi
last_fingerprint=""
for i in $(seq 1 "$MAX_ITERS"); do
  do_work
  if verify; then
    echo "$(date) ✅ goal met (iter $i)" >> "$STATUS"
    git -C "$LOOP_DIR" add -A 2>/dev/null && git -C "$LOOP_DIR" commit -m "loop $NAME: green (iter $i)" 2>/dev/null
    exit 0
  fi
  # circuit-breaker: bail if no progress (same failure signature twice)
  fp="$(verify 2>&1 | tail -1)"
  if [ "$fp" = "$last_fingerprint" ]; then
    echo "$(date) ⛔ no progress (iter $i): $fp" >> "$STATUS"
    escalate "No progress after repeated identical failure at iter $i: $fp"
    exit 1
  fi
  last_fingerprint="$fp"
done
echo "$(date) ⛔ hit MAX_ITERS=$MAX_ITERS without success" >> "$STATUS"
escalate "Hit max iterations ($MAX_ITERS) without meeting goal."
exit 1
RUNNER
chmod +x "$DEST/run.sh"

# --- seed state + git ---
printf '# %s — loop status\n(created %s)\n' "$NAME" "$TODAY" > "$DEST/state/STATUS.md"
git -C "$DEST" init -q 2>/dev/null || true

echo "Scaffolded loop: $DEST"
echo "  1. Fill EVERY field in   $DEST/contract.md   (no TODO may remain)"
echo "  2. Implement verify() and do_work() in   $DEST/run.sh"
echo "  3. Confirm, then schedule (launchd / cron / /loop) and record in ~/JesseOS/vault/50-memory/decisions.md"
