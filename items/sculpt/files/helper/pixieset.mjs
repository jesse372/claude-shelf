// Put a finished gallery into Jesse's Pixieset as a HIDDEN collection, through his own signed-in Pixieset in a real
// Chrome window (the persistent profile in ~/JesseOS/workspace/pixieset/profile, port 9444 — headed, never headless).
// Only Pixieset's normal web dashboard is used, exactly as Jesse would click it; nothing is published or emailed.
//
// NOT BUILT YET: needs Jesse to sign in to the Pixieset dashboard once in that profile, so each step (new collection
// → name + event date → upload → confirm the count → keep hidden) can be mapped from the real page and verified.
// Until then this refuses, and the helper marks the gallery "needs a look" instead of guessing.

export async function uploadToPixieset({ name, date, dir, files, log = console.log }) {
  throw new Error('Pixieset upload is not set up yet — Jesse needs to sign in to Pixieset once on this Mac');
}
