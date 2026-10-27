#!/bin/bash
# =============================================================================
# qc-lib.sh — the universal self-healing QC engine for JesseOS pipelines.
#
# Source this from a workflow's "<name>-qc.sh" spec, register your stages, then
# call qc_run. The engine walks every stage and runs each RED one up a 3-tier
# self-healing ladder so a human never has to QC by hand:
#
#   Tier 1  MECHANICAL  — a deterministic repair fn (restart a service, restore a
#                         file, re-kick a job). The engine re-probes after it.
#   Tier 2  CLAUDE       — headless `claude -p` rewrites a drifted file (parser,
#                         selector, config), GATED: the edit is kept + committed
#                         ONLY IF the SAME probe goes green afterwards; else the
#                         file is reverted and the stage escalates. Safe by
#                         construction — a bad self-edit can never survive.
#   Tier 3  HUMAN        — a notifier alert (see _qc_notify below) for true
#                         human-gates or when Tiers 1–2 give up. All-green +
#                         no-repair = silent.
#
# Design notes:
#   * Pure bash 3.2 (macOS /bin/bash) — no associative arrays; every array
#     expansion is guarded for `set -u` + empty arrays.
#   * Probe functions run IN THE CURRENT SHELL (not a subshell), so they may set
#     globals your later stages reuse (e.g. a fetched list). A probe returns 0=OK,
#     non-0=RED, and may set $QC_DETAIL to a one-line status for the log/alert.
#   * Idempotent + launchd-safe: single-instance lock, explicit-PATH friendly,
#     optional cleanup hook on exit.
#
# Public API:  qc_init … ; qc_stage … (repeat) ; qc_run "$@"
# See templates/example-qc.sh and SKILL.md for the full authoring guide.
# =============================================================================

# ---------------------------- qc_init ---------------------------------------
# qc_init --name <label> [--lockdir <dir>] [--logfile <f>] [--repo <git-dir>]
#         [--model <m>] [--timeout <s>] [--no-tidy]
qc_init() {
  QC_LABEL="qc"
  QC_LOCKDIR=""; QC_LOG="/tmp/qc.log"; QC_REPO=""; QC_TIDY=1; QC_MODEL="sonnet"; QC_TIMEOUT=600
  QC_HB_MAXGAP=108000     # 30h: alert (via the heartbeat watchdog) if no QC run completes in this long
  QC_SOFT_ESCALATE=3      # a --soft stage stuck "behind" for this many consecutive runs => escalate
  QC_CLAUDE_BIN="${QC_CLAUDE_BIN:-$(command -v claude 2>/dev/null || echo claude)}"
  # where the generic notifier appends a durable record of every Tier-3 alert
  QC_NOTIFY_LOG="${QC_NOTIFY_LOG:-~/.claude/logs/pipeline-qc.log}"
  while [ $# -gt 0 ]; do case "$1" in
    --name)             QC_LABEL="$2"; shift 2;;
    --lockdir)          QC_LOCKDIR="$2"; shift 2;;
    --logfile)          QC_LOG="$2"; shift 2;;
    --repo)             QC_REPO="$2"; shift 2;;
    --model)            QC_MODEL="$2"; shift 2;;
    --timeout)          QC_TIMEOUT="$2"; shift 2;;
    --heartbeat-maxgap) QC_HB_MAXGAP="$2"; shift 2;;
    --soft-escalate)    QC_SOFT_ESCALATE="$2"; shift 2;;
    --no-tidy)          QC_TIDY=0; shift;;
    *) shift;;
  esac; done
  [ -z "$QC_LOCKDIR" ] && QC_LOCKDIR="/tmp/.${QC_LABEL}-qc.lockd"
  QC_NAME=(); QC_PROBE=(); QC_REPAIR=(); QC_SHFILE=(); QC_SHPROMPT=(); QC_SHCTX=(); QC_FLAGS=()
  QC_SHTOOLS=(); QC_SHATTEMPTS=(); QC_SHMAXTURNS=()
  QC_FAILED=(); QC_REPAIRED=(); QC_ACTION=(); QC_DETAIL=""; QC_DEEP=0; QC_BLOCKED=0
}

