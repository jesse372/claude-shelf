/**
 * Wedding Jobs Bot — Google Apps Script (runs inside Jesse's Google account)
 *
 * Every 10 minutes:
 *   1. Reads Studio Ninja's Google Calendar sync → adds/updates each job in the
 *      "Wedding Jobs (auto)" Google Sheet, keyed on the Studio Ninja job ID.
 *      New job → emails Jesse a ready-to-send WhatsApp message (one tap to the team group).
 *   2. Reads Studio Ninja "you have received a payment" emails → logs the payment,
 *      works out how much belongs in the Bankwest team account, emails Jesse "move $X".
 *   3. Re-totals every job: paid so far / allocated to team / moved / still to move.
 * Every morning at 8am: one reminder if any team money hasn't been ticked off as moved.
 *
 * Setup: paste into script.google.com, fill in CONFIG.PACKAGES, run setup() once.
 */

const CONFIG = {
  TIMEZONE: 'Australia/Perth',
  CALENDAR_ID: 'primary',                       // calendar Studio Ninja syncs into
  BUSINESS_NAME: 'Jesse Chance Wedding Photographers',
  SHEET_NAME: 'Wedding Jobs (auto)',
  TEAM_SHARE: 0.5,                              // half the job total goes to the team account
  RATES: { photographer: 110, videographer: 200 },

  // Package name exactly as it appears in Studio Ninja ("Which package/s would you like to book?")
  // price = job total, hours = crew hours. Unknown packages still work — the sheet flags them
  // and you can type the total/hours straight into the sheet row instead.
  PACKAGES: {
    // 'Diamond':  { price: 0, photographerHours: 0, videographerHours: 0 },
    // 'Gold':     { price: 0, photographerHours: 0, videographerHours: 0 },
  },

  JOB_TYPES: [],          // e.g. ['Wedding'] to ignore other job types; empty = track all
  LOOKBACK_DAYS: 30,
  LOOKAHEAD_DAYS: 365 * 3,
  PAYMENT_QUERY: '"received a payment of" "Studio Ninja" newer_than:60d',
};

const JOB_HEADERS = ['Job ID', 'Date', 'Job name', 'Client', 'Type', 'Package', 'Location',
  'Client notes', 'Phone', 'Email', 'Job total', 'Photographer hrs', 'Videographer hrs',
  'Team pot', 'Paid so far', 'Allocated to team', 'Moved to team', 'Still to move',
  'Status', 'Studio Ninja', 'First seen', 'Last updated'];
const PAY_HEADERS = ['Received', 'Job name', 'Job ID', 'Amount', 'Move to team', 'Moved?',
  'Note', 'Gmail ID'];

// ───────────────────────── entry points ─────────────────────────

/** Run once by hand. Creates the sheet, imports what already exists WITHOUT notifying, installs triggers. */
function setup() {
  const ss = getSpreadsheet_();
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('run').timeBased().everyMinutes(10).create();
  ScriptApp.newTrigger('dailyReminder').timeBased().atHour(8).everyDays(1)
    .inTimezone(CONFIG.TIMEZONE).create();
  syncAll_({ quiet: true });
  MailApp.sendEmail(me_(), '✅ Wedding Jobs Bot is running',
    'Your jobs sheet: ' + ss.getUrl() + '\n\nExisting jobs and payments were imported quietly ' +
    '(older payments are marked as already moved). From now on you will get an email for every ' +
    'new booking and every payment.');
  Logger.log('Sheet: ' + ss.getUrl());
}

/** Time-driven, every 10 minutes. */
function run() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30 * 1000)) return;
  try {
    syncAll_({ quiet: false });
    PropertiesService.getScriptProperties().setProperty('LAST_OK', new Date().toISOString());
  } catch (e) {
    alertError_(e);
    throw e;
  } finally {
    lock.releaseLock();
  }
}

