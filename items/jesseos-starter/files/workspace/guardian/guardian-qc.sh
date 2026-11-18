#!/bin/bash
# guardian-qc.sh - one self-healing QC pass over EVERY unattended job in registry.json (pipeline-qc engine).
# Runs every 10 min via com.jesse.guardian. Manual: /bin/bash guardian-qc.sh   (bash 3.2 safe)
#   Tier 1 (inside guardian.py probe): load agent / restore last-good state JSON / re-run the job, re-check.
#   Tier 2: headless Claude fixes the job's script (only jobs with selfheal:true, max once per 6h per job),
#           kept ONLY if a fresh run of the job then checks green; otherwise reverted.
#   Tier 3: alert through notify.py, throttled: the same problem is re-sent at most every 6h.
set -uo pipefail
export PATH="/usr/local/bin:/opt/homebrew/bin:$HOME/.local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
source "$HOME/.claude/skills/pipeline-qc/scripts/qc-lib.sh"

cd "$HOME" || exit 1   # never run from a TCC-blocked cwd (~/Documents): gmail/uv fail there
G="$HOME/JesseOS/workspace/guardian"; PY="$(command -v python3)"; RUN_ID="$(date +%s)$$"
NOTIFY="$HOME/JesseOS/workspace/notify/notify.py"   # the one place alerts go (Telegram)

# ---- alerts: de-duplicated (engine has no throttle and we run every 10 min) ----
eval "$(declare -f _qc_notify | sed '1s/_qc_notify/_qc_notify_base/')"
_qc_notify() {
  [ -n "${GUARDIAN_SILENT:-}" ] && return 0   # test runs: never page the owner
  local subj="$1" body="$2" key last now labels l fresh=0; now=$(date +%s)
  # Identity = WHICH jobs are red, never what the text says about them. The reason text changes between
  # passes ("re-run skipped, last re-run N min ago" vs "rerun disabled", 2 stages -> 1 stage), so hashing the
  # text (even with digits blanked) sent 8 emails on 2026-11-08 for two faults that never changed. Each red
  # job is reported ONCE per failure: the marker file
  # state/alert-<label> stays until the job is green again (cleared in _qc_summarize below, with a phone-only
  # "back to normal" push). An email goes out only if some listed red job has no marker yet.
  labels="$(printf '%s\n' "$body" | sed -nE 's/^- ([A-Za-z0-9._-]+) .*/\1/p' | sort -u)"
  if [ -n "$labels" ]; then
    for l in $labels; do [ -f "$G/state/alert-$l" ] || fresh=1; done
    [ $fresh = 1 ] || return 0                                  # every red job already reported this episode
  else                                                          # alerts without a job list: hash the text
    key="$(printf '%s' "$subj|$body" | sed -E 's/[0-9]+/N/g' | shasum | cut -c1-16)"
    last="$(cat "$G/state/alert-$key" 2>/dev/null || echo 0)"
    [ $((now - last)) -lt 21600 ] && return 0                    # same alert within 6h -> stay quiet
  fi
  _qc_notify_base "$subj" "$body"
  local rc=0
  "$PY" "$NOTIFY" send --subject "$subj" --body "$body" --level urgent --source guardian >/dev/null 2>&1 || rc=1
  if [ $rc = 0 ]; then
    if [ -n "$labels" ]; then for l in $labels; do echo "$now" > "$G/state/alert-$l"; done
    else echo "$now" > "$G/state/alert-$key"; fi
  fi
  return $rc
}

# ---- recovery: when a job that was reported red is green again, drop its marker (so the NEXT failure emails
# again) and tell the phone only (no email). Wraps the engine's summary step, which runs after every stage.
eval "$(declare -f _qc_summarize | sed '1s/_qc_summarize/_qc_summarize_base/')"
_qc_summarize() {
  local name f l red="" back=""
  for f in "${QC_FAILED[@]}"; do red="$red ${f%% *}"; done           # entries are "label — reason"
  for name in "${QC_NAME[@]}"; do
    case " $red " in *" $name "*) continue;; esac
    [ -f "$G/state/alert-$name" ] || continue
    rm -f "$G/state/alert-$name"; back="$back $name"; _qc_log "RECOVERED: $name is green again (alert marker cleared)"
  done
  if [ -n "$back" ] && [ -z "${GUARDIAN_SILENT:-}" ]; then
    "$PY" "$NOTIFY" send --subject "back to normal:$back" --body "Fixed itself or was fixed:$back" --source guardian >/dev/null 2>&1 || true
  fi
  _qc_summarize_base
}

