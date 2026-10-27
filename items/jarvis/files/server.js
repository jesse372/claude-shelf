#!/usr/bin/env node
/**
 * JARVIS — local tactical interface for this Mac.
 * Zero-dependency Node server that bridges the HUD to the Claude Code CLI
 * (headless stream-json mode) + local voice stack (whisper STT, edge-tts TTS).
 *
 * Security: binds 127.0.0.1 ONLY. Claude runs with --dangerously-skip-permissions
 * (full autonomy) — do not expose this port beyond localhost.
 */
'use strict';

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFile } = require('child_process');

const PORT = 1963;                     // Batman's debut year
const HOST = '127.0.0.1';
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const SESSION_FILE = path.join(ROOT, '.session');
const HOME = os.homedir();
const SPEAK_VOICE = 'en-GB-RyanNeural'; // JARVIS-adjacent British neural voice
const TRANSCRIBE = path.join(HOME, 'JesseOS/workspace/skills/voice/scripts/transcribe.sh');
const EDGE_TTS_PATHS = [
  path.join(HOME, '.local/bin/edge-tts'),
  '/usr/local/bin/edge-tts',
  '/opt/homebrew/bin/edge-tts',
];
const CLAUDE_BIN = '/usr/local/bin/claude';
const PORTFOLIO_FILE = path.join(ROOT, 'portfolio.json');

const JARVIS_SYSTEM_PROMPT = [
  'You are JARVIS, Jesse\'s tactical interface running with full autonomy on his Mac (HUD at localhost:1963).',
  'Your replies are spoken aloud via TTS: be concise, natural and direct. Avoid markdown tables, headers and code blocks unless explicitly asked. Lead with the answer.',
  `Jesse's stock portfolio lives at ${PORTFOLIO_FILE} as JSON: {"holdings":[{"sym":"AAPL","qty":10,"basis":150.0}]} (basis = avg buy price, optional; sym = Yahoo Finance ticker). When Jesse mentions buying/selling stocks or tells you his holdings, update that file — the HUD prices it live.`,
  'His Up Bank API token is in the macOS Keychain under service "upbank" (do not print it).',
  'His Google Calendar secret iCal URL lives in Keychain service "gcal-ics" — if he gives you a calendar.google.com/.../basic.ics URL, store it with: security add-generic-password -U -s gcal-ics -a jesse -w <url>',
  'CONTINUITY: your live conversation is deliberately reset periodically to save tokens, so do NOT rely on it as long-term memory. Durable memory lives in JesseOS: recall past work/decisions with ~/.claude/skills/memory/search.sh "query" and record notable ones with ~/.claude/skills/memory/capture.sh "what was decided". If Jesse refers to something you don\'t see in this conversation, search memory before asking him to repeat himself.',
].join(' ');

// Route quick voice commands to Haiku (cheap, ~5x more headroom on the limit);
// escalate to the account-default (most capable) model only for real work.
function needsHeavyModel(text) {
  const t = text.toLowerCase();
  if (/\b(think hard|go deep|deep dive|full power|use (opus|sonnet)|heavy mode|take your time|carefully)\b/.test(t)) return true;
  return /\b(build|create|write|implement|refactor|debug|fix|edit|modif|instal|configur|set ?up|deploy|migrat|generat|design|architect|script|code|program|analys|analyz|research|investigat|plan|rewrite|automat|integrat|review|audit)\b/.test(t);
}
// Find a session's transcript on disk to gauge size/age (Claude Code stores it
// under ~/.claude/projects/<mangled-cwd>/<id>.jsonl).
function sessionStat(id) {
  try {
    const base = path.join(HOME, '.claude', 'projects');
    for (const d of fs.readdirSync(base)) {
      const f = path.join(base, d, id + '.jsonl');
      if (fs.existsSync(f)) { const s = fs.statSync(f); return { bytes: s.size, mtimeMs: s.mtimeMs }; }
    }
  } catch {}
  return null;
}

// ---------- state ----------
let activeClaude = null; // currently running claude process (one at a time)

function loadSession() {
  try { return fs.readFileSync(SESSION_FILE, 'utf8').trim() || null; } catch { return null; }
}
function saveSession(id) {
  try { fs.writeFileSync(SESSION_FILE, id); } catch {}
}
function clearSession() {
  try { fs.unlinkSync(SESSION_FILE); } catch {}
}

