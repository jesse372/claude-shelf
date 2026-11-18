# Guardian: self-healing watch over every unattended job

`com.jesse.guardian` runs `guardian-qc.sh` every 10 min (it uses the `pipeline-qc` skill's engine, so that
skill must be installed). `registry.json` lists every job. Only jobs whose LaunchAgent you have loaded should
be in it: delete the entries you do not use.

- **Add a job**: append an entry to `registry.json` (see `_doc` there). Run `python3 guardian.py check <label>`,
  which should say `ok`.
- **What it checks**: launchd loaded, last exit code, `runs` counter moving within `max_gap_h`, daemon has a pid,
  new crash lines in `log` (Traceback, fatal:, PUSH FAILED, Operation not permitted, ...), `state_json` parse, `probe`.
- **Repair ladder**: Tier 1 (in `guardian.py probe`): load agent, restore last-good state JSON (`state/lastgood/`),
  re-run, re-check. Tier 2: headless Claude edits `script` (constrained tools, business rules frozen), kept only
  if a fresh run is green, then committed to ~/JesseOS. Max once per 6h per job. Tier 3: ONE alert per failure
  through `notify/notify.py` (marker `state/alert-<label>` until green again).
- **Logs**: `state/qc.log` (every run), `state/repaired.log` (Tier-1 fixes), `state/launchd.log`.
- **Test the ladder** (run with `GUARDIAN_SILENT=1` so nobody is paged): make a throwaway LaunchAgent that runs a
  python file with a deliberate bug (e.g. `pritn`), add it to the registry with `selfheal: true`, run
  `guardian-qc.sh`: expect "Tier2 VERIFIED GREEN". Then remove the job.
- Pause it: `launchctl bootout gui/$(id -u)/com.jesse.guardian`.
