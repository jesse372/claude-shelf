/* ============================================================
   AnotherLife — culture, class and migration
   Events gated on archetype (arch / archAny), country, heritage, or
   simply on having moved at all (migrant).
   ============================================================ */
import { pick, rint, chance, money, afford, local } from "./util.js";

/* A coin flip that is remembered for the life of the character.

   A low `w` does NOT make a childhood event rare: the pool of events a
   six-year-old is eligible for is tiny, an unseen event is weighted up 3x, and
   the window is a dozen years wide — so a small weight only delays it. Uprooting
   the family is a once-in-a-childhood thing that should shape a minority of
   lives, so the roll happens once, per life, and is remembered. */
const rareLife = (g, key, p) => {
  const F = g.flags || (g.flags = {});
  if (F[key] === undefined) F[key] = Math.random() < p;
  return F[key];
};

/* You can only be uprooted as a child once. Both childhood migration events
   require you to still be where you started, which is also what stops them
   chaining: emigrate to Australia and you would otherwise immediately qualify
   for the expat-dad event and be off to Bali two years later. */
const stillHome = g => g.heritage === g.country.name;

export const CULTURE = [
/* ---------------- AUSTRALIA ---------------- */
{ id:"c_bogan_ute", arch:"bogan", min:17, max:60, w:6, choice:{
    text:"There's a ute for sale down the road. It's rough, it's loud, and it's yours if you want it.",
    choices:[
      { label:"Buy it", run:g=>{ const c=local(g,rint(3000,12000));
          if(g.money<c) return { text:"You couldn't get the money together in time.", stats:{happiness:-8} };
          g.assets.cars.push({id:'ute'+Date.now(),name:"Ute",emoji:"🛻",value:c,bought:g.age,age:0});
          return { text:`You bought the ute for ${money(g,c)}. It is now your entire personality.`, money:-c, stats:{happiness:+18} };} },
      { label:"Be sensible", run:()=>({text:"You bought something with a warranty and felt nothing.",stats:{happiness:-4,smarts:+3}}) },
    ]}},
{ id:"c_bogan_bunnings", arch:"bogan", min:18, max:75, w:5, auto:()=>({
    text:`You spent Saturday at Bunnings and came home with a snag, a plant you'll kill, and something you didn't need.`, stats:{ happiness:+9 } }) },
{ id:"c_eshay_train", arch:"eshay", min:13, max:24, w:6, choice:{
    text:"The boys want to jump the barriers and ride the line into the city.",
    choices:[
      { label:"Go with them", run:g=>chance(0.7)?({text:"You spent the day in the city and got home before anyone noticed.",stats:{happiness:+12}}):({text:"Transit officers were waiting at the other end.",money:-afford(g,local(g,rint(100,600))),stats:{happiness:-10}}) },
      { label:"Pay for a ticket", run:()=>({text:"You tapped on like a mug and never heard the end of it.",stats:{happiness:-4,smarts:+2}}) },
      { label:"Stay home", run:()=>({text:"You stayed home. They stopped asking.",stats:{happiness:-6}}) },
    ]}},
{ id:"c_eshay_polo", arch:"eshay", min:13, max:22, w:5, auto:g=>({
    text:`You saved up for the polo and the bum bag. The look is the whole point.`, money:-afford(g,local(g,rint(80,400))), stats:{ happiness:+11 } }) },
{ id:"c_tradie_apprentice", arch:"tradie", min:16, max:22, w:6, once:true, choice:{
    text:"Your uncle can get you an apprenticeship, starting Monday.",
    choices:[
      { label:"Take it", run:g=>({text:"Four years of terrible pay and then very good pay.",money:+local(g,rint(8000,20000)),stats:{health:+6,smarts:+4,happiness:+10},takeAnyJob:true}) },
      { label:"Finish school first", run:()=>({text:"You finished school. The offer was still there.",stats:{smarts:+6}}) },
      { label:"Not for you", run:()=>({text:"You told him it wasn't for you and he took it badly.",stats:{happiness:-6}}) },
    ]}},
{ id:"c_surfer_dawn", arch:"surfer", min:12, max:70, w:5, auto:()=>({
    text:`You were in the water before sunrise and the rest of the day couldn't touch you.`, stats:{ happiness:+12, health:+5 } }) },
{ id:"c_private_rowing", arch:"privateschool", min:13, max:19, w:5, choice:{
    text:"The rowing squad trains at half four in the morning. Your father rowed.",
    choices:[
      { label:"Row", run:()=>({text:"You rowed for five years and it built something in you.",stats:{health:+12,happiness:+4,smarts:+2}}) },
      { label:"Refuse", run:g=>{const p=g.rels.find(r=>r.type==="father"&&r.alive);
          return { text:"You refused. It was mentioned at every family gathering for a decade.", stats:{happiness:+4}, relAdj:p?{id:p.id,d:-15}:null };} },
    ]}},
{ id:"c_farm_drought", arch:"farmkid", min:8, max:60, w:5, auto:g=>({
    text:`The drought broke the neighbours before it broke you. Half the district sold up.`, money:-afford(g,local(g,rint(500,9000))), stats:{ happiness:-12, health:-3 } }) },

/* ---------------- UNITED KINGDOM ---------------- */
{ id:"c_roadman_food", arch:"roadman", min:14, max:30, w:6, choice:{
    text:"Someone's offering you fifty quid to hold something for a week. No questions.",
    choices:[
      { label:"Hold it", run:g=>chance(0.6)?({text:"You held it, handed it back, took the money.",money:+local(g,rint(40,300)),stats:{happiness:+4}}):({text:"Police came through the door at six in the morning.",arrest:{name:"possession with intent",sentence:[2,5]}}) },
      { label:"Say no", run:()=>({text:"You said no. They found someone else within the hour.",stats:{smarts:+4,happiness:-2}}) },
    ]}},
{ id:"c_roadman_drill", arch:"roadman", min:14, max:28, w:5, choice:{
    text:"Your mate's recording drill in his bedroom and wants you on the track.",
    choices:[
      { label:"Spit a verse", run:g=>chance(0.35)?({text:"🎤 It did numbers. People started recognising you.",fame:+rint(6,18),money:+local(g,rint(100,6000)),stats:{happiness:+16}}):({text:"It got four hundred views and your mum found it.",stats:{happiness:+4}}) },
      { label:"Just film it", run:()=>({text:"You shot the video instead and got better at it.",stats:{smarts:+5,happiness:+6}}) },
    ]}},
{ id:"c_posh_shooting", arch:"posh", min:14, max:70, w:5, auto:g=>({
    text:`You spent the weekend at somebody's estate being shown how to hold a gun properly.`, stats:{ happiness:+8, health:+2 } }) },
{ id:"c_posh_name", arch:"posh", min:18, max:60, w:5, choice:{
    text:"A friend of your father's has offered you a job you are not remotely qualified for.",
    choices:[
      { label:"Take it", run:g=>({text:"You took it. You were fine at it, eventually, which was the galling part.",money:+local(g,rint(8000,60000)),stats:{happiness:+8,smarts:+3},takeAnyJob:true}) },
      { label:"Refuse on principle", run:()=>({text:"You turned it down and made your own way, slower.",stats:{happiness:+6,smarts:+6}}) },
    ]}},
{ id:"c_chav_lambrini", arch:"chav", min:14, max:30, w:5, auto:()=>({
    text:`You spent Friday night in the park with a bottle of something blue and it was, honestly, brilliant.`, stats:{ happiness:+11, health:-4 } }) },
{ id:"c_casual_awayday", arch:"casual", min:15, max:55, w:6, choice:{
    text:"There's an away day and the other lot have been mouthing off all week.",
    choices:[
      { label:"Go for the match", run:()=>({text:"You went, sang for ninety minutes, and came home hoarse.",stats:{happiness:+14,health:-2}}) },
      { label:"Go for the other thing", run:g=>chance(0.55)?({text:"It went off outside the ground and you came away buzzing.",stats:{happiness:+12,health:-8}}):({text:"Police kettled the lot of you and you got a banning order.",arrest:{name:"violent disorder",sentence:[1,3]}}) },
      { label:"Watch it in the pub", run:()=>({text:"You watched it in the pub like a sensible adult.",stats:{happiness:+6}}) },
    ]}},

/* ---------------- UNITED STATES ---------------- */
{ id:"c_hood_corner", arch:"hood", min:13, max:35, w:6, choice:{
    text:"The older guys on the corner have started talking to you like you're one of them.",
    choices:[
      { label:"Get involved", run:g=>chance(0.5)?({text:"The money was better than anything else on offer.",money:+local(g,rint(500,15000)),stats:{happiness:+6}}):({text:"It went wrong in the first month.",arrest:{name:"dealing",sentence:[3,8]}}) },
      { label:"Keep walking", run:()=>({text:"You kept your head down and kept walking.",stats:{smarts:+5,happiness:-4}}) },
      { label:"Get out of the neighbourhood", run:g=>({text:"You spent every spare hour somewhere else.",stats:{smarts:+7,happiness:+4}}) },
    ]}},
{ id:"c_frat_rush", arch:"frat", min:18, max:23, w:6, choice:{
    text:"Rush week. The house you want is making pledges do things that aren't strictly legal.",
    choices:[
      { label:"Do whatever it takes", run:g=>chance(0.7)?({text:"You got in. The connections lasted longer than the hangover.",stats:{happiness:+16,health:-8,smarts:-2}}):({text:"You ended up in hospital and the house was suspended.",stats:{health:-25,happiness:-14}}) },
      { label:"Draw a line", run:()=>chance(0.4)?({text:"They respected it and took you anyway.",stats:{happiness:+12,smarts:+4}}):({text:"You weren't offered a place.",stats:{happiness:-8}}) },
      { label:"Skip Greek life", run:()=>({text:"You didn't rush and had a perfectly good time.",stats:{smarts:+5,happiness:+4}}) },
    ]}},
{ id:"c_trailer_tornado", arch:"trailer", min:5, max:60, w:5, auto:g=>({
    text:`A storm came through and took the roof off half the park. Everyone helped everyone.`, money:-afford(g,local(g,rint(200,4000))), stats:{ happiness:-8, health:-4 } }) },
{ id:"c_cowboy_rodeo", arch:"cowboy", min:14, max:45, w:5, choice:{
    text:"There's prize money at the rodeo and you've been practising on the neighbour's stock.",
    choices:[
      { label:"Ride", run:g=>chance(0.4)?({text:"🤠 Eight seconds and the buckle.",money:+local(g,rint(300,9000)),fame:+rint(2,7),stats:{happiness:+18,health:-6}}):({text:"You were off in three and it hurt for a month.",stats:{health:-18,happiness:-6}}) },
      { label:"Watch", run:()=>({text:"You watched from the rail and said you'd enter next year.",stats:{happiness:+4}}) },
    ]}},
{ id:"c_tech_garage", arch:"techkid", min:15, max:30, w:6, once:true, choice:{
    text:"The thing you built in your bedroom has started getting real users.",
    choices:[
      { label:"Drop everything for it", run:g=>chance(0.35)?({text:"💻 It took off. Someone offered to buy it before you turned twenty-five.",money:+local(g,rint(50000,3000000)),fame:+rint(6,18),stats:{happiness:+26}}):({text:"You gave it two years and it went nowhere.",stats:{happiness:-16,smarts:+8}}) },
      { label:"Keep it a side project", run:g=>({text:"You kept it running at weekends and it paid for holidays.",money:+local(g,rint(2000,40000)),stats:{happiness:+10,smarts:+5}}) },
      { label:"Sell it now", run:g=>({text:"You sold it early for a sum that seemed enormous at the time.",money:+local(g,rint(5000,120000)),stats:{happiness:+12}}) },
    ]}},

/* ---------------- ELSEWHERE ---------------- */
{ id:"c_striver_exam", arch:"striver", min:15, max:22, w:7, choice:{
    text:"The entrance exams are everything. Your parents have not stopped saying so.",
    choices:[
      { label:"Study until you break", run:g=>chance(0.55)?({text:"You got the rank. The whole street heard about it.",stats:{smarts:+14,happiness:+12,health:-8}}):({text:"You missed it by a hundred places and your father didn't speak for a week.",stats:{smarts:+8,happiness:-22,health:-8}}) },
      { label:"Do your best and accept it", run:()=>({text:"You did what you could and made your peace with the result.",stats:{smarts:+6,happiness:+2}}) },
      { label:"Tell them you want something else", run:g=>{const p=g.rels.find(r=>(r.type==="father"||r.type==="mother")&&r.alive);
          return chance(0.35)?({text:"They listened, eventually.",stats:{happiness:+16},relAdj:p?{id:p.id,d:-10}:null})
                             :({text:"They did not listen, and you sat the exams anyway.",stats:{happiness:-18},relAdj:p?{id:p.id,d:-20}:null});} },
    ]}},
{ id:"c_salaryman_nomikai", arch:"salaryman", min:22, max:60, w:6, req:g=>!!g.job, choice:{
    text:"Your section chief expects you at drinks. Again. It is not really optional.",
    choices:[
      { label:"Go every time", run:g=>({text:"You went to all of them and were marked as reliable.",stats:{health:-8,happiness:-6,smarts:+2}}) },
      { label:"Go sometimes", run:()=>({text:"You went to enough of them to get away with it.",stats:{health:-3,happiness:+2}}) },
      { label:"Stop going", run:()=>chance(0.5)?({text:"Nobody said anything, but you stopped being invited to things.",stats:{happiness:-8}}):({text:"You were quietly moved sideways.",stats:{happiness:-14}}) },
    ]}},
{ id:"c_otaku_con", arch:"otaku", min:14, max:50, w:5, auto:g=>({
    text:`You spent a fortune at a convention and met people who cared about exactly what you care about.`, money:-afford(g,local(g,rint(100,2500))), stats:{ happiness:+16 } }) },
{ id:"c_yankii_bike", arch:"yankii", min:15, max:28, w:5, choice:{
    text:"The group is riding out tonight and the exhausts have been modified specifically to annoy people.",
    choices:[
      { label:"Ride", run:g=>chance(0.7)?({text:"You rode until dawn and felt untouchable.",stats:{happiness:+14,health:-4}}):({text:"Police stopped the whole group.",money:-afford(g,local(g,rint(200,2000))),stats:{happiness:-10}}) },
      { label:"Stay in", run:()=>({text:"You stayed in. They noticed.",stats:{happiness:-6}}) },
    ]}},
{ id:"c_favela_football", arch:"favela", min:8, max:22, w:6, choice:{
    text:"A scout has been watching the pitch behind the block.",
    choices:[
      { label:"Give it everything", run:g=>chance(0.25)?({text:"⚽ You were signed to an academy. Everything changed.",money:+local(g,rint(2000,60000)),fame:+rint(8,22),stats:{happiness:+26,health:+8}}):({text:"They took someone else. You played on anyway.",stats:{happiness:-10,health:+5}}) },
      { label:"Stay in school", run:()=>({text:"You chose the books. Nobody in the block understood it.",stats:{smarts:+9,happiness:-4}}) },
    ]}},
{ id:"c_lagos_hustle", arch:"lagos", min:15, max:55, w:6, choice:{
    text:"You've spotted a gap. It needs a small amount of money you don't quite have.",
    choices:[
      { label:"Borrow it and go", run:g=>chance(0.5)?({text:"It worked. You paid the loan back in six weeks.",money:+local(g,rint(500,40000)),stats:{happiness:+16,smarts:+5}}):({text:"It didn't work and the loan was still due.",money:-afford(g,local(g,rint(200,8000))),stats:{happiness:-14}}) },
      { label:"Save up first", run:g=>({text:"By the time you'd saved it, three other people were doing it.",stats:{happiness:-6,smarts:+4}}) },
    ]}},
{ id:"c_township_taxi", arch:"township", min:12, max:60, w:5, auto:g=>({
    text:`The taxi rank was closed by a dispute and you walked two hours each way for a week.`, stats:{ health:+3, happiness:-8 } }) },
{ id:"c_exam_hagwon", archAny:["examkid","gaokao"], min:13, max:20, w:6, choice:{
    text:"You're at the cram school until eleven and then there's homework.",
    choices:[
      { label:"Keep up", run:()=>({text:"You kept up and it cost you your teens.",stats:{smarts:+12,health:-10,happiness:-14}}) },
      { label:"Start skipping", run:g=>chance(0.5)?({text:"You skipped, nobody found out, and you slept.",stats:{health:+8,happiness:+12,smarts:-4}}):({text:"They rang your parents.",stats:{happiness:-16}}) },
      { label:"Tell your parents it's too much", run:()=>chance(0.4)?({text:"They pulled you out. It was the kindest thing they ever did.",stats:{happiness:+20,health:+8,smarts:-3}}):({text:"They told you everyone finds it hard.",stats:{happiness:-12}}) },
    ]}},
{ id:"c_hockey_scout", arch:"hockey", min:12, max:22, w:5, choice:{
    text:"There are scouts at the tournament this weekend.",
    choices:[
      { label:"Play your game", run:g=>chance(0.3)?({text:"🏒 You were drafted. Your dad cried in the car park.",money:+local(g,rint(5000,200000)),fame:+rint(6,18),stats:{happiness:+24}}):({text:"You played well and nobody called.",stats:{happiness:-8,health:+4}}) },
      { label:"Try to impress", run:()=>chance(0.2)?({text:"The highlight-reel goal worked.",fame:+rint(4,12),stats:{happiness:+18}}):({text:"You overplayed it and looked selfish.",stats:{happiness:-10}}) },
    ]}},

/* ---------------- MIGRATION ---------------- */
{ id:"c_family_migrate", min:3, max:15, w:3, once:true,
  req:g=>stillHome(g)
     && ["India","Nigeria","Brazil","Mexico","China","Philippines","South Africa","Vietnam"].includes(g.country.name)
     && rareLife(g, "mig_family", 0.15), choice:{
    text:g=>`Your parents have been talking in the kitchen for weeks. They want to move the family abroad.`,
    choices:[
      { label:"Go", run:g=>{ const dest=pick(["Australia","United Kingdom","United States","Canada","New Zealand"]);
          return { text:`You left everything you knew.`, migrateTo:dest,
            migrateText:`✈️ Your family emigrated from ${g.country.name} to ${dest}. You were ${g.age}.`,
            stats:{happiness:-12,smarts:+6} };} },
      { label:"Beg to stay", run:g=>chance(0.3)?({text:"They stayed, and you always wondered what the other life would have been.",stats:{happiness:+6}}):
          (()=>{ const dest=pick(["Australia","United Kingdom","Canada"]);
            return { text:"You had no say in it.", migrateTo:dest,
              migrateText:`✈️ The family moved to ${dest} anyway.`, stats:{happiness:-20,smarts:+5} };})() },
    ]}},
{ id:"c_expat_dad", min:4, max:16, w:3, once:true,
  req:g=>stillHome(g)
     && ["Australia","United Kingdom","United States","Canada","New Zealand","Ireland"].includes(g.country.name)
     && rareLife(g, "mig_expat", 0.15), choice:{
    text:"Your dad's online business has taken off and he's talking about running it from somewhere warm.",
    choices:[
      { label:"Bali", run:g=>({ text:"He was serious.", migrateTo:"Indonesia",
          migrateText:`✈️ The family moved to Bali. Dad works from a café with a laptop and a very good tan.`,
          stats:{happiness:+14,smarts:+4,health:+4} }) },
      { label:"Thailand", run:g=>({ text:"He booked the flights that week.", migrateTo:"Thailand",
          migrateText:`✈️ The family moved to Chiang Mai. School was international and strange and brilliant.`,
          stats:{happiness:+12,smarts:+5} }) },
      { label:"Talk him out of it", run:g=>({ text:"You talked him out of it. The business did fine anyway.", stats:{happiness:-4,smarts:+3} }) },
    ]}},
{ id:"c_migrant_school", migrant:true, min:6, max:18, w:7, choice:{
    text:g=>`You're the ${g.heritage} kid at a ${g.country.name} school and everyone has decided that's your whole identity.`,
    choices:[
      { label:"Lean into it", run:()=>({text:"You made it the joke before anyone else could, and it worked.",stats:{happiness:+10,smarts:+4}}) },
      { label:"Assimilate hard", run:()=>({text:"You dropped the accent, the lunches, the lot. It worked, and it cost something.",stats:{happiness:+4,smarts:+2}}) },
      { label:"Find the others", run:()=>({text:"You found the other kids like you and they became everything.",stats:{happiness:+16}}) },
      { label:"Fight about it", run:()=>chance(0.5)?({text:"You made it stop.",stats:{happiness:+8,health:-5}}):({text:"You got suspended and it didn't stop.",stats:{happiness:-14,health:-6}}) },
    ]}},
{ id:"c_migrant_parents", migrant:true, min:12, max:40, w:6, choice:{
    text:g=>`Your parents gave up careers in ${g.heritage} to bring you here, and they remind you.`,
    choices:[
      { label:"Live up to it", run:g=>{const p=g.rels.find(r=>(r.type==="mother"||r.type==="father")&&r.alive);
          return { text:"You worked twice as hard as anyone around you and it showed.", stats:{smarts:+10,happiness:-6}, relAdj:p?{id:p.id,d:+20}:null };} },
      { label:"Resent it", run:g=>{const p=g.rels.find(r=>(r.type==="mother"||r.type==="father")&&r.alive);
          return { text:"You told them you never asked them to. Nobody won that one.", stats:{happiness:-14}, relAdj:p?{id:p.id,d:-22}:null };} },
      { label:"Say thank you properly", run:g=>{const p=g.rels.find(r=>(r.type==="mother"||r.type==="father")&&r.alive);
          return { text:"You sat them down and said it out loud. Your mother cried.", stats:{happiness:+18}, relAdj:p?{id:p.id,d:+30}:null };} },
    ]}},
{ id:"c_migrant_return", migrant:true, min:22, max:70, w:5, once:true, choice:{
    text:g=>`You've been offered the chance to go back to ${g.heritage} for work.`,
    choices:[
      { label:"Go back", run:g=>({ text:"You went back.", migrateTo:g.heritage,
          migrateText:`✈️ You returned to ${g.heritage} after a lifetime away. It was not how you remembered it.`,
          money:+local(g,rint(2000,40000)), stats:{happiness:+8,smarts:+6} }) },
      { label:"Visit first", run:g=>({ text:`You went for a month and realised you were a tourist there now.`, money:-afford(g,local(g,rint(1000,6000))), stats:{happiness:-6,smarts:+6} }) },
      { label:"Stay", run:()=>({ text:"You stayed. This is home, whatever the paperwork says.", stats:{happiness:+6} }) },
    ]}},
{ id:"c_expat_bubble", min:18, max:75, w:5, req:g=>["Indonesia","Thailand","Vietnam","United Arab Emirates","Portugal","Philippines"].includes(g.country.name) && g.heritage !== g.country.name, choice:{
    text:g=>`You've been in ${g.country.name} for years and still only know other expats.`,
    choices:[
      { label:"Learn the language properly", run:()=>({text:"You put in the hours and the country opened up.",stats:{smarts:+10,happiness:+16}}) },
      { label:"Stay in the bubble", run:()=>({text:"You stayed in the bubble. It was comfortable and slightly embarrassing.",stats:{happiness:+4}}) },
      { label:"Go home", run:g=>({ text:"You'd had enough.", migrateTo:g.heritage, migrateText:`✈️ You moved back to ${g.heritage}.`, stats:{happiness:+6} }) },
    ]}},
{ id:"c_visa_stress", migrant:true, min:20, max:60, w:5, req:g=>!(g.citizenships||[]).includes(g.country.name), choice:{
    text:g=>`Your visa is up for renewal and the rules have changed again.`,
    choices:[
      { label:"Pay a lawyer", run:g=>{const c=local(g,rint(1500,9000));
          return g.money<c?({text:"You couldn't afford one and did it yourself, badly.",stats:{happiness:-14}}):({text:"The lawyer sorted it in a fortnight.",money:-c,stats:{happiness:+8}});} },
      { label:"Do the forms yourself", run:()=>chance(0.6)?({text:"You got it through on your own.",stats:{happiness:+10,smarts:+5}}):({text:"It was refused on a technicality and you had to start again.",stats:{happiness:-18}}) },
      { label:"Marry someone", run:g=>{const p=g.rels.find(r=>r.type==="partner"&&r.alive);
          return p?({text:`You and ${p.name} brought the wedding forward. Everyone knew why.`,stats:{happiness:+4}}):({text:"You had nobody to marry, which rather closed that avenue.",stats:{happiness:-10}});} },
    ]}},
];