/** Time-driven, daily 8am: nag about team money not yet moved; also a dead-man check. */
function dailyReminder() {
  const ss = getSpreadsheet_();
  const pays = readTable_(ss.getSheetByName('Payments'), PAY_HEADERS);
  const owing = pays.filter(p => num_(p['Move to team']) > 0 && p['Moved?'] !== true);
  const total = round2_(owing.reduce((s, p) => s + num_(p['Move to team']), 0));
  if (owing.length) {
    const lines = owing.map(p => '• $' + money_(p['Move to team']) + ' — ' + p['Job name']);
    MailApp.sendEmail(me_(), '🏦 Reminder: move $' + money_(total) + ' to the team account',
      lines.join('\n') + '\n\nTick "Moved?" in the Payments tab once done: ' + ss.getUrl());
  }
  const lastOk = PropertiesService.getScriptProperties().getProperty('LAST_OK');
  if (!lastOk || Date.now() - new Date(lastOk).getTime() > 6 * 3600 * 1000) {
    MailApp.sendEmail(me_(), '⚠️ Wedding Jobs Bot has not run successfully in 6+ hours',
      'Last good run: ' + (lastOk || 'never') + '\nOpen script.google.com → Executions to see why.');
  }
}

// ───────────────────────── core sync ─────────────────────────

function syncAll_(opts) {
  const ss = getSpreadsheet_();
  const jobsSheet = ss.getSheetByName('Jobs');
  const paySheet = ss.getSheetByName('Payments');
  syncCalendar_(ss, jobsSheet, opts);
  syncPayments_(ss, jobsSheet, paySheet, opts);
  recalcJobs_(jobsSheet, paySheet);
}

function syncCalendar_(ss, sheet, opts) {
  const cal = CONFIG.CALENDAR_ID === 'primary'
    ? CalendarApp.getDefaultCalendar() : CalendarApp.getCalendarById(CONFIG.CALENDAR_ID);
  const now = new Date();
  const start = new Date(now.getTime() - CONFIG.LOOKBACK_DAYS * 864e5);
  const end = new Date(now.getTime() + CONFIG.LOOKAHEAD_DAYS * 864e5);

  const seen = {};
  cal.getEvents(start, end).forEach(ev => {
    const job = parseJobDescription(ev.getDescription());
    if (!job.jobId || seen[job.jobId]) return;          // not a Studio Ninja job / already have its first event
    if (CONFIG.JOB_TYPES.length && CONFIG.JOB_TYPES.indexOf(job.type) < 0) return;
    if (!job.location) job.location = ev.getLocation();
    if (!job.jobName) job.jobName = ev.getTitle();
    job.date = ev.isAllDayEvent() ? ev.getAllDayStartDate() : ev.getStartTime();
    job.allDay = ev.isAllDayEvent();
    seen[job.jobId] = job;
  });

  const rows = readTable_(sheet, JOB_HEADERS);
  const byId = {};
  rows.forEach(r => { byId[String(r['Job ID'])] = r; });
  const stamp = new Date();

  Object.keys(seen).forEach(id => {
    const j = seen[id];
    const pkg = lookupPackage_(j.package);
    const existing = byId[id];
    const auto = {
      'Job ID': id, 'Date': j.date, 'Job name': j.jobName, 'Client': j.client.name,
      'Type': j.type, 'Package': j.package, 'Location': j.location, 'Client notes': j.extraNotes,
      'Phone': j.client.phone, 'Email': j.client.email, 'Status': 'Booked',
      'Studio Ninja': j.link, 'Last updated': stamp,
    };
    if (!existing) {
      Object.assign(auto, {
        'Job total': pkg ? pkg.price : '', 'Photographer hrs': pkg ? pkg.photographerHours : '',
        'Videographer hrs': pkg ? pkg.videographerHours : '', 'First seen': stamp,
      });
      appendRow_(sheet, JOB_HEADERS, auto);
      if (!opts.quiet) notifyNewJob_(ss, auto);
      return;
    }
    // Existing job: refresh Studio Ninja fields, never overwrite numbers Jesse typed in.
    const changed = sameDay_(existing['Date'], j.date) ? [] : ['date'];
    if (String(existing['Location']) !== String(j.location)) changed.push('location');
    const patch = Object.assign({}, auto);
    if (existing['Job total'] === '' && pkg) patch['Job total'] = pkg.price;
    if (existing['Photographer hrs'] === '' && pkg) patch['Photographer hrs'] = pkg.photographerHours;
    if (existing['Videographer hrs'] === '' && pkg) patch['Videographer hrs'] = pkg.videographerHours;
    writeRow_(sheet, JOB_HEADERS, existing._row, patch);
    if (changed.length && !opts.quiet) notifyJobChanged_(ss, Object.assign({}, existing, patch), changed);
  });

  // Future jobs that disappeared from the calendar (cancelled / moved out of range).
  rows.forEach(r => {
    if (seen[String(r['Job ID'])] || r['Status'] !== 'Booked') return;
    if (r['Date'] instanceof Date && r['Date'] < start) return;      // just aged out of the window
    writeRow_(sheet, JOB_HEADERS, r._row, { 'Status': 'Not on calendar – check', 'Last updated': stamp });
  });
}