# ---------------------------- qc_stage --------------------------------------
# Register one stage. Behavior is set by which flags you pass:
#   --name <text>          (required) human label
#   --probe <fn>           (required) returns 0=OK / non-0=RED; may set $QC_DETAIL
#   --repair <fn>          Tier-1 mechanical fix; engine re-probes after it
#   --critical             if still RED after repair, BLOCK all downstream stages
#   --soft                 a "behind" stage: on RED just run --repair (a kick) and
#                          record an ACTION — never a hard FAILURE (job runs async)
#   --selfheal-file <f>    Tier-2: file(s) (comma-sep) to let Claude edit; snapshotted
#   --selfheal-prompt <fn-or-string>  the repair brief (a fn name is called for fresh
#                          state; otherwise used literally)
#   --selfheal-context <fn>  optional: gather context before Claude (e.g. dump a page)
#   --commit               after a verified-green self-repair, git-commit the file(s)
#   --human-gate           on RED, escalate to a human immediately (no auto-repair)
#   --deep                 only run in deep mode (qc_run --deep)
qc_stage() {
  local name="" probe="" repair="" shfile="" shprompt="" shctx="" flags=""
  local shtools="" shattempts="" shmaxturns=""
  while [ $# -gt 0 ]; do case "$1" in
    --name)                name="$2"; shift 2;;
    --probe)               probe="$2"; shift 2;;
    --repair)              repair="$2"; shift 2;;
    --selfheal-file)       shfile="$2"; flags="$flags selfheal"; shift 2;;
    --selfheal-prompt)     shprompt="$2"; shift 2;;
    --selfheal-context)    shctx="$2"; shift 2;;
    --selfheal-allowed-tools) shtools="$2"; shift 2;;  # constrained tools instead of bypass-perms
    --selfheal-attempts)   shattempts="$2"; shift 2;;  # retry the claude+verify loop N times
    --selfheal-max-turns)  shmaxturns="$2"; shift 2;;  # cap the headless agent's turns
    --critical)            flags="$flags critical"; shift;;
    --soft)                flags="$flags soft"; shift;;
    --deep)                flags="$flags deep"; shift;;
    --human-gate)          flags="$flags human-gate"; shift;;
    --commit)              flags="$flags commit"; shift;;
    *) shift;;
  esac; done
  # a selfheal stage need not touch a FILE — it can run constrained Bash repairs (e.g. re-run a script)
  [ -n "$shtools" ] && ! _qc_has "$flags" selfheal && flags="$flags selfheal"
  QC_NAME+=("$name"); QC_PROBE+=("$probe"); QC_REPAIR+=("$repair")
  QC_SHFILE+=("$shfile"); QC_SHPROMPT+=("$shprompt"); QC_SHCTX+=("$shctx"); QC_FLAGS+=("$flags")
  QC_SHTOOLS+=("$shtools"); QC_SHATTEMPTS+=("$shattempts"); QC_SHMAXTURNS+=("$shmaxturns")
}

# ---------------------------- internals -------------------------------------
_qc_log() { echo "$(date '+%F %T') $*" >>"$QC_LOG"; echo "$*"; }
_qc_has() { case " $1 " in *" $2 "*) return 0;; *) return 1;; esac; }
# per-stage "consecutive behind" counter file (for --soft escalation)
_qc_statefile() {
  local k; k=$(echo "$1" | tr ' /' '__' | tr -cd 'A-Za-z0-9_')
  mkdir -p "$HOME/.qc-heartbeats/state" 2>/dev/null
  echo "$HOME/.qc-heartbeats/state/${QC_LABEL}.${k}.behind"
}
_qc_hq_dir() { local d="$HOME/.qc-heartbeats/hq-queue"; mkdir -p "$d" 2>/dev/null; echo "$d"; }

