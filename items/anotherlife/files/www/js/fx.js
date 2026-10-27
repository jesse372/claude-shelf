/* ============================================================
   AnotherLife — feedback effects

   Short, physical reactions to the big moments: the screen takes a hit when
   you do, money falls when you win it. Two rules kept throughout:

   1. No asset files. Every sound is synthesised with WebAudio at the moment
      it plays — a few hundred bytes of code instead of a megabyte of mp3s,
      nothing to license, and it works with no network. The app is offline by
      design and this keeps it that way.
   2. Nothing here may ever break the game. Every entry point is wrapped; if
      audio is blocked or the device hates us, the effect is skipped and play
      continues. An effect is decoration — it does not get to throw.
   ============================================================ */

const SOUND_KEY = "anotherlife.sound";
let soundOn = null;
export function soundEnabled() {
  if (soundOn === null) {
    try { soundOn = localStorage.getItem(SOUND_KEY) !== "0"; } catch (e) { soundOn = true; }
  }
  return soundOn;
}
export function setSound(on) {
  soundOn = !!on;
  try { localStorage.setItem(SOUND_KEY, on ? "1" : "0"); } catch (e) {}
  if (on) resume();
}

const calm = () => {
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; }
  catch (e) { return false; }
};

/* ---------- audio ---------- */
let ctx = null;
function audio() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try { ctx = new AC(); } catch (e) { ctx = null; }
  return ctx;
}
/* Mobile browsers start the context suspended until a gesture. Every effect
   follows a tap, so resuming here is enough. */
function resume() {
  const a = audio();
  if (a && a.state === "suspended") a.resume().catch(() => {});
}

function tone({ type = "sine", from, to = from, t = 0.2, vol = 0.2, delay = 0, curve = "exp" }) {
  const a = audio(); if (!a) return;
  const t0 = a.currentTime + delay;
  const osc = a.createOscillator(), gain = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t0);
  if (to !== from) {
    if (curve === "exp") osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + t);
    else osc.frequency.linearRampToValueAtTime(to, t0 + t);
  }
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + t);
  osc.connect(gain).connect(a.destination);
  osc.start(t0); osc.stop(t0 + t + 0.05);
}

function noise({ t = 0.18, vol = 0.25, cutoff = 1200, delay = 0 }) {
  const a = audio(); if (!a) return;
  const t0 = a.currentTime + delay;
  const frames = Math.floor(a.sampleRate * t);
  const buf = a.createBuffer(1, frames, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < frames; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / frames);
  const src = a.createBufferSource(); src.buffer = buf;
  const lp = a.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = cutoff;
  const gain = a.createGain();
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + t);
  src.connect(lp).connect(gain).connect(a.destination);
  src.start(t0); src.stop(t0 + t);
}

/* One oscillator gliding through a series of pitches with no gaps in between.
   A siren is not a sequence of beeps — it is a single voice that never stops
   moving, and building it out of separate short tones is exactly why the last
   attempt sounded like a reversing lorry. */
function sweep({ type = "sawtooth", points, vol = 0.16, cutoff = 0, attack = 0.03, release = 0.14, delay = 0 }) {
  const a = audio(); if (!a || !points || !points.length) return;
  const t0 = a.currentTime + delay;
  const end = points[points.length - 1][1];
  const osc = a.createOscillator(), gain = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(points[0][0], t0);
  for (let i = 1; i < points.length; i++) osc.frequency.linearRampToValueAtTime(points[i][0], t0 + points[i][1]);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(vol, t0 + attack);
  gain.gain.setValueAtTime(vol, t0 + end);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + end + release);
  let node = osc;
  if (cutoff) { const lp = a.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = cutoff; node = osc.connect(lp); }
  node.connect(gain).connect(a.destination);
  osc.start(t0); osc.stop(t0 + end + release + 0.05);
}

