#!/usr/bin/env bash
# FINISH SETUP (double-click me). The sign-ins only a person can do: they need your browser and your phone.
# Safe to re-run any time: it skips anything already done.
export PATH="$HOME/.local/bin:/usr/local/bin:/opt/homebrew/bin:$PATH"
set -u
W="$HOME/JesseOS/workspace"
G=$'\033[32m'; Y=$'\033[33m'; N=$'\033[0m'
step() { printf '\n%s== %s ==%s\n' "$Y" "$*" "$N"; }
ok()   { printf '%s  ✓ %s%s\n' "$G" "$*" "$N"; }

echo "Finishing setup. Takes about 5 minutes."

step "1/4  Claude sign-in"
if claude auth status >/dev/null 2>&1; then ok "Claude already signed in"
else echo "  A browser window will open: sign in with the company's Claude account."; claude auth login || true; fi

step "2/4  GitHub sign-in (turns on the nightly off-machine backup)"
if ! command -v gh >/dev/null; then echo "  GitHub CLI missing. Install it (brew install gh) and run this again."
else
  gh auth status >/dev/null 2>&1 && ok "GitHub already signed in" || { echo "  Pick: GitHub.com → HTTPS → Login with a web browser."; gh auth login || true; }
  if gh auth status >/dev/null 2>&1; then
    "$W/backup/connect-github.sh" && "$W/backup/backup.sh" && ok "Backup now pushes to your PRIVATE GitHub repo every night (4am)"
  else echo "  (not signed in: backup stays local-only until you run this again)"; fi
fi

step "3/4  Telegram alerts (so the Mac can tell you when it needs you)"
if python3 "$W/notify/notify.py" status | grep -q '"telegram_linked": true'; then ok "Telegram already linked"
else
  echo "  In Telegram, message @BotFather, send /newbot, follow the two questions and copy the token it gives you."
  python3 "$W/notify/notify.py" link && python3 "$W/notify/notify.py" test
fi

step "4/4  Start the background jobs"
"$W/launchagents/load.sh" all
echo
echo "Phone access: a Terminal window named 'Claude Remote Control' opens within 5 minutes. Leave it open."
echo "Then open the Claude app on your phone → Code → pick this Mac."
echo "Last step, by hand: double-click claude-remote/grant-terminal-permissions.command and click Allow on each prompt."
read -r -p "Press Return to close." _
