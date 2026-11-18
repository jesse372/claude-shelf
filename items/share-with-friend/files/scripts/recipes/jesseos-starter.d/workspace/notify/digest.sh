#!/bin/bash
# com.jesse.notify-digest (18:40): ONE Telegram summary of the day's non-urgent robot messages, only if any.
export PATH="/usr/local/bin:/opt/homebrew/bin:$HOME/.local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
cd "$HOME" || exit 1
N="$HOME/JesseOS/workspace/notify"
echo "$(date '+%F %T') digest start"
python3 -I "$N/notify.py" digest; rc=$?
echo "$(date '+%F %T') digest rc=$rc"
exit $rc
