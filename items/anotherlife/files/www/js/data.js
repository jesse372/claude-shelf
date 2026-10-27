import { pick, rint, chance } from "./util.js";

/* ============================================================
   AnotherLife — content tables
   Pure data + tiny pure helpers. No game state lives here.
   ============================================================ */
export const FIRST_M = ["James","Liam","Noah","Oliver","Elijah","Lucas","Mason","Logan","Ethan","Jack","Henry","Leo","Owen","Theo","Miles","Felix","Rowan","Caleb","Desmond","Arlo","Kai","Hugo","Otis","Silas","Bruno","Wes","Idris","Marcus","Dante","Cyrus","Ravi","Omar","Tobias","Emmett","Jonah","Ellis","Kofi","Mateo","Nikolai","Soren"];
export const FIRST_F = ["Olivia","Emma","Ava","Sophia","Isabella","Mia","Amelia","Harper","Evelyn","Luna","Nora","Iris","Freya","Maya","Ruby","Alice","Willa","Zara","Esme","Cleo","Ida","Sasha","Noor","Delphine","Marisol","Wren","Odette","Juno","Thea","Greta","Amara","Priya","Ingrid","Lucia","Nadia","Saoirse","Tamsin","Yara","Beatrix","Rosalind"];
export const SURNAMES = ["Hayes","Whitlock","Barnes","Okafor","Rivera","Kowalski","Nakamura","Delgado","Fitzgerald","Osei","Lindqvist","Moreau","Bianchi","Vasquez","Ashford","Kim","Petrov","Silva","Larkin","Mbeki","Donnelly","Ferreira","Halloran","Ibarra","Novak","Sandoval","Thornbury","Ueda","Vance","Wexler","Yildiz","Zamora","Cobb","Draper","Elliot","Sterling","Achebe","Bergström","Castellano","Dubois","Espinoza","Fontaine","Grimaldi","Haddad","Ivanov"];

export const COUNTRIES = [
  { name: "United States", flag: "🇺🇸",  city: ["New York","Austin","Portland","Chicago","Miami","Denver"], cur: "$",  mult: 1.00 },
  { name: "United Kingdom", flag: "🇬🇧", city: ["London","Bristol","Leeds","Glasgow","Manchester"],         cur: "£",  mult: 0.92 },
  { name: "Canada", flag: "🇨🇦",         city: ["Toronto","Vancouver","Montreal","Calgary"],                cur: "$",  mult: 0.88 },
  { name: "Australia", flag: "🇦🇺",      city: ["Sydney","Melbourne","Perth","Brisbane"],                   cur: "$",  mult: 0.95 },
  { name: "Japan", flag: "🇯🇵",          city: ["Tokyo","Osaka","Kyoto","Sapporo"],                         cur: "¥",  mult: 0.85 },
  { name: "Germany", flag: "🇩🇪",        city: ["Berlin","Munich","Hamburg","Cologne"],                     cur: "€",  mult: 0.90 },
  { name: "France", flag: "🇫🇷",         city: ["Paris","Lyon","Marseille","Bordeaux"],                     cur: "€",  mult: 0.88 },
  { name: "Italy", flag: "🇮🇹",          city: ["Rome","Milan","Naples","Turin"],                           cur: "€",  mult: 0.78 },
  { name: "Spain", flag: "🇪🇸",          city: ["Madrid","Barcelona","Valencia","Seville"],                 cur: "€",  mult: 0.74 },
  { name: "Brazil", flag: "🇧🇷",         city: ["São Paulo","Rio de Janeiro","Salvador","Recife"],          cur: "R$", mult: 0.45 },
  { name: "Mexico", flag: "🇲🇽",         city: ["Mexico City","Guadalajara","Monterrey"],                   cur: "$",  mult: 0.42 },
  { name: "Nigeria", flag: "🇳🇬",        city: ["Lagos","Abuja","Ibadan","Kano"],                           cur: "₦",  mult: 0.30 },
  { name: "South Africa", flag: "🇿🇦",   city: ["Cape Town","Johannesburg","Durban"],                       cur: "R",  mult: 0.40 },
  { name: "India", flag: "🇮🇳",          city: ["Mumbai","Bengaluru","Delhi","Chennai"],                    cur: "₹",  mult: 0.35 },
  { name: "China", flag: "🇨🇳",          city: ["Shanghai","Beijing","Shenzhen","Chengdu"],                 cur: "¥",  mult: 0.55 },
  { name: "South Korea", flag: "🇰🇷",    city: ["Seoul","Busan","Incheon"],                                 cur: "₩",  mult: 0.80 },
  { name: "Sweden", flag: "🇸🇪",         city: ["Stockholm","Gothenburg","Malmö"],                          cur: "kr", mult: 0.94 },
  { name: "Netherlands", flag: "🇳🇱",    city: ["Amsterdam","Rotterdam","Utrecht"],                         cur: "€",  mult: 0.93 },
  { name: "Ireland", flag: "🇮🇪",        city: ["Dublin","Cork","Galway"],                                  cur: "€",  mult: 0.90 },
  { name: "New Zealand", flag: "🇳🇿",    city: ["Auckland","Wellington","Christchurch"],                    cur: "$",  mult: 0.86 },
  { name: "Indonesia",      flag: "\uD83C\uDDEE\uD83C\uDDE9", city: ["Bali","Jakarta","Yogyakarta","Surabaya"],       cur: "Rp", mult: 0.28 },
  { name: "Thailand",       flag: "\uD83C\uDDF9\uD83C\uDDED", city: ["Bangkok","Chiang Mai","Phuket"],                cur: "\u0E3F",  mult: 0.34 },
  { name: "Portugal",       flag: "\uD83C\uDDF5\uD83C\uDDF9", city: ["Lisbon","Porto","Faro"],                        cur: "\u20AC",  mult: 0.62 },
  { name: "Vietnam",        flag: "\uD83C\uDDFB\uD83C\uDDF3", city: ["Ho Chi Minh City","Hanoi","Da Nang"],           cur: "\u20AB",  mult: 0.26 },
  { name: "United Arab Emirates", flag: "\uD83C\uDDE6\uD83C\uDDEA", city: ["Dubai","Abu Dhabi","Sharjah"],            cur: "AED", mult: 0.95 },
  { name: "Philippines",    flag: "\uD83C\uDDF5\uD83C\uDDED", city: ["Manila","Cebu","Davao"],                        cur: "\u20B1",  mult: 0.30 },
];

