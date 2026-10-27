#!/usr/bin/env bash
# One-shot: connect ~/JesseOS to a PRIVATE GitHub repo and enable off-machine nightly backup.
# Safe to re-run (idempotent). Requires `gh auth login` to have been done once by Jesse.
set -u
export PATH="$HOME/.local/bin:/usr/local/bin:$HOME/.omnara/bin:$PATH"
REPO_NAME="JesseOS"
cd "$HOME/JesseOS" || { echo "no ~/JesseOS"; exit 1; }

command -v gh >/dev/null 2>&1 || { echo "gh not installed. Run: brew install gh"; exit 1; }

if ! gh auth status >/dev/null 2>&1; then
  echo "GitHub not authenticated yet."
  echo "  ->  Run this once:   gh auth login"
  echo "      (choose: GitHub.com, HTTPS, login with a web browser)"
  echo "      Then re-run this script."
  exit 2
fi

GH_USER="$(gh api user --jq .login 2>/dev/null)"
echo "Authenticated as: ${GH_USER:-unknown}"

# Ensure git uses gh's token for HTTPS pushes (so the headless nightly job can push).
gh auth setup-git >/dev/null 2>&1 && echo "git credential helper -> gh (configured)"

# Already wired?
if git remote get-url origin >/dev/null 2>&1; then
  echo "Remote 'origin' already set: $(git remote get-url origin)"
else
  if gh repo view "${GH_USER}/${REPO_NAME}" >/dev/null 2>&1; then
    echo "Repo ${GH_USER}/${REPO_NAME} exists; wiring remote."
    git remote add origin "https://github.com/${GH_USER}/${REPO_NAME}.git"
  else
    echo "Creating PRIVATE repo ${GH_USER}/${REPO_NAME} from local JesseOS."
    gh repo create "${REPO_NAME}" --private --source=. --remote=origin || {
      echo "repo create failed"; exit 1; }
  fi
fi

# Make sure there is at least one commit, then push.
git add -A
git diff --cached --quiet || git commit -m "JesseOS connect-github $(date '+%Y-%m-%d %H:%M')" >/dev/null 2>&1
BRANCH="$(git symbolic-ref --short HEAD 2>/dev/null || echo main)"
if git push -u origin "$BRANCH" 2>&1; then
  echo "✅ Pushed. Off-machine nightly backup is now LIVE (runs 4:00 AM daily via com.jesse.backup)."
else
  echo "⚠️  Push failed — check 'gh auth status' and that the token has 'repo' scope."
  exit 1
fi
