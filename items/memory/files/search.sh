#!/usr/bin/env bash
# Recall: search shared memory + context.
#
# Entries in decisions.md are long (~1KB each), so by default this prints a
# TRUNCATED preview of each hit. Grepping 40 matches used to dump 35KB into an
# agent's context in a single call, which is most of what "recall" ever cost.
# Read the previews, then pull only the entries you actually need with --full.
#
#   search.sh <query>              preview each hit (default width 200)
#   search.sh -w 400 <query>       wider previews
#   search.sh --full <query>       whole entries, no truncation
#   search.sh --at <file:line>     print one entry in full, by its hit location
usage() { sed -n '4,13p' "$0" | sed 's/^# \{0,1\}//'; exit "${1:-1}"; }

W=200; FULL=0; AT=""
while [ $# -gt 0 ]; do
  case "$1" in
    --full) FULL=1; shift ;;
    -w) W="${2:?-w needs a number}"; shift 2 ;;
    --at) AT="${2:?--at needs file:line}"; shift 2 ;;
    -h|--help) usage 0 ;;
    --) shift; break ;;
    -*) echo "unknown flag: $1" >&2; usage ;;
    *) break ;;
  esac
done

V="$HOME/JesseOS/vault"

if [ -n "$AT" ]; then
  f="${AT%:*}"; n="${AT##*:}"
  case "$n" in (*[!0-9]*|'') echo "--at wants file:line, got: $AT" >&2; exit 1 ;; esac
  [ -f "$f" ] || { echo "no such file: $f" >&2; exit 1; }
  sed -n "${n}p" "$f"
  exit 0
fi

q="${*:-}"
[ -z "$q" ] && usage

hits=$(grep -rin --color=never "$q" "$V/50-memory" "$V/00-context" 2>/dev/null | head -60)
[ -z "$hits" ] && { echo "no hits for: $q"; exit 0; }

if [ "$FULL" = 1 ]; then
  printf '%s\n' "$hits"
else
  printf '%s\n' "$hits" | cut -c1-"$W"
  n=$(printf '%s\n' "$hits" | wc -l | tr -d ' ')
  echo
  echo "-- $n hit(s), previewed to ${W} chars. Full entry: search.sh --at <file>:<line>"
fi