# =============================================================================
# _qc_notify <subject> <body>  — the GENERIC Tier-3 notifier. Returns 0 if the
# alert was successfully delivered, non-0 otherwise (so the durable queue can
# retry it next run). By default it does two reliable, dependency-free things:
#   1. posts a macOS desktop notification (osascript)
#   2. appends a timestamped record to $QC_NOTIFY_LOG
#
# >>> WIRE YOUR OWN CHANNEL HERE <<<
# To get alerts on your phone / in a chat / by email, add ONE delivery call
# inside the marked block below and make the function's return code reflect
# whether THAT channel accepted the message. Examples (uncomment + fill in):
#
#   # Telegram bot:
#   #   curl -fsS --max-time 20 \
#   #     "https://api.telegram.org/bot<TOKEN>/sendMessage" \
#   #     --data-urlencode "chat_id=<CHAT_ID>" \
#   #     --data-urlencode "text=$1"$'\n'"$2" >/dev/null || return 1
#   #   (keep the <TOKEN> in your secret manager — see
#   #    ~/JesseOS/workspace/security/README.md — do NOT inline it here.)
#
#   # ntfy.sh:
#   #   curl -fsS --max-time 20 -H "Title: $1" -d "$2" "https://ntfy.sh/<your-topic>" >/dev/null || return 1
#
#   # Email (macOS):
#   #   printf '%s\n' "$2" | mail -s "$1" you@example.com || return 1
#
# Until you wire a channel, alerts still land in $QC_NOTIFY_LOG and as a desktop
# notification, and (for true delivery failure) in the durable retry queue.
# =============================================================================
_qc_notify() {  # <subject> <body>  -> 0 on delivered
  local subject="$1" body="$2" rc=0
  # 1) desktop notification (best-effort; never the source of truth)
  osascript -e "display notification \"$(printf '%s' "$body" | head -c 200 | tr '\n' ' ' | sed 's/\"/\\\\\"/g')\" with title \"pipeline-qc: $subject\"" >/dev/null 2>&1 || true
  # 2) durable local record
  mkdir -p "$(dirname "$QC_NOTIFY_LOG")" 2>/dev/null
  { printf '%s [%s] %s\n' "$(date '+%F %T')" "$QC_LABEL" "$subject"
    printf '%s\n' "$body" | sed 's/^/    /'
  } >>"$QC_NOTIFY_LOG" 2>/dev/null || rc=1
  # ---------------------------------------------------------------------------
  # >>> ADD YOUR OWN DELIVERY CHANNEL HERE (see header). Make `rc` non-zero if
  #     your channel fails, so the alert is queued and retried next run.       <<<
  # ---------------------------------------------------------------------------
  return $rc
}

