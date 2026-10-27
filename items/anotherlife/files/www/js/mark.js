/* The AnotherLife mark: growth rings, cut from a trunk.

   Concentric circles read as a dartboard, so the rings here are eccentric the
   way real ones are: the pith sits low and off to one side, each ring drifts
   further from it, and they are all slightly wider than they are tall. The
   outermost ring is left open — the year you're in isn't finished yet.

   Everything downstream (app icon, splash, favicon, in-app glyph) is generated
   from this one file, so the mark can never drift out of sync with itself. */

export const INK   = "#191614";   // bark
export const CREAM = "#efe6d8";   // heartwood
export const AMBER = "#e9a13c";   // the year you are living

/* r = radius, w = stroke weight. A fat ring is a good year. */
const RINGS = [
  { r: 40,  w: 9  },
  { r: 66,  w: 17 },
  { r: 96,  w: 8  },
  { r: 130, w: 20 },
  { r: 163, w: 10 },
  { r: 196, w: 22, open: true },
];

const PITH = { x: 244, y: 292 };   // off-centre, low — like a real trunk
const DRIFT = 9;                   // how far each ring pulls away from the pith
const SQUASH = 0.93;               // rings are wider than they are tall
const TILT = -9;                   // degrees

const ell = (i) => {
  const k = RINGS[i];
  return { cx: PITH.x + i * DRIFT * 0.45, cy: PITH.y - i * DRIFT,
           rx: k.r, ry: k.r * SQUASH, w: k.w };
};

/* Open arc around an ellipse, from a0 to a1 degrees. */
function arcPath(e, a0, a1) {
  const p = a => [e.cx + e.rx * Math.cos(a * Math.PI / 180), e.cy + e.ry * Math.sin(a * Math.PI / 180)];
  const [x0, y0] = p(a0), [x1, y1] = p(a1);
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  return `M ${x0.toFixed(1)} ${y0.toFixed(1)} A ${e.rx} ${e.ry} 0 ${large} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
}

/* `rings` (1–6) lets the in-app glyph thicken as a life goes on. */
/* `closed` shuts the outermost ring: the year — and the life — is over. */
export function markSVG({ size = 512, bg = INK, ring = CREAM, live = AMBER,
                          rings = 6, plate = true, radius = 0, closed = false } = {}) {
  const S = 512;
  const n = Math.max(1, Math.min(RINGS.length, Math.round(rings)));
  const body = [];
  for (let i = 0; i < n; i++) {
    const e = ell(i), isLive = i === n - 1;
    const col = isLive ? live : ring;
    body.push(isLive && !closed
      ? `<path d="${arcPath(e, -54, 232)}" fill="none" stroke="${col}" stroke-width="${e.w}" stroke-linecap="round"/>`
      : `<ellipse cx="${e.cx.toFixed(1)}" cy="${e.cy.toFixed(1)}" rx="${e.rx}" ry="${e.ry.toFixed(1)}" fill="none" stroke="${col}" stroke-width="${e.w}"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${size}" height="${size}" role="img" aria-label="AnotherLife">
  ${plate ? `<rect width="${S}" height="${S}" rx="${radius}" fill="${bg}"/>` : ""}
  <g transform="rotate(${TILT} ${PITH.x} ${PITH.y})">
  ${body.join("\n  ")}
  <ellipse cx="${PITH.x}" cy="${PITH.y}" rx="15" ry="14" fill="${live}"/>
  </g>
</svg>`;
}
