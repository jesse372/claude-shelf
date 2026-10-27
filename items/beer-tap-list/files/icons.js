/* Shared beer icons — used by both the TV screen (index.html) and the editor (edit.html).
   Each entry: [key, label, inner SVG].  All drawn on a 24x24 grid in currentColor. */
window.BEER_ICONS = [
  ["pint", "Pint glass",
    '<path d="M6.4 2.8h11.2l-1.35 17.4a1.6 1.6 0 0 1-1.6 1.5H9.35a1.6 1.6 0 0 1-1.6-1.5z"/>' +
    '<path d="M6.9 8.2h10.2"/>'],

  ["mug", "Beer mug",
    '<path d="M4.2 4.6h11.4v14.9a2 2 0 0 1-2 2H6.2a2 2 0 0 1-2-2z"/>' +
    '<path d="M15.6 8.4h2.2a3 3 0 0 1 0 6h-2.2"/>' +
    '<path d="M4.2 9.1h11.4"/>'],

  ["bottle", "Bottle",
    '<path d="M10 2.4h4v2.9c0 1 .3 1.6 1 2.3l.5.6c.6.7.9 1.5.9 2.4v9a2 2 0 0 1-2 2H9.6a2 2 0 0 1-2-2v-9c0-.9.3-1.7.9-2.4l.5-.6c.7-.7 1-1.3 1-2.3z"/>' +
    '<path d="M8.5 13.2h7"/>'],

  ["can", "Can",
    '<rect x="6.2" y="2.8" width="11.6" height="18.4" rx="2.1"/>' +
    '<path d="M6.5 6.3h11M6.5 17.7h11"/>'],

  ["hop", "Hop cone",
    '<path d="M12 2.6c3.1 2.1 5.1 4.7 5.1 8.2 0 4.6-2.6 8.2-5.1 10.3-2.5-2.1-5.1-5.7-5.1-10.3 0-3.5 2-6.1 5.1-8.2z"/>' +
    '<path d="M12 4.4v15.6"/>' +
    '<path d="M7.4 9.1c2.1 1.6 7.1 1.6 9.2 0M7.1 13.4c2.2 1.6 7.6 1.6 9.8 0"/>'],

  ["wheat", "Barley",
    '<path d="M12 21.4V8.2"/>' +
    '<path d="M12 8.2c0-2.4-1.2-3.9-3-4.5.3 2.4 1.2 3.9 3 4.5zM12 8.2c0-2.4 1.2-3.9 3-4.5-.3 2.4-1.2 3.9-3 4.5z"/>' +
    '<path d="M12 13.1c0-2.4-1.2-3.9-3-4.5.3 2.4 1.2 3.9 3 4.5zM12 13.1c0-2.4 1.2-3.9 3-4.5-.3 2.4-1.2 3.9-3 4.5z"/>' +
    '<path d="M12 18c0-2.4-1.2-3.9-3-4.5.3 2.4 1.2 3.9 3 4.5zM12 18c0-2.4 1.2-3.9 3-4.5-.3 2.4-1.2 3.9-3 4.5z"/>'],

  ["keg", "Keg",
    '<ellipse cx="12" cy="4.6" rx="5.2" ry="2.1"/>' +
    '<path d="M6.8 4.6v14.8M17.2 4.6v14.8"/>' +
    '<path d="M6.8 19.4a5.2 2.1 0 0 0 10.4 0"/>' +
    '<path d="M6.9 10.1h10.2M6.9 14.4h10.2"/>'],

  ["growler", "Growler",
    '<path d="M9.2 2.6h5.6v2.6l1.3 1.9c.5.8.8 1.6.8 2.5v10.3a2 2 0 0 1-2 2H9.1a2 2 0 0 1-2-2V9.6c0-.9.3-1.7.8-2.5l1.3-1.9z"/>' +
    '<path d="M16.9 10.4h1.6a2 2 0 0 1 2 2v1.7a2 2 0 0 1-2 2h-1.6"/>']
];

