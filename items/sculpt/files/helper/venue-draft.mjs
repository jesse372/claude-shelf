// A gallery for a venue that has no page on jessechance.com yet → start a venue page draft for Jesse:
// a varied shortlist of the strongest frames (blur / blown / duplicates rejected by the pixieset cull.py) as numbered
// contact sheets, plus draft.json with the wedding's facts. Jesse picks the photos (site rule: the model only rejects,
// Jesse selects — and checks there are no children); the page itself is then built from his picks with the website's
// generator (tools/gen_venues.py) on a branch. Nothing is published or emailed from here.
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFileSync } from 'child_process';

const PX = path.join(os.homedir(), 'JesseOS/workspace/pixieset');
export const DRAFTS = process.env.VENUE_DRAFTS || path.join(os.homedir(), 'JesseOS/workspace/venue-drafts');
export const venueSlug = (v) => String(v).toLowerCase().replace(/^the\s+/, '').replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** d = the delivery record, dir = folder with its photos. Returns the draft folder, or null if not needed / failed. */
export function draftVenue(d, dir, log = console.log) {
  if (d.venuePage || !d.venue) return null;
  const slug = venueSlug(d.venue), out = path.join(DRAFTS, `${slug}-${venueSlug(d.couple.a + '-' + d.couple.b)}`);
  if (fs.existsSync(path.join(out, 'draft.json'))) return out;          // already drafted (re-run)
  fs.mkdirSync(out, { recursive: true });
  log(`  new venue “${d.venue}” — shortlisting photos for a venue page draft`);
  // stage 1 (cull.py): reject blur / blown / near-duplicates and keep a varied pool
  execFileSync(path.join(PX, '.venv/bin/python'), [path.join(PX, 'cull.py'), dir, '--top', '160', '--per-cluster', '14', '--out', path.join(out, 'pool')],
    { stdio: ['ignore', 'ignore', 'pipe'], timeout: 3600e3 });
  // stage 2: a venue page is couple portraits, the place and the details — family formals rarely belong, so groups
  // (4+ faces) are capped; best-first within each kind, interleaved so the sheet isn't one kind in a row
  const pool = JSON.parse(fs.readFileSync(path.join(out, 'pool.json'), 'utf8')).picks || [];
  const kinds = { couple: pool.filter((p) => p.nf >= 1 && p.nf <= 2), place: pool.filter((p) => p.nf === 0), few: pool.filter((p) => p.nf === 3), groups: pool.filter((p) => p.nf >= 4).slice(0, 6) };
  for (const k in kinds) kinds[k].sort((a, b) => b.score - a.score);
  const order = [];
  for (let i = 0; order.length < 60 && Object.values(kinds).some((v) => v.length); i++)
    for (const k of ['couple', 'couple', 'place', 'few', 'groups']) if (kinds[k].length && order.length < 60) order.push(kinds[k].shift());
  // numbered copies (the gallery's temporary folder is deleted once it's in Pixieset) + numbered contact sheets
  fs.mkdirSync(path.join(out, 'photos'), { recursive: true });
  const short = order.map((p, k) => {
    const to = `${String(k + 1).padStart(2, '0')}-${p.file}`;
    fs.copyFileSync(path.join(dir, p.file), path.join(out, 'photos', to));
    return to;
  });
  execFileSync(path.join(PX, '.venv/bin/python'), [new URL('./sheet.py', import.meta.url).pathname, path.join(out, 'pick'), ...short.map((f) => path.join(out, 'photos', f))], { stdio: 'ignore' });
  const sheets = fs.readdirSync(out).filter((f) => /^pick-\d+\.jpg$/.test(f)).sort();
  fs.writeFileSync(path.join(out, 'draft.json'), JSON.stringify({
    venue: d.venue, slug, page: `${slug}-wedding-photographer.html`, couple: d.couple, weddingDate: d.weddingDate,
    photographer: d.photographer || null, pixieset: d.pixieset || null, galleryPhotos: d.fileNames.length,
    shortlist: short, sheets, picks: [],
    status: 'waiting for Jesse to pick photos',
    howToPick: 'Reply with the numbers on the contact sheets (e.g. 4, 9, 17, 23) — 15-25 photos suits a venue page.',
    rules: ['Jesse picks the photos (the model only rejected blur/duplicates)', 'no children anywhere — check every frame',
      'never say who is in a photo beyond “bride and groom” when plainly both', 'venue facts only from the venue’s own site — no invented capacities or claims',
      'never mention AI or hand editing'],
  }, null, 1));
  log(`  ✓ venue draft: ${out} (${short.length} shortlisted, ${sheets.length} contact sheet${sheets.length === 1 ? '' : 's'})`);
  return out;
}
