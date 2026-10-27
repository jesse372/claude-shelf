#!/usr/bin/env bash
# Nightly backup of ~/JesseOS: local git commit, and push if a GitHub remote is connected.
set -u
export PATH="$HOME/.local/bin:/usr/local/bin:$HOME/.omnara/bin:$PATH"
cd "$HOME/JesseOS" || exit 1
[ -d .git ] || { echo "no git repo yet"; exit 0; }
git add -A
if git diff --cached --quiet; then echo "nothing to commit"; else
  git commit -m "JesseOS backup $(date '+%Y-%m-%d %H:%M')" >/dev/null 2>&1 && echo "committed"; fi
if git remote get-url origin >/dev/null 2>&1; then
  git push origin HEAD >/dev/null 2>&1 && echo "pushed to origin" || echo "push failed (check: gh auth status)"
else
  echo "no remote yet — local commit only. Connect GitHub to enable off-machine backup."
fi