/* Build an <svg> string for a given icon key. Returns "" for none/unknown. */
window.beerIconSVG = function(key, extraClass){
  if(!key) return "";
  var list = window.BEER_ICONS, i;
  for(i = 0; i < list.length; i++){
    if(list[i][0] === key){
      return '<svg class="' + (extraClass || "") + '" viewBox="0 0 24 24" ' +
             'fill="none" stroke="currentColor" stroke-width="1.6" ' +
             'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
             list[i][2] + '</svg>';
    }
  }
  return "";
};

/* ---- SRM beer colour spectrum (Standard Reference Method) ----
   1 = pale straw, 40 = black. These are the standard chart values. */
window.SRM = {
  1:"#FFE699",2:"#FFD878",3:"#FFCA5A",4:"#FFBF42",5:"#FBB123",6:"#F8A600",7:"#F39C00",8:"#EA8F00",
  9:"#E58500",10:"#DE7C00",11:"#D77200",12:"#CF6900",13:"#CB6200",14:"#C35900",15:"#BB5100",16:"#B54C00",
  17:"#B04500",18:"#A63E00",19:"#A13700",20:"#9B3200",21:"#952D00",22:"#8E2900",23:"#882300",24:"#821E00",
  25:"#7B1A00",26:"#771900",27:"#701400",28:"#6A0E00",29:"#660D00",30:"#5E0B00",31:"#5A0A02",32:"#560903",
  33:"#520907",34:"#4C0505",35:"#470606",36:"#440607",37:"#3F0708",38:"#3B0607",39:"#3A070B",40:"#36080A",
};

/* Rough style guide, shown next to the number so he doesn't need a chart. */
window.SRM_NAMES = [
  [1,2,"Pale straw"],[3,4,"Straw"],[5,6,"Pale gold"],[7,9,"Deep gold"],
  [10,13,"Pale amber"],[14,17,"Amber"],[18,21,"Deep amber"],[22,26,"Copper"],
  [27,32,"Deep copper"],[33,37,"Brown"],[38,40,"Black"]
];

window.srmName = function(n){
  var t = window.SRM_NAMES, i;
  for(i = 0; i < t.length; i++){ if(n >= t[i][0] && n <= t[i][1]) return t[i][2]; }
  return "";
};

/* Strictly for the father-in-law. */
window.DOODLE =
  '<svg viewBox="0 0 44 64" fill="none" stroke="currentColor" stroke-width="3.4" ' +
  'stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M15 46V21a7 7 0 0 1 14 0v25"/>' +
    '<circle cx="12" cy="52" r="8"/>' +
    '<circle cx="32" cy="52" r="8"/>' +
  '</svg>';

/* ---- glassware silhouettes: body path, optional handle/stem, and the
   y-range the liquid occupies (so stemmed glasses fill their bowl) ---- */