// ---------- helpers ----------
function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function readBody(req, limit = 32 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function sseSend(res, obj) {
  res.write(`data: ${JSON.stringify(obj)}\n\n`);
}

function findEdgeTts() {
  for (const p of EDGE_TTS_PATHS) if (fs.existsSync(p)) return p;
  return null;
}

function summarizeToolInput(name, input) {
  if (!input) return '';
  try {
    if (input.command) return String(input.command).slice(0, 120);
    if (input.file_path) return String(input.file_path).replace(HOME, '~');
    if (input.pattern) return String(input.pattern).slice(0, 80);
    if (input.url) return String(input.url).slice(0, 100);
    if (input.query) return String(input.query).slice(0, 80);
    if (input.prompt) return String(input.prompt).slice(0, 80);
    if (input.description) return String(input.description).slice(0, 80);
    const s = JSON.stringify(input);
    return s.length > 100 ? s.slice(0, 100) + '…' : s;
  } catch { return ''; }
}

// ---------- /api/ask : stream claude over SSE ----------
async function handleAsk(req, res) {
  if (activeClaude) return json(res, 409, { error: 'busy', detail: 'A task is already running. Stop it first.' });

  let body;
  try { body = JSON.parse((await readBody(req)).toString('utf8')); } catch { return json(res, 400, { error: 'bad json' }); }
  const text = (body.text || '').trim();
  if (!text) return json(res, 400, { error: 'empty prompt' });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const args = ['-p', text, '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
    '--dangerously-skip-permissions', '--append-system-prompt', JARVIS_SYSTEM_PROMPT];
  // Model: Haiku for quick commands; account-default (heaviest) for real work or on request.
  if (body.fast || !needsHeavyModel(text)) args.push('--model', 'claude-haiku-4-5');

  // Rolling session cap: resuming re-sends the WHOLE transcript every turn, so a
  // session that grows unbounded (or sits stale for hours) silently torches the
  // usage limit. Start fresh past ~180KB (~45K tokens) or after 3h idle.
  let sessionId = loadSession();
  let resume = sessionId && !body.newSession;
  if (resume) {
    const st = sessionStat(sessionId);
    if (st && (st.bytes > 180 * 1024 || Date.now() - st.mtimeMs > 3 * 3600 * 1000)) {
      clearSession(); resume = false; sessionId = null;
    }
  }
  if (resume) args.push('--resume', sessionId);

  const child = spawn(CLAUDE_BIN, args, {
    cwd: HOME,
    env: { ...process.env, PATH: `/usr/local/bin:/opt/homebrew/bin:${HOME}/.local/bin:${process.env.PATH || ''}` },
  });
  activeClaude = child;

  let buf = '';
  let resumeFailed = false;

  child.stdout.on('data', (chunk) => {
    buf += chunk.toString('utf8');
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line) continue;
      let ev;
      try { ev = JSON.parse(line); } catch { continue; }

      if (ev.type === 'stream_event' && ev.event) {
        // token-by-token partials
        const se = ev.event;
        if (se.type === 'content_block_delta' && se.delta && se.delta.type === 'text_delta' && se.delta.text) {
          sseSend(res, { type: 'delta', text: se.delta.text });
        }
      } else if (ev.type === 'system' && ev.subtype === 'init') {
        saveSession(ev.session_id);
        sseSend(res, { type: 'session', id: ev.session_id, model: ev.model });
      } else if (ev.type === 'assistant' && ev.message && Array.isArray(ev.message.content)) {
        for (const block of ev.message.content) {
          if (block.type === 'text' && block.text) {
            sseSend(res, { type: 'text', text: block.text });
          } else if (block.type === 'tool_use') {
            sseSend(res, { type: 'tool', name: block.name, detail: summarizeToolInput(block.name, block.input) });
          }
        }
      } else if (ev.type === 'result') {
        sseSend(res, {
          type: 'done',
          ok: !ev.is_error,
          result: ev.result || '',
          cost: ev.total_cost_usd,
          ms: ev.duration_ms,
          turns: ev.num_turns,
        });
      }
    }
  });

  let errBuf = '';
  child.stderr.on('data', (c) => { errBuf += c.toString('utf8'); });

  child.on('close', (code) => {
    activeClaude = null;
    // If resume pointed at a stale session, retry once with a fresh one.
    if (code !== 0 && sessionId && /No conversation found|session/i.test(errBuf) && !resumeFailed) {
      resumeFailed = true;
      clearSession();
      sseSend(res, { type: 'info', text: 'Previous session expired — started a fresh one. Ask again.' });
    }
    if (code !== 0 && errBuf) sseSend(res, { type: 'error', text: errBuf.slice(0, 500) });
    sseSend(res, { type: 'closed', code });
    res.end();
  });

  req.on('close', () => {
    // Client disconnected — leave claude running? No: kill so state stays sane.
    if (activeClaude === child) { try { child.kill('SIGTERM'); } catch {} activeClaude = null; }
  });
}

