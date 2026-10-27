#!/usr/bin/env bash
# One-time setup: create the GitHub repo, push the site, turn on GitHub Pages.
# Run this once from ~/Projects/beer-tap-list:   ./setup.sh
set -euo pipefail

REPO_NAME="${1:-beer-tap-list}"
cd "$(dirname "$0")"

# --- checks -----------------------------------------------------------------
command -v gh >/dev/null || { echo "✗ GitHub CLI not installed.  brew install gh"; exit 1; }
if ! gh auth status >/dev/null 2>&1; then
  echo "✗ Not logged in to GitHub.  Run:  gh auth login   (then re-run this script)"
  exit 1
fi

OWNER="$(gh api user --jq .login)"
echo "→ GitHub user: $OWNER"

# --- git --------------------------------------------------------------------
if [ ! -d .git ]; then
  git init -q -b main
  printf '.DS_Store\n' > .gitignore
  git add -A
  git commit -qm "Beer tap list for the Fire Stick"
  echo "→ Created local git repo"
fi

# --- remote repo ------------------------------------------------------------
if gh repo view "$OWNER/$REPO_NAME" >/dev/null 2>&1; then
  echo "→ Repo $OWNER/$REPO_NAME already exists, pushing to it"
  git remote get-url origin >/dev/null 2>&1 || \
    git remote add origin "https://github.com/$OWNER/$REPO_NAME.git"
  git push -u origin main
else
  # Public is required: GitHub Pages on a private repo needs a paid plan.
  gh repo create "$REPO_NAME" --public --source=. --remote=origin --push \
    --description "Home brew tap list for the TV"
  echo "→ Created https://github.com/$OWNER/$REPO_NAME"
fi

# --- enable Pages -----------------------------------------------------------
if gh api "repos/$OWNER/$REPO_NAME/pages" >/dev/null 2>&1; then
  echo "→ GitHub Pages already enabled"
else
  gh api -X POST "repos/$OWNER/$REPO_NAME/pages" \
    -f "source[branch]=main" -f "source[path]=/" >/dev/null
  echo "→ Turned on GitHub Pages"
fi

URL="https://$OWNER.github.io/$REPO_NAME"
cat <<EOF

────────────────────────────────────────────────────────────
✓ Done. Give it 1–2 minutes for the first build, then:

  TV screen (put this on the Fire Stick):
      $URL

  Editor (bookmark on his laptop):
      $URL/edit.html

Next: make the access token so the Publish button works.
  1. https://github.com/settings/personal-access-tokens/new
  2. Repository access → Only select repositories → $REPO_NAME
  3. Permissions → Repository permissions → Contents → Read and write
  4. Generate, copy the token
  5. Open $URL/edit.html on his laptop
     → open the ⚙️ section → paste username ($OWNER), repo ($REPO_NAME),
       and the token → click "Test the connection"
────────────────────────────────────────────────────────────
EOF