window.GLASSWARE = {
 "pint": {
  "label": "Pint",
  "body": "M9 4 H31 L27.6 56.5 Q27.4 60 24 60 H16 Q12.6 60 12.4 56.5 Z",
  "top": 4,
  "bot": 60,
  "scale": 0.973
 },
 "nonic": {
  "label": "Nonic",
  "body": "M9 4 H31 L30 17 Q32.5 19.5 29.6 22 L27.6 56.5 Q27.4 60 24 60 H16 Q12.6 60 12.4 56.5 L10.4 22 Q7.5 19.5 10 17 Z",
  "top": 4,
  "bot": 60,
  "scale": 0.975
 },
 "mug": {
  "label": "Stein",
  "body": "M8 7 H28.5 V56.5 Q28.5 60 25 60 H11.5 Q8 60 8 56.5 Z",
  "extra": "M28.5 17 h3.5 a7 7 0 0 1 0 14 h-3.5",
  "top": 7,
  "bot": 60,
  "scale": 0.922
 },
 "weizen": {
  "label": "Weizen",
  "body": "M12 4 H28 L29.4 21 Q31.5 33 27 42.5 L26.2 56.5 Q26 60 23 60 H17 Q14 60 13.8 56.5 L13 42.5 Q8.5 33 10.6 21 Z",
  "top": 4,
  "bot": 60,
  "scale": 1.012
 },
 "tulip": {
  "label": "Tulip",
  "body": "M11 6 H29 Q31.5 21 25.8 28.5 Q24 30.8 24 34 H16 Q16 30.8 14.2 28.5 Q8.5 21 11 6 Z",
  "extra": "M20 34 V52 M11.5 58 H28.5 Q28.5 52 20 52 Q11.5 52 11.5 58",
  "top": 6.5,
  "bot": 34,
  "scale": 1.069
 },
 "snifter": {
  "label": "Snifter",
  "body": "M9.5 12 Q9.5 33 20 35.5 Q30.5 33 30.5 12 Q30.5 9 20 9 Q9.5 9 9.5 12 Z",
  "extra": "M20 35.5 V50 M12 57 H28 Q28 50 20 50 Q12 50 12 57",
  "top": 9.5,
  "bot": 35.5,
  "scale": 1.156
 },
 "goblet": {
  "label": "Goblet",
  "body": "M10 8 H30 Q30 28 22 33 H18 Q10 28 10 8 Z",
  "extra": "M20 33 V51 M11 58 H29 Q29 51 20 51 Q11 51 11 58",
  "top": 8.5,
  "bot": 33,
  "scale": 1.111
 },
 "can": {
  "label": "Can",
  "body": "M10 5 H30 Q31.5 5 31.5 8 V56 Q31.5 60 30 60 H10 Q8.5 60 8.5 56 V8 Q8.5 5 10 5 Z",
  "top": 5,
  "bot": 60,
  "scale": 0.874
 },
 "bottle": {
  "label": "Bottle",
  "body": "M16.5 4 H23.5 V13 Q23.5 16 25.5 18.5 Q28 22 28 26 V56.5 Q28 60 24.5 60 H15.5 Q12 60 12 56.5 V26 Q12 22 14.5 18.5 Q16.5 16 16.5 13 Z",
  "top": 4,
  "bot": 60,
  "scale": 1.012
 },
 "growler": {
  "label": "Growler",
  "body": "M14 4 H26 V9.5 L28.6 13.6 Q30.5 17 30.5 21 V56 Q30.5 60 27 60 H13 Q9.5 60 9.5 56 V21 Q9.5 17 11.4 13.6 L14 9.5 Z",
  "extra": "M30.5 24 h2.5 a5 5 0 0 1 0 10 h-2.5",
  "top": 4,
  "bot": 60,
  "scale": 0.925
 },
 "ipa": {
  "label": "IPA",
  "scale": 1.0,
  "top": 4.5,
  "bot": 59.5,
  "body": "M8 4 C7.6 15, 9.6 25, 14 31 C12.9 32.2, 12.9 33.4, 14 34.6 C12.9 35.8, 12.9 37, 14 38.2 C12.9 39.4, 12.9 40.6, 14 41.8 L14 56.4 C14 59.3, 16.2 59.6, 20 59.6 C23.8 59.6, 26 59.3, 26 56.4 L26 41.8 C27.1 40.6, 27.1 39.4, 26 38.2 C27.1 37, 27.1 35.8, 26 34.6 C27.1 33.4, 27.1 32.2, 26 31 C30.4 25, 32.4 15, 32 4 Z"
 },
 "chalice": {
  "label": "Goblet",
  "scale": 1.0,
  "top": 10.5,
  "bot": 39.5,
  "body": "M9.5 10 C6.4 16, 6.4 30, 12.8 36.4 C15.4 39, 17.6 39.6, 20 39.6 C22.4 39.6, 24.6 39, 27.2 36.4 C33.6 30, 33.6 16, 30.5 10 Z",
  "extra": "M20 39.6 V46.5 M11 57.5 H29 Q29 46.5 20 46.5 Q11 46.5 11 57.5 Z"
 },
 "pilsner": {
  "label": "Lager",
  "scale": 1.0,
  "top": 4.5,
  "bot": 59.5,
  "body": "M9.8 4 C9.4 6, 9.6 8, 10.6 10 L15.4 56.5 C15.6 59.4, 17.6 59.6, 20 59.6 C22.4 59.6, 24.4 59.4, 24.6 56.5 L29.4 10 C30.4 8, 30.6 6, 30.2 4 Z"
 }
};

