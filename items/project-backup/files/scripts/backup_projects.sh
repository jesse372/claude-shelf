#!/bin/bash
# Daily: auto commit + push every registered project git repo (registry: ~/.project-repos,
# one dir per line). Skips repos with no changes. Run by com.jesse.project-backup.
set -uo pipefail
REG="$HOME/.project-repos"
LOG="$HOME/.project-backup.log"
ts(){ date '+%F %T'; }

# Generic notifier: macOS banner + append to the project-backup log.
# (Optional) wire your own channel by uncommenting/replacing the placeholder line below.
notify(){
  local msg="$1"
  osascript -e "display notification \"${msg//\"/\'}\" with title \"project-backup\"" 2>/dev/null || true
  mkdir -p "~/.claude/logs" 2>/dev/null || true
  echo "[$(ts)] $msg" >> "~/.claude/logs/project-backup.log" 2>/dev/null || true
  # Placeholder for a custom alert channel (e.g. your own webhook/chat bot):
  # curl -s -X POST "$YOUR_WEBHOOK_URL" -d "$msg" >/dev/null 2>&1 || true
}

[ -f "$REG" ] || exit 0
fail=0
while IFS= read -r d; do
  [ -z "$d" ] && continue
  d="${d/#\~/$HOME}"
  [ -d "$d/.git" ] || { echo "[$(ts)] skip (no .git): $d" >>"$LOG"; continue; }
  cd "$d" || { echo "[$(ts)] UNREADABLE (cd failed): $d" >>"$LOG"; fail=1; notify "BACKUP CAN'T READ: $d"; continue; }
  # git status failing (e.g. macOS privacy/TCC blocking ~/Documents) used to look like "no changes" and the repo
  # silently never backed up. Treat it as a failure.
  if ! st="$(git status --porcelain 2>&1)"; then
    echo "[$(ts)] UNREADABLE (git status failed: $(printf '%s' "$st" | head -1)): $d" >>"$LOG"; fail=1
    notify "BACKUP CAN'T READ: $d (macOS privacy block?)"; continue
  fi
  if [ -n "$st" ]; then
    branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo HEAD)"

    # --- DEPLOY GUARD -------------------------------------------------------
    # A repo that publishes a LIVE SITE must never have work-in-progress
    # auto-pushed to its deploy branch: this script runs unattended at 04:30,
    # and on GitHub Pages a push to main is a publish. Half-finished work would
    # go live on a real business's website with no human ever seeing it.
    #
    # Detected by a CNAME file (Pages custom domain) or an explicit .deploy-guard
    # marker. For those repos we still COMMIT locally and still push off-machine,
    # but to a parking branch instead of the deploy branch. Deploying stays a
    # deliberate human action: git push origin main
    push_ref=""
    if { [ -f CNAME ] || [ -f .deploy-guard ]; } \
       && { [ "$branch" = "main" ] || [ "$branch" = "master" ]; }; then
      push_ref="HEAD:refs/heads/auto-backup/$branch"
    fi
    # ------------------------------------------------------------------------

    # Uses your own configured git identity (git config user.name / user.email).
    if git add -A && git commit -q -m "backup: $(ts)"; then
      if [ -n "$push_ref" ]; then
        if git push -q origin "$push_ref" 2>/dev/null; then
          echo "[$(ts)] deploy-guard: committed on $branch, pushed to auto-backup/$branch: $d" >>"$LOG"
        else
          echo "[$(ts)] PUSH FAILED (guarded): $d" >>"$LOG"; fail=1; notify "PUSH FAILED: $d"
        fi
      elif git push -q 2>/dev/null || git push -q -u origin HEAD 2>/dev/null; then
        # the -u fallback covers a branch with no upstream, which otherwise
        # fails silently and leaves that repo un-backed-up indefinitely
        echo "[$(ts)] pushed: $d" >>"$LOG"
      else
        echo "[$(ts)] PUSH FAILED: $d" >>"$LOG"; fail=1; notify "PUSH FAILED: $d"
      fi
    else
      echo "[$(ts)] COMMIT FAILED: $d" >>"$LOG"; fail=1; notify "COMMIT FAILED: $d"
    fi
  else
    # Nothing new to commit, but commits made by hand/agents may still be unpushed (2026-11-04: two
    # jessechance-2026 commits sat local-only for a day because this branch never pushed). Push them.
    ahead=$(git rev-list --count @{u}..HEAD 2>/dev/null || echo 0)
    if [ "${ahead:-0}" -gt 0 ]; then
      branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo HEAD)"; push_ref=""   # same DEPLOY GUARD as above
      if { [ -f CNAME ] || [ -f .deploy-guard ]; } && { [ "$branch" = "main" ] || [ "$branch" = "master" ]; }; then
        push_ref="HEAD:refs/heads/auto-backup/$branch"
      fi
      if [ -n "$push_ref" ]; then git push -q origin "$push_ref" 2>/dev/null; else git push -q 2>/dev/null; fi \
        && echo "[$(ts)] pushed $ahead unpushed commit(s): $d" >>"$LOG" \
        || { echo "[$(ts)] PUSH FAILED: $d" >>"$LOG"; fail=1; notify "PUSH FAILED: $d"; }
    else
      echo "[$(ts)] no changes: $d" >>"$LOG"
    fi
  fi
done < "$REG"
exit "$fail"
