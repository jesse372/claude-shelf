#!/bin/bash
# Build + deploy Sculpt to Cloudflare Workers (password-protected).
#   ./deploy/deploy.sh                 # deploy (sets the password on first run)
#   ./deploy/deploy.sh --password      # change the password
#   ./deploy/deploy.sh --build-only    # just assemble deploy/dist (local testing: wrangler dev -c wrangler.dev.jsonc)
set -euo pipefail
cd "$(dirname "$0")/.."
./setup.sh >/dev/null
D=deploy/dist
rm -rf "$D"; mkdir -p "$D"
cp -R index.html manifest.webmanifest css js icons fonts "$D/"
[ -d review ] && cp -R review "$D/"   # style review page (local only, not in git)
mkdir -p "$D/vendor"
# everything except the removal models (> 25 MB per-file limit; the app fetches them from Hugging Face)
rsync -a --exclude 'models/lama_fp32.onnx' --exclude 'models/migan_pipeline_v2.onnx' --exclude 'ort-gpu/ort-wasm-*' vendor/ "$D/vendor/"   # big removal models load from Hugging Face; the graphics-card face finder's engine from the npm CDN
find "$D" -name '.DS_Store' -delete
big=$(find "$D" -type f -size +25M)
[ -z "$big" ] || { echo "Files over Cloudflare's 25 MB limit: $big" >&2; exit 1; }
echo "  bundle: $(du -sh "$D" | cut -f1), $(find "$D" -type f | wc -l | tr -d ' ') files"
[ "${1:-}" = "--build-only" ] && exit 0
cd deploy
npx -y wrangler@latest deploy
if [ "${1:-}" = "--password" ] || ! npx -y wrangler@latest secret list 2>/dev/null | grep -q '"PASSWORD"'; then
  PW="${SCULPT_PASSWORD:-}"
  if [ -z "$PW" ]; then
    # never hang an unattended deploy: only ask when someone is at the keyboard
    [ -t 0 ] || { echo "  (password check skipped - could not confirm the PASSWORD secret; run ./deploy/deploy.sh --password to set it)"; exit 0; }
    read -r -s -p "New Sculpt password: " PW; echo
  fi
  printf '%s' "$PW" | npx -y wrangler@latest secret put PASSWORD >/dev/null
  echo "  password set"
fi