qc_init --name "guardian" --lockdir "$G/.qc.lockd" --logfile "$G/state/qc.log" --repo "$HOME/JesseOS" \
        --heartbeat-maxgap 3600 --timeout 900

# ---- one stage per registered job (generated; bash 3.2 has no closures, so eval tiny wrappers) ----
i=0
while IFS='|' read -r label selfheal script recent; do
  [ -z "$label" ] && continue
  i=$((i+1))
  eval "probe_$i() { local o; o=\"\$(\"$PY\" \"$G/guardian.py\" probe '$label' '$RUN_ID' 2>&1 | tail -1)\"; QC_DETAIL=\"\$o\"
        case \"\$o\" in self-repaired*) QC_REPAIRED+=(\"$label: \${o#self-repaired: }\");; esac
        case \"\$o\" in ok*|self-repaired*) return 0;; *) return 1;; esac; }"
  if [ "$selfheal" = "1" ] && [ -n "$script" ] && [ -f "$script" ] && [ "$recent" = "0" ]; then
    eval "ctx_$i() { \"$PY\" \"$G/guardian.py\" context '$label' > /tmp/guardian_ctx_$i.txt 2>&1; date +%s > \"$G/state/tier2-$label\"; }"
    eval "prompt_$i() { cat <<P
You are repairing an unattended job on this Mac. It failed its health check and a mechanical
restart did not fix it.
Job: $label
What it does: \$(\"$PY\" -c \"import json;print({j['label']:j for j in json.load(open('$G/registry.json'))['jobs']}['$label']['what'])\")
Failure: \$QC_DETAIL
Log tail + launchd status: /tmp/guardian_ctx_$i.txt
Script you may fix: $script

Rules (hard):
- Fix the ROOT CAUSE with the smallest change, in $script only (or a file it directly imports in the same folder).
- Do NOT change business behaviour or safety rules: who gets emailed/texted, caps, delays, prices, wording rules,
  kill switches, budgets, dry-run flags, duplicate-send protection. Never weaken a check just to make errors go away.
- Do NOT send any email/SMS/post, do NOT run the job yourself (the guardian re-runs it to verify), do NOT delete data.
- Syntax-check your edit (python3 -m py_compile / bash -n).
- If it needs a human (login, password, 2FA, macOS privacy permission, paid account), change NOTHING and print
  'HUMAN NEEDED: <reason>'.
P
}"
    qc_stage --name "$label" --probe "probe_$i" --selfheal-file "$script" --selfheal-context "ctx_$i" \
             --selfheal-prompt "prompt_$i" --selfheal-allowed-tools "Read,Edit(/${script%/*}/**),Grep,Glob,Bash(python3 -m py_compile:*),Bash(bash -n:*),Bash(tail:*),Bash(head:*),Bash(grep:*),Bash(ls:*)" \
             --selfheal-max-turns 40 --commit
  else
    qc_stage --name "$label" --probe "probe_$i" --human-gate     # Tier 1 is inside the probe; then page the owner
  fi
done < <("$PY" - "$G" <<'PY'
import json, os, sys, time
G = sys.argv[1]
for j in json.load(open(os.path.join(G, "registry.json")))["jobs"]:
    s = os.path.expanduser(j.get("script", "") or "")
    t = os.path.join(G, "state", "tier2-" + j["label"])
    recent = 1 if os.path.exists(t) and time.time() - float(open(t).read().strip() or 0) < 6 * 3600 else 0
    print(f"{j['label']}|{1 if j.get('selfheal') else 0}|{s}|{recent}")
PY
)

qc_run "$@"