/* ============================================================
   EDUCATION
   ============================================================ */
export const UNI_MAJORS = [
  "Computer Science","Medicine","Law","Business","Psychology","Fine Art","Engineering",
  "Nursing","Philosophy","Economics","Biology","Education","Chemistry","Physics",
  "Journalism","Architecture","Mathematics","Political Science","History","Sociology",
  "Marketing","Environmental Science","Music","Film Studies",
];

export const SCHOOL_STAGES = {
  elementary: { label: "Elementary School", start: 6,  end: 11 },
  middle:     { label: "Middle School",     start: 12, end: 14 },
  high:       { label: "High School",       start: 15, end: 17 },
};

/* Post-graduate tracks. `unlocks` maps to job.gradType. */
export const GRAD_SCHOOLS = [
  { id:"med",      name:"Medical School",     years:4, cost:38000, minSmarts:70, majors:["Medicine","Biology","Chemistry"] },
  { id:"law",      name:"Law School",         years:3, cost:32000, minSmarts:65, majors:null },
  { id:"mba",      name:"Business School",    years:2, cost:34000, minSmarts:55, majors:null },
  { id:"dental",   name:"Dental School",      years:4, cost:36000, minSmarts:68, majors:["Medicine","Biology","Chemistry"] },
  { id:"vet",      name:"Veterinary School",  years:4, cost:30000, minSmarts:66, majors:["Biology","Chemistry"] },
  { id:"pharm",    name:"Pharmacy School",    years:4, cost:29000, minSmarts:64, majors:["Chemistry","Biology","Medicine"] },
  { id:"grad",     name:"Graduate School",    years:3, cost:16000, minSmarts:55, majors:null },
];

export const CLUBS = [
  { id:"debate",   name:"Debate Team",     stats:{ smarts:+6, happiness:+3 } },
  { id:"football", name:"Football Team",   stats:{ health:+6, looks:+2, happiness:+4 } },
  { id:"drama",    name:"Drama Club",      stats:{ looks:+3, happiness:+6 } },
  { id:"band",     name:"School Band",     stats:{ smarts:+3, happiness:+5 } },
  { id:"chess",    name:"Chess Club",      stats:{ smarts:+8, happiness:-1 } },
  { id:"track",    name:"Track & Field",   stats:{ health:+8, looks:+3 } },
  { id:"yearbook", name:"Yearbook",        stats:{ smarts:+3, happiness:+3 } },
  { id:"science",  name:"Science Olympiad",stats:{ smarts:+9 } },
];

/* ============================================================
   JOBS — tier 0 none, 1 high school, 2 bachelor's, 3 grad school
   ============================================================ */
/* The job market moved to its own file — 519 of them, grouped by sector.
   Re-exported here so every existing import keeps working. */
export { JOBS } from "./jobs.js";

export const SPECIAL = [
  { id:"actor", name:"Actor", emoji:"\uD83C\uDFAC", base:34000, project:"Audition for a Role",
    fameRate:0.72, req:{ looks:55 },
    big:{ label:"Headline a Blockbuster", noun:"blockbuster", minFame:60, pay:[3,9], fame:[12,26] },
    ladder:["Extra","Bit Part","Supporting Actor","Working Actor","Lead Actor","Studio Draw","A-List Star","Hollywood Legend"] },

  { id:"musician", name:"Musician", emoji:"\uD83C\uDFB8", base:26000, project:"Record New Music",
    fameRate:0.66, req:{ },
    big:{ label:"Launch a World Tour", noun:"world tour", minFame:60, pay:[4,11], fame:[14,28] },
    ladder:["Bar Gig Act","Local Support","Touring Support","Headliner","Chart Artist","Arena Act","Stadium Act","Global Icon"] },

  { id:"singer", name:"Singer", emoji:"\uD83C\uDFA4", base:29000, project:"Release a Single",
    fameRate:0.74, req:{ looks:50 },
    big:{ label:"Launch a World Tour", noun:"world tour", minFame:60, pay:[4,11], fame:[14,28] },
    ladder:["Open Mic Singer","Session Vocalist","Recording Artist","Charting Singer","Pop Star","Arena Headliner","Global Superstar","Living Legend"] },

  { id:"model", name:"Model", emoji:"\uD83D\uDC83", base:38000, project:"Book a Campaign",
    fameRate:0.90, req:{ looks:78 },
    big:{ label:"Front a Global Campaign", noun:"global campaign", minFame:58, pay:[3,7], fame:[10,20] },
    ladder:["Catalog Model","Runway Model","Editorial Model","Campaign Face","Cover Model","Brand Ambassador","Supermodel","Fashion Icon"] },

  { id:"athlete", name:"Professional Athlete", emoji:"\uD83C\uDFC5", base:58000, project:"Train for the Season",
    fameRate:0.80, req:{ health:75 }, maxAge:36,
    big:{ label:"Sign a Franchise Deal", noun:"franchise deal", minFame:58, pay:[3,8], fame:[10,22] },
    ladder:["Practice Squad","Rookie","Squad Player","Starter","All-Star","Franchise Player","MVP","Hall of Famer"] },

  { id:"influencer", name:"Influencer", emoji:"\uD83D\uDCF1", base:14000, project:"Post Content",
    fameRate:1.00, req:{ looks:55 },
    big:{ label:"Launch Your Own Brand", noun:"brand launch", minFame:52, pay:[3,9], fame:[8,18] },
    ladder:["Nano Creator","Micro Influencer","Rising Creator","Verified Creator","Brand Partner","Channel Star","Media Empire","Household Name"] },

  { id:"author", name:"Author", emoji:"\u270D\uFE0F", base:20000, project:"Write a Book",
    fameRate:0.58, req:{ smarts:65 },
    big:{ label:"Sign a Major Book Deal", noun:"book deal", minFame:52, pay:[4,12], fame:[12,24] },
    ladder:["Self-Published","Debut Novelist","Published Author","Critically Acclaimed","Bestseller","No.1 Bestseller","Literary Star","Literary Legend"] },

  { id:"comedian", name:"Comedian", emoji:"\uD83C\uDF99\uFE0F", base:19000, project:"Work on Your Set",
    fameRate:0.72, req:{ },
    big:{ label:"Film a Streaming Special", noun:"streaming special", minFame:54, pay:[3,9], fame:[11,22] },
    ladder:["Open Mic","Club Comic","Touring Comic","Festival Act","Special Headliner","Arena Comic","Comedy Star","Comedy Legend"] },

  { id:"director", name:"Film Director", emoji:"\uD83C\uDFA5", base:44000, project:"Direct a Project",
    fameRate:0.64, req:{ smarts:60 },
    big:{ label:"Direct a Tentpole Film", noun:"tentpole film", minFame:60, pay:[4,10], fame:[12,24] },
    ladder:["Short Film Director","Indie Director","Festival Director","Studio Director","Blockbuster Director","Auteur","Oscar Winner","Cinema Legend"] },

  { id:"racer", name:"Racing Driver", emoji:"\uD83C\uDFCE\uFE0F", base:50000, project:"Race the Season",
    fameRate:0.70, req:{ health:65 }, maxAge:40,
    big:{ label:"Sign With a Top Team", noun:"season with a top team", minFame:58, pay:[3,9], fame:[12,24] },
    ladder:["Karting","Junior Formula","Reserve Driver","Works Driver","Race Winner","Factory Star","Title Contender","World Champion"] },

  { id:"astronaut", name:"Astronaut", emoji:"\uD83D\uDE80", base:104000, project:"Train for a Mission",
    fameRate:0.50, req:{ smarts:85, health:80, uni:true },
    big:{ label:"Command a Flagship Mission", noun:"flagship mission", minFame:50, pay:[2,4], fame:[14,26] },
    ladder:["Candidate","Mission Specialist","Pilot","Commander","Veteran Commander","Programme Lead"] },

  { id:"politician", name:"Politician", emoji:"\uD83C\uDFDB\uFE0F", base:64000, project:"Campaign",
    fameRate:0.55, req:{ smarts:55 }, minAge:25,
    big:{ label:"Run for the Top Office", noun:"run at the top office", minFame:64, pay:[2,5], fame:[14,28] },
    ladder:["Councillor","Mayor","Representative","Senator","Cabinet Minister","Party Leader","Head of State"] },

  { id:"military", name:"Military", emoji:"\uD83C\uDF96\uFE0F", base:42000, project:"Deploy",
    fameRate:0.34, req:{ health:60, high:true },
    big:{ label:"Take a Field Command", noun:"field command", minFame:46, pay:[2,4], fame:[10,20] },
    ladder:["Private","Corporal","Sergeant","Lieutenant","Captain","Major","Colonel","General"] },
];

