#!/usr/bin/env bash
# Weekly Google Search Console check (run it from launchd/cron once a week).
# Inspects every URL in the LIVE sitemap, counts index states, pulls queries at positions 11-20, writes
# reports/YYYY-MM-DD.md + state/last.json (atomic), and pushes a one-line ntfy summary with the week's delta.
# Exit 0 = ran and reported. Exit 1 = could not run (auth/API down) - the guardian alerts on that.
#
# A SECOND PROPERTY uses the same script with three env vars (set them in a second LaunchAgent):
#   GSC_SITE=sc-domain:example.com   the Search Console property (gsc.py reads this itself)
#   GSC_WEEKLY_URL=https://example.com   where the live sitemap is
#   GSC_WEEKLY_NAME=shop             suffix for its own report, state file and heartbeat
# With none of them set the script behaves exactly as before (gsc.config.json, state/last.json).
set -uo pipefail
export PATH="$HOME/.local/bin:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin"
D="$(cd "$(dirname "$0")" && pwd)"; G="python3 -I $D/gsc.py"
# site + ntfy topic come from gsc.config.json next to the script: {"site": "https://www.example.com/", "ntfy_topic": "..."}
SITE="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1])).get("site","").rstrip("/"))' "$D/gsc.config.json" 2>/dev/null)"
NTFY_TOPIC="${NTFY_TOPIC:-$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1])).get("ntfy_topic",""))' "$D/gsc.config.json" 2>/dev/null)}"
NAME="${GSC_WEEKLY_NAME:-}"; [ -n "${GSC_WEEKLY_URL:-}" ] && SITE="${GSC_WEEKLY_URL%/}"
[ -n "$SITE" ] || { echo "no site in $D/gsc.config.json"; exit 1; }
TODAY=$(date +%F); R="$D/reports/${NAME:+$NAME-}$TODAY.md"; S="$D/state/last${NAME:+-$NAME}.json"; TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
log(){ echo "$(date '+%F %T') $*"; }
notify(){ [ -n "$NTFY_TOPIC" ] || return 0; curl -fsS --max-time 20 -H "Title: $1" -d "$2" "https://ntfy.sh/$NTFY_TOPIC" >/dev/null 2>&1 || log "ntfy failed"; }

log "gsc-weekly start"
if ! $G sites >/dev/null 2>"$TMP/err"; then log "ABORT: Search Console API unusable: $(cat "$TMP/err")"; exit 1; fi
curl -fsS --max-time 30 "$SITE/sitemap.xml" | grep -o '<loc>[^<]*' | sed 's/<loc>//' > "$TMP/urls" || { log "ABORT: cannot fetch live sitemap"; exit 1; }
N=$(wc -l < "$TMP/urls" | tr -d ' '); [ "$N" -gt 0 ] || { log "ABORT: empty sitemap"; exit 1; }

# URL inspection, one call per URL (quota 2000/day; ~5s each)
$G inspect $(cat "$TMP/urls") > "$TMP/inspect" 2>&1 || log "inspect returned non-zero (partial results kept)"
awk '/^https/{u=$1} /verdict/{split($0,a,"coverage: "); c=a[2]} /last crawl/{print c "\t" $3 "\t" u}' "$TMP/inspect" > "$TMP/rows"
IDX=$(grep -c $'^Submitted and indexed\t' "$TMP/rows"); DISC=$(grep -c $'^Discovered' "$TMP/rows")
CRAWLED_NOT=$(grep -c $'^Crawled' "$TMP/rows"); UNKNOWN=$(grep -c $'^URL is unknown' "$TMP/rows")
OTHER=$(( $(wc -l < "$TMP/rows" | tr -d ' ') - IDX - DISC - CRAWLED_NOT - UNKNOWN ))
$G queries --min-pos 11 --max-pos 20 --limit 25 > "$TMP/q1120" 2>&1 || true
$G queries --limit 15 > "$TMP/qtop" 2>&1 || true
$G sitemaps > "$TMP/sm" 2>&1 || true

PREV_IDX=$(python3 -c "import json;print(json.load(open('$S')).get('indexed','?'))" 2>/dev/null || echo "?")
PREV_DATE=$(python3 -c "import json;print(json.load(open('$S')).get('date','?'))" 2>/dev/null || echo "?")
{
  echo "# Search Console weekly - $TODAY"; echo
  echo "| State | Pages | Last week ($PREV_DATE) |"; echo "|---|---|---|"
  echo "| Indexed | $IDX | $PREV_IDX |"; echo "| Discovered, not crawled | $DISC | |"
  echo "| Crawled, not indexed | $CRAWLED_NOT | |"; echo "| Unknown to Google | $UNKNOWN | |"; [ "$OTHER" -gt 0 ] && echo "| Other | $OTHER | |"
  echo; echo "Sitemap URLs: $N"; echo; echo '```'; cat "$TMP/sm"; echo '```'
  echo; echo "## Not indexed (state | last crawl | url)"; echo '```'
  grep -v $'^Submitted and indexed\t' "$TMP/rows" | sed "s#$SITE##" | sort; echo '```'
  echo; echo "## Queries at positions 11-20 (28 days)"; echo '```'; cat "$TMP/q1120"; echo '```'
  echo; echo "## Top queries"; echo '```'; cat "$TMP/qtop"; echo '```'
} > "$R"
python3 - "$S" "$TODAY" "$IDX" "$DISC" "$CRAWLED_NOT" "$UNKNOWN" "$N" "$R" <<'PY'
import json, os, sys, tempfile
p, date, idx, disc, cn, unk, n, rep = sys.argv[1:]
d = {"date": date, "indexed": int(idx), "discovered_not_crawled": int(disc), "crawled_not_indexed": int(cn),
     "unknown": int(unk), "sitemap_urls": int(n), "report": rep}
fd, tmp = tempfile.mkstemp(dir=os.path.dirname(p)); os.write(fd, json.dumps(d, indent=1).encode()); os.close(fd); os.replace(tmp, p)
PY
DELTA=""; [ "$PREV_IDX" != "?" ] && DELTA=" ($(( IDX - PREV_IDX )) vs $PREV_DATE)"
MSG="Indexed $IDX/$N$DELTA. Not crawled yet: $DISC. Crawled-not-indexed: $CRAWLED_NOT. Unknown: $UNKNOWN. Report: $R"
log "$MSG"; notify "${SITE#https://} Google index" "$MSG"
# Heartbeat format is "epoch maxgap label". Without a maxgap the heartbeat watchdog assumes 30h and
# reports a WEEKLY job as "gone DARK" every Friday. 734400s = 8.5 days.
HB="gsc-weekly${NAME:+-$NAME}"; mkdir -p "$HOME/.qc-heartbeats" && echo "$(date +%s) 734400 $HB" > "$HOME/.qc-heartbeats/$HB"
log "gsc-weekly done"
