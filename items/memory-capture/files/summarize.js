#!/usr/bin/env node
// JesseOS memory auto-capture. Summarizes IDLE agent session transcripts —
// Claude Code (~/.claude/projects) AND Codex (~/.codex/sessions) — into the
// vault's durable decisions log. Runs daily (LaunchAgent com.jesse.memcapture).
//
// Layout (JesseOS-aligned):
//   knowledge -> ~/JesseOS/vault/50-memory/   (committed, backed up; shared with the `memory` skill)
//   tooling   -> ~/.claude/skills/memory-capture/  (this file)
//   state/log -> ~/.local/state/jesseos-memory/   (machine-local, out of repo)
//
// Both sources share ONE state file, decisions log, and the same haiku summarizer.
// Debug a source without writing: MEMCAP_DEBUG=codex node summarize.js

'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const HOME = os.homedir();
const PROJECTS = path.join(HOME, '.claude', 'projects');
const CODEX_SESSIONS = path.join(HOME, '.codex', 'sessions');
const KNOW = path.join(HOME, 'JesseOS', 'vault', '50-memory');
const DECISIONS = path.join(KNOW, 'decisions.md');
const ARCHIVE = path.join(KNOW, 'archive.md');
const SESSIONS = path.join(KNOW, 'sessions');
const STATE_DIR = path.join(HOME, '.local', 'state', 'jesseos-memory');
const STATE = path.join(STATE_DIR, 'state.json');
const LOGF = path.join(STATE_DIR, 'capture.log');

const IDLE_HOURS = 2;
const MAX_CHARS = 60000;
const MODEL = 'haiku';
const CLAUDE = process.env.CLAUDE_BIN || 'claude';
const MARKER = '<!-- entries below (most recent first) -->';

function log(m) { try { fs.mkdirSync(STATE_DIR, { recursive: true }); fs.appendFileSync(LOGF, `${new Date().toISOString()} ${m}\n`); } catch {} }
function loadState() { try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch { return null; } }
function saveState(s) { fs.mkdirSync(STATE_DIR, { recursive: true }); fs.writeFileSync(STATE, JSON.stringify(s, null, 2)); }

function listTranscripts() {
  const out = [];
  let dirs = []; try { dirs = fs.readdirSync(PROJECTS); } catch { return out; }
  for (const d of dirs) {
    const dir = path.join(PROJECTS, d);
    let files = []; try { files = fs.readdirSync(dir); } catch { continue; }
    for (const f of files) {
      if (!f.endsWith('.jsonl')) continue;
      const fp = path.join(dir, f);
      let st; try { st = fs.statSync(fp); } catch { continue; }
      out.push({ id: f.replace(/\.jsonl$/, ''), project: prettyProject(d), path: fp, size: st.size, mtime: st.mtimeMs });
    }
  }
  return out;
}
function prettyProject(d) { const p = d.replace(/^-/, '/').replace(/-/g, '/'); return p === '/' ? '(root)' : p; }

function extractText(fp) {
  let raw; try { raw = fs.readFileSync(fp, 'utf8'); } catch { return ''; }
  const parts = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let o; try { o = JSON.parse(line); } catch { continue; }
    const role = o.type || (o.message && o.message.role);
    const c = o.message && o.message.content;
    let t = '';
    if (typeof c === 'string') t = c;
    else if (Array.isArray(c)) t = c.filter(b => b && b.type === 'text' && b.text).map(b => b.text).join('\n');
    if (!t.trim()) continue;
    parts.push((role === 'user' ? 'User: ' : 'Assistant: ') + t);
  }
  let j = parts.join('\n\n');
  if (j.length > MAX_CHARS) j = j.slice(-MAX_CHARS);
  return j;
}

