#!/usr/bin/env python3
"""JARVIS agenda: expand upcoming events (today + 2 days) from an ICS feed (URL on stdin).

Uses recurring-ical-events for correct RRULE/COUNT/UNTIL/EXDATE/moved-instance
handling — the stuff naive parsers get wrong. Prints JSON to stdout.
"""
import sys, json, datetime, urllib.request

import icalendar
import recurring_ical_events

DAY_LABEL = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]


def main():
    url = sys.stdin.read().strip()
    if not url.startswith("https://"):
        print(json.dumps({"error": "bad url"}))
        return
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=15) as r:
        ics = r.read()
    cal = icalendar.Calendar.from_ical(ics)
    today = datetime.date.today()
    end = today + datetime.timedelta(days=3)  # today + 2 full days ahead
    events = recurring_ical_events.of(cal).between(today, end)
    out = []
    for ev in events:
        summary = str(ev.get("SUMMARY", "")).strip()[:36]
        if not summary:
            continue
        start = ev["DTSTART"].dt
        if isinstance(start, datetime.datetime):
            local = start.astimezone()
            day, time_s, sort_t = local.date(), local.strftime("%H:%M"), local.strftime("%H%M")
        else:  # all-day
            day, time_s, sort_t = start, "ALL DAY", "0000"
        if not (today <= day < end):
            continue
        prefix = "" if day == today else DAY_LABEL[day.weekday()] + " "
        out.append({"sort": day.strftime("%Y%m%d") + sort_t, "text": f"{prefix}{time_s}  {summary}"})
    out.sort(key=lambda e: e["sort"])
    print(json.dumps({"events": [e["text"] for e in out[:6]]}))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(json.dumps({"error": str(e)[:100]}))
