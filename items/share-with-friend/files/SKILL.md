---
name: share-with-friend
description: "Post things Jesse builds with Claude/Codex (skills, tools, scripts, websites, prompts) to his public 'Claude Shelf' site (https://jesse372.github.io/claude-shelf/) so his friend can browse them and install them with his own Claude. One command copies a sanitised version, blocks secrets and private info, builds a download .zip and a copy-paste install prompt, updates the RSS feed and pushes live. STANDING RULE: after creating something new and reusable for Jesse, publish it here (see 'When to post'). TRIGGERS: 'share this with my friend', 'post it to the site', 'put it on the shelf', 'claude shelf', 'publish this', 'share this skill', 'send this to my mate', 'add it to the website for my friend', 'remove that from the shelf', 'what's on the shelf'."
version: 1.0.0
metadata:
  tags: [Sharing, Publishing, Website, Conventions]
---

# share-with-friend: the Claude Shelf

Jesse's friend also has Claude. Everything Jesse builds that is reusable goes on a public static site
so the friend can see it and install it: **https://jesse372.github.io/claude-shelf/**
(repo: `github.com/jesse372/claude-shelf`, local clone `~/JesseOS/workspace/claude-shelf`, GitHub Pages
serves `main` directly, about 1 minute to go live).

## When to post (standing rule from Jesse, 2026-10-28)
Jesse asked that **every time he creates something with an agent, it gets posted**. So when you finish
building a new skill, tool, script, site or useful prompt, publish it as part of finishing up (the
`wrap-up` protocol includes this step). Then tell Jesse in one line what you posted and the card link.
- **Updates count too.** If you meaningfully improve something already on the shelf, republish it
  with the same `--slug`. The version goes up and the card shows "Updated".
- **Don't post** things that only make sense with Jesse's private accounts, clients or business data
  (his Gmail, Square, Meta ads, client albums), or one-off throwaway edits. If you can make a
  generic version safely, post that. If you skip something, tell Jesse why in one line so he can
  override it.
- **It is public.** Anyone with the link can see it. Never publish secrets, client data or personal info.

## Publish
```bash
SHELF=~/.claude/skills/share-with-friend/scripts/shelf.py
$SHELF publish --source <file-or-folder> \
  --title "Short friendly name" --emoji "🧩" \
  --summary "1-2 sentences for the friend: what it does and why it's useful." \
  --how-to-use "What to say to Claude, or the command to run." \
  --requires "What he needs: macOS? Node? his own API key? (blank if nothing)" \
  [--type skill|tool|website|prompt|script|other]  # auto: folder with SKILL.md = skill, else tool
  [--link https://live-site.example]               # for websites
  [--slug existing-slug]                           # to update an existing card
  [--tags a,b] [--dry-run]
$SHELF verify <slug>      # waits until the live site shows it
```
Write the summary, how-to-use and requires fields **for the friend**, in plain words. He hasn't
seen the conversation and doesn't have JesseOS.

What publishing does:
1. Copies the source to `items/<slug>/files/`, skipping `.git`, `node_modules`, logs/state dirs,
   `.env`, keys, `*token*`/`*secret*`/`*credential*`/`*session*`/`*cookie*` files, files over 5 MB.
2. **Rewrites paths** so they work on the friend's machine: `~/.claude/skills/X` becomes
   `~/.claude/skills/X` and `~` becomes `~` (rules in `config.json`).
3. **Scans** every text file and the card text. **Blocks** API keys, tokens, private keys, hard-coded
   passwords and anything in `private-terms.txt` (private, never published). **Warns** on email
   addresses, phone numbers and leftover `JesseOS` references. Read the warnings. If one is a real
   dependency on Jesse's setup, mention it in `--requires` or generalise the file before publishing.
4. Builds `<slug>.zip`. Skills zip as `<skill-name>/SKILL.md`, so the same zip works for Claude Code
   (`~/.claude/skills/`) and claude.ai (Settings → Capabilities → Skills → upload).
5. Regenerates `index.html`, `items.json` (with a per-item copy-paste install prompt for Claude) and
   `feed.xml`, then commits and pushes. A file lock plus pull-rebase makes concurrent Claude/Codex
   publishes safe.

Other commands: `scan <path>` (dry check only), `list`, `remove <slug>`, `rebuild` (after editing
`scripts/site_template/index.html` or `config.json`), `publish ... --dry-run`.

## If the scan blocks
Don't work around it. Remove or parameterise the secret (read it from an env var), or move the
private file out of the source folder, then re-run. If a block is a false positive, change the
source so it's clearly a placeholder (e.g. `"YOUR_API_KEY"`). Don't weaken the patterns.

## Pitfalls
- `remove` deletes the card, but the files **stay in public git history**. If a secret ever got
  out, rotate it. Removing the card isn't enough.
- Pages can take 30–90 s to update. `verify` polls for you.
- Website type: if the site is already hosted, pass `--link` (and `--source` too if the friend should
  be able to run his own copy).
- Single-file `--type prompt` items show a **Copy prompt** button that copies the prompt text itself.

## Verify
`$SHELF verify <slug>` prints `✓ live`, and the card appears at `https://jesse372.github.io/claude-shelf/#<slug>`.
