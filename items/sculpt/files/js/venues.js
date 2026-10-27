// Venues that already have a page on jessechance.com (from tools/gen_venues.py in the website repo).
// Used to suggest venue names in the wedding-details form, and later to decide whether a new venue page
// should be drafted. Keep in step with the website when a venue page is added.
export const SITE_VENUES = [
  { name: 'RiverBank Estate', area: 'Swan Valley', page: 'riverbank-estate-wedding-photographer.html' },
  { name: 'The Olive Estate', area: 'Henley Brook', page: 'olive-estate-wedding-photographer.html' },
  { name: 'Anderson Point', area: 'Perth Hills', page: 'anderson-point-elopement-photographer.html' },
  { name: 'Mundaring', area: 'Perth Hills', page: 'mundaring-wedding-photographer.html' },
  { name: 'Quarry Farm', area: 'Whitby', page: 'quarry-farm-wedding-photographer.html' },
  { name: 'Brookleigh Estate', area: 'Upper Swan', page: 'brookleigh-estate-wedding-photographer.html' },
  { name: 'Eight Willows Retreat', area: 'Metricup', page: 'eight-willows-retreat-wedding-photographer.html' },
  { name: 'Cottesloe Civic Centre', area: 'Cottesloe', page: 'cottesloe-civic-centre-wedding-photographer.html' },
  { name: 'Meelup Farmhouse', area: 'Eagle Bay', page: 'meelup-farmhouse-wedding-photographer.html' },
  { name: 'Edenvale Heritage Precinct', area: 'Pinjarra', page: 'edenvale-heritage-precinct-wedding-photographer.html' },
];

const norm = (s) => String(s || '').toLowerCase().replace(/^the\s+/, '').replace(/[^a-z0-9]+/g, ' ').trim();
/** The site venue a typed name refers to (case / "the" / punctuation-insensitive), or null for a new venue. */
export function siteVenue(name) {
  const n = norm(name);
  return n ? SITE_VENUES.find((v) => norm(v.name) === n) || null : null;
}