/* ============================================================
   ASSETS
   ============================================================ */
export const HOUSES = [
  { name:"Trailer",            price: 24000,    emoji:"🚚" },
  { name:"Studio Apartment",   price: 68000,    emoji:"🏢" },
  { name:"Row House",          price: 145000,   emoji:"🏘️" },
  { name:"Bungalow",           price: 198000,   emoji:"🏚️" },
  { name:"Suburban Home",      price: 285000,   emoji:"🏡" },
  { name:"Lakeside Cottage",   price: 420000,   emoji:"🛖" },
  { name:"Modern Townhouse",   price: 610000,   emoji:"🏠" },
  { name:"Beach House",        price: 890000,   emoji:"🏖️" },
  { name:"Penthouse Loft",     price: 1250000,  emoji:"🌆" },
  { name:"Vineyard Villa",     price: 2100000,  emoji:"🍇" },
  { name:"Country Estate",     price: 3400000,  emoji:"🏰" },
  { name:"Ski Chalet",         price: 4800000,  emoji:"🎿" },
  { name:"Private Island",     price: 18000000, emoji:"🏝️" },
  { name:"Historic Castle",    price: 42000000, emoji:"🏯" },
  /* ---- the money-is-no-object tier ---- */
  { name:"Manhattan Penthouse", price: 68000000,    emoji:"🌃" },
  { name:"Aspen Mountain Lodge",    price: 84000000,    emoji:"🏔️" },
  { name:"Monaco Duplex",   price: 125000000,   emoji:"⚓" },
  { name:"Bel-Air Megamansion",     price: 168000000,   emoji:"🌴" },
  { name:"Highland Deer Estate",    price: 215000000,   emoji:"🦌" },
  { name:"Dubai Sky Villa",         price: 260000000,   emoji:"🕌" },
  { name:"Tuscan Village",   price: 340000000,   emoji:"🍷" },
  { name:"Caribbean Cay",   price: 480000000,   emoji:"🐚" },
  { name:"Alpine Fortress",         price: 620000000,   emoji:"⛰️" },
  { name:"Fifth Avenue Block",      price: 850000000,   emoji:"🏙️" },
  { name:"Doomsday Bunker", price: 1100000000,  emoji:"☢️" },
  { name:"Renaissance Palazzo",     price: 1600000000,  emoji:"🏛️" },
  { name:"A Royal Palace",    price: 2400000000,  emoji:"👑" },
  { name:"Private Archipelago",     price: 4200000000,  emoji:"🏝️" },
];

/* `dep` is the yearly value drift. Most vehicles bleed money; a handful of
   collectibles quietly beat the market, which is the whole point of them. */
