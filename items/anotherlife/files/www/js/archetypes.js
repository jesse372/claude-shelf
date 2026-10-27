/* ============================================================
   AnotherLife — where you're from, and what that makes you
   An archetype is assigned at birth from your country and your family's
   money. It shifts your starting stats and unlocks events nobody else
   sees. Migration is tracked separately: heritage is where you were
   born, country is where you live now, and plenty of events care about
   the gap between the two.
   ============================================================ */

export const ARCHETYPES = [
  /* ---- Australia ---- */
  { id:"bogan",    name:"Bogan",              emoji:"🦘", country:"Australia", wealth:["poor","working"],
    blurb:"Ute, servo pies, and a deep suspicion of anyone from the city.",
    stats:{ health:+6, smarts:-8, happiness:+8, looks:-2 } },
  { id:"eshay",    name:"Eshay",              emoji:"🧢", country:"Australia", wealth:["poor","working"],
    blurb:"Polo shirt, bum bag, and a train station to loiter in.",
    stats:{ health:+4, smarts:-6, happiness:+4 }, crime:0.12 },
  { id:"privateschool", name:"Private School Kid", emoji:"🎓", country:"Australia", wealth:["comfortable","rich"],
    blurb:"Blazer, rowing, and a surname that opens doors.",
    stats:{ smarts:+10, looks:+6, happiness:+2 }, money:12000 },
  { id:"tradie",   name:"Tradie",             emoji:"🔨", country:"Australia", wealth:["working","comfortable"],
    blurb:"Up at five, done by two, earning more than the office lot.",
    stats:{ health:+10, smarts:-2, happiness:+6 } },
  { id:"surfer",   name:"Surfer",             emoji:"🏄", country:"Australia", wealth:null,
    blurb:"The swell matters more than the job.",
    stats:{ health:+9, looks:+7, smarts:-4, happiness:+9 } },
  { id:"farmkid",  name:"Farm Kid",           emoji:"🚜", country:"Australia", wealth:["working"],
    blurb:"Three hours from anywhere, and can fix anything.",
    stats:{ health:+8, smarts:+3, happiness:+3 } },

  /* ---- United Kingdom ---- */
  { id:"roadman",  name:"Roadman",            emoji:"🛴", country:"United Kingdom", wealth:["poor","working"],
    blurb:"Estate, trackies, and a postcode that means something.",
    stats:{ health:+4, smarts:-5, happiness:+3 }, crime:0.15 },
  { id:"chav",     name:"Chav",               emoji:"🧥", country:"United Kingdom", wealth:["poor","working"],
    blurb:"Burberry, Lambrini, and a fierce loyalty to your own.",
    stats:{ health:+3, smarts:-6, happiness:+7 }, crime:0.08 },
  { id:"posh",     name:"Posh",               emoji:"🎩", country:"United Kingdom", wealth:["comfortable","rich"],
    blurb:"Boarding school, a family pile, and vowels you could cut glass with.",
    stats:{ smarts:+9, looks:+7, happiness:+1 }, money:25000 },
  { id:"casual",   name:"Football Casual",    emoji:"⚽", country:"United Kingdom", wealth:["working"],
    blurb:"Terrace clobber and an away day every fortnight.",
    stats:{ health:+6, smarts:-3, happiness:+8 }, crime:0.07 },
  { id:"northern", name:"Northern Working Class", emoji:"🏭", country:"United Kingdom", wealth:["poor","working"],
    blurb:"Pit closed before you were born, but the town still talks about it.",
    stats:{ health:+4, smarts:+2, happiness:+5 } },

  /* ---- United States ---- */
  { id:"trailer",  name:"Trailer Park Kid",   emoji:"🚚", country:"United States", wealth:["poor"],
    blurb:"Two jobs between three adults and a lot of stubbornness.",
    stats:{ health:+3, smarts:-4, happiness:+2 }, crime:0.08 },
  { id:"preppy",   name:"Preppy",             emoji:"⛵", country:"United States", wealth:["comfortable","rich"],
    blurb:"Country club, legacy admission, and a very straight parting.",
    stats:{ smarts:+8, looks:+8 }, money:20000 },
  { id:"frat",     name:"Frat Kid",           emoji:"🍺", country:"United States", wealth:["comfortable"],
    blurb:"Letters on the wall and a liver you'll hear about later.",
    stats:{ health:+3, looks:+5, smarts:-3, happiness:+9 } },
  { id:"hood",     name:"Street Kid",         emoji:"🏙️", country:"United States", wealth:["poor"],
    blurb:"You learned which corners to avoid before you learned to read.",
    stats:{ health:+5, smarts:+2, happiness:-2 }, crime:0.16 },
  { id:"cowboy",   name:"Ranch Kid",          emoji:"🤠", country:"United States", wealth:["working"],
    blurb:"Horses, rifles, and a hundred miles to the nearest cinema.",
    stats:{ health:+9, smarts:+1, happiness:+5 } },
  { id:"techkid",  name:"Tech Kid",           emoji:"💻", country:"United States", wealth:["comfortable","rich"],
    blurb:"Wrote your first line of code before you could drive.",
    stats:{ smarts:+13, looks:-4, health:-4 } },

  /* ---- elsewhere ---- */
  { id:"striver",  name:"Middle-Class Striver", emoji:"📚", country:"India", wealth:["working","comfortable"],
    blurb:"Engineering or medicine. Those are the options.",
    stats:{ smarts:+12, happiness:-4, health:+2 } },
  { id:"villagein",name:"Village Kid",        emoji:"🌾", country:"India", wealth:["poor"],
    blurb:"First in the family who might get out.",
    stats:{ health:+6, smarts:+4, happiness:+2 } },
  { id:"cityelite",name:"City Elite",         emoji:"🏙️", country:"India", wealth:["rich"],
    blurb:"Driver, cook, and an international school.",
    stats:{ smarts:+9, looks:+6 }, money:18000 },
  { id:"salaryman",name:"Salaryman Track",    emoji:"👔", country:"Japan", wealth:["working","comfortable"],
    blurb:"Cram school, then a company that owns your evenings.",
    stats:{ smarts:+11, health:-4, happiness:-6 } },
  { id:"otaku",    name:"Otaku",              emoji:"🎮", country:"Japan", wealth:null,
    blurb:"Encyclopaedic about one thing and awkward about everything else.",
    stats:{ smarts:+8, looks:-6, health:-5, happiness:+4 } },
  { id:"yankii",   name:"Yankii",             emoji:"🏍️", country:"Japan", wealth:["poor","working"],
    blurb:"Bleached hair, modified bike, and a permanent scowl.",
    stats:{ health:+5, smarts:-7, happiness:+5 }, crime:0.12 },
  { id:"favela",   name:"Favela Kid",         emoji:"🎶", country:"Brazil", wealth:["poor"],
    blurb:"Football, funk, and a community that raises everyone's kids.",
    stats:{ health:+7, happiness:+8, smarts:-2 }, crime:0.13 },
  { id:"paulista", name:"Paulista",           emoji:"🏢", country:"Brazil", wealth:["comfortable","rich"],
    blurb:"Gated block, private school, helicopter overhead.",
    stats:{ smarts:+7, looks:+5 }, money:9000 },
  { id:"lagos",    name:"Lagos Hustler",      emoji:"🛺", country:"Nigeria", wealth:["poor","working"],
    blurb:"Three side businesses before breakfast.",
    stats:{ smarts:+7, health:+4, happiness:+6 } },
  { id:"township", name:"Township Kid",       emoji:"🏘️", country:"South Africa", wealth:["poor","working"],
    blurb:"Taxis, church on Sunday, and a very long walk to school.",
    stats:{ health:+6, smarts:+3, happiness:+4 }, crime:0.09 },
  { id:"banlieue", name:"Banlieue Kid",       emoji:"🏢", country:"France", wealth:["poor","working"],
    blurb:"Tower block on the edge of a city that pretends you're not there.",
    stats:{ health:+5, smarts:+3, happiness:+1 }, crime:0.11 },
  { id:"ultras",   name:"Ultra",              emoji:"🔥", country:"Italy", wealth:["working"],
    blurb:"The curva is the only institution you respect.",
    stats:{ health:+6, happiness:+7, smarts:-3 }, crime:0.09 },
  { id:"examkid",  name:"Exam Machine",       emoji:"📖", country:"South Korea", wealth:["working","comfortable"],
    blurb:"Hagwon until eleven, then homework.",
    stats:{ smarts:+14, health:-6, happiness:-8 } },
  { id:"gaokao",   name:"Gaokao Kid",         emoji:"✏️", country:"China", wealth:["working","comfortable"],
    blurb:"One exam decides everything, and everyone reminds you.",
    stats:{ smarts:+13, health:-4, happiness:-7 } },
  { id:"hockey",   name:"Hockey Kid",         emoji:"🏒", country:"Canada", wealth:["working","comfortable"],
    blurb:"Five a.m. practices and a parent who never missed one.",
    stats:{ health:+11, happiness:+6, smarts:-1 } },
  { id:"culchie",  name:"Culchie",            emoji:"🐑", country:"Ireland", wealth:["working"],
    blurb:"GAA, a tractor, and everyone knows your father.",
    stats:{ health:+7, happiness:+7, smarts:+1 } },
  { id:"islander", name:"Islander",           emoji:"🌊", country:"New Zealand", wealth:["poor","working"],
    blurb:"Big family, bigger church, rugby on Saturday.",
    stats:{ health:+9, happiness:+8, smarts:-1 } },
  { id:"norteno",  name:"Norteño",            emoji:"🎺", country:"Mexico", wealth:["poor","working"],
    blurb:"Border town, banda, and a cousin who went north.",
    stats:{ health:+6, happiness:+6, smarts:+1 }, crime:0.10 },

  /* ---- available anywhere ---- */
  { id:"suburban", name:"Suburban Kid",       emoji:"🏡", country:null, wealth:["working","comfortable"],
    blurb:"Nothing much happened, which was rather the point.",
    stats:{ smarts:+3, happiness:+4 } },
  { id:"churchkid",name:"Church Kid",         emoji:"⛪", country:null, wealth:null,
    blurb:"Twice on Sundays and a youth group that ran your social life.",
    stats:{ smarts:+3, happiness:+5, health:+2 } },
  { id:"militarybrat", name:"Military Brat",  emoji:"🎖️", country:null, wealth:["working","comfortable"],
    blurb:"Six schools in ten years and very good at goodbyes.",
    stats:{ health:+6, smarts:+4, happiness:-3 } },
  { id:"artskid",  name:"Arts Kid",           emoji:"🎨", country:null, wealth:null,
    blurb:"Black clothes, strong opinions, terrible at maths.",
    stats:{ looks:+5, smarts:+4, happiness:+3, health:-2 } },
  { id:"immigrant",name:"Immigrant Family",   emoji:"🧳", country:null, wealth:["poor","working"],
    blurb:"Two languages at home and parents who gave up a great deal to be here.",
    stats:{ smarts:+7, health:+3, happiness:-2 } },
];

/* Countries people commonly move to, for the migration events. */
export const MIGRATION_TARGETS = ["Australia","United Kingdom","United States","Canada","New Zealand","Germany","Netherlands","Ireland"];
export const EXPAT_TARGETS = ["Indonesia","Thailand","Portugal","Spain","Vietnam","United Arab Emirates","Mexico"];

export function pickArchetype(country, wealth, rnd) {
  const local = ARCHETYPES.filter(a => a.country === country && (!a.wealth || a.wealth.includes(wealth)));
  const generic = ARCHETYPES.filter(a => a.country === null && (!a.wealth || a.wealth.includes(wealth)));
  const pool = local.length && rnd() < 0.72 ? local : (generic.length ? generic : ARCHETYPES.filter(a => !a.country));
  return pool[Math.floor(rnd() * pool.length)] || null;
}
export function archetypeById(id) { return ARCHETYPES.find(a => a.id === id) || null; }
