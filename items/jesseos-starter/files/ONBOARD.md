# For the Claude setting this Mac up

You are installing an always-on agent setup on someone's own Mac. Work through this with the owner at the
keyboard. Everything you learn about their business stays on this Mac.

## 1. Install
1. Read `install.sh` and the scripts it installs. Tell the owner about anything that looks risky or costs money.
2. Check the basics exist: `git`, `gh` (GitHub CLI), `python3`, `node`/`npm`. Install what is missing with
   Homebrew, asking first.
3. Run `./install.sh`. It copies the kit into `~/JesseOS`, links the standing instructions into
   `~/.claude/CLAUDE.md`, downloads the companion skills from the shelf and mirrors them into `~/.claude/skills`.
   It never overwrites existing files and loads no background jobs.
4. Have the owner double-click `~/JesseOS/workspace/setup/finish-setup.command`. It walks them through the
   sign-ins only a person can do (Claude, GitHub for the private backup, a Telegram bot for alerts) and then
   starts the background jobs.
5. Phone access: read `~/JesseOS/workspace/claude-remote/README.md`. Have the owner grant Terminal its macOS
   permissions and set the Mac to restart after a power cut, then confirm the Mac shows in the Claude app on
   their phone (Code tab). Use the `mac-headless-setup` skill's audit to check permissions.
6. Verify: `python3 ~/JesseOS/workspace/guardian/guardian.py list`, then
   `GUARDIAN_SILENT=1 /bin/bash ~/JesseOS/workspace/guardian/guardian-qc.sh` should finish with every job green.
   Remove registry entries for jobs the owner chose not to load.

## 2. Learn the business (interview, one question at a time)
Fill in `~/JesseOS/vault/00-context/about-me.md`, `working-style.md` and `business-state.md` from the owner's
answers: what the business does, who does what, which software it runs on, what they want taken off their
plate, who approves what. Short, dated, in their words. Ask about connectors they need (email, calendar, file
storage) and help them connect those to their Claude account.

## 3. Build the first automation, the way this setup expects
- Pick ONE workflow and ONE stage of it. Get that working end to end before the next.
- Use the `loop-contract` skill to write down the goal, scope, verifier, budget and stop conditions first.
- Test on real past work the owner already knows the right answer to.
- Anything that sends to a customer, supplier or subcontractor, or writes into a business system, is
  draft-then-approve until the owner explicitly says it may run by itself. Record that decision, dated, in
  `automations.md`.
- Every scheduled job is registered in `guardian/registry.json` the moment it is created, alerts through
  `notify/notify.py`, and gets a row in `automations.md` with its rules.
- Numbers read off drawings, scans or PDFs are drafts for a person to check.
- Secrets go in `~/.authframework/secrets/` (mode 600) or the Keychain. Never in `~/JesseOS`, which is backed
  up to GitHub.
- Finish each piece with the `wrap-up` skill.

## 4. Keep the rules
Whenever the owner says "always", "never" or "from now on", write it into `automations.md` or
`business-state.md` with the date. That file is loaded into every session, which is how the setup keeps
behaving the same way months later.