export const CARS = [
  { name:"Rusted Hatchback",   price: 1400,    emoji:"🚗" },
  { name:"Scooter",            price: 2200,    emoji:"🛵" },
  { name:"Used Sedan",         price: 7800,    emoji:"🚙" },
  { name:"Motorcycle",         price: 12500,   emoji:"🏍️" },
  { name:"Hybrid Compact",     price: 28000,   emoji:"🚕" },
  { name:"Pickup Truck",       price: 34000,   emoji:"🛻" },
  { name:"Sport Coupe",        price: 46000,   emoji:"🚘" },
  { name:"Electric Saloon",    price: 62000,   emoji:"⚡" },
  { name:"Luxury SUV",         price: 92000,   emoji:"🚐" },
  { name:"Convertible",        price: 138000,  emoji:"🏖️" },
  { name:"Italian Supercar",   price: 310000,  emoji:"🏎️", dep:-0.06 },
  { name:"Vintage Roadster",   price: 780000,  emoji:"🚖", dep: 0.04 },
  { name:"Hypercar",           price: 2400000, emoji:"🏁", dep:-0.03 },
  /* ---- hangar, marina and private platform ---- */
  { name:"Armoured Limousine",      price: 480000,     emoji:"🛡️" },
  { name:"Expedition Truck",   price: 850000,     emoji:"🚜" },
  { name:"Track-Only Hyper GT",     price: 3600000,    emoji:"🛞", dep:-0.04 },
  { name:"Helicopter",              price: 5200000,    emoji:"🚁", dep:-0.07 },
  { name:"Le Mans Racer",   price: 9500000,    emoji:"🏆", dep: 0.06 },
  { name:"Coachbuilt One-Off",      price: 16000000,   emoji:"✨", dep: 0.03 },
  { name:"Airship",                 price: 24000000,   emoji:"🎈", dep:-0.09 },
  { name:"Formula One Car",         price: 32000000,   emoji:"🚦", dep: 0.02 },
  { name:"Personal Submarine",      price: 48000000,   emoji:"🤿", dep:-0.08 },
  { name:"Auction Legend",  price: 72000000,   emoji:"🥇", dep: 0.07 },
  { name:"Business Jet", price: 95000000,   emoji:"🛩️", dep:-0.08 },
  { name:"Private Luxury Train",    price: 140000000,  emoji:"🚂", dep:-0.04 },
  { name:"Sailing Superyacht",      price: 230000000,  emoji:"🚤", dep:-0.07 },
  { name:"VIP Airliner",            price: 420000000,  emoji:"🛫", dep:-0.09 },
  { name:"Gigayacht",               price: 900000000,  emoji:"🛳️", dep:-0.10 },
  { name:"Explorer Yacht",price: 1800000000, emoji:"🐋", dep:-0.10 },
];

export const LUXURY = [
  { name:"Gold Watch",         price: 6500,     emoji:"⌚", app: 0.02 },
  { name:"Diamond Ring",       price: 18000,    emoji:"💍", app: 0.03 },
  { name:"Designer Handbag",   price: 9000,     emoji:"👜", app:-0.05 },
  { name:"Vintage Guitar",     price: 24000,    emoji:"🎸", app: 0.05 },
  { name:"Abstract Painting",  price: 85000,    emoji:"🖼️", app: 0.08 },
  { name:"Antique Vase",       price: 42000,    emoji:"🏺", app: 0.04 },
  { name:"Rare Sculpture",     price: 260000,   emoji:"🗿", app: 0.07 },
  { name:"Racing Yacht",       price: 1400000,  emoji:"⛵", app:-0.09 },
  { name:"Superyacht",         price: 12000000, emoji:"🛥️", app:-0.07 },
  { name:"Private Jet",        price: 26000000, emoji:"✈️", app:-0.08 },
  /* ---- the auction-house tier ---- */
  { name:"Rare Whisky Cask",        price: 320000,     emoji:"🥃", app: 0.07 },
  { name:"Grand Cru Cellar",   price: 900000,     emoji:"🍾", app: 0.06 },
  { name:"Watch Collection",  price: 2600000,    emoji:"⏱️", app: 0.05 },
  { name:"Meteorite Fragment",      price: 3400000,    emoji:"☄️", app: 0.04 },
  { name:"Moon Rock",               price: 8000000,    emoji:"🌙", app: 0.09 },
  { name:"Blue Diamond",   price: 11000000,   emoji:"💎", app: 0.06 },
  { name:"Stradivarius Violin",     price: 16000000,   emoji:"🎻", app: 0.06 },
  { name:"Fabergé Egg",             price: 24000000,   emoji:"🥚", app: 0.05 },
  { name:"T-Rex Skeleton",          price: 32000000,   emoji:"🦖", app: 0.07 },
  { name:"Gutenberg Bible",         price: 38000000,   emoji:"📖", app: 0.05 },
  { name:"Founding Charter",        price: 46000000,   emoji:"📜", app: 0.04 },
  { name:"Apollo Capsule",   price: 60000000,   emoji:"🚀", app: 0.06 },
  { name:"A Queen's Emeralds",      price: 78000000,   emoji:"📿", app: 0.05 },
  { name:"Crown Jewel Ruby",        price: 95000000,   emoji:"💠", app: 0.05 },
  { name:"A Monet",price: 120000000,  emoji:"🎨", app: 0.07 },
  { name:"A Picasso",       price: 210000000,  emoji:"🖌️", app: 0.07 },
  { name:"A Lost Da Vinci",         price: 450000000,  emoji:"🧑‍🎨", app: 0.08 },
];

/* ============================================================
   EMPIRE — trophy holdings for people who have run out of things to own.
   Each one is a going concern: it throws off (or burns) cash every year,
   its valuation drifts, and some of them buy you fame instead of money.
     yield : annual profit as a fraction of valuation (can be negative)
     drift : annual valuation change
     fame  : fame per year while you hold it
   ============================================================ */
