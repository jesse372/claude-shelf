#!/usr/bin/env node
// JesseOS memory search — on-demand retrieval over captured memory (and,
// optionally, raw session transcripts). Dependency-free lexical ranking; an
// embedding backend can be added later behind the same CLI.
//
// Usage:
//   node search.js "tailscale nginx port"          # search the memory store
//   node search.js --transcripts "ssh config"        # also scan raw transcripts
//   node search.js --limit 5 "launchagent"
//
// Output: ranked matches with source, title/date, and a snippet.

'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const HOME = os.homedir();
const KNOW = path.join(HOME, 'JesseOS', 'vault', '50-memory');
const DECISIONS = path.join(KNOW, 'decisions.md');
const ARCHIVE = path.join(KNOW, 'archive.md');
const SESSIONS = path.join(KNOW, 'sessions');
const PROJECTS = path.join(HOME, '.claude', 'projects');

const args = process.argv.slice(2);
let limit = 8, scanTranscripts = false;
const terms = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--transcripts' || args[i] === '--all') scanTranscripts = true;
  else if (args[i] === '--limit') limit = parseInt(args[++i], 10) || 8;
  else terms.push(args[i]);
}
const query = terms.join(' ').trim();
if (!query) { console.error('usage: search.js [--transcripts] [--limit N] "query terms"'); process.exit(2); }
const qtokens = query.toLowerCase().split(/\s+/).filter(Boolean);

function score(text) {
  const lc = text.toLowerCase();
  let distinct = 0, total = 0;
  for (const t of qtokens) {
    const re = new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    const m = lc.match(re);
    if (m) { distinct++; total += m.length; }
  }
  return distinct === 0 ? 0 : distinct * 100 + total;
}
function snippet(text, max = 240) {
  const lc = text.toLowerCase();
  let pos = -1;
  for (const t of qtokens) { const p = lc.indexOf(t); if (p >= 0 && (pos < 0 || p < pos)) pos = p; }
  if (pos < 0) pos = 0;
  const start = Math.max(0, pos - 60);
  return (start > 0 ? '…' : '') + text.slice(start, start + max).replace(/\s+/g, ' ').trim() + '…';
}

const docs = [];
// 1) decisions.md + archive.md, split into per-entry docs
for (const [src, file] of [['decisions', DECISIONS], ['archive', ARCHIVE]]) {
  let raw = ''; try { raw = fs.readFileSync(file, 'utf8'); } catch { continue; }
  const mi = raw.indexOf('<!-- entries below');
  const body = mi >= 0 ? raw.slice(raw.indexOf('\n', mi)) : raw;
  for (const e of body.split(/\n(?=## )/)) {
    const txt = e.trim(); if (!txt.startsWith('##')) continue;
    const title = (txt.split('\n')[0] || '').replace(/^##\s*/, '');
    docs.push({ source: src, label: title, text: txt });
  }
}
// 2) per-session notes
try {
  for (const f of fs.readdirSync(SESSIONS)) {
    if (!f.endsWith('.md')) continue;
    const txt = fs.readFileSync(path.join(SESSIONS, f), 'utf8');
    docs.push({ source: 'session', label: f.replace(/\.md$/, ''), text: txt });
  }
} catch {}

// 3) optional: raw transcripts (heavier) — score by message text
if (scanTranscripts) {
  let dirs = []; try { dirs = fs.readdirSync(PROJECTS); } catch {}
  for (const d of dirs) {
    let files = []; try { files = fs.readdirSync(path.join(PROJECTS, d)); } catch { continue; }
    for (const f of files) {
      if (!f.endsWith('.jsonl')) continue;
      let raw = ''; try { raw = fs.readFileSync(path.join(PROJECTS, d, f), 'utf8'); } catch { continue; }
      const parts = [];
      for (const line of raw.split('\n')) {
        if (!line.trim()) continue; let o; try { o = JSON.parse(line); } catch { continue; }
        const c = o.message && o.message.content;
        if (typeof c === 'string') parts.push(c);
        else if (Array.isArray(c)) for (const b of c) if (b && b.type === 'text' && b.text) parts.push(b.text);
      }
      const text = parts.join('\n');
      if (text) docs.push({ source: 'transcript', label: `${d.replace(/^-/, '/').replace(/-/g, '/')} ${f.slice(0, 8)}`, text });
    }
  }
}

const ranked = docs.map(d => ({ ...d, s: score(d.text) })).filter(d => d.s > 0).sort((a, b) => b.s - a.s).slice(0, limit);

if (!ranked.length) {
  console.log(`No memory matches for: "${query}"` + (scanTranscripts ? '' : '  (try --transcripts to scan raw session logs)'));
  process.exit(0);
}
console.log(`Top ${ranked.length} memory matches for "${query}":\n`);
for (const r of ranked) {
  console.log(`[${r.source}] ${r.label}   (score ${r.s})`);
  console.log('  ' + snippet(r.text) + '\n');
}