const SOUNDS = {
  /* a body blow: the slap of contact, then the thump under it */
  hit()   { noise({ t:0.045, vol:0.34, cutoff:5200 });          // impact
            noise({ t:0.22, vol:0.26, cutoff:700 });            // body
            /* held, not decayed — an exponential from the first millisecond
               measured as 60ms of audible sound, which is a click */
            sweep({ type:"sine", cutoff:0, vol:0.32, attack:0.004, release:0.16,
                    points:[[210,0],[90,0.09],[48,0.2]] }); },
  /* a till: the mechanical "ka", the bright "ching", then coins after it.
     Rising blips read as a video-game pickup; a cash register reads as money. */
  money() { noise({ t:0.05, vol:0.24, cutoff:2600 });                                  // ka
            tone({ type:"triangle", from:1046, t:0.7, vol:0.17, delay:0.03 });         // ching, ringing on
            tone({ type:"triangle", from:1568, t:0.6, vol:0.12, delay:0.035 });
            tone({ type:"sine",     from:2093, t:0.45, vol:0.07, delay:0.04 });
            /* coins overlap the ring rather than following a silence — the gap
               was audible as a stop-start, not a cascade */
            for (let i = 0; i < 8; i++)
              tone({ type:"triangle", from:1400 + Math.random()*1000, t:0.09, vol:0.085,
                     delay:0.16 + i*0.075 + Math.random()*0.04 }); },
  /* a small warm two-note chime */
  love()  { tone({ type:"sine", from:523, t:0.34, vol:0.16 });
            tone({ type:"sine", from:659, t:0.4, vol:0.14, delay:0.1 }); },
  /* An actual wailing siren: one voice climbing and falling without pause for
     two and a bit seconds. Sawtooth for the harmonics that make it cut, rolled
     off so it doesn't shriek on a phone speaker. */
  police(){
    /* A yelp, not a warble. The previous version swept a narrow 620-1010Hz at
       0.76s a cycle, which is neither a wail nor a yelp and reads as a musical
       wobble. Real emergency yelp is fast — about four cycles a second — over a
       much wider range, and bright enough to cut. Two bars of yelp, then one
       long wail fall, which is how a car actually passes you. */
    const yelp = [], lo = 520, hi = 1450;
    let t = 0;
    for (let i = 0; i < 9; i++) { yelp.push([lo, t]); t += 0.13; yelp.push([hi, t]); t += 0.05; }
    yelp.push([lo, t]); t += 0.12;
    yelp.push([1250, t]); t += 0.5;          // the long wail as it goes past
    yelp.push([430, t]);
    sweep({ type:"sawtooth", cutoff:5200, vol:0.15, points:yelp, release:0.2 });
    sweep({ type:"square",  cutoff:1800, vol:0.045,                  // body underneath
            points:yelp.map(([f, tt]) => [f / 2, tt]), release:0.2 });
  },
  /* the floor going out from under it */
  death() { sweep({ type:"sine", cutoff:0, vol:0.2, attack:0.06, release:0.7,
                    points:[[220,0],[120,0.75],[62,1.5],[40,2.0]] });
            sweep({ type:"triangle", cutoff:600, vol:0.05, attack:0.1, release:0.7,
                    points:[[110,0],[60,0.75],[31,1.5],[20,2.0]] });
            noise({ t:1.4, vol:0.06, cutoff:380 }); },
  /* a rising major arpeggio */
  cheer() { [523, 659, 784, 1046].forEach((f, i) =>
              tone({ type:"triangle", from:f, t:0.28, vol:0.13, delay:i*0.075 })); },
};

function buzz(pattern) {
  try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) {}
}

/* ---------- visuals ---------- */
const layer = () => document.getElementById("fx");

function sheet(cls, ms) {
  const el = layer(); if (!el) return;
  const d = document.createElement("div");
  d.className = "fx-" + cls;
  el.appendChild(d);
  setTimeout(() => d.remove(), ms);
}

function fall(chars, count, ms, cls) {
  const el = layer(); if (!el) return;
  const box = document.createElement("div");
  box.className = "fx-fall";
  for (let i = 0; i < count; i++) {
    const s = document.createElement("span");
    s.className = cls;
    s.textContent = chars[Math.floor(Math.random() * chars.length)];
    s.style.left = (Math.random() * 96) + "%";
    s.style.animationDelay = (Math.random() * 0.6).toFixed(2) + "s";
    s.style.animationDuration = (1.5 + Math.random() * 1.1).toFixed(2) + "s";
    s.style.fontSize = (16 + Math.random() * 20).toFixed(0) + "px";
    box.appendChild(s);
  }
  el.appendChild(box);
  setTimeout(() => box.remove(), ms);
}

function shake() {
  if (calm()) return;
  const g = document.getElementById("screen-game");
  if (!g) return;
  g.classList.remove("fx-shake"); void g.offsetWidth; g.classList.add("fx-shake");
  setTimeout(() => g.classList.remove("fx-shake"), 420);
}

const VISUALS = {
  hit()   { sheet("hit", 620); shake(); buzz(60); },
  money() { fall(["💵","💰","💸","🪙"], calm() ? 8 : 26, 3000, "fx-note"); sheet("gold", 900); },
  love()  { fall(["❤️","💕","💗"], calm() ? 5 : 14, 2600, "fx-heart"); },
  police(){ sheet("police", 1400); buzz([40, 90, 40]); },
  death() { sheet("death", 2200); buzz([120, 80, 220]); },
  cheer() { fall(["🎉","✨","🎊","⭐"], calm() ? 6 : 22, 2800, "fx-note"); },
};

/* Which effect wins when a year produces several. */
const RANK = { death: 5, police: 4, hit: 3, money: 3, cheer: 2, love: 2 };
export const rank = name => RANK[name] || 0;

/* The only entry point. Never throws — an effect is decoration. */
export function play(name) {
  if (!name || !VISUALS[name]) return;
  try { VISUALS[name](); } catch (e) { /* decoration must not break play */ }
  if (!soundEnabled()) return;
  try { resume(); SOUNDS[name] && SOUNDS[name](); } catch (e) {}
}

/* Play the most significant effect out of a year's worth of entries. */
export function playFor(entries) {
  if (!entries || !entries.length) return;
  let best = null;
  for (const e of entries) if (e && e.fx && rank(e.fx) > rank(best)) best = e.fx;
  if (best) play(best);
}