export const EMPIRE = [
  { id:"brewery",  name:"Craft Brewery",        emoji:"🍺", price: 2500000,     yield:[-0.04, 0.14], drift:[-0.05, 0.10], fame:0, blurb:"Small, stubborn, and yours" },
  { id:"resto",    name:"Michelin Restaurant",  emoji:"🍽️", price: 4500000,     yield:[-0.12, 0.10], drift:[-0.06, 0.09], fame:1, blurb:"Prestige per plate, losses per year" },
  { id:"hotel",    name:"Boutique Hotel",       emoji:"🏨", price: 9000000,     yield:[-0.03, 0.13], drift:[-0.04, 0.11], fame:1, blurb:"Twelve rooms and a permanent suite for you" },
  { id:"winery",   name:"Vineyard & Winery",    emoji:"🍇", price: 16000000,    yield:[-0.05, 0.11], drift:[-0.02, 0.12], fame:1, blurb:"A hobby that occasionally pays" },
  { id:"paper",    name:"City Newspaper",       emoji:"📰", price: 34000000,    yield:[-0.18, 0.04], drift:[-0.10, 0.04], fame:2, blurb:"Influence is the dividend" },
  { id:"radio",    name:"Radio Network",        emoji:"📻", price: 52000000,    yield:[-0.06, 0.12], drift:[-0.06, 0.08], fame:2, blurb:"Two hundred stations and a voice" },
  { id:"gallery",  name:"Blue-Chip Gallery",    emoji:"🖼️", price: 78000000,    yield:[-0.10, 0.18], drift:[-0.08, 0.14], fame:2, blurb:"You decide what art is worth" },
  { id:"ski",      name:"Ski Resort",           emoji:"🚡", price: 110000000,   yield:[-0.08, 0.12], drift:[-0.05, 0.10], fame:2, blurb:"A mountain, with a lift pass" },
  { id:"label",    name:"Record Label",         emoji:"💿", price: 160000000,   yield:[-0.16, 0.22], drift:[-0.14, 0.18], fame:3, blurb:"One hit pays for a decade of misses" },
  { id:"casino",   name:"Casino Resort",        emoji:"🎰", price: 320000000,   yield:[-0.10, 0.19], drift:[-0.10, 0.12], fame:3, blurb:"The house edge, wholesale" },
  { id:"studio",   name:"Film Studio",          emoji:"🎬", price: 520000000,   yield:[-0.24, 0.24], drift:[-0.16, 0.14], fame:4, blurb:"Green-light your own films" },
  { id:"airline",  name:"Regional Airline",     emoji:"🛬", price: 680000000,   yield:[-0.18, 0.10], drift:[-0.14, 0.08], fame:3, blurb:"The fastest way to become a millionaire" },
  { id:"football", name:"Football Club",        emoji:"⚽", price: 950000000,   yield:[-0.18, 0.06], drift:[-0.08, 0.18], fame:6, blurb:"A city's love, rented by the year" },
  { id:"f1",       name:"Formula One Team",     emoji:"🏁", price: 1400000000,  yield:[-0.20, 0.08], drift:[-0.10, 0.16], fame:5, blurb:"The costliest way to lose on Sundays" },
  { id:"bank",     name:"Private Bank",         emoji:"💰", price: 1900000000,  yield:[-0.08, 0.16], drift:[-0.11, 0.13], fame:2, blurb:"Other people's money, kept safe" },
  { id:"hoops",    name:"Basketball Team", emoji:"🏀", price: 2800000000,  yield:[-0.10, 0.10], drift:[-0.08, 0.20], fame:6, blurb:"The valuations only ever go up. Mostly" },
  { id:"mine",     name:"Diamond Mine",         emoji:"⛏️", price: 3400000000,  yield:[-0.16, 0.26], drift:[-0.18, 0.16], fame:1, blurb:"A hole in the ground, with security" },
  { id:"social",   name:"Social Network",       emoji:"📱", price: 4600000000,  yield:[-0.26, 0.30], drift:[-0.30, 0.34], fame:7, blurb:"Buy the town square. Regret it publicly" },
  { id:"oil",      name:"Offshore Oil Field",   emoji:"🛢️", price: 6200000000,  yield:[-0.18, 0.28], drift:[-0.22, 0.16], fame:1, blurb:"A rig, a pipeline and a great many lawyers" },
  { id:"news",     name:"Global News Network",  emoji:"📡", price: 7500000000,  yield:[-0.16, 0.12], drift:[-0.12, 0.10], fame:9, blurb:"Set the agenda for a whole planet" },
  { id:"rocket",   name:"Rocket Company",       emoji:"🛸", price: 9500000000,  yield:[-0.32, 0.22], drift:[-0.22, 0.32], fame:8, blurb:"Reusable, eventually" },
  { id:"chip",     name:"Chip Foundry",         emoji:"🔬", price: 14000000000, yield:[-0.14, 0.26], drift:[-0.18, 0.22], fame:4, blurb:"Everything on earth waits on your queue" },
];

/* ============================================================
   LEGACY — money that never comes back. Buys standing, not assets:
   permanent fame, a lasting lift in happiness, and a line in the obituary.
   ============================================================ */