/* Existing icon choices map onto a vessel. */
window.GLASS_FOR = {pint:"pint", mug:"mug", bottle:"bottle", can:"can",
                    growler:"growler", keg:"mug", hop:"pint", wheat:"weizen", "":"pint"};

/* Pick the glass a beer person would actually pour it into.
   Rules run in order, most specific first; the first match wins. */
window.GLASS_RULES = [
  [/neipa|new england|hazy|juicy|india pale|\bipa\b|\bdipa\b|\bxpa\b/, "ipa"],
  [/berliner/,                                                              "tulip"],
  [/hefe|weizen|weiss|wei\u00dfe|witbier|\bwit\b|wheat|kristall/,          "weizen"],
  [/imperial|barrel[- ]?aged|barley ?wine|quad|dubbel|tripel|trappist|abbey|belgian (dark|strong)|wee heavy|scotch ale|old ale|russian/, "chalice"],
  [/saison|farmhouse|sour|gose|lambic|gueuze|geuze|wild|brett|kriek|berliner|fruit/, "tulip"],
  [/stout|porter|schwarzbier|black ale/,                                    "chalice"],
  [/m\u00e4rzen|marzen|oktoberfest|festbier|bock|dunkel|vienna|munich/,   "mug"],
  [/pilsner|\bpils\b|helles|k\u00f6lsch|kolsch|cream ale|lager/,              "pilsner"],
  [/bitter|\besb\b|\bmild\b|english|irish|amber ale|red ale|brown ale/,      "nonic"],
  [/pale ale|\bapa\b|blonde|golden ale|session|pacific ale|\bale\b/,         "pint"]
];

window.glassFor = function(t){
  var txt = ((t.style || "") + " " + (t.name || "")).toLowerCase();
  var i, r = window.GLASS_RULES;
  for(i = 0; i < r.length; i++){ if(r[i][0].test(txt)) return r[i][1]; }
  if((Number(t.srm) || 0) >= 24) return "chalice";      /* anything genuinely dark */
  return window.GLASS_FOR[t.icon] || t.icon || "pint";  /* fall back to his pick */
};

/* Build the filled glass for a beer. level 0-100. */
window.glassSVG = function(key, level, color, uid){
  var g = window.GLASSWARE[window.GLASS_FOR[key] || key] || window.GLASSWARE.pint;
  var lv = Math.max(0, Math.min(100, Number(level) || 0));
  var y  = g.bot - (g.bot - g.top) * lv / 100;
  var id = "gc" + uid;
  var foam = lv > 6
    ? '<rect x="0" y="' + (y - 0.2).toFixed(1) + '" width="40" height="2.6" fill="#fffdf7" clip-path="url(#' + id + ')"/>'
    : '';
  var sc = g.scale || 1;
  /* scale about the base so all vessels share a footing, and keep the stroke
     visually constant rather than growing with the shape */
  var sw = (1.9 / sc).toFixed(2);
  return '<svg class="glasssvg" viewBox="0 0 40 64" preserveAspectRatio="xMidYMid meet" aria-hidden="true">' +
    '<defs><clipPath id="' + id + '"><path d="' + g.body + '"/></clipPath></defs>' +
    '<g transform="translate(20 60) scale(' + sc + ') translate(-20 -60)">' +
      (lv > 0 ? '<rect x="0" y="' + y.toFixed(1) + '" width="40" height="64" fill="' + color + '" clip-path="url(#' + id + ')"/>' : '') +
      foam +
      '<path d="' + g.body + '" fill="none" stroke="currentColor" stroke-width="' + sw + '" stroke-linejoin="round"/>' +
      (g.extra ? '<path d="' + g.extra + '" fill="none" stroke="currentColor" stroke-width="' + sw + '" stroke-linecap="round" stroke-linejoin="round"/>' : '') +
    '</g></svg>';
};
