# gsc.py — Google Search Console from the command line

Plain-Python (no packages) CLI for the Search Console API: submit sitemaps, inspect URLs, pull query
and page reports. Built for a headless Mac where nobody can click "Request indexing" in a browser.

## Setup (once)
1. In Google Cloud Console create a **Desktop app** OAuth client and download its JSON to
   `~/.authframework/secrets/gmail.client` (a Gmail/YouTube CLI can share the same client).
2. On that project enable **Google Search Console API** (APIs & Services → Library). Note: if the project
   has Service Usage disabled too, this must be done in the console by hand; no token can flip it.
3. Put your property in `gsc.config.json` next to the script:
   `{"site": "https://www.example.com/", "login_hint": "you@example.com"}` (or export `GSC_SITE`).
4. Authorize: `gsc.py auth-url` → open the URL, Allow, paste the failed `127.0.0.1` address into
   `gsc.py auth-finish "<address>"`. From a phone with nobody at the Mac: `gsc.py relay TOKEN` and expose
   `127.0.0.1:8771` with `cloudflared tunnel --url http://127.0.0.1:8771 --protocol http2`.

## Commands
```
gsc.py sites                      properties this account can see
gsc.py sitemaps                   submitted sitemaps + status
gsc.py submit-sitemap [url]       (re)submit the sitemap — run after every deploy
gsc.py inspect URL [URL...]       index status / last crawl / canonical (paths like /about work too)
gsc.py queries --min-pos 11 --max-pos 20 --days 28 --limit 50
gsc.py pages --days 28
gsc.py token-status               JSON probe for a keepalive job
```
There is no API for "Request indexing"; that stays a button in the Search Console UI.