export const LEGACY = [
  /* Status */
  { id:"lordship",  group:"Status", name:"A Lordship",           emoji:"🎩", price: 250000,      fame: 2,  happy: 6,  blurb:"A Scottish title and a very small field", done:"You bought a Scottish lordship. Technically, you now own a field" },
  { id:"racehorse", group:"Status", name:"Racing Stable",            emoji:"🐎", price: 4000000,     fame: 4,  happy: 10, blurb:"Your colours in the winner's enclosure", done:"You set up a racing stable and put your colours on a jockey" },
  { id:"doctorate", group:"Status", name:"Honorary Doctorate",       emoji:"🎓", price: 6000000,     fame: 4,  happy: 8,  blurb:"A donation, and suddenly you're a Doctor", done:"The university awarded you an honorary doctorate. You are, technically, a Doctor" },
  { id:"passport",  group:"Status", name:"Golden Passport",          emoji:"🛂", price: 12000000,    fame: 2,  happy: 8,  blurb:"Citizenship, purchased outright", done:"You bought a second citizenship outright. No queue, no test", effect:"citizenship" },
  { id:"stadium",   group:"Status", name:"Name a Stadium",    emoji:"🏟️", price: 60000000,    fame: 12, happy: 12, blurb:"Sixty thousand people say your name", done:"The stadium carries your name now. Sixty thousand people say it every other Saturday" },
  { id:"knight",    group:"Status", name:"A Knighthood",  emoji:"🗡️", price: 90000000,    fame: 14, happy: 16, blurb:"Arise. Nobody asks what it cost", done:"You were knighted. Nobody asked what it cost" },
  /* Experiences */
  { id:"trench",    group:"Experiences", name:"Dive the Trench", emoji:"🌊", price: 900000,   fame: 3,  happy: 14, blurb:"Eleven kilometres down, alone", done:"You rode a submersible eleven kilometres down and sat alone on the sea floor" },
  { id:"summit",    group:"Experiences", name:"Climb Everest",   emoji:"🗻", price: 1600000,  fame: 4,  happy: 16, blurb:"Every possible sherpa, oxygen and helicopter", done:"You were guided to the summit of Everest, with every possible sherpa and helicopter" },
  { id:"space",     group:"Experiences", name:"A Trip to Orbit",           emoji:"🚀", price: 55000000, fame: 15, happy: 26, blurb:"Eleven days on the station. Worth it", done:"You went to orbit. Eleven days up there, and you came back different" },
  { id:"moonseat",  group:"Experiences", name:"Around the Moon",  emoji:"🌑", price: 380000000,fame: 24, happy: 32, blurb:"The tenth human to see the far side", done:"You flew around the far side of the Moon. Only nine people had ever seen it" },
  /* Philanthropy */
  { id:"school",    group:"Philanthropy", name:"Fund a School",            emoji:"🏫", price: 5000000,     fame: 3,  happy: 12, blurb:"Four hundred kids, every year, forever", done:"You funded a school. Four hundred children go there every year now" },
  { id:"chair",     group:"Philanthropy", name:"Endow a Chair", emoji:"📚", price: 25000000,    fame: 5,  happy: 12, blurb:"The Chair in your family's name", done:"You endowed a university chair in your family's name" },
  { id:"hospital",  group:"Philanthropy", name:"A Hospital Wing",    emoji:"🏥", price: 90000000,    fame: 10, happy: 18, blurb:"Your name over the doors that matter", done:"You paid for a new hospital wing. Your name is over the doors that matter" },
  { id:"museum",    group:"Philanthropy", name:"Found an Art Museum",      emoji:"🏛️", price: 400000000,   fame: 16, happy: 20, blurb:"Free entry, in perpetuity", done:"You founded an art museum. Free entry, in perpetuity" },
  { id:"forest",    group:"Philanthropy", name:"Save a Rainforest",emoji:"🌳", price: 750000000,  fame: 14, happy: 24, blurb:"Two million hectares, taken off the market", done:"You bought two million hectares of rainforest and took it off the market for good" },
  { id:"vaccine",   group:"Philanthropy", name:"Vaccinate a Nation", emoji:"🧬", price: 1500000000,  fame: 20, happy: 28, blurb:"A disease stops spreading because of you", done:"You funded a vaccine programme. A disease stopped spreading because of you" },
  { id:"telescope", group:"Philanthropy", name:"A Space Telescope",  emoji:"🔭", price: 2800000000,  fame: 18, happy: 26, blurb:"It will still be looking long after you", done:"You funded a space telescope. It will still be looking long after you are gone" },
  { id:"foundation",group:"Philanthropy", name:"A Global Foundation",emoji:"🕊️", price: 5000000000,  fame: 26, happy: 30, blurb:"Gives away more each year than most countries", done:"You endowed a global foundation. It gives away more each year than some countries" },
  { id:"mars",      group:"Philanthropy", name:"The First Mars Crew", emoji:"🪐", price: 12000000000, fame: 34, happy: 34, blurb:"Six people, and your name on the plaque", done:"You funded the first crewed mission to Mars. Six people, and your name on the plaque" },
  { id:"cure",      group:"Philanthropy", name:"Cure a Disease",  emoji:"🧪", price: 20000000000, fame: 45, happy: 40, blurb:"It simply stops existing. Because of you", done:"You funded the cure. The disease simply stopped existing" },
];

export const PETS = [
  { name:"Hamster", emoji:"🐹", price: 60,    life:[2,4] },
  { name:"Goldfish",emoji:"🐠", price: 25,    life:[1,5] },
  { name:"Cat",     emoji:"🐈", price: 350,   life:[12,20] },
  { name:"Dog",     emoji:"🐕", price: 600,   life:[9,16] },
  { name:"Rabbit",  emoji:"🐇", price: 180,   life:[6,10] },
  { name:"Snake",   emoji:"🐍", price: 480,   life:[10,20] },
  { name:"Parrot",  emoji:"🦜", price: 900,   life:[25,50] },
  { name:"Pony",    emoji:"🐎", price: 14000, life:[20,30] },
];

/* ---------- Heirlooms: survive your death and pass to your heir ---------- */
export const HEIRLOOMS = [
  { id:"watch",  name:"Grandfather's Watch", emoji:"⌚", price: 25000,   perk:"smarts",    bonus:6,  blurb:"+6 smarts for every heir who carries it" },
  { id:"ring",   name:"Family Signet Ring",  emoji:"💍", price: 60000,   perk:"looks",     bonus:6,  blurb:"+6 looks, generation after generation" },
  { id:"violin", name:"Antique Violin",      emoji:"🎻", price: 180000,  perk:"happiness", bonus:8,  blurb:"+8 happiness to whoever inherits it" },
  { id:"medal",  name:"War Medal",           emoji:"🎖️", price: 40000,   perk:"health",    bonus:5,  blurb:"+5 health and a story to live up to" },
  { id:"estate", name:"Ancestral Portrait",  emoji:"🖼️", price: 320000,  perk:"fame",      bonus:10, blurb:"+10 starting fame for your line" },
];

/* ---------- Investments ---------- */
export const INVESTMENTS = [
  { id:"savings", name:"Savings Account",  emoji:"🏦", mean: 0.02, vol: 0.005, min: 100 },
  { id:"bonds",   name:"Government Bonds", emoji:"📜", mean: 0.04, vol: 0.03,  min: 500 },
  { id:"index",   name:"Index Fund",       emoji:"📈", mean: 0.065, vol: 0.16,  min: 500 },
  { id:"stocks",  name:"Individual Stocks",emoji:"📊", mean: 0.08, vol: 0.34,  min: 1000 },
  { id:"crypto",  name:"Cryptocurrency",   emoji:"🪙", mean: 0.11, vol: 0.95,  min: 100 },
  { id:"startup", name:"Startup Equity",   emoji:"🚀", mean: 0.13, vol: 1.40,  min: 5000 },
];

