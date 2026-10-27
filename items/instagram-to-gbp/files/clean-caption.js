// Code by Zapier → Run JavaScript
//
// Input Data (set these in the Zapier UI):
//   caption    → Step 1 "Caption"
//   permalink  → Step 1 "Permalink"
//
// Outputs:
//   summary    → clean post text for Google Business Profile
//   shouldPost → "yes" or "no"  (filter on this in the next step)
//   charCount  → length of summary, for debugging

const GBP_MAX = 1500;
const SAFE_MAX = 1450;      // leave headroom
const MIN_USEFUL = 15;      // shorter than this isn't worth a GBP post

let text = (inputData.caption || '').toString();

// 1. Strip hashtags (#anything up to whitespace)
text = text.replace(/(^|\s)#[^\s#]+/g, ' ');

// 2. Remove Instagram-only calls-to-action.
//    We delete the WHOLE sentence containing the phrase, not just the phrase —
//    otherwise "Link in bio to book!" leaves a dangling "to book!".
const IG_NOISE = /[^.!?\n]*\b(?:link in (?:my )?bio|tag a friend|double tap|swipe (?:left|right|up)|save (?:this|the) post|share to (?:your )?stor(?:y|ies)|(?:follow|dm) (?:us|me)|comment below)\b[^.!?\n]*[.!?]?/gi;
text = text.replace(IG_NOISE, ' ');

// 3. Tidy whitespace: collapse runs of spaces, cap blank lines at one
text = text
  .replace(/[ \t]+/g, ' ')
  .replace(/ *\n */g, '\n')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

// 4. Drop orphaned punctuation left behind by the strips
text = text.replace(/^[\s.,!?;:\-–—]+/, '').replace(/[\s,;:\-–—]+$/, '').trim();

// 5. Truncate on a word boundary if needed
if (text.length > SAFE_MAX) {
  let cut = text.slice(0, SAFE_MAX);
  const lastSpace = cut.lastIndexOf(' ');
  if (lastSpace > SAFE_MAX * 0.8) cut = cut.slice(0, lastSpace);
  text = cut.trim() + '…';
}

// 6. Decide whether this is worth posting
const shouldPost = text.length >= MIN_USEFUL ? 'yes' : 'no';

return {
  summary: text,
  shouldPost: shouldPost,
  charCount: text.length,
  withinLimit: text.length <= GBP_MAX
};
