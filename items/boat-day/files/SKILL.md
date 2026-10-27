---
name: boat-day
description: "Check boating conditions off Perth (Two Rocks Marina) for the next 7 mornings and manage the automatic 'good boat day' email alerts. Combines Open-Meteo ECMWF+GFS wind/gusts, Open-Meteo Marine swell + chop, and the BOM Perth Coast coastal waters forecast + marine warnings into GREAT/GOOD/MARGINAL/NO per morning. TRIGGERS: 'boat day', 'good day for the boat', 'boating forecast', 'can I take the boat out', 'is it calm', 'fishing weather', 'swell forecast', 'when can I go out', 'boat alerts', 'change the boat thresholds', 'marine forecast', 'sea breeze'."
version: 1.0.0
metadata:
  tags: [Weather, Marine, Alerts, Loop]
  related: [gmail, pipeline-qc, loop-contract]
---

# boat-day

The loop lives at `~/JesseOS/workspace/loops/boat-day/` (private repo `jesse372/boat-day-alerts`).
launchd `com.jesse.boat-day` runs it 06:00 + 17:30 AWST and emails Jesse when a good day appears.

## Quick reference
```bash
L=~/JesseOS/workspace/loops/boat-day
python3 $L/boat_day.py --report      # 7-day table now (no email, no state change)
python3 $L/boat_day.py --dry-run     # table + the email it WOULD send
python3 $L/boat_day.py --test-email  # prove email delivery
python3 $L/boat_day.py --selftest    # offline logic tests
/bin/bash $L/boat-day-qc.sh --deep   # self-healing health check
```

## Tuning — edit `$L/config.json` (no code changes)
- `good` / `great`: wind, gust (kn, sampled over water), swell, wind_wave = chop (m, ~4 km offshore)
- `window_start_hour` / `window_end_hour` (default 05–12, before the sea breeze), `min_hours` (4)
- `weekends_only`, `max_rain_prob`, `min_visibility_m`, BOM downgrade limits
- `launch` / `sea_point` / `wind_point` + `bom_area` to move spots (BOM areas in IDW11160:
  WA_MW008 Lancelin coast, WA_MW009 Perth coast, WA_MW010 Bunbury/Geographe)

## Rules of the rating
Hour passes if wind, gusts, swell, chop are under thresholds, no thunderstorm, rain chance and
visibility OK. A day is GOOD/GREAT if ≥ `min_hours` consecutive passing hours. BOM marine warning
for that day ⇒ NO; BOM wind (start of day) / seas / swell over limits ⇒ down one level.
ECMWF and GFS disagreeing by > `model_spread_kn` caps an hour at GOOD.

## Alerts
One email per run max: NEW good day (or upgrade), TOMORROW'S ON (evening run), CALLED OFF (drops to
NO, or MARGINAL at the night-before check). Delivered by `gmail.sh notify-self` (self-only) + ntfy
push to the topic in config.json. Email failure ⇒ state not advanced, retried next run.

## Gotchas
- ntfy.sh no longer allows anonymous email relay (error 40053) — that's why Gmail is the channel.
- Open-Meteo grid cells near the coast can be land cells (damped wind) — keep wind_point over water.
- Open-Meteo `bom_access_global` returns nulls here; ECMWF + GFS are used.
- BOM web pages 403/404 scripted fetches; the anonymous FTP `ftp.bom.gov.au/anon/gen/fwo/` works.
