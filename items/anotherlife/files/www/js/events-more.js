/* ============================================================
   AnotherLife — further scenarios
   A third event file, kept separate so each stays readable.
   ============================================================ */
import { pick, rint, chance, money, an, afford, local } from "./util.js";

export const MORE = [
/* ---------------- CHILDHOOD ---------------- */
{ id:"m_recital", min:6, max:13, w:4, choice:{
    text:"You have a part in the school concert and you have not practised.",
    choices:[
      { label:"Practise every night", run:()=>chance(0.75)?({text:"You were the best thing in it and your parents wouldn't shut up.",stats:{happiness:+14,smarts:+3}}):({text:"You practised and still froze.",stats:{happiness:-8}}) },
      { label:"Wing it",              run:()=>chance(0.35)?({text:"You winged it and got away with it entirely.",stats:{happiness:+10}}):({text:"It was a disaster and it was filmed.",stats:{happiness:-12}}) },
      { label:"Pretend to be ill",    run:()=>({text:"You faked a temperature and watched telly instead.",stats:{happiness:+3,smarts:-2}}) },
    ]}},
{ id:"m_lostpet", min:5, max:14, w:4, req:g=>g.pets.length>0, choice:{
    text:g=>{ const p=g.pets[0]; return p ? `${p.name} has got out and nobody can find ${p.kind === "Dog" ? "him" : "them"}.`
      : "Your pet has got out and nobody can find them."; },
    choices:[
      { label:"Search all night", run:g=>chance(0.6)?({text:"You found them three streets away at 2am, filthy and delighted.",stats:{happiness:+16,health:-4}}):({text:"You never found them. You still look, sometimes.",stats:{happiness:-22},removePet:g.pets[0]&&g.pets[0].id}) },
      { label:"Put up posters",   run:g=>chance(0.45)?({text:"Someone rang the number. They'd been fed for a week.",stats:{happiness:+14}}):({text:"Nobody rang.",stats:{happiness:-18},removePet:g.pets[0]&&g.pets[0].id}) },
    ]}},
{ id:"m_sleepover", min:6, max:13, w:4, choice:{
    text:"You've been invited to a sleepover and you have never slept anywhere but home.",
    choices:[
      { label:"Go", run:()=>chance(0.7)?({text:"You stayed up until four and ate crisps for breakfast.",stats:{happiness:+13,health:-2}}):({text:"You rang your mum at eleven to come and get you.",stats:{happiness:-8}}) },
      { label:"Stay home", run:()=>({text:"You stayed home and heard about it for weeks.",stats:{happiness:-6}}) },
    ]}},
{ id:"m_swimbadge", min:6, max:12, w:3, auto:()=>({ text:`You earned your ${pick(["25m","50m","100m","survival"])} swimming badge and wore the patch everywhere.`, stats:{ health:+5, happiness:+8 } }) },
{ id:"m_grandparent", min:5, max:16, w:4, req:g=>g.rels.some(r=>r.alive&&(r.type==="grandmother"||r.type==="grandfather")), choice:{
    text:g=>{ const gp=g.rels.find(r=>r.alive&&(r.type==="grandmother"||r.type==="grandfather"));
      return `${gp ? gp.name : "Your grandparent"} has offered to teach you something they know.`; },
    choices:[
      { label:"Learn it properly", run:g=>{const gp=g.rels.find(r=>r.alive&&(r.type==="grandmother"||r.type==="grandfather"));
          return { text:`You learned ${pick(["to fish","to bake","carpentry","chess","the family recipes","to fix an engine"])} from them. You still use it.`, stats:{smarts:+7,happiness:+14}, relAdj:gp?{id:gp.id,d:+25}:null };} },
      { label:"Sit through it politely", run:()=>({text:"You were bored and you have regretted that since.",stats:{happiness:-4}}) },
    ]}},
{ id:"m_bikestolen", min:7, max:15, w:3, auto:()=>({ text:`Your bike was stolen from outside the shop. You'd only gone in for a drink.`, stats:{ happiness:-12 } }) },
{ id:"m_bestfriend", min:6, max:14, w:4, auto:()=>({ text:`You and ${pick(["a boy","a girl"])} in your class became inseparable overnight for no reason either of you could explain.`, stats:{ happiness:+13 } }) },

/* ---------------- TEENS ---------------- */
{ id:"m_firstjob_teen", min:14, max:18, w:5, choice:{
    text:"There's a Saturday job going at the shop on the corner.",
    choices:[
      { label:"Take it", run:g=>({text:"You worked Saturdays for two years and learned what work is.",money:+local(g,rint(600,4000)),stats:{happiness:+6,smarts:+4}}) },
      { label:"Hold out for something better", run:g=>chance(0.4)?({text:"Something better came along.",money:+local(g,rint(1500,7000)),stats:{happiness:+10}}):({text:"Nothing better came along.",stats:{happiness:-6}}) },
      { label:"Don't bother", run:()=>({text:"You spent the year doing nothing in particular, which was lovely.",stats:{happiness:+6}}) },
    ]}},
{ id:"m_fakeid", min:15, max:19, w:5, choice:{
    text:"Someone can get you a fake ID for the price of a night out.",
    choices:[
      { label:"Get one", run:g=>{const c=local(g,rint(20,200));
          if(g.money<c) return {text:"You couldn't put your hands on the cash, and the offer quietly went away.",stats:{happiness:-6}};
          return chance(0.65)?({text:"It worked for two years and you were untouchable.",money:-c,stats:{happiness:+14}}):({text:"The bouncer confiscated it and rang the police for a laugh.",money:-c,stats:{happiness:-12}});} },
      { label:"Don't",   run:()=>({text:"You waited it out like a law-abiding coward.",stats:{happiness:-3,smarts:+2}}) },
    ]}},
{ id:"m_exams", min:15, max:18, w:6, choice:{
    text:"Exams are in eight weeks and you have not opened a book.",
    choices:[
      { label:"Revise properly", run:g=>({text:"You worked flat out and it showed.",stats:{smarts:+rint(6,14),happiness:-6}}) },
      { label:"Cram the week before", run:g=>chance(0.45)?({text:"You crammed and somehow it stuck.",stats:{smarts:+rint(2,7),happiness:-3}}):({text:"You crammed and remembered none of it.",stats:{smarts:-3,happiness:-10}}) },
      { label:"Accept your fate", run:()=>({text:"You went in cold and it went how you'd expect.",stats:{smarts:-5,happiness:-6}}) },
    ]}},
{ id:"m_drivinggift", min:16, max:19, w:4, req:g=>g.rels.some(r=>r.alive&&(r.type==="mother"||r.type==="father")), choice:{
    text:"Your parents have offered to help with a first car if you put in half.",
    choices:[
      { label:"Save up your half", run:g=>({text:"You saved for a year and drove away in something terrible and beloved.",money:-afford(g,local(g,rint(400,3000))),stats:{happiness:+18}}) },
      { label:"Ask them to cover it all", run:g=>{const p=g.rels.find(r=>r.alive&&(r.type==="mother"||r.type==="father"));
          return chance(0.35)?({text:"They caved. You did not learn much from it.",stats:{happiness:+12},relAdj:p?{id:p.id,d:-8}:null})
                             :({text:"They said no, and meant it.",stats:{happiness:-8}});} },
      { label:"Say you don't need one", run:()=>({text:"You cycled everywhere and were fitter for it.",stats:{health:+8,happiness:+2}}) },
    ]}},
{ id:"m_bandpractice", min:14, max:19, w:3, auto:()=>({ text:`You spent every weekend in a garage learning ${pick(["three chords","one riff","a drum fill"])} very loudly.`, stats:{ happiness:+9 } }) },
{ id:"m_summerjob", min:16, max:20, w:4, auto:g=>{ const amt=rint(800,5000);
    return { text:`You spent the summer ${pick(["picking fruit","in a call centre","behind a bar","on a building site","in a kitchen"])} and saved ${money(g,amt)}.`, money:+amt, stats:{ health:-3, smarts:+3 } }; } },

/* ---------------- YOUNG ADULT ---------------- */
{ id:"m_flatshare", min:19, max:35, w:5, choice:{
    text:"Your flatmate hasn't paid rent in two months and won't discuss it.",
    choices:[
      { label:"Cover it for now", run:g=>({text:"You covered them, and they never paid it back.",money:-afford(g,local(g,rint(800,5000))),stats:{happiness:-10}}) },
      { label:"Give them notice", run:()=>chance(0.6)?({text:"They left, badly, and you slept better.",stats:{happiness:+6}}):({text:"It got ugly and the landlord got involved.",stats:{happiness:-14}}) },
      { label:"Move out yourself", run:g=>({text:"You left rather than fight about it.",money:-afford(g,local(g,rint(500,3000))),stats:{happiness:-4}}) },
    ]}},
{ id:"m_backpack", min:18, max:32, w:4, once:true, choice:{
    text:"Everyone you know is going travelling and you could just go with them.",
    choices:[
      { label:"Go for a year", run:g=>({text:`You spent a year in ${pick(["South America","southeast Asia","eastern Europe","west Africa"])} and came back different.`,money:-afford(g,local(g,rint(3000,18000))),stats:{happiness:+26,smarts:+8,health:-3}}) },
      { label:"Go for a month", run:g=>({text:"You went for a month and wished you'd gone for longer.",money:-afford(g,local(g,rint(800,4000))),stats:{happiness:+14,smarts:+3}}) },
      { label:"Stay and work",  run:g=>({text:"You stayed, worked, and saved what they spent.",money:+local(g,rint(2000,15000)),stats:{happiness:-6}}) },
    ]}},
{ id:"m_masters", min:21, max:40, w:4, req:g=>g.diplomas.uni&&!g.diplomas.grad, choice:{
    text:"You could go back and do a master's, if you can stomach the fees.",
    choices:[
      { label:"Do it full time", run:g=>{const c=local(g,rint(9000,26000));
          return g.money<c?({text:"You couldn't fund it and let it go.",stats:{happiness:-8}}):({text:"You went back and it reset your career.",money:-c,stats:{smarts:+14,happiness:+10}});} },
      { label:"Study part time", run:g=>({text:"Three years of evenings. Exhausting and worth it.",money:-afford(g,local(g,rint(4000,14000))),stats:{smarts:+10,happiness:-4,health:-4}}) },
      { label:"Leave it", run:()=>({text:"You decided experience would do.",stats:{happiness:+2}}) },
    ]}},
{ id:"m_wedding_cost", min:22, max:45, w:4, req:g=>g.married, choice:{
    text:"The wedding you're planning has quietly doubled in price.",
    choices:[
      { label:"Pay for the big one", run:g=>({text:"It was beautiful and it cost more than a car.",money:-afford(g,local(g,rint(15000,80000))),stats:{happiness:+18}}) },
      { label:"Cut it right back",   run:g=>({text:"Registry office and a pub afterwards. Everyone said it was the best one they'd been to.",money:-afford(g,local(g,rint(500,4000))),stats:{happiness:+14,smarts:+4}}) },
      { label:"Elope",               run:g=>({text:"You told nobody until it was done. Some people have still not forgiven you.",money:-afford(g,local(g,rint(300,3000))),stats:{happiness:+10}}) },
    ]}},
{ id:"m_promotion_move", min:24, max:55, w:4, req:g=>!!g.job, choice:{
    text:"There's a promotion going, but it's four hundred miles away.",
    choices:[
      { label:"Take it and move", run:g=>{ if(!g.job) return {text:"The job had gone by then.",stats:{happiness:-4}};
          g.job.salary=Math.round(g.job.salary*1.4);
          return { text:`You moved for the job. Now on ${money(g,g.job.salary)}/yr, and you know nobody.`, stats:{happiness:-6}, kind:"good" }; } },
      { label:"Commute weekly", run:g=>({text:"You lived out of a suitcase for two years.",stats:{happiness:-14,health:-8}}) },
      { label:"Turn it down",   run:()=>({text:"You stayed put, and they gave it to someone else.",stats:{happiness:-6}}) },
    ]}},
{ id:"m_freelance", min:22, max:60, w:4, req:g=>!!g.job, choice:{
    text:"You've been offered enough work on the side to go freelance.",
    choices:[
      { label:"Jump", run:g=>chance(0.45)?({text:"It worked. You'll never go back to an office.",fire:true,money:+local(g,rint(5000,90000)),stats:{happiness:+20}}):({text:"The work dried up in four months.",fire:true,money:+local(g,rint(500,8000)),stats:{happiness:-18}}) },
      { label:"Do both for a year", run:g=>({text:"You worked every evening and weekend for a year.",money:+local(g,rint(3000,40000)),stats:{health:-12,happiness:-4}}) },
      { label:"Stay employed", run:()=>({text:"You turned it down and kept the pension.",stats:{happiness:-2,smarts:+2}}) },
    ]}},

/* ---------------- MIDDLE AGE ---------------- */
{ id:"m_school_run", min:32, max:55, w:4, req:g=>g.rels.some(r=>r.type==="child"&&r.alive&&r.age>=4&&r.age<=11), choice:{
    text:"Your child's school has asked whether you'd stand as a parent governor.",
    choices:[
      { label:"Stand", run:g=>{const k=g.rels.find(r=>r.type==="child"&&r.alive);
          return { text:"You did four years of meetings about drains and were quietly proud of it.", stats:{happiness:+8,smarts:+4}, relAdj:k?{id:k.id,d:+12}:null };} },
      { label:"Decline", run:()=>({text:"You said you didn't have the time, which was true.",stats:{happiness:-2}}) },
    ]}},
{ id:"m_divorce_friends", min:33, max:60, w:2, choice:{
    text:"Two of your closest friends are divorcing and both want you on their side.",
    choices:[
      { label:"Stay friends with both", run:()=>chance(0.5)?({text:"You managed it, just about.",stats:{happiness:+6,smarts:+4}}):({text:"You lost them both by trying.",stats:{happiness:-16}}) },
      { label:"Pick a side", run:()=>({text:"You picked, and kept one good friend out of two.",stats:{happiness:-6}}) },
      { label:"Withdraw", run:()=>({text:"You made yourself scarce until it was over.",stats:{happiness:-8}}) },
    ]}},
{ id:"m_inherit_house", min:35, max:70, w:4, once:true, req:g=>g.rels.some(r=>!r.alive&&(r.type==="mother"||r.type==="father")), choice:{
    text:"You've inherited a house you don't want, four hours away.",
    choices:[
      { label:"Sell it", run:g=>({text:"You sold it and split the proceeds with everyone who asked.",money:+local(g,rint(30000,600000)),stats:{happiness:+6}}) },
      { label:"Rent it out", run:g=>{const val=rint(80000,500000);
          g.assets.houses.push({id:'inh'+Date.now(),name:"Inherited House",emoji:"🏚️",value:val,bought:g.age,age:0});
          return { text:"You kept it and let it out. Tenants are a job you didn't apply for.", stats:{happiness:+4} };} },
      { label:"Move into it", run:g=>{const val=rint(80000,500000);
          g.assets.houses.push({id:'inh'+Date.now(),name:"The Family House",emoji:"🏡",value:val,bought:g.age,age:0});
          return { text:"You moved into the house you grew up in. It was strange for about a year.", stats:{happiness:+10}, endHomeless:true };} },
    ]}},
{ id:"m_redundant_again", min:40, max:60, w:4, req:g=>!g.job&&!g.special&&g.age>45, choice:{
    text:"Nobody is calling you back, and you've started to suspect it's your age.",
    choices:[
      { label:"Retrain completely", run:g=>({text:"You retrained at fifty and started again at the bottom.",money:-afford(g,local(g,rint(1000,12000))),stats:{smarts:+10,happiness:+8}}) },
      { label:"Take anything going", run:g=>({text:"You took work well below what you'd done before.",stats:{happiness:-12},takeAnyJob:true}) },
      { label:"Go self-employed",    run:g=>chance(0.5)?({text:"You went out on your own and it suited you.",money:+local(g,rint(2000,40000)),stats:{happiness:+14}}):({text:"You went out on your own and it did not work.",money:-afford(g,local(g,rint(500,8000))),stats:{happiness:-16}}) },
    ]}},
{ id:"m_affair_partner", min:32, max:65, w:4, req:g=>g.married, choice:{
    text:"You've found something on your partner's phone that you cannot unsee.",
    choices:[
      { label:"Confront them", run:g=>{const p=g.rels.find(r=>r.type==="partner"&&r.alive);
          return chance(0.4)?({text:"There was an explanation, and it held.",stats:{happiness:-8},relAdj:p?{id:p.id,d:-10}:null})
                            :({text:"There was no explanation. It ended there.",stats:{happiness:-30},divorce:true});} },
      { label:"Say nothing and watch", run:()=>({text:"You said nothing for a year and it ate you.",stats:{happiness:-22,health:-6}}) },
      { label:"Leave first", run:g=>({text:"You left before they could explain. You'll never be sure.",stats:{happiness:-20},divorce:true}) },
    ]}},

/* ---------------- SENIOR ---------------- */
{ id:"m_grandkid_born", min:48, max:90, w:5, req:g=>g.rels.some(r=>r.type==="child"&&r.alive&&r.age>=20), auto:()=>({
    text:`You became a grandparent. You held them and understood something new.`, stats:{ happiness:+24 } }) },
{ id:"m_driving_night", min:66, max:92, w:4, choice:{
    text:"You've started avoiding driving at night without admitting why.",
    choices:[
      { label:"Get your eyes tested", run:g=>({text:"New glasses, and the world came back.",money:-afford(g,local(g,rint(100,900))),stats:{happiness:+10,health:+3}}) },
      { label:"Only drive in daylight", run:()=>({text:"You quietly reorganised your life around the light.",stats:{happiness:-4,smarts:+2}}) },
      { label:"Carry on regardless", run:()=>chance(0.7)?({text:"You got away with it.",stats:{happiness:+2}}):({text:"You clipped a parked car and it shook you badly.",stats:{health:-10,happiness:-14}}) },
    ]}},
{ id:"m_old_letters", min:65, max:99, w:4, choice:{
    text:"You've found a box of letters from someone you haven't thought about in forty years.",
    choices:[
      { label:"Read them all", run:()=>({text:"You read the lot in one sitting and cried at the kitchen table.",stats:{happiness:+8}}) },
      { label:"Try to find them", run:()=>chance(0.45)?({text:"You found them. They were glad you called.",stats:{happiness:+22}}):({text:"They had died in 2019.",stats:{happiness:-16}}) },
      { label:"Burn them", run:()=>({text:"You burned them in the garden and felt lighter.",stats:{happiness:+6}}) },
    ]}},
{ id:"m_care_home_visit", min:60, max:95, w:4, req:g=>g.rels.some(r=>r.alive&&(r.type==="mother"||r.type==="father")&&r.age>80), choice:{
    text:"Your parent no longer reliably knows who you are.",
    choices:[
      { label:"Visit every week regardless", run:g=>{const p=g.rels.find(r=>r.alive&&(r.type==="mother"||r.type==="father"));
          return { text:"You went every week for years. Some days they knew you.", stats:{happiness:-6,health:-2}, relAdj:p?{id:p.id,d:+20}:null };} },
      { label:"Visit when you can", run:()=>({text:"You went when you could and felt guilty the rest of the time.",stats:{happiness:-10}}) },
      { label:"Stop going", run:()=>({text:"You stopped. You told yourself they wouldn't know.",stats:{happiness:-18}}) },
    ]}},
{ id:"m_last_house", min:70, max:97, w:3, auto:()=>({ text:`You outlived most of the people on your street. New families keep moving in and you keep learning names.`, stats:{ happiness:-4, smarts:+2 } }) },

/* ---------------- SYSTEM-LINKED ---------------- */
{ id:"m_licence_lost", min:20, max:85, w:3, req:g=>g.licences&&g.licences.car, auto:g=>{ g.licences.car=false;
    return { text:`You were banned from driving for ${rint(6,36)} months. You'll have to sit the test again.`, stats:{ happiness:-16 }, kind:"bad" }; } },
{ id:"m_secondopinion", min:30, max:95, w:5, req:g=>(g.conditions||[]).length>0, choice:{
    text:"A friend keeps telling you to get a second opinion on your diagnosis.",
    choices:[
      { label:"Get one", run:g=>chance(0.25)?({text:"The second doctor found something the first had missed, and it was better news.",clearCondition:true,stats:{happiness:+22,health:+10}}):({text:"The second opinion matched the first.",stats:{happiness:-4,smarts:+3}}) },
      { label:"Trust the first", run:()=>({text:"You stuck with your doctor.",stats:{happiness:+2}}) },
      { label:"Try something alternative", run:g=>({text:"You spent a fortune on things with no evidence behind them.",money:-afford(g,local(g,rint(500,9000))),stats:{happiness:+6,health:-4}}) },
    ]}},
{ id:"m_jury_big", min:21, max:70, w:1, choice:{
    text:"You're on the jury for a murder trial and the room is split eleven to one.",
    choices:[
      { label:"You're the one", run:()=>chance(0.4)?({text:"You held out and eventually turned the room.",stats:{happiness:+16,smarts:+6}}):({text:"You held out for four days and then caved.",stats:{happiness:-12,smarts:+4}}) },
      { label:"Go with the room", run:()=>({text:"You went with the majority and have wondered about it since.",stats:{happiness:-8,smarts:+2}}) },
    ]}},
{ id:"m_viral_lawsuit", min:20, max:70, w:3, req:g=>g.fame>=30, choice:{
    text:"A brand has used your face in an advert without asking.",
    choices:[
      { label:"Sue them", run:g=>chance(0.6)?({text:"They settled quickly and quietly.",money:+local(g,rint(5000,300000)),stats:{happiness:+16}}):({text:"Their lawyers buried you in paperwork until you gave up.",money:-afford(g,local(g,rint(2000,30000))),stats:{happiness:-16}}) },
      { label:"Ask for a fee instead", run:g=>({text:"You negotiated a fee and an apology.",money:+local(g,rint(2000,80000)),stats:{happiness:+10}}) },
      { label:"Let it go", run:()=>({text:"You decided the exposure was worth more than the fight.",fame:+rint(2,8)}) },
    ]}},
{ id:"m_pandemic", min:5, max:99, w:1, once:true, choice:{
    text:"A new virus is spreading and the country is shutting down.",
    choices:[
      { label:"Follow every rule", run:g=>({text:"You did everything right and were bored out of your mind.",stats:{health:+4,happiness:-16}}) },
      { label:"Bend the rules", run:g=>chance(0.6)?({text:"You saw people you shouldn't have and got away with it.",stats:{happiness:+8,health:-6}}):({text:"You caught it badly and were laid up for weeks.",stats:{health:-24,happiness:-12}}) },
      { label:"Make money from it", run:g=>chance(0.4)?({text:"You spotted a gap and made a great deal of money very fast.",money:+local(g,rint(5000,400000)),stats:{happiness:+14}}):({text:"You bought stock nobody wanted and sat on it.",money:-afford(g,local(g,rint(1000,30000))),stats:{happiness:-12}}) },
    ]}},
{ id:"m_disaster", min:12, max:99, w:1, choice:{
    text:g=>`A ${pick(["flood","wildfire","earthquake","hurricane"])} has hit ${g.city} and you have twenty minutes.`,
    choices:[
      { label:"Take the photographs", run:()=>({text:"You grabbed the albums and nothing else. You have never regretted it.",stats:{happiness:+10}}) },
      { label:"Take the valuables", run:g=>({text:"You saved what was worth money.",money:+local(g,rint(500,20000)),stats:{happiness:-6}}) },
      { label:"Help the neighbours", run:()=>chance(0.7)?({text:"You got three people out. You lost everything you owned.",fame:+rint(3,10),stats:{happiness:+18}}):({text:"You tried to help and were badly hurt doing it.",stats:{health:-25,happiness:-10}}) },
    ]}},
{ id:"m_charity_run", min:16, max:75, w:1, choice:{
    text:"Someone has signed you up for a charity run and told everyone.",
    choices:[
      { label:"Train and do it", run:()=>({text:"You trained for months and finished it, slowly.",stats:{health:+12,happiness:+16}}) },
      { label:"Turn up untrained", run:()=>chance(0.5)?({text:"You finished on spite alone.",stats:{health:-6,happiness:+12}}):({text:"You pulled up at nine miles and got a lift back.",stats:{health:-10,happiness:-8}}) },
      { label:"Just donate", run:g=>({text:"You paid rather than ran, which everyone understood.",money:-afford(g,local(g,rint(50,600))),stats:{happiness:+4}}) },
    ]}},
{ id:"m_reunion_band", min:35, max:70, w:3, req:g=>g.flags&&g.flags.band, choice:{
    text:"The band is talking about getting back together for one night.",
    choices:[
      { label:"Do it", run:g=>chance(0.6)?({text:"🎸 You sold out a room of two hundred people who all knew the words.",money:+local(g,rint(200,9000)),fame:+rint(3,10),stats:{happiness:+22}}):({text:"Nobody came, and you remembered why you stopped.",stats:{happiness:-12}}) },
      { label:"Let it lie", run:()=>({text:"You let it stay a good memory.",stats:{happiness:+4}}) },
    ]}},
{ id:"m_neighbour_dies", min:25, max:95, w:1, choice:{
    text:"The neighbour you nodded at for fifteen years has died, and nobody has claimed the cat.",
    choices:[
      { label:"Take the cat", run:()=>({text:"You took the cat. It hated you for a year and then didn't.",stats:{happiness:+12},addPet:"Cat"}) },
      { label:"Call the shelter", run:()=>({text:"The shelter took it. You still think about it.",stats:{happiness:-5}}) },
      { label:"Go to the funeral", run:()=>({text:"You went. There were six people there and you were glad you'd come.",stats:{happiness:+6}}) },
    ]}},
{ id:"m_scam_invest", min:25, max:80, w:1, choice:{
    text:"Someone very confident is offering returns that sound too good to be true.",
    choices:[
      { cost:g=>`${money(g,afford(g,g.money*0.3))} \u2014 30% of your money`, label:"Put money in", run:g=>chance(0.2)?({text:"Astonishingly, it paid out.",money:+local(g,rint(3000,80000)),stats:{happiness:+18}}):({text:"It was exactly what it sounded like.",money:-afford(g,Math.round(g.money*0.3)),stats:{happiness:-22}}) },
      { label:"Ask hard questions", run:()=>({text:"They stopped returning your calls, which told you everything.",stats:{smarts:+6,happiness:+4}}) },
      { label:"Report them", run:()=>chance(0.5)?({text:"They were shut down. Several people thanked you.",stats:{happiness:+14,smarts:+4}}):({text:"Nothing came of it and they're still going.",stats:{happiness:-6}}) },
    ]}},
];
