# JESSE: NIGHT OUT — overnight upgrade (2026-07-19 22:27)

LIVE LINK (current): https://browse-hewlett-isp-hazards.trycloudflare.com
(If this ever stops working, the current URL is always in LINK.txt — the tunnel self-restarts.)

## What was added tonight (all verified rendering, no errors)
- Real Ferrari 458 car models (drivable) + a rigged, animated human character (walk/run/idle)
- Cinematic rendering: ACES tone-mapping, neon bloom glow, PBR reflections, soft shadows
- Gradient night sky + 1400 stars + moon
- Dense, walkable neon city; enterable pubs & clubs (bar counter, bottles, stools, dancefloor)
- Living city: 9 NPC traffic cars on the roads + 11 wandering pedestrians
- Minimap (bottom-right): road grid, venue dots (pink=pub, cyan=club, grey=visited), cash, player arrow
- Procedural audio: ambient night pad, club beat that swells near clubs, engine note while driving, drink clink
- Cash pickups (green tokens on roads) to fund drinking
- Drunk pass-out consequence at 100% (black out, respawn, lose $15)
- Spinning car wheels; fixed the reversed forward/back movement

## Reality check
This is top-tier *web/mobile* quality, NOT literally GTA V (that needs a native engine + a studio).
It loads ~4MB of models first time from fast CDNs, with primitive fallbacks so it can't black-screen.

## Files
- gta-jesse.html  (source)
- index.html      (served copy — same file)
- serve.sh + launchd com.jesseos.gta-jesse  (self-restarting tunnel)