// ---------- /api/wake : physically wake the display (voice wake word) ----------
function handleWake(_req, res) {
  execFile('/usr/bin/caffeinate', ['-u', '-t', '2'], () => {});
  json(res, 200, { ok: true });
}

// ---------- /api/stop ----------
function handleStop(_req, res) {
  if (activeClaude) { try { activeClaude.kill('SIGTERM'); } catch {} activeClaude = null; return json(res, 200, { stopped: true }); }
  json(res, 200, { stopped: false });
}

// ---------- /api/new-session ----------
function handleNewSession(_req, res) {
  clearSession();
  json(res, 200, { ok: true });
}

// ---------- /api/transcribe : audio blob -> whisper text ----------
async function handleTranscribe(req, res) {
  let audio;
  try { audio = await readBody(req); } catch { return json(res, 400, { error: 'bad body' }); }
  if (!audio.length) return json(res, 400, { error: 'no audio' });
  const tmp = path.join(os.tmpdir(), `jarvis-${Date.now()}.webm`);
  fs.writeFileSync(tmp, audio);
  // Primary: whisper.cpp (fast + accurate). Fallback: voice-skill whisper (base).
  const sttCpp = path.join(ROOT, 'jarvis-stt.sh');
  const useCpp = fs.existsSync(path.join(ROOT, 'whisper.cpp/build/bin/whisper-cli'));
  const cmd = useCpp ? sttCpp : TRANSCRIBE;
  const cmdArgs = useCpp ? [tmp] : [tmp, 'base'];
  execFile(cmd, cmdArgs, { timeout: 120000 }, (err, stdout) => {
    try { fs.unlinkSync(tmp); } catch {}
    if (err) return json(res, 500, { error: 'transcription failed', detail: String(err).slice(0, 200) });
    json(res, 200, { text: (stdout || '').trim() });
  });
}

