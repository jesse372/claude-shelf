// Wedding details for a job: the couple, the date and the venue. Asked when a job starts (while the photos
// import in the background) and needed before delivery — they name the job, the Pixieset collection and,
// for a venue without a page yet, the venue page draft.
import { $, toast } from './state.js';
import { SITE_VENUES, siteVenue } from './venues.js';

/** "[redacted]" from the two first names. */
export const coupleName = (d) => [d?.a, d?.b].map((s) => (s || '').trim()).filter(Boolean).join(' & ');
/** All three details filled in. */
export const hasDetails = (job) => !!(job?.couple?.a && job?.couple?.b && job?.weddingDate && job?.venue);

const isoDay = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

let wired = false;
function wire() {
  if (wired) return; wired = true;
  $('#venueList').innerHTML = SITE_VENUES.map((v) => `<option value="${v.name}">${v.area}</option>`).join('');
  const hint = () => {
    const v = $('#wdVenue').value.trim(), sv = siteVenue(v);
    $('#wdVenueHint').textContent = !v ? '' : sv ? `On your website · ${sv.area}` : 'New venue — a venue page will be drafted for you to pick photos';
  };
  $('#wdVenue').addEventListener('input', hint);
  $('#wdForm').addEventListener('input', () => { $('#wdTitle').textContent = coupleName({ a: $('#wdA').value, b: $('#wdB').value }) || 'Wedding details'; });
  $('#wdSkip').onclick = () => $('#detailsDlg').close('skip');
  wire.hint = hint;
}

/**
 * Show the form for a job. Resolves to the saved details, or null if skipped.
 * opts.required — needed now (e.g. before delivery): the button reads Cancel, not Later; opts.shootDate — prefill from the photos' capture time.
 */
export function askDetails(job, { required = false, shootDate = null } = {}) {
  wire();
  const dlg = $('#detailsDlg');
  $('#wdA').value = job.couple?.a || ''; $('#wdB').value = job.couple?.b || '';
  $('#wdDate').value = job.weddingDate || (shootDate || job.shootDate ? isoDay(shootDate || job.shootDate) : '');
  $('#wdVenue').value = job.venue || '';
  $('#wdTitle').textContent = coupleName(job.couple) || 'Wedding details';
  $('#wdLead').textContent = required ? 'Needed before the gallery goes to Pixieset.' : 'Names the job and the Pixieset gallery. Your photos keep importing meanwhile.';
  $('#wdSkip').textContent = required ? 'Cancel' : 'Later';
  wire.hint();
  return new Promise((resolve) => {
    $('#wdForm').onsubmit = (e) => {
      e.preventDefault();
      const a = $('#wdA').value.trim(), b = $('#wdB').value.trim(), date = $('#wdDate').value, venue = $('#wdVenue').value.trim();
      if (!a || !b || !date || !venue) { toast('Please fill in both names, the date and the venue.'); return; }
      const sv = siteVenue(venue);
      dlg.close('saved');
      resolve({ couple: { a, b }, weddingDate: date, venue: sv ? sv.name : venue, venuePage: sv ? sv.page : null });
    };
    dlg.addEventListener('close', () => { if (dlg.returnValue !== 'saved') resolve(null); }, { once: true });
    dlg.returnValue = '';
    dlg.showModal();
    setTimeout(() => (job.couple?.a ? $('#wdVenue') : $('#wdA')).focus(), 50);
  });
}
