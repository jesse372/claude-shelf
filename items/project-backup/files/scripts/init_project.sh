#!/bin/bash
# Standing default: give a project git backup. git init + sensible .gitignore + a PRIVATE
# GitHub repo (via gh, under YOUR OWN authenticated account) + register it for daily auto-commit/push.
# Usage: init_project.sh <project_dir> [repo_name]
#
# Prereq: `gh auth status` must show you logged in. The repo is created under whichever account
# `gh` is authenticated as — nothing is hardcoded.
set -uo pipefail
DIR="${1:?usage: init_project.sh <project_dir> [repo_name]}"
DIR="$(cd "$DIR" && pwd)"
NAME="${2:-$(basename "$DIR")}"
REG="$HOME/.project-repos"
cd "$DIR"

[ -d .git ] || { git init -q && echo "git init"; }

if [ ! -f .gitignore ]; then
  cat > .gitignore <<'EOF'
# large/binary (regenerate; never in git)
*.bin
*.mp4
*.mov
*.wav
*.zip
# secrets (keep in your secret manager; source at runtime)
.env
.secrets.sh
.cf_token
*token*.txt
# noise
*.log
.DS_Store
node_modules/
__pycache__/
EOF
  echo "wrote default .gitignore"
fi

git add -A
# Uses your own configured git identity (git config user.name / user.email).
git commit -q -m "Initial commit: $NAME" 2>/dev/null && echo "committed" || echo "(nothing to commit)"

if git remote get-url origin >/dev/null 2>&1; then
  git push -u origin HEAD 2>/dev/null && echo "pushed to existing remote"
else
  # Create under YOUR OWN gh account. `gh repo create <name>` (no owner prefix) uses the
  # authenticated user as owner.
  if ! gh auth status >/dev/null 2>&1; then
    echo "✗ gh is not authenticated. Run: gh auth login   (then re-run this script)"
    exit 1
  fi
  gh repo create "$NAME" --private --source=. --remote=origin --push && echo "created private repo $NAME under your gh account"
fi

touch "$REG"
if ! grep -qxF "$DIR" "$REG"; then echo "$DIR" >> "$REG"; echo "registered for daily backup"; else echo "(already registered)"; fi
echo "OK $NAME: private GitHub backup + daily auto-push enabled"