/* ---------- Insurance ---------- */
export const INSURANCE = [
  { id:"health", name:"Health Insurance", emoji:"🏥", premium: 2400, covers:"medical bills" },
  { id:"home",   name:"Home Insurance",   emoji:"🏠", premium: 1200, covers:"damage to your property" },
  { id:"car",    name:"Car Insurance",    emoji:"🚗", premium: 900,  covers:"vehicle write-offs" },
  { id:"life",   name:"Life Insurance",   emoji:"🕊️", premium: 1500, covers:"a payout to your heirs" },
  { id:"pet",    name:"Pet Insurance",    emoji:"🐾", premium: 400,  covers:"veterinary bills" },
];


/* ============================================================
   VICE — 18+ only. Gated on the adult switch AND age 18+.
   Each substance trades a high against health, addiction risk and the
   chance of being caught holding.
   ============================================================ */
export const DRUGS = [
  { id:"weed",   name:"Weed",        emoji:"\uD83C\uDF3F", price: 60,   high:[6,14],  health:[1,5],   addict:0.04, bust:0.06, deal:[200,3000] },
  { id:"shroom", name:"Mushrooms",   emoji:"\uD83C\uDF44", price: 90,   high:[10,26], health:[2,7],   addict:0.03, bust:0.07, deal:[300,4000] },
  { id:"mdma",   name:"Ecstasy",     emoji:"\uD83D\uDC8A", price: 110,  high:[14,30], health:[4,12],  addict:0.10, bust:0.12, deal:[600,9000] },
  { id:"lsd",    name:"Acid",        emoji:"\uD83C\uDF00", price: 130,  high:[12,32], health:[3,10],  addict:0.05, bust:0.11, deal:[500,7000] },
  { id:"ket",    name:"Ketamine",    emoji:"\uD83C\uDF7C", price: 150,  high:[10,24], health:[6,16],  addict:0.16, bust:0.14, deal:[800,12000] },
  { id:"coke",   name:"Cocaine",     emoji:"\u2744\uFE0F", price: 320,  high:[16,32], health:[6,18],  addict:0.22, bust:0.18, deal:[2000,40000] },
  { id:"speed",  name:"Speed",       emoji:"\u26A1", price: 140,  high:[12,26], health:[8,20],  addict:0.24, bust:0.16, deal:[900,14000] },
  { id:"meth",   name:"Meth",        emoji:"\uD83D\uDD25", price: 180,  high:[18,36], health:[14,32], addict:0.42, bust:0.26, deal:[1500,30000] },
  { id:"heroin", name:"Heroin",      emoji:"\uD83D\uDC80", price: 200,  high:[20,40], health:[16,36], addict:0.48, bust:0.28, deal:[1800,35000] },
];

/* Sex work, both directions. Tiers differ in pay, danger and how likely
   you are to be arrested or recognised. */
export const SEXWORK = [
  { id:"street", name:"Street Work",      emoji:"\uD83C\uDF03", pay:[80,600],     risk:0.30, harm:[6,18], stigma:8 },
  { id:"parlour",name:"Massage Parlour",  emoji:"\uD83D\uDC86", pay:[300,1800],   risk:0.16, harm:[3,10], stigma:5 },
  { id:"escort", name:"Escorting",        emoji:"\uD83D\uDC84", pay:[600,6000],   risk:0.10, harm:[2,8],  stigma:4 },
  { id:"agency", name:"High-End Agency",  emoji:"\uD83E\uDD42", pay:[2000,25000], risk:0.06, harm:[1,6],  stigma:3 },
];

/* ============================================================
   CRIME
   ============================================================ */
export const CRIMES = [
  { id:"shoplift", name:"Shoplift",          risk:0.30, min:20,     max:900,     sentence:[1,2] },
  { id:"pickpock", name:"Pickpocket",        risk:0.38, min:40,     max:1800,    sentence:[1,3] },
  { id:"porch",    name:"Steal a Package",   risk:0.34, min:30,     max:1200,    sentence:[1,2] },
  { id:"graffiti", name:"Vandalise Property",risk:0.40, min:0,      max:0,       sentence:[1,2] },
  { id:"scam",     name:"Run a Scam",        risk:0.42, min:800,    max:35000,   sentence:[2,5] },
  { id:"cyber",    name:"Cyber Crime",       risk:0.45, min:2000,   max:180000,  sentence:[3,8], smartCrime:true },
  { id:"burglary", name:"Burglary",          risk:0.48, min:1500,   max:60000,   sentence:[3,7] },
  { id:"extort",   name:"Extortion",         risk:0.52, min:3000,   max:90000,   sentence:[4,9] },
  { id:"gta",      name:"Grand Theft Auto",  risk:0.55, min:5000,   max:120000,  sentence:[4,9] },
  { id:"launder",  name:"Launder Money",     risk:0.50, min:8000,   max:250000,  sentence:[5,11], smartCrime:true },
  { id:"jewel",    name:"Rob a Jeweller",    risk:0.62, min:20000,  max:400000,  sentence:[6,14] },
  { id:"bank",     name:"Rob a Bank",        risk:0.68, min:40000,  max:900000,  sentence:[8,20] },
  { id:"train",    name:"Rob a Train",       risk:0.72, min:80000,  max:1500000, sentence:[10,22] },
  { id:"heist",    name:"Casino Heist",      risk:0.78, min:200000, max:5000000, sentence:[14,30] },
];

/* ---------- Casino games ---------- */
export const CASINO = [
  { id:"slots",     name:"Slot Machines", emoji:"🎰", win:0.30, pay:[1.8, 12] },
  { id:"roulette",  name:"Roulette",      emoji:"🔴", win:0.47, pay:[2.0, 2.0] },
  { id:"blackjack", name:"Blackjack",     emoji:"🃏", win:0.49, pay:[1.72, 2.2], skill:0.10 },
  { id:"poker",     name:"Poker",         emoji:"♠️", win:0.44, pay:[1.68, 2.6], skill:0.22 },
  { id:"horses",    name:"Horse Racing",  emoji:"🐎", win:0.26, pay:[2.9, 9 ], skill:0.06 },
];

/* ---------- Prison gangs ---------- */
export const GANGS = ["the Iron Wolves","the Southside Kings","La Sombra","the Dockyard Crew","the Blackthorn Family"];

/* ============================================================
   ACTIVITIES (menu metadata — behaviour lives in the engine)
   ============================================================ */