function syncPayments_(ss, jobsSheet, paySheet, opts) {
  const pays = readTable_(paySheet, PAY_HEADERS);
  const known = {};
  pays.forEach(p => { known[p['Gmail ID']] = true; });
  const jobs = readTable_(jobsSheet, JOB_HEADERS);

  const msgs = [];
  GmailApp.search(CONFIG.PAYMENT_QUERY, 0, 100).forEach(t => t.getMessages().forEach(m => {
    if (!known[m.getId()]) msgs.push(m);
  }));
  msgs.sort((a, b) => a.getDate() - b.getDate());

  msgs.forEach(m => {
    const p = parsePaymentText(m.getPlainBody(), CONFIG.BUSINESS_NAME);
    if (!p) return;                                       // not a payment notification
    const job = matchJob_(jobs, p.jobName);
    const prior = pays.filter(x => job ? String(x['Job ID']) === String(job['Job ID'])
                                       : norm_(x['Job name']) === norm_(p.jobName));
    const allocated = prior.reduce((s, x) => s + num_(x['Move to team']), 0);
    const calc = computeTeamMove({
      amount: p.amount, jobTotal: job ? num_(job['Job total']) : 0,
      alreadyAllocated: allocated, isFirstPayment: prior.length === 0, share: CONFIG.TEAM_SHARE,
    });
    const note = [job ? '' : 'No matching job in sheet – check name', calc.note].filter(String).join('; ');
    const row = {
      'Received': m.getDate(), 'Job name': p.jobName, 'Job ID': job ? job['Job ID'] : '',
      'Amount': p.amount, 'Move to team': calc.move, 'Moved?': opts.quiet, 'Note': opts.quiet
        ? (note ? note + '; ' : '') + 'imported at setup' : note, 'Gmail ID': m.getId(),
    };
    const r = appendRow_(paySheet, PAY_HEADERS, row);
    paySheet.getRange(r, PAY_HEADERS.indexOf('Moved?') + 1).insertCheckboxes();
    pays.push(row);
    if (!opts.quiet) notifyPayment_(ss, row, job, calc);
  });
}