_qc_hq_flush() {  # re-send any previously-queued alerts; delete on success
  local d qf subj body; d="$(_qc_hq_dir)"
  for qf in "$d"/*.alert; do
    [ -e "$qf" ] || continue
    subj="$(sed -n '1p' "$qf")"; body="$(sed -n '2,$p' "$qf")"
    if _qc_notify "$subj" "$body"; then rm -f "$qf"; _qc_log "notify queue: re-sent + cleared $(basename "$qf")"
    else _qc_log "notify queue: still undelivered $(basename "$qf")"; fi
  done
}
_qc_hq() {  # _qc_hq <subject> <body> — retry+backoff, durable queue on total failure
  _qc_hq_flush                                   # opportunistically drain backlog first
  local attempt rc=1
  for attempt in 1 2 3; do
    if _qc_notify "$1" "$2"; then rc=0; break; fi
    _qc_log "WARN: notify attempt $attempt/3 failed ($1)"; sleep $((attempt*3))
  done
  if [ "$rc" -ne 0 ]; then
    local d qf; d="$(_qc_hq_dir)"; qf="$d/$(date +%s)_$$_$RANDOM.alert"
    { printf '%s\n' "$1"; printf '%s\n' "$2"; } >"$qf" 2>/dev/null
    _qc_log "ERROR: notify failed after 3 attempts — queued $qf (auto-retried next run)"
  fi
  return $rc
}
_qc_lock() {
  [ -d "$QC_LOCKDIR" ] && [ -n "$(find "$QC_LOCKDIR" -maxdepth 0 -mmin +30 2>/dev/null)" ] && rmdir "$QC_LOCKDIR" 2>/dev/null
  mkdir "$QC_LOCKDIR" 2>/dev/null || { _qc_log "another ${QC_LABEL} QC run active — exit"; return 1; }
  return 0
}
_qc_cleanup() {
  rmdir "$QC_LOCKDIR" 2>/dev/null
  # optional: point QC_TIDY_SCRIPT at your own cleanup script to run it on exit
  [ "$QC_TIDY" = 1 ] && [ -n "${QC_TIDY_SCRIPT:-}" ] && [ -x "$QC_TIDY_SCRIPT" ] \
    && bash "$QC_TIDY_SCRIPT" >/dev/null 2>&1
  return 0
}

# Tier-2 Claude self-repair for stage index $1 (idx label $2, name $3)
_qc_selfheal() {
  local i="$1" idx="$2" name="$3"
  _qc_log "$idx $name ... RED — Tier2 Claude self-repair"
  [ -n "${QC_SHCTX[$i]}" ] && "${QC_SHCTX[$i]}" >>"$QC_LOG" 2>&1
  # snapshot every target file so we can revert if the fix doesn't verify
  local files="${QC_SHFILE[$i]}" f bak; local farr=() baks=()
  local oldifs="$IFS"; IFS=','; read -ra farr <<< "$files"; IFS="$oldifs"
  for f in "${farr[@]}"; do bak="/tmp/qc_$(basename "$f").bak.$$"; cp "$f" "$bak" 2>/dev/null; baks+=("$f|$bak"); done
  # build prompt (a function name is called for fresh counts; else literal)
  local prompt="${QC_SHPROMPT[$i]}"
  if declare -F "$prompt" >/dev/null 2>&1; then prompt="$("$prompt")"; fi
  local tools="${QC_SHTOOLS[$i]}" attempts="${QC_SHATTEMPTS[$i]}" maxturns="${QC_SHMAXTURNS[$i]}"
  [ -z "$attempts" ] && attempts=1
  # invoke up to N times: prompt via STDIN (required), then GATE on the SAME probe each time.
  # If --selfheal-allowed-tools is set, run CONSTRAINED (allowlist, no bypass) — for sensitive
  # pipelines that must NOT hand the agent a blank cheque; else bypass perms (headless default).
  local a green=0
  for (( a=1; a<=attempts; a++ )); do
    [ "$attempts" -gt 1 ] && _qc_log "      [Tier2] attempt $a/$attempts"
    if [ -n "$tools" ]; then
      if [ -n "$maxturns" ]; then
        printf '%s' "$prompt" | timeout "$QC_TIMEOUT" "$QC_CLAUDE_BIN" -p --model "$QC_MODEL" \
          --allowedTools "$tools" --max-turns "$maxturns" >>"$QC_LOG" 2>&1 || true
      else
        printf '%s' "$prompt" | timeout "$QC_TIMEOUT" "$QC_CLAUDE_BIN" -p --model "$QC_MODEL" \
          --allowedTools "$tools" >>"$QC_LOG" 2>&1 || true
      fi
    else
      printf '%s' "$prompt" | timeout "$QC_TIMEOUT" "$QC_CLAUDE_BIN" -p --model "$QC_MODEL" \
        --dangerously-skip-permissions >>"$QC_LOG" 2>&1 || true
    fi
    QC_DETAIL=""; if "${QC_PROBE[$i]}" >>"$QC_LOG" 2>&1; then green=1; break; fi
  done
  if [ "$green" = 1 ]; then
    _qc_log "      → Tier2 VERIFIED GREEN — keeping the fix"
    if _qc_has "${QC_FLAGS[$i]}" commit && [ -n "$QC_REPO" ]; then
      ( cd "$QC_REPO" && git add "${farr[@]}" >/dev/null 2>&1 \
        && git commit -q -m "${QC_LABEL}-qc: Claude self-repaired ${files} (verified green)" >/dev/null 2>&1 ) || true
    fi
    QC_REPAIRED+=("$name (Claude self-repair)")
  else
    _qc_log "      → Tier2 did NOT verify — reverting, escalating"
    local pair; for pair in "${baks[@]}"; do cp "${pair#*|}" "${pair%%|*}" 2>/dev/null; done
    QC_FAILED+=("$name (self-repair did not verify — needs a human)")
  fi
  local pair; for pair in "${baks[@]}"; do rm -f "${pair#*|}" 2>/dev/null; done
}

# ---------------------------- qc_run ----------------------------------------
qc_run() {
  local a; for a in "$@"; do [ "$a" = "--deep" ] && QC_DEEP=1; done
  _qc_lock || exit 0
  trap '_qc_cleanup' EXIT
  _qc_log "===== ${QC_LABEL} pipeline QC (deep=$QC_DEEP) ====="

  local n="${#QC_NAME[@]}" i rc
  for (( i=0; i<n; i++ )); do
    local name="${QC_NAME[$i]}" flags="${QC_FLAGS[$i]}" idx="[$((i+1))/$n]"
    if _qc_has "$flags" deep && [ "$QC_DEEP" != 1 ]; then _qc_log "$idx $name ... skipped (light mode)"; continue; fi
    if [ "$QC_BLOCKED" = 1 ] && ! _qc_has "$flags" critical; then _qc_log "$idx $name ... SKIPPED (upstream red)"; continue; fi

    QC_DETAIL=""; "${QC_PROBE[$i]}"; rc=$?
    if [ $rc -eq 0 ]; then
      _qc_log "$idx $name ... OK${QC_DETAIL:+ ($QC_DETAIL)}"
      rm -f "$(_qc_statefile "$name")" 2>/dev/null   # healthy => clear any soft-behind streak
      continue
    fi
    local det="$QC_DETAIL"

    if _qc_has "$flags" selfheal; then
      _qc_selfheal "$i" "$idx" "$name"
    elif _qc_has "$flags" soft; then
      _qc_log "$idx $name ... BEHIND${det:+ ($det)} — Tier1 action"
      [ -n "${QC_REPAIR[$i]}" ] && "${QC_REPAIR[$i]}" >>"$QC_LOG" 2>&1
      QC_ACTION+=("$name${det:+: $det}")
      # STUCK escalation: only page if the stage is behind AND making NO progress. We track the
      # status detail across runs; if it changes (e.g. "4 un-subtitled" -> "3"), it's progressing,
      # so the counter resets. Only an UNCHANGED detail for QC_SOFT_ESCALATE runs => truly stuck.
      local sf prevc=0 prevd="" curd; sf="$(_qc_statefile "$name")"; curd="${det:-_}"
      [ -f "$sf" ] && IFS='|' read -r prevc prevd < "$sf"
      prevc="${prevc:-0}"
      if [ "$curd" != "$prevd" ]; then
        echo "0|$curd" > "$sf"                       # progressing (or first sighting) => not stuck
      else
        local c=$((prevc+1)); echo "$c|$curd" > "$sf"
        if [ "$c" -ge "$QC_SOFT_ESCALATE" ]; then
          QC_FAILED+=("$name — STUCK: no progress for $c consecutive QC runs${det:+ ($det)}")
        fi
      fi
    elif _qc_has "$flags" human-gate; then
      _qc_log "$idx $name ... RED — human gate${det:+ ($det)}"
      QC_FAILED+=("$name${det:+ — $det}")
    else
      _qc_log "$idx $name ... RED${det:+ ($det)} — Tier1 repair"
      [ -n "${QC_REPAIR[$i]}" ] && "${QC_REPAIR[$i]}" >>"$QC_LOG" 2>&1
      QC_DETAIL=""; "${QC_PROBE[$i]}"; rc=$?
      if [ $rc -eq 0 ]; then _qc_log "      → REPAIRED"; QC_REPAIRED+=("$name")
      else _qc_log "      → STILL RED"; QC_FAILED+=("$name${QC_DETAIL:+ — $QC_DETAIL}"); _qc_has "$flags" critical && QC_BLOCKED=1; fi
    fi
  done

  _qc_summarize
  # heartbeat (dead-man's-switch): record that a QC run COMPLETED, with this pipeline's
  # max tolerable gap. An independent watchdog (qc-heartbeat-watchdog.sh) alerts if the
  # heartbeat ever goes stale — i.e. if the self-healer itself silently stops running.
  mkdir -p "$HOME/.qc-heartbeats" 2>/dev/null
  echo "$(date +%s) $QC_HB_MAXGAP $QC_LABEL" > "$HOME/.qc-heartbeats/$QC_LABEL" 2>/dev/null
  return 0
}

_qc_summarize() {
  local nf="${#QC_FAILED[@]}" nr="${#QC_REPAIRED[@]}" na="${#QC_ACTION[@]}"
  local rep="none" fail="none" act="none"
  [ "$nr" -gt 0 ] && rep="${QC_REPAIRED[*]}"
  [ "$nf" -gt 0 ] && fail="${QC_FAILED[*]}"
  [ "$na" -gt 0 ] && act="${QC_ACTION[*]}"
  _qc_log "QC summary — repaired:[$rep] failed:[$fail] actions:[$act]"

  if [ "$nf" -gt 0 ]; then
    local body="Stages still RED after auto-repair:"$'\n' s
    for s in "${QC_FAILED[@]}"; do body="$body- $s"$'\n'; done
    [ "$nr" -gt 0 ] && body="$body"$'\n'"Auto-repaired this run: $rep"$'\n'
    [ "$na" -gt 0 ] && body="${body}Actions kicked: $act"$'\n'
    _qc_hq "${QC_LABEL} QC — ${nf} stage(s) need you" "$body"
  elif [ "$nr" -gt 0 ]; then
    local extra=""; [ "$na" -gt 0 ] && extra=" | actions: $act"
    _qc_hq "${QC_LABEL} self-healed" "Auto-repaired: ${rep}${extra}"
  fi
  # all-green + nothing repaired => stay silent (log only) to avoid alert fatigue.
}