// ---------- /api/speak : text -> mp3 (edge-tts) ----------
async function handleSpeak(req, res) {
  let body;
  try { body = JSON.parse((await readBody(req)).toString('utf8')); } catch { return json(res, 400, { error: 'bad json' }); }
  let text = (body.text || '').trim();
  if (!text) return json(res, 400, { error: 'empty' });
  // Strip markdown noise so TTS reads cleanly
  text = text
    .replace(/```[\s\S]*?```/g, ' code block omitted. ')
    .replace(/[*_#`>|]/g, '')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/\s+/g, ' ')
    .slice(0, 3000);

  const edgeTts = findEdgeTts();
  const tmp = path.join(os.tmpdir(), `jarvis-tts-${Date.now()}.mp3`);
  if (!edgeTts) {
    // Offline fallback: speak server-side with macOS `say`
    execFile('/usr/bin/say', [text], () => {});
    res.writeHead(204); return res.end();
  }
  execFile(edgeTts, ['--voice', SPEAK_VOICE, '--text', text, '--write-media', tmp], { timeout: 60000 }, (err) => {
    if (err || !fs.existsSync(tmp) || !fs.statSync(tmp).size) {
      try { fs.unlinkSync(tmp); } catch {}
      execFile('/usr/bin/say', [text], () => {});
      res.writeHead(204); return res.end();
    }
    const stat = fs.statSync(tmp);
    res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Content-Length': stat.size });
    const stream = fs.createReadStream(tmp);
    stream.pipe(res);
    stream.on('close', () => { try { fs.unlinkSync(tmp); } catch {} });
  });
}

// ---------- /api/stats : HUD readouts ----------
function handleStats(_req, res) {
  execFile('/usr/bin/pmset', ['-g', 'batt'], (e, out) => {
    let battery = null;
    if (!e && out) {
      const m = out.match(/(\d+)%/);
      if (m) battery = parseInt(m[1], 10);
    }
    execFile('/bin/df', ['-k', '/'], (e2, out2) => {
      let diskPct = null;
      if (!e2 && out2) {
        const m = out2.match(/(\d+)%/);
        if (m) diskPct = parseInt(m[1], 10);
      }
      const load = os.loadavg()[0];
      const cores = os.cpus().length;
      json(res, 200, {
        cpu: Math.min(100, Math.round((load / cores) * 100)),
        memGB: +(os.totalmem() / 1e9).toFixed(0),
        memFreeGB: +(os.freemem() / 1e9).toFixed(1),
        uptimeH: +(os.uptime() / 3600).toFixed(1),
        battery,
        diskPct,
        host: os.hostname().replace(/\.local$/, ''),
        session: loadSession() ? loadSession().slice(0, 8) : null,
        busy: !!activeClaude,
      });
    });
  });
}

// ---------- /api/widgets : live HUD data ----------
const https = require('https');

function httpGetJSON(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36', ...headers },
      timeout: 8000,
    }, (r) => {
      if (r.statusCode >= 400) { r.resume(); return reject(new Error('HTTP ' + r.statusCode)); }
      let b = '';
      r.on('data', (c) => b += c);
      r.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

const cache = {}; // key -> {at, ttl, data}
async function cached(key, ttlMs, fn) {
  const c = cache[key];
  if (c && Date.now() - c.at < c.ttl) return c.data;
  const data = await fn();
  cache[key] = { at: Date.now(), ttl: ttlMs, data };
  return data;
}

function keychainGet(service) {
  return new Promise((resolve) => {
    execFile('/usr/bin/security', ['find-generic-password', '-s', service, '-w'], (err, out) => {
      resolve(err ? null : (out || '').trim());
    });
  });
}

async function wUpBank() {
  return cached('upbank', 3600000, async () => { // hourly per Jesse
    const token = await keychainGet('upbank');
    if (!token) return { error: 'no-token' };
    const j = await httpGetJSON('https://api.up.com.au/api/v1/accounts?page[size]=10', { Authorization: `Bearer ${token}` });
    const accounts = (j.data || []).map((a) => ({
      name: a.attributes.displayName,
      value: parseFloat(a.attributes.balance.value),
    }));
    const total = accounts.reduce((s, a) => s + a.value, 0);
    return { total, accounts };
  });
}

async function wPortfolio() {
  let mtime = 0;
  try { mtime = fs.statSync(PORTFOLIO_FILE).mtimeMs; } catch {}
  return cached('portfolio:' + mtime, 30000, async () => { // near-live during market hours
    let pf;
    try { pf = JSON.parse(fs.readFileSync(PORTFOLIO_FILE, 'utf8')); } catch { return { error: 'no-file' }; }
    const holdings = (pf.holdings || []).filter((h) => h.sym && h.qty);
    if (!holdings.length) return { error: 'empty' };
    const rows = [];
    let total = 0, prevTotal = 0, costTotal = 0, currency = 'USD';
    for (const h of holdings) {
      try {
        const j = await httpGetJSON(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(h.sym)}?interval=1d&range=2d`);
        const meta = j.chart.result[0].meta;
        const price = meta.regularMarketPrice;
        const prev = meta.chartPreviousClose || price;
        currency = meta.currency || currency;
        total += price * h.qty;
        prevTotal += prev * h.qty;
        if (h.basis) costTotal += h.basis * h.qty;
        rows.push({ sym: h.sym, qty: h.qty, price, dayPct: prev ? ((price - prev) / prev) * 100 : 0, value: price * h.qty });
      } catch { rows.push({ sym: h.sym, qty: h.qty, error: true }); }
    }
    // USD -> AUD conversion (Stake trades US stocks; Jesse wants AUD on the HUD)
    let audRate = null;
    if (currency === 'USD') {
      try {
        audRate = await cached('fx:audusd', 3600000, async () => {
          const j = await httpGetJSON('https://query1.finance.yahoo.com/v8/finance/chart/AUDUSD=X?interval=1d&range=1d');
          return 1 / j.chart.result[0].meta.regularMarketPrice; // AUD per 1 USD
        });
      } catch {}
    }
    const gain = costTotal ? total - costTotal : null;
    return {
      total, currency,
      asOf: Date.now(), // when these prices were actually fetched
      dayChange: total - prevTotal,
      dayPct: prevTotal ? ((total - prevTotal) / prevTotal) * 100 : 0,
      gain,
      gainPct: costTotal ? ((total - costTotal) / costTotal) * 100 : null,
      aud: audRate ? { rate: audRate, total: total * audRate, dayChange: (total - prevTotal) * audRate, gain: gain != null ? gain * audRate : null } : null,
      rows,
    };
  });
}

const WMO = { 0:'CLEAR',1:'MOSTLY CLEAR',2:'PARTLY CLOUDY',3:'OVERCAST',45:'FOG',48:'FOG',51:'DRIZZLE',53:'DRIZZLE',55:'DRIZZLE',61:'LIGHT RAIN',63:'RAIN',65:'HEAVY RAIN',71:'SNOW',73:'SNOW',75:'SNOW',80:'SHOWERS',81:'SHOWERS',82:'HEAVY SHOWERS',95:'THUNDERSTORM',96:'THUNDERSTORM',99:'THUNDERSTORM' };

async function wWeather() {
  return cached('weather', 15 * 60000, async () => {
    const loc = await cached('geoloc', 24 * 3600000, async () => {
      return new Promise((resolve, reject) => {
        // ip-api is http-only on the free tier
        require('http').get('http://ip-api.com/json?fields=lat,lon,city', { timeout: 6000 }, (r) => {
          let b = ''; r.on('data', (c) => b += c); r.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } });
        }).on('error', reject);
      });
    });
    const j = await httpGetJSON(`https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}&current_weather=true&daily=temperature_2m_max,temperature_2m_min&timezone=auto`);
    return {
      city: (loc.city || '').toUpperCase(),
      temp: Math.round(j.current_weather.temperature),
      desc: WMO[j.current_weather.weathercode] || '—',
      hi: Math.round(j.daily.temperature_2m_max[0]),
      lo: Math.round(j.daily.temperature_2m_min[0]),
    };
  });
}

function httpGetText(url, redirects = 3) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 10000 }, (r) => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location && redirects > 0) {
        r.resume();
        return resolve(httpGetText(r.headers.location, redirects - 1));
      }
      if (r.statusCode >= 400) { r.resume(); return reject(new Error('HTTP ' + r.statusCode)); }
      let b = '';
      r.on('data', (c) => b += c);
      r.on('end', () => resolve(b));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

// Minimal ICS parser: upcoming events over a window of days (today + N ahead),
// incl. basic DAILY/WEEKLY/MONTHLY recurrence.
const DOW = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const DAY_LABEL = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

function dateKey(d) { return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`; }
function keyToDate(k) { return new Date(+k.slice(0,4), +k.slice(4,6)-1, +k.slice(6,8)); }

// How many occurrences of `rrule` (rooted at startDate) have happened on or before dayDate.
function occurrencesUpTo(startDate, freq, interval, bydays, dayDate) {
  if (freq === 'WEEKLY' && bydays) {
    const startBucket = new Date(startDate); startBucket.setDate(startBucket.getDate() - startBucket.getDay());
    let n = 0;
    for (let b = 0; b < 1000; b++) {
      const bucketDate0 = new Date(startBucket); bucketDate0.setDate(bucketDate0.getDate() + b * interval * 7);
      if (bucketDate0 > dayDate) break;
      for (let wd = 0; wd < 7; wd++) {
        if (!bydays.includes(DOW[wd])) continue;
        const occ = new Date(bucketDate0); occ.setDate(occ.getDate() + wd);
        if (occ >= startDate && occ <= dayDate) n++;
      }
    }
    return n;
  }
  if (freq === 'WEEKLY') return Math.floor((dayDate - startDate) / (7 * 86400000) / interval) + 1;
  if (freq === 'DAILY') return Math.floor((dayDate - startDate) / 86400000 / interval) + 1;
  if (freq === 'MONTHLY') return (dayDate.getFullYear() - startDate.getFullYear()) * 12 + (dayDate.getMonth() - startDate.getMonth()) + 1;
  return Infinity; // unknown freq: don't let COUNT suppress it
}

// Does an RRULE-driven event (DTSTART=startKey) land on dayKey, respecting FREQ/INTERVAL/BYDAY/UNTIL/COUNT?
function ruleMatchesDay(startKey, rrule, dayKey) {
  if (dayKey < startKey) return false;
  const until = /UNTIL=(\d{8})/.exec(rrule);
  if (until && dayKey > until[1]) return false;
  const freq = (/FREQ=(\w+)/.exec(rrule) || [])[1];
  const interval = +((/INTERVAL=(\d+)/.exec(rrule) || [])[1] || 1);
  const bydayM = /BYDAY=([^;]+)/.exec(rrule);
  const bydays = bydayM ? bydayM[1].split(',').map((x) => x.slice(-2)) : null;
  const startDate = keyToDate(startKey), dayDate = keyToDate(dayKey);

  let dowOk = false;
  if (freq === 'DAILY') {
    dowOk = Math.round((dayDate - startDate) / 86400000) % interval === 0;
  } else if (freq === 'WEEKLY') {
    dowOk = bydays ? bydays.includes(DOW[dayDate.getDay()]) : dayDate.getDay() === startDate.getDay();
    if (dowOk) {
      const startWeek = new Date(startDate); startWeek.setDate(startWeek.getDate() - startWeek.getDay());
      const dayWeek = new Date(dayDate); dayWeek.setDate(dayWeek.getDate() - dayWeek.getDay());
      dowOk = Math.round((dayWeek - startWeek) / (7 * 86400000)) % interval === 0;
    }
  } else if (freq === 'MONTHLY') {
    dowOk = dayDate.getDate() === startDate.getDate()
      && ((dayDate.getFullYear() - startDate.getFullYear()) * 12 + (dayDate.getMonth() - startDate.getMonth())) % interval === 0;
  }
  if (!dowOk) return false;

  const countM = /COUNT=(\d+)/.exec(rrule);
  if (countM) {
    const n = occurrencesUpTo(startDate, freq, interval, bydays, dayDate);
    if (n > +countM[1]) return false;
  }
  return true;
}

function icsEventsUpcoming(ics, daysAhead = 2) {
  const lines = ics.replace(/\r/g, '').split('\n');
  // unfold continuation lines
  const un = [];
  for (const l of lines) {
    if ((l.startsWith(' ') || l.startsWith('\t')) && un.length) un[un.length - 1] += l.slice(1);
    else un.push(l);
  }
  const now = new Date();
  const todayKey = dateKey(now);
  // window of day-keys we care about: today .. today+daysAhead
  const window = [];
  for (let i = 0; i <= daysAhead; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    window.push({ key: dateKey(d), dow: DOW[d.getDay()], label: DAY_LABEL[d.getDay()], isToday: i === 0 });
  }

  const events = [];
  let cur = null;
  for (const l of un) {
    if (l === 'BEGIN:VEVENT') cur = {};
    else if (l === 'END:VEVENT' && cur) {
      const { start, summary, rrule, allDay } = cur;
      if (summary && start) {
        const startKey = start.slice(0, 8);
        for (const day of window) {
          const hit = startKey === day.key || (rrule && ruleMatchesDay(startKey, rrule, day.key));
          if (hit) {
            const time = allDay ? 'ALL DAY' : `${start.slice(9, 11)}:${start.slice(11, 13)}`;
            const prefix = day.isToday ? '' : `${day.label} `;
            events.push({
              text: `${prefix}${time}  ${summary.slice(0, 36)}`,
              sort: `${day.key}${allDay ? '0000' : start.slice(9, 13)}`,
            });
            break; // one hit per event per window pass is enough
          }
        }
      }
      cur = null;
    } else if (cur) {
      if (l.startsWith('DTSTART')) {
        const v = l.split(':').pop();
        cur.allDay = /VALUE=DATE[:;]/.test(l) || v.length === 8;
        if (/^\d{8}T\d{6}Z$/.test(v)) {
          // UTC -> local
          const dt = new Date(Date.UTC(+v.slice(0,4), +v.slice(4,6)-1, +v.slice(6,8), +v.slice(9,11), +v.slice(11,13)));
          cur.start = `${dt.getFullYear()}${String(dt.getMonth()+1).padStart(2,'0')}${String(dt.getDate()).padStart(2,'0')}T${String(dt.getHours()).padStart(2,'0')}${String(dt.getMinutes()).padStart(2,'0')}00`;
        } else cur.start = v;
      } else if (l.startsWith('SUMMARY')) cur.summary = l.slice(l.indexOf(':') + 1);
      else if (l.startsWith('RRULE')) cur.rrule = l.slice(l.indexOf(':') + 1);
    }
  }
  events.sort((a, b) => a.sort.localeCompare(b.sort));
  return events.map((e) => e.text).slice(0, 6);
}

const VENV_PY = path.join(ROOT, '.venv', 'bin', 'python');

async function wCalendar() {
  return cached('calendar', 5 * 60000, async () => {
    // Preferred: Google Calendar secret iCal address (Keychain service 'gcal-ics')
    const icsUrl = await keychainGet('gcal-ics');
    if (icsUrl && /^https:/.test(icsUrl)) {
      // Primary: library-grade recurrence expansion (COUNT/UNTIL/EXDATE/moved instances)
      if (fs.existsSync(VENV_PY)) {
        try {
          const out = await new Promise((resolve, reject) => {
            const p = spawn(VENV_PY, [path.join(ROOT, 'gcal_today.py')], { timeout: 30000 });
            let so = '', se = '';
            p.stdout.on('data', (c) => so += c);
            p.stderr.on('data', (c) => se += c);
            p.on('close', (code) => code === 0 && so.trim() ? resolve(so.trim()) : reject(new Error(se.slice(0, 100) || 'py fail')));
            p.on('error', reject);
            p.stdin.write(icsUrl); p.stdin.end();
          });
          const j = JSON.parse(out);
          if (!j.error) return { events: j.events, src: 'google' };
        } catch {}
      }
      // Fallback: built-in JS parser
      const ics = await httpGetText(icsUrl);
      return { events: icsEventsUpcoming(ics, 2), src: 'google' };
    }
    // Fallback: local Calendar.app via icalBuddy
    return new Promise((resolve) => {
      execFile('icalBuddy', ['-n', '-nc', '-b', '', '-li', '4', '-iep', 'title,datetime', '-po', 'datetime,title', '-df', '', '-tf', '%H:%M', 'eventsToday:tomorrow'], { timeout: 10000 }, (err, out) => {
        if (err) return resolve({ error: 'no-source' });
        const events = out.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 6);
        resolve({ events, src: 'local' });
      });
    });
  });
}

// Temporary demo override (for screenshots): a self-expiring JSON file that swaps
// the bank/portfolio totals with fake numbers, then cleans itself up. No revert needed.
const DEMO_FILE = path.join(ROOT, '.demo-override.json');
function demoOverride() {
  try {
    const d = JSON.parse(fs.readFileSync(DEMO_FILE, 'utf8'));
    if (d.expires && Date.now() < d.expires) return d;
    fs.unlinkSync(DEMO_FILE); // expired → auto-revert
  } catch {}
  return null;
}

async function handleWidgets(_req, res) {
  let [bank, portfolio, weather, calendar] = await Promise.all([
    wUpBank().catch((e) => ({ error: String(e.message || e).slice(0, 80) })),
    wPortfolio().catch((e) => ({ error: String(e.message || e).slice(0, 80) })),
    wWeather().catch((e) => ({ error: String(e.message || e).slice(0, 80) })),
    wCalendar().catch((e) => ({ error: String(e.message || e).slice(0, 80) })),
  ]);
  const demo = demoOverride();
  if (demo) {
    if (demo.bank) bank = demo.bank;
    if (demo.portfolio) portfolio = demo.portfolio;
  }
  json(res, 200, { bank, portfolio, weather, calendar });
}

// ---------- static ----------
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
function serveStatic(req, res) {
  let p = req.url.split('?')[0];
  if (p === '/') p = '/index.html';
  if (p === '/apple-touch-icon.png') p = '/icons/apple-touch-icon.png';
  if (p === '/favicon.svg' || p === '/favicon.ico') p = '/icons/favicon.svg';
  let file = path.normalize(path.join(p.startsWith('/icons/') ? ROOT : PUBLIC, p));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}

// ---------- router ----------
const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (req.method === 'POST' && url === '/api/ask') return handleAsk(req, res);
  if (req.method === 'POST' && url === '/api/stop') return handleStop(req, res);
  if (req.method === 'POST' && url === '/api/wake') return handleWake(req, res);
  if (req.method === 'POST' && url === '/api/new-session') return handleNewSession(req, res);
  if (req.method === 'POST' && url === '/api/transcribe') return handleTranscribe(req, res);
  if (req.method === 'POST' && url === '/api/speak') return handleSpeak(req, res);
  if (req.method === 'GET' && url === '/api/stats') return handleStats(req, res);
  if (req.method === 'GET' && url === '/api/widgets') return handleWidgets(req, res);
  if (req.method === 'GET') return serveStatic(req, res);
  res.writeHead(405); res.end();
});

server.listen(PORT, HOST, () => {
  console.log(`JARVIS online → http://${HOST}:${PORT}`);
});