function recalcJobs_(jobsSheet, paySheet) {
  const pays = readTable_(paySheet, PAY_HEADERS);
  readTable_(jobsSheet, JOB_HEADERS).forEach(j => {
    const mine = pays.filter(p => String(p['Job ID']) === String(j['Job ID']));
    const paid = mine.reduce((s, p) => s + num_(p['Amount']), 0);
    const alloc = mine.reduce((s, p) => s + num_(p['Move to team']), 0);
    const moved = mine.filter(p => p['Moved?'] === true).reduce((s, p) => s + num_(p['Move to team']), 0);
    const total = num_(j['Job total']);
    writeRow_(jobsSheet, JOB_HEADERS, j._row, {
      'Team pot': total ? round2_(total * CONFIG.TEAM_SHARE) : '',
      'Paid so far': round2_(paid), 'Allocated to team': round2_(alloc),
      'Moved to team': round2_(moved), 'Still to move': round2_(alloc - moved),
    });
  });
}

// ───────────────────────── pure logic (unit-tested in test.js) ─────────────────────────

function stripHtml(s) {
  return String(s || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|ol|ul|h\d|tr)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&#x27;|&rsquo;/g, "'")
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function between_(text, startRe, endRe) {
  const m = startRe.exec(text);
  if (!m) return '';
  const rest = text.slice(m.index + m[0].length);
  const e = rest.search(endRe);
  return (e < 0 ? rest : rest.slice(0, e)).replace(/\s*\n\s*/g, ' ').trim();
}

function field_(text, label) {
  const m = new RegExp('^\\s*' + label + ':[ \\t]*(.*)$', 'mi').exec(text);
  return m ? m[1].trim() : '';
}

/** Parse a Studio Ninja calendar event description. jobId is '' if it isn't a Studio Ninja job. */
function parseJobDescription(desc) {
  const t = stripHtml(desc);
  const idm = /studioninja\.co\/jobs\/view\/(\d+)/i.exec(String(desc || ''));
  const clientBlock = between_(t, /Client\(s\):/i, /^\s*Job Name:/mi).replace(/^\d+\.\s*/, '');
  const parts = clientBlock.split(',').map(s => s.trim()).filter(Boolean);
  const email = parts.find(p => /@/.test(p)) || '';
  const phone = parts.find(p => /^\+?[\d\s()-]{8,}$/.test(p)) || '';
  const name = parts.length && parts[0] !== email && parts[0] !== phone ? parts[0] : '';
  return {
    jobId: idm ? idm[1] : '',
    link: idm ? 'https://app.studioninja.co/jobs/view/' + idm[1] : '',
    jobName: field_(t, 'Job Name'),
    type: field_(t, 'Type'),
    mainShoot: field_(t, 'Main Shoot'),
    location: field_(t, 'Location'),
    package: between_(t, /Which package\/s would you like to book\?:?/i,
      /\n\s*\n|Anything else|Job Profile link:/i),
    extraNotes: between_(t, /Anything else you['’]d like to share\?:?/i, /Job Profile link:/i),
    client: { name: name, phone: phone, email: email },
  };
}

/** Parse a Studio Ninja "you have received a payment" email body → {amount, jobName} or null. */
function parsePaymentText(body, businessName) {
  const t = String(body || '').replace(/\s+/g, ' ') + ' ';
  const biz = businessName ? businessName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '';
  const re = biz
    ? new RegExp('received a payment of \\$?\\s*([\\d,]+(?:\\.\\d{1,2})?) for (.+?) in ' + biz, 'i')
    : /received a payment of \$?\s*([\d,]+(?:\.\d{1,2})?) for (.+?) in [^.]+\.\s/i;
  const m = re.exec(t) || /received a payment of \$?\s*([\d,]+(?:\.\d{1,2})?) for (.+?) in [^.]+\.\s/i.exec(t);
  if (!m) return null;
  return { amount: round2_(parseFloat(m[1].replace(/,/g, ''))), jobName: m[2].trim() };
}

/**
 * How much of this payment goes to the team account.
 * Team pot = share × job total. Each payment tops the pot up until it's full
 * (a full 50% deposit fills it in one go; a short deposit fills part, the next payment the rest).
 * Job total unknown → assume the first payment is the deposit and move all of it.
 */
function computeTeamMove(o) {
  if (o.jobTotal > 0) {
    const pot = round2_(o.jobTotal * o.share);
    const move = round2_(Math.max(0, Math.min(o.amount, pot - o.alreadyAllocated)));
    return { move: move, pot: pot, remaining: round2_(pot - o.alreadyAllocated - move), note: '' };
  }
  return o.isFirstPayment
    ? { move: o.amount, pot: null, remaining: null, note: 'Job total unknown – moved whole first payment' }
    : { move: 0, pot: null, remaining: null, note: 'Job total unknown – check if team pot is full' };
}

/** The message for the team WhatsApp group (no client phone/email — team doesn't need them). */
function buildWhatsAppText(job, rates, dateLabel) {
  const lines = ['📸 NEW JOB BOOKED', '*' + job['Job name'] + '*'];
  if (dateLabel) lines.push('📅 ' + dateLabel);
  if (job['Location']) lines.push('📍 ' + job['Location']);
  if (job['Client notes']) lines.push('📝 ' + job['Client notes']);
  if (job['Package']) lines.push('📦 ' + job['Package']);
  const ph = num_(job['Photographer hrs']), vh = num_(job['Videographer hrs']);
  if (ph) lines.push('💵 Photographer: ' + ph + 'h × $' + rates.photographer + ' = $' + money_(ph * rates.photographer));
  if (vh) lines.push('🎥 Videographer: ' + vh + 'h × $' + rates.videographer + ' = $' + money_(vh * rates.videographer));
  if (!ph && !vh) lines.push('💵 Pay: $' + rates.photographer + '/hr photo · $' + rates.videographer + '/hr video');
  lines.push('', 'Reply if you\'re available 🙌');
  return lines.join('\n');
}

function round2_(n) { return Math.round((Number(n) || 0) * 100) / 100; }
function num_(v) { const n = parseFloat(String(v).replace(/[$,]/g, '')); return isNaN(n) ? 0 : n; }
function money_(n) { return round2_(n).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function norm_(s) { return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim(); }

// ───────────────────────── notifications ─────────────────────────

function notifyNewJob_(ss, job) {
  const dateLabel = fmtDate_(job['Date']);
  const text = buildWhatsAppText(job, CONFIG.RATES, dateLabel);
  const wa = 'https://wa.me/?text=' + encodeURIComponent(text);
  const pkgWarn = job['Package'] && !lookupPackage_(job['Package'])
    ? '<p>⚠️ Package "' + esc_(job['Package']) + '" isn\'t in the price list — add the job total + hours in the sheet.</p>' : '';
  MailApp.sendEmail({
    to: me_(), subject: '📸 New job booked: ' + job['Job name'] + ' – ' + dateLabel,
    htmlBody: '<p><a href="' + wa + '" style="font-size:18px;font-weight:bold">👉 Send to team WhatsApp</a>' +
      ' (opens WhatsApp — pick the team group)</p><pre style="font-family:inherit">' + esc_(text) + '</pre>' +
      pkgWarn + '<p><a href="' + ss.getUrl() + '">Jobs sheet</a> · <a href="' + job['Studio Ninja'] +
      '">Studio Ninja</a></p>',
  });
}

function notifyJobChanged_(ss, job, changed) {
  MailApp.sendEmail(me_(), '✏️ Job changed (' + changed.join(' + ') + '): ' + job['Job name'],
    'Now: ' + fmtDate_(job['Date']) + ' @ ' + job['Location'] +
    '\nYou may want to tell the team.\n\n' + ss.getUrl());
}

function notifyPayment_(ss, row, job, calc) {
  const subj = calc.move > 0
    ? '💰 $' + money_(row['Amount']) + ' received – move $' + money_(calc.move) + ' to team account'
    : '💰 $' + money_(row['Amount']) + ' received – nothing to move (team pot full)';
  const body = [
    'Job: ' + row['Job name'] + (job ? ' (' + fmtDate_(job['Date']) + ')' : ' — ⚠️ not matched to a job'),
    'Payment: $' + money_(row['Amount']),
    'Move to Bankwest team account: $' + money_(calc.move),
    calc.pot != null ? 'Team pot for this job: $' + money_(calc.pot) + ' (still to fill after this: $' + money_(calc.remaining) + ')' : '',
    row['Note'] ? 'Note: ' + row['Note'] : '',
    '', 'Once moved, tick "Moved?" in the Payments tab: ' + ss.getUrl(),
  ].filter(l => l !== '').join('\n');
  MailApp.sendEmail(me_(), subj, body);
}

function alertError_(e) {
  const props = PropertiesService.getScriptProperties();
  const last = Number(props.getProperty('LAST_ERR_MAIL') || 0);
  if (Date.now() - last < 6 * 3600 * 1000) return;     // at most one error email per 6h
  props.setProperty('LAST_ERR_MAIL', String(Date.now()));
  MailApp.sendEmail(me_(), '⚠️ Wedding Jobs Bot error', String(e && e.stack || e));
}

// ───────────────────────── sheet helpers ─────────────────────────

function getSpreadsheet_() {
  const props = PropertiesService.getScriptProperties();
  let id = props.getProperty('SHEET_ID'), ss = null;
  if (id) { try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; } }
  if (!ss) {
    ss = SpreadsheetApp.create(CONFIG.SHEET_NAME);
    ss.setSpreadsheetTimeZone(CONFIG.TIMEZONE);
    props.setProperty('SHEET_ID', ss.getId());
    ss.getSheets()[0].setName('Jobs');
    ss.insertSheet('Payments');
  }
  ensureHeaders_(ss.getSheetByName('Jobs') || ss.insertSheet('Jobs'), JOB_HEADERS);
  ensureHeaders_(ss.getSheetByName('Payments') || ss.insertSheet('Payments'), PAY_HEADERS);
  return ss;
}

function ensureHeaders_(sh, headers) {
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
}

function readTable_(sh, headers) {
  const n = sh.getLastRow() - 1;
  if (n < 1) return [];
  return sh.getRange(2, 1, n, headers.length).getValues().map((vals, i) => {
    const o = { _row: i + 2 };
    headers.forEach((h, k) => { o[h] = vals[k]; });
    return o;
  });
}

function appendRow_(sh, headers, obj) {
  sh.appendRow(headers.map(h => (h in obj ? obj[h] : '')));
  return sh.getLastRow();
}

function writeRow_(sh, headers, row, patch) {
  const range = sh.getRange(row, 1, 1, headers.length);
  const vals = range.getValues()[0];
  headers.forEach((h, k) => { if (h in patch) vals[k] = patch[h]; });
  range.setValues([vals]);
}

function lookupPackage_(name) {
  const n = norm_(name);
  const key = Object.keys(CONFIG.PACKAGES).find(k => norm_(k) === n);
  return key ? CONFIG.PACKAGES[key] : null;
}

function matchJob_(jobs, jobName) {
  const n = norm_(jobName);
  const hits = jobs.filter(j => norm_(j['Job name']) === n);
  return hits.length ? hits[hits.length - 1] : null;
}

function sameDay_(a, b) {
  if (!(a instanceof Date) || !(b instanceof Date)) return false;
  return fmtDate_(a) === fmtDate_(b);
}
function fmtDate_(d) { return d instanceof Date ? Utilities.formatDate(d, CONFIG.TIMEZONE, 'EEE d MMM yyyy') : String(d || ''); }
function esc_(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function me_() { return Session.getEffectiveUser().getEmail(); }

// Lets test.js load the pure functions under Node; ignored by Apps Script.
if (typeof module !== 'undefined') {
  module.exports = { stripHtml, parseJobDescription, parsePaymentText, computeTeamMove, buildWhatsAppText };
}