export const ACTIVITIES = [
  /* Mind & Body */
  { id:"gym",        group:"Mind & Body", name:"Go to the Gym",        emoji:"🏋️", sub:"Health & looks up", cost:400 },
  { id:"meditate",   group:"Mind & Body", name:"Meditate",             emoji:"🧘", sub:"Free · happiness up", cost:0 },
  { id:"library",    group:"Mind & Body", name:"Read at the Library",  emoji:"📚", sub:"Free · smarts up", cost:0 },
  { id:"martial",    group:"Mind & Body", name:"Martial Arts Class",   emoji:"🥋", sub:"Health & discipline", cost:700 },
  { id:"music",      group:"Mind & Body", name:"Music Lessons",        emoji:"🎹", sub:"Smarts & happiness", cost:900 },
  { id:"doctor",     group:"Mind & Body", name:"See a Doctor",         emoji:"🩺", sub:"Restore health", cost:900 },
  { id:"dentist",    group:"Mind & Body", name:"See a Dentist",        emoji:"🦷", sub:"Looks & health", cost:500 },
  { id:"therapy",    group:"Mind & Body", name:"See a Therapist",      emoji:"🛋️", sub:"Big happiness boost", cost:2600 },
  { id:"spa",        group:"Mind & Body", name:"Spa Day",              emoji:"💆", sub:"Looks & happiness", cost:800 },
  { id:"surgery",    group:"Mind & Body", name:"Cosmetic Surgery",     emoji:"💉", sub:"Expensive · can go wrong", cost:12000 },
  { id:"tattoo",     group:"Mind & Body", name:"Get a Tattoo",         emoji:"🖋️", sub:"Looks may go either way", cost:400 },
  { id:"diet",       group:"Mind & Body", name:"Go on a Diet",         emoji:"🥗", sub:"Health & looks, less fun", cost:0 },

  /* Leisure */
  { id:"vacation",   group:"Leisure", name:"Take a Holiday",       emoji:"🏖️", cost:3500 },
  { id:"party",      group:"Leisure", name:"Go Out Partying",      emoji:"🎉", cost:300 },
  { id:"nightclub",  group:"Leisure", name:"Hit the Nightclub",    emoji:"🕺", cost:500 },
  { id:"cinema",     group:"Leisure", name:"Go to the Cinema",     emoji:"🍿", cost:60 },
  { id:"concert",    group:"Leisure", name:"See a Concert",        emoji:"🎫", cost:220 },
  { id:"hunting",    group:"Leisure", name:"Go Hunting",           emoji:"🏹", cost:600 },
  { id:"fishing",    group:"Leisure", name:"Go Fishing",           emoji:"🎣", cost:150 },
  { id:"skydive",    group:"Leisure", name:"Go Skydiving",         emoji:"🪂", sub:"Thrilling · slightly lethal", cost:400 },
  { id:"volunteer",  group:"Leisure", name:"Volunteer",            emoji:"🤝", sub:"Free · good for the soul", cost:0 },
  { id:"protest",    group:"Leisure", name:"Join a Protest",       emoji:"📢", sub:"Risk of arrest", cost:0 },
  { id:"emigrate",   group:"Leisure", name:"Emigrate",             emoji:"✈️", sub:"Move to another country", cost:5000 },

  /* Love */
  { id:"date",       group:"Love", name:"Dating App",      emoji:"💘", min:16, sub:"Find a partner", cost:0 },
  { id:"hookup",     group:"Love", name:"Hook Up",         emoji:"🔥", min:18, cost:0 },
  { id:"blinddate",  group:"Love", name:"Blind Date",      emoji:"🕶️", min:18, sub:"A friend sets you up", cost:0 },
];

/* ============================================================
   DEATH
   ============================================================ */
export const DEATHS_OLD = ["old age","a heart attack","a stroke","pneumonia","organ failure","complications from surgery","natural causes in their sleep","a long illness"];
export const DEATHS_ANY = ["a car accident","a house fire","a rare infection","a fall down the stairs","choking on a sandwich","a lightning strike","an allergic reaction","a swimming accident","a freak gym accident","food poisoning","an electrical fault","a cycling accident","a falling piano","a bee sting"];

/* ---------- End-of-life ribbons ---------- */
export const RIBBONS = [
  { id:"rich",      name:"Loaded",        test:g => g.__net > 5000000 },
  { id:"famous",    name:"Famous",        test:g => g.fame >= 70 },
  { id:"scholar",   name:"Scholar",       test:g => g.diplomas.grad && g.stats.smarts >= 85 },
  { id:"villain",   name:"Villain",       test:g => g.criminalRecord >= 5 },
  { id:"jailbird",  name:"Jailbird",      test:g => g.yearsJailed >= 10 },
  { id:"lothario",  name:"Heartbreaker",  test:g => g.rels.filter(r => r.type === "ex").length >= 4 },
  { id:"family",    name:"Family Person", test:g => g.rels.filter(r => r.type === "child").length >= 4 },
  { id:"lonely",    name:"Solitary",      test:g => g.rels.filter(r => r.alive).length === 0 },
  { id:"healthy",   name:"Well-Lived",    test:g => g.age >= 95 },
  { id:"kind",      name:"Beloved",       test:g => g.stats.happiness >= 90 && g.rels.filter(r => r.rel > 80).length >= 3 },
  { id:"mogul",     name:"Mogul",         test:g => g.assets.houses.length >= 5 },
  { id:"deadbeat",  name:"Deadbeat",      test:g => g.money < 0 },
  { id:"billion",   name:"Billionaire",   test:g => g.__net >= 1000000000 },
  { id:"tycoon",    name:"Tycoon",        test:g => (g.assets.empire || []).length >= 3 },
  { id:"collector", name:"Collector",     test:g => g.assets.luxury.length >= 8 },
  { id:"benefactor",name:"Benefactor",    test:g => (g.legacy || []).length >= 3 },
  { id:"saint",     name:"Saint",         test:g => (g.legacy || []).reduce((s, x) => s + (x.spent || 0), 0) >= 1000000000 },
];

/* ---------- helpers re-exported for convenience ---------- */
export { pick, rint, chance, money, clamp } from "./util.js";