// --- Codex source: ~/.codex/sessions/YYYY/MM/DD/rollout-<ts>-<uuid>.jsonl ---
function walkRollouts(dir, out) {
  let ents = []; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    const fp = path.join(dir, e.name);
    if (e.isDirectory()) walkRollouts(fp, out);
    else if (e.name.startsWith('rollout-') && e.name.endsWith('.jsonl')) out.push(fp);
  }
  return out;
}
function codexMeta(fp) { // pull id + cwd from session_meta — regex a chunk (the first line embeds huge base_instructions, so don't JSON.parse it)
  try {
    const fd = fs.openSync(fp, 'r'); const buf = Buffer.alloc(16384);
    const n = fs.readSync(fd, buf, 0, 16384, 0); fs.closeSync(fd);
    const head = buf.toString('utf8', 0, n);
    const id = (head.match(/"id":"([^"]+)"/) || [])[1] || '';
    const cwd = ((head.match(/"cwd":"((?:[^"\\]|\\.)*)"/) || [])[1] || '').replace(/\\\//g, '/');
    return { id, cwd };
  } catch { return { id: '', cwd: '' }; }
}
function listCodexTranscripts() {
  const out = [];
  for (const fp of walkRollouts(CODEX_SESSIONS, [])) {
    let st; try { st = fs.statSync(fp); } catch { continue; }
    const m = codexMeta(fp);
    const id = m.id || path.basename(fp).replace(/\.jsonl$/, '');
    out.push({ id, project: 'codex · ' + (m.cwd || '(unknown)'), path: fp, size: st.size, mtime: st.mtimeMs, source: 'codex' });
  }
  return out;
}
function extractCodexText(fp) {
  let raw; try { raw = fs.readFileSync(fp, 'utf8'); } catch { return ''; }
  const parts = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let o; try { o = JSON.parse(line); } catch { continue; }
    if (o.type !== 'response_item') continue;
    const p = o.payload || {};
    if (p.type !== 'message' || !p.role) continue;
    const c = p.content;
    let t = '';
    if (typeof c === 'string') t = c;
    else if (Array.isArray(c)) t = c.map(b => (b && (b.text || b.input_text || b.output_text)) || '').join('\n');
    t = t.trim();
    if (!t) continue;
    // Drop injected, non-conversational context replayed into the transcript.
    if (/^(#\s*AGENTS\.md instructions\b|<permissions instructions>|<environment_context>|<user_instructions>|<system_instruction>|<INSTRUCTIONS>)/.test(t)) continue;
    parts.push((p.role === 'user' ? 'User: ' : 'Assistant: ') + t);
  }
  let j = parts.join('\n\n');
  if (j.length > MAX_CHARS) j = j.slice(-MAX_CHARS);
  return j;
}

const PROMPT = [
  'You maintain a long-term memory log for an engineer\'s AI coding agent.',
  'Below is a session transcript. Extract ONLY durable, reusable facts worth',
  'recalling in FUTURE sessions: decisions made, tools/services installed or',
  'configured, file locations & conventions, gotchas, and resulting system state.',
  'Ignore small talk, one-off debugging, and anything ephemeral.',
  'Output EXACTLY this format and NOTHING else — no preamble, no greeting, no sign-off:',
  'TOPIC: <3 to 7 word title>',
  'followed by up to 4 lines each starting with "- " (a durable fact).',
  'If nothing durable is worth keeping, output exactly: SKIP',
].join(' ');

function summarize(text) {
  try {
    return execFileSync(CLAUDE, ['-p', PROMPT, '--model', MODEL],
      { input: text, encoding: 'utf8', timeout: 120000, maxBuffer: 4 * 1024 * 1024 }).trim();
  } catch (e) { log('summarize error: ' + (e.message || e)); return null; }
}

function parseSummary(raw) {
  if (!raw || /^\s*SKIP\b/i.test(raw)) return null;
  const lines = raw.split('\n').map(s => s.replace(/\*\*/g, '').trimEnd());
  let title = null; const bullets = [];
  for (const l of lines) {
    const m = l.match(/^\s*TOPIC:\s*(.+)$/i);
    if (m && !title) { title = m[1].trim(); continue; }
    if (/^\s*-\s+/.test(l)) bullets.push('- ' + l.replace(/^\s*-\s+/, '').trim());
  }
  // Guard against model refusals that still emit a TOPIC line.
  if (title && /unable to process|cannot (engage|assist|help)|can't (engage|assist|help)/i.test(title) && !bullets.length) return null;
  if (!title && !bullets.length) return null;
  return { title: title || 'Session notes', bullets: bullets.slice(0, 4) };
}

function appendEntry(t, parsed) {
  const date = new Date().toISOString().slice(0, 10);
  const tag = t.source === 'codex' ? 'codex session' : 'session';
  const entry = `\n## ${date} — ${t.project} — ${parsed.title}\n${parsed.bullets.join('\n')}\n_${tag} ${t.id}_\n`;
  let cur = ''; try { cur = fs.readFileSync(DECISIONS, 'utf8'); } catch {}
  const mi = cur.indexOf(MARKER);
  cur = mi >= 0 ? cur.slice(0, mi + MARKER.length) + '\n' + entry + cur.slice(mi + MARKER.length) : cur + '\n' + entry;
  fs.writeFileSync(DECISIONS, cur);
  try { fs.mkdirSync(SESSIONS, { recursive: true });
    fs.writeFileSync(path.join(SESSIONS, t.id + '.md'),
      `# ${t.project}\n# session ${t.id}\n# captured ${new Date().toISOString()}\n\n## ${parsed.title}\n${parsed.bullets.join('\n')}\n`); } catch {}
}

function rotateIfLarge() {
  const KEEP = 40;
  let cur; try { cur = fs.readFileSync(DECISIONS, 'utf8'); } catch { return; }
  const mi = cur.indexOf(MARKER); if (mi < 0) return;
  const head = cur.slice(0, mi + MARKER.length);
  const entries = cur.slice(mi + MARKER.length).split(/\n(?=## )/).map(s => s.trim()).filter(Boolean);
  if (entries.length <= KEEP) return;
  fs.writeFileSync(DECISIONS, head + '\n\n' + entries.slice(0, KEEP).join('\n\n') + '\n');
  fs.appendFileSync(ARCHIVE, '\n\n' + entries.slice(KEEP).join('\n\n') + '\n');
  log(`rotated ${entries.length - KEEP} entries to archive.md`);
}

// Self-heal: drop duplicate entries (same session id) from decisions.md, keeping the first.
// Cheap insurance — runs at the start of every capture pass.
function dedupeDecisions() {
  let cur; try { cur = fs.readFileSync(DECISIONS, 'utf8'); } catch { return 0; }
  const mi = cur.indexOf(MARKER); if (mi < 0) return 0;
  const head = cur.slice(0, mi + MARKER.length);
  const entries = cur.slice(mi + MARKER.length).split(/\n(?=## )/).map(s => s.replace(/^\n+/, '').trimEnd()).filter(Boolean);
  const seen = new Set(); const keep = []; let dropped = 0;
  for (const e of entries) {
    const m = e.match(/_(?:codex )?session ([0-9a-fA-F-]{8,})_/);
    const id = m ? m[1] : null;
    if (id) { if (seen.has(id)) { dropped++; continue; } seen.add(id); }
    keep.push(e);
  }
  if (dropped > 0) {
    fs.writeFileSync(DECISIONS, head + '\n\n' + keep.join('\n\n') + '\n');
    log(`de-duped decisions.md: dropped ${dropped} duplicate session entries`);
  }
  return dropped;
}

// Ensure the Codex baseline flag + ids are present (e.g. after a state-clobbering concurrent run).
function ensureCodexSeed() {
  const state = loadState(); if (!state) return;
  let added = 0;
  for (const t of listCodexTranscripts()) if (!state.processed[t.id]) { state.processed[t.id] = { size: t.size, mtime: t.mtime }; added++; }
  state.codexSeeded = true; saveState(state);
  log(`ensureCodexSeed: codexSeeded=true, seeded ${added} new codex ids`);
}

function main() {
  fs.mkdirSync(SESSIONS, { recursive: true });
  dedupeDecisions();
  const now = Date.now();
  const transcripts = [...listTranscripts(), ...listCodexTranscripts()];
  let state = loadState();

  if (!state) {
    state = { processed: {}, seededAt: new Date().toISOString(), codexSeeded: true };
    for (const t of transcripts) state.processed[t.id] = { size: t.size, mtime: t.mtime };
    saveState(state);
    log(`baseline seeded: ${transcripts.length} transcripts (no backfill)`);
    console.log(`Memory capture baseline seeded (${transcripts.length} transcripts).`);
    return;
  }

  // One-time Codex baseline: seed existing Codex sessions as processed (no backfill),
  // so capture starts fresh going forward — same philosophy as the initial Claude seed.
  if (!state.codexSeeded) {
    let n = 0;
    for (const t of transcripts) if (t.source === 'codex') { state.processed[t.id] = { size: t.size, mtime: t.mtime }; n++; }
    state.codexSeeded = true; saveState(state);
    log(`codex baseline seeded: ${n} transcripts (no backfill)`);
  }

  let captured = 0, skipped = 0;
  for (const t of transcripts) {
    const idleH = (now - t.mtime) / 3.6e6;
    const prev = state.processed[t.id];
    const grown = prev ? (t.size - prev.size > 2000) : true;
    if (!grown || idleH < IDLE_HOURS) continue;
    const text = t.source === 'codex' ? extractCodexText(t.path) : extractText(t.path);
    if (text.length < 400) { state.processed[t.id] = { size: t.size, mtime: t.mtime }; continue; }
    const parsed = parseSummary(summarize(text));
    state.processed[t.id] = { size: t.size, mtime: t.mtime };
    if (!parsed) { skipped++; log(`SKIP ${t.id}`); continue; }
    appendEntry(t, parsed); captured++; log(`captured ${t.id} (${t.project})`);
  }
  saveState(state);
  rotateIfLarge();
  console.log(`Memory capture: ${captured} captured, ${skipped} skipped.`);
}

function debugCodex() {
  const ts = listCodexTranscripts();
  console.log(`Codex transcripts found: ${ts.length}`);
  for (const t of ts) {
    const txt = extractCodexText(t.path);
    console.log(`\n• ${t.id}  [${t.project}]  ${t.size}B  extracted=${txt.length} chars`);
    console.log('  ' + txt.slice(0, 160).replace(/\n/g, ' ⏎ '));
  }
  // End-to-end (read-only): summarize the most substantive one and print the entry it WOULD write.
  const pick = ts.map(t => ({ t, txt: extractCodexText(t.path) })).filter(x => x.txt.length > 1500).sort((a, b) => b.txt.length - a.txt.length)[0];
  if (!pick) { console.log('\n(no transcript large enough to summarize)'); return; }
  console.log(`\n=== END-TO-END on ${pick.t.id} (summarizing via ${MODEL}) ===`);
  const parsed = parseSummary(summarize(pick.txt));
  if (!parsed) { console.log('→ parsed as SKIP / nothing durable'); return; }
  const date = new Date().toISOString().slice(0, 10);
  console.log(`\n## ${date} — ${pick.t.project} — ${parsed.title}\n${parsed.bullets.join('\n')}\n_codex session ${pick.t.id}_`);
}

if (process.env.MEMCAP_DEBUG === 'codex') debugCodex();
else if (process.env.MEMCAP_DEDUPE) { const d = dedupeDecisions(); ensureCodexSeed(); console.log(`Dedupe: dropped ${d} duplicate entries; codex baseline re-asserted.`); }
else main();
