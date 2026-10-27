/* ============================================================
   AnotherLife — life events
   { id, min, max, w, once?, req?(g), and either auto(g) or choice{} }
   Results may carry: text, stats, money, fame, kind, fire, removePet,
   addPet, relAdj, divorce, arrest, insuranceClaim, flags.
   `flags` is how multi-year storylines chain: one choice sets a flag,
   later events gate on it with req.
   ============================================================ */
import { pick, rint, chance, money, an, afford, local } from "./util.js";
import { FIRST_M, FIRST_F, SPECIAL } from "./data.js";
import { someone, stranger, neighbour, outside, inside, timeOfDay, weather, smallObject, smallSum, container, livingKin } from "./weave.js";

const anyName = () => pick(FIRST_M.concat(FIRST_F));
const F = g => g.flags || (g.flags = {});
const sdef = g => SPECIAL.find(x => x.id === (g.special && g.special.id)) || null;
const addictHook = (g,kind) => { if(g.addiction) g.addiction.level=Math.min(3,g.addiction.level+1); else g.addiction={kind,level:1}; };
const bigOf = g => { const d = sdef(g); return d && d.big ? d.big : null; };

export const EVENTS = [
/* ============================================================
   CHILDHOOD (0–12)
   ============================================================ */
{ id:"first_word", min:1, max:2, w:5, auto:()=>({ text:`Your first word was "${pick(["mama","dada","no","dog","more","uh-oh"])}".`, stats:{ smarts:+2 } }) },
{ id:"walk", min:1, max:2, w:4, auto:()=>({ text:"You took your first steps. Everyone applauded like you'd cured something.", stats:{ health:+2 } }) },
{ id:"imaginary", min:3, max:7, w:3, auto:()=>({ text:`You invented an imaginary friend named ${anyName()}. They were a bad influence.`, stats:{ happiness:+4, smarts:+1 } }) },
{ id:"tooth", min:5, max:8, w:3, auto:g=>({ text:`You lost a tooth. The tooth fairy left ${money(g,3)}.`, money:+3, stats:{ happiness:+4 } }) },
{ id:"reading", min:5, max:8, w:3, auto:()=>({ text:"You learned to read and immediately became unbearable about it.", stats:{ smarts:+6, happiness:+3 } }) },
{ id:"chickenpox", min:2, max:11, w:3, auto:()=>({ text:"You caught chickenpox and were covered head to toe.", stats:{ health:-6, happiness:-6 } }) },
{ id:"broke_arm", min:5, max:14, w:3, auto:()=>({ text:`You broke your ${pick(["arm","wrist","collarbone","ankle"])} falling out of a tree.`, stats:{ health:-12, happiness:-6 } }) },

{ id:"bully", min:7, max:14, w:3, choice:{
    text:"A kid at school keeps taking your lunch money.",
    choices:[
      { label:"Fight back",      run:()=>chance(0.55)?({text:"You swung once and they never bothered you again.",stats:{happiness:+8,health:-3},flags:{scrappy:true}}):({text:"You lost the fight badly and got detention.",stats:{happiness:-10,health:-8}}) },
      { label:"Tell a teacher",  run:()=>chance(0.6)?({text:"The teacher handled it. The bully was suspended.",stats:{happiness:+4}}):({text:"The teacher did nothing. It got worse.",stats:{happiness:-8}}) },
      { label:"Befriend them",   run:()=>chance(0.4)?({text:"Somehow it worked. They became a loyal friend.",stats:{happiness:+12,smarts:+3}}):({text:"They took your kindness as weakness.",stats:{happiness:-9}}) },
      { label:"Just take it",    run:()=>({text:"You gave up the money every day for a year.",stats:{happiness:-6,smarts:+1},flags:{pushover:true}}) },
    ]}},
{ id:"stray_dog", min:6, max:14, w:4, choice:{
    text:"A stray dog has been following you home all week.",
    choices:[
      { label:"Beg to keep it",      run:()=>chance(0.5)?({text:"Your parents caved. You have a dog.",stats:{happiness:+16},addPet:"Dog"}):({text:"Your parents said absolutely not.",stats:{happiness:-8}}) },
      { label:"Take it to a shelter",run:()=>({text:"You took it to a shelter. They found it a home.",stats:{happiness:+4}}) },
      { label:"Feed it in secret",   run:()=>chance(0.5)?({text:"You kept it secret for months before you were caught. You got to keep it.",stats:{happiness:+14},addPet:"Dog"}):({text:"You were caught. The dog went to the pound.",stats:{happiness:-12}}) },
    ]}},
{ id:"school_talent", min:6, max:12, w:3, choice:{
    text:"The school talent show is next week. Sign-ups are open.",
    choices:[
      { label:"Sing",            run:()=>chance(0.5)?({text:"You sang and brought the house down.",stats:{happiness:+14,looks:+2},fame:+3,flags:{performer:true}}):({text:"You froze on stage. Nobody let you forget it.",stats:{happiness:-12}}) },
      { label:"Do a magic trick",run:()=>chance(0.55)?({text:"The trick worked. You were briefly a legend.",stats:{happiness:+11,smarts:+3}}):({text:"The trick failed and you had to explain it.",stats:{happiness:-7}}) },
      { label:"Don't enter",     run:()=>({text:"You watched from the audience, quietly relieved.",stats:{happiness:+1}}) },
    ]}},
{ id:"broke_vase", min:5, max:12, w:3, choice:{
    text:"You broke something expensive at home and nobody saw.",
    choices:[
      { label:"Own up",       run:()=>chance(0.7)?({text:"You confessed. They were annoyed but proud of you.",stats:{happiness:+6,smarts:+2},flags:{honest:true}}):({text:"You confessed and were grounded for a month anyway.",stats:{happiness:-8}}) },
      { label:"Blame a sibling",run:g=>{const s=g.rels.find(r=>r.type==="sibling"&&r.alive);
          return s?({text:`You blamed ${s.name}. They took the punishment.`,stats:{happiness:-4},relAdj:{id:s.id,d:-18}}):({text:"There was nobody to blame. You said nothing.",stats:{happiness:-3}});} },
      { label:"Hide the pieces",run:()=>chance(0.5)?({text:"Nobody ever found out.",stats:{happiness:+3}}):({text:"They found the pieces. Lying made it much worse.",stats:{happiness:-14}}) },
    ]}},
{ id:"new_school", min:6, max:13, w:4, choice:{
    text:"Your family is moving. You'll be the new kid at a different school.",
    choices:[
      { label:"Reinvent yourself", run:()=>chance(0.55)?({text:"Nobody knew your old self. You came back different, and better.",stats:{happiness:+14,looks:+4},flags:{reinvented:true}}):({text:"You tried too hard and it showed.",stats:{happiness:-10}}) },
      { label:"Keep your head down",run:()=>({text:"You got through the year without anyone learning your name.",stats:{happiness:-5,smarts:+3}}) },
      { label:"Beg them not to move",run:()=>chance(0.25)?({text:"Astonishingly, they changed their minds.",stats:{happiness:+10}}):({text:"You moved anyway, and resented it.",stats:{happiness:-9}}) },
    ]}},
{ id:"pet_died", min:5, max:16, w:3, req:g=>g.pets.length>0, auto:g=>{ const p=g.pets[0]; if(!p) return null; return { text:`${p.name} the ${p.kind.toLowerCase()} passed away. You buried them in the garden.`, stats:{ happiness:-15 }, removePet:p.id }; } },
{ id:"sibling_fight", min:4, max:16, w:3, req:g=>g.rels.some(r=>r.type==="sibling"&&r.alive), auto:g=>{
    const s=pick(g.rels.filter(r=>r.type==="sibling"&&r.alive));
    if(!s) return { text:"You picked a fight with someone over the television.", stats:{ happiness:-4 } };
    return { text:`You and ${s.name} had a screaming argument over the television.`, stats:{ happiness:-4 }, relAdj:{ id:s.id, d:-8 } }; } },

/* ============================================================
   TEENS (13–19)
   ============================================================ */
{ id:"acne", min:12, max:18, w:3, auto:()=>({ text:"Puberty arrived and brought acne with it.", stats:{ looks:-6, happiness:-4 } }) },
{ id:"growth", min:12, max:18, w:3, auto:()=>({ text:"You hit a growth spurt and none of your clothes fit.", stats:{ looks:+4, health:+3 } }) },
{ id:"first_crush", min:12, max:17, w:3, auto:()=>({ text:`You developed a crushing, unspoken crush on someone in your ${pick(["chemistry","history","art","gym"])} class.`, stats:{ happiness:+6 } }) },

{ id:"party", min:14, max:19, w:6, choice:{
    text:"You got invited to a party where there will definitely be alcohol.",
    choices:[
      { label:"Go and drink",   run:()=>chance(0.7)?({text:"You had a legendary night. You also threw up in a hedge.",stats:{happiness:+12,health:-5,smarts:-2}}):({text:"The police broke it up and your parents got a call.",stats:{happiness:-10}}) },
      { label:"Go, stay sober", run:()=>({text:"You went, drove everyone home, and were quietly the hero.",stats:{happiness:+6,smarts:+2}}) },
      { label:"Stay home",      run:()=>({text:"You stayed in and read. Nobody mentioned it again.",stats:{smarts:+4,happiness:-3}}) },
    ]}},
{ id:"smoke_offer", min:13, max:19, w:6, once:true, choice:{
    text:"Someone passes you a cigarette behind the sports hall.",
    choices:[
      { label:"Take it",  run:()=>({text:"You started smoking. It made you feel older and looked it.",stats:{health:-8,happiness:+4},flags:{smoker:true}}) },
      { label:"Decline",  run:()=>({text:"You declined. They shrugged and moved on.",stats:{health:+2}}) },
      { label:"Talk them out of it", run:()=>chance(0.4)?({text:"They actually listened and stubbed it out.",stats:{happiness:+8,smarts:+3}}):({text:"They laughed at you for a week.",stats:{happiness:-6}}) },
    ]}},
{ id:"smoke_quit", priority:true, min:20, max:70, w:5, req:g=>F(g).smoker, choice:{
    text:"You've been smoking for years now. Your chest isn't what it was.",
    choices:[
      { label:"Quit cold turkey", run:()=>chance(0.45)?({text:"You quit. The first month was hell, then it wasn't.",stats:{health:+14,happiness:+10},flags:{smoker:false,quitter:true}}):({text:"You lasted nine days.",stats:{happiness:-8,health:-3}}) },
      { label:"Get help quitting",run:g=>{const c=local(g,600);
          return g.money<c?({text:"You couldn't afford the programme.",stats:{happiness:-5}})
            :chance(0.7)?({text:"The programme worked. You haven't smoked since.",money:-c,stats:{health:+16,happiness:+12},flags:{smoker:false,quitter:true}})
            :({text:"You did the programme and relapsed anyway.",money:-c,stats:{happiness:-9}});} },
      { label:"Keep smoking",     run:()=>({text:"You lit another one and thought about it tomorrow.",stats:{health:-10,happiness:+2}}) },
    ]}},
{ id:"smoke_toll", priority:true, min:45, max:90, w:4, req:g=>F(g).smoker, auto:()=>({ text:"Decades of smoking caught up with your lungs.", stats:{ health:-16, happiness:-10 }, kind:"bad" }) },

{ id:"band_form", min:13, max:19, w:5, once:true, choice:{
    text:`Some friends want to start a band called "${pick(["The Wet Sundays","Concrete Lemons","Static Youth","Model Citizens","Ghost Orchard"])}".`,
    choices:[
      { label:"Play guitar",   run:()=>({text:"You learned three chords and played every party going.",stats:{happiness:+12,smarts:+2},fame:+4,flags:{band:true}}) },
      { label:"Sing lead",     run:()=>({text:"You fronted the band. Terrifying, then addictive.",stats:{happiness:+14,looks:+3},fame:+6,flags:{band:true,performer:true}}) },
      { label:"Too busy",      run:()=>({text:"You passed. They played the school dance without you.",stats:{happiness:-4,smarts:+3}}) },
    ]}},
{ id:"band_deal", priority:true, min:18, max:32, w:4, once:true, req:g=>F(g).band, choice:{
    text:"Your old band has a small label sniffing around. They want a two-year commitment.",
    choices:[
      { label:"Sign the deal", run:g=>chance(0.4)?({text:"🎸 The record did well. You toured for two years.",money:+local(g,rint(8000,90000)),fame:+rint(14,30),stats:{happiness:+20}}):({text:"The label dropped you after one single.",fame:+5,stats:{happiness:-14}}) },
      { label:"Stay independent", run:()=>({text:"You kept the rights and a much smaller audience.",fame:+6,stats:{happiness:+8,smarts:+3}}) },
      { label:"Walk away from music",run:()=>({text:"You put the guitar in the loft for good.",stats:{happiness:-10},flags:{band:false}}) },
    ]}},

{ id:"cheating_exam", min:13, max:18, w:5, choice:{
    text:"You can see the top student's exam paper from where you sit.",
    choices:[
      { label:"Copy the answers", run:()=>chance(0.65)?({text:"You copied and got an A. Nobody noticed.",stats:{happiness:+6,smarts:-3},flags:{cheat:true}}):({text:"You were caught cheating and suspended.",stats:{happiness:-18,smarts:-2}}) },
      { label:"Do your own work", run:()=>({text:"You wrote what you knew and accepted the grade.",stats:{smarts:+4,happiness:+2}}) },
      { label:"Report the temptation",run:()=>({text:"You asked to be moved. The teacher respected it.",stats:{smarts:+2,happiness:+4}}) },
    ]}},
{ id:"licence", min:16, max:18, w:5, choice:{
    text:"Your driving test is booked for Thursday.",
    choices:[
      { label:"Practice hard first", run:()=>chance(0.85)?({text:"You passed comfortably.",stats:{happiness:+10}}):({text:"You failed anyway. Brutal.",stats:{happiness:-8}}) },
      { label:"Wing it",             run:()=>chance(0.4)?({text:"You passed by pure luck.",stats:{happiness:+12}}):({text:"You failed. The parallel park destroyed you.",stats:{happiness:-6}}) },
      { label:"Postpone it",         run:()=>({text:"You put it off another year.",stats:{happiness:-2}}) },
    ]}},
{ id:"prom", min:16, max:18, w:5, choice:{
    text:"Prom is coming up.",
    choices:[
      { label:"Ask your crush",   run:g=>chance(0.35+g.stats.looks/220)?({text:"They said yes. It was a genuinely perfect night.",stats:{happiness:+22,looks:+2}}):({text:"They said no, kindly, which was somehow worse.",stats:{happiness:-14}}) },
      { label:"Go with friends",  run:()=>({text:"You went as a group and had a better time than the couples.",stats:{happiness:+13}}) },
      { label:"Skip it",          run:()=>({text:"You stayed home. You still think about it sometimes.",stats:{happiness:-7}}) },
    ]}},
{ id:"college_choice", min:17, max:19, w:5, once:true, req:g=>g.diplomas.high, choice:{
    text:"Everyone's asking what you're doing after school.",
    choices:[
      { label:"Aim for university",run:()=>({text:"You set your sights on a degree and started saving.",stats:{smarts:+6,happiness:+5},flags:{ambitious:true}}) },
      { label:"Learn a trade",     run:g=>({text:"You lined up an apprenticeship instead. Practical, and paid.",money:+local(g,rint(1000,5000)),stats:{happiness:+8,health:+3},flags:{trade:true}}) },
      { label:"Take a gap year",   run:g=>{const c=afford(g,local(g,rint(500,4000)));return {text:"You spent a year travelling and working odd jobs.",money:-c,stats:{happiness:+16,smarts:+4},flags:{gapyear:true}};} },
      { label:"Figure it out later",run:()=>({text:"You shrugged and got a job for now.",stats:{happiness:-3}}) },
    ]}},
{ id:"heartbreak", min:14, max:19, w:3, auto:()=>({ text:"Your first relationship ended. You listened to one album on repeat for a month.", stats:{ happiness:-14 } }) },
{ id:"shoplift_dare", min:13, max:18, w:5, choice:{
    text:"Your friends dare you to walk out of the shop without paying.",
    choices:[
      { label:"Do it",     run:g=>chance(0.6)?({text:"You got away with it and felt sick about it.",money:+local(g,rint(5,60)),stats:{happiness:+3}}):({text:"Security caught you at the door. Your parents were called.",stats:{happiness:-18},flags:{caughtyoung:true}}) },
      { label:"Refuse",    run:()=>({text:"You refused. They called you boring; you slept fine.",stats:{happiness:+2,smarts:+2}}) },
      { label:"Pay and pretend",run:()=>({text:"You paid quietly and let them believe you'd stolen it.",stats:{happiness:+5,smarts:+3}}) },
    ]}},

/* ============================================================
   YOUNG ADULT (20–35)
   ============================================================ */
{ id:"moveout", min:18, max:26, w:4, choice:{
    text:"You can finally afford to move out of your parents' place — just about.",
    choices:[
      { label:"Get your own flat", run:g=>({text:"You moved into a tiny place of your own. Worth every penny.",money:-afford(g,local(g,rint(1500,6000))),stats:{happiness:+16}}) },
      { label:"Share with friends",run:g=>({text:"You moved in with friends. Cheaper, louder, more fun.",money:-afford(g,local(g,rint(500,2500))),stats:{happiness:+11,smarts:-1}}) },
      { label:"Stay and save",     run:g=>({text:"You stayed put and banked the difference.",money:+local(g,rint(2000,9000)),stats:{happiness:-7}}) },
    ]}},
{ id:"startup_pitch", min:22, max:50, w:2, once:true, choice:{
    text:"A friend wants you to invest your savings in their startup.",
    choices:[
      { label:"Invest big",       run:g=>{const s=afford(g,local(g,rint(3000,40000)));return s<1000?({text:"You had nothing to invest.",stats:{happiness:-3}}):({text:`You put ${money(g,s)} in and took a real stake.`,money:-s,flags:{startup:s}});} },
      { label:"Invest a little",  run:g=>{const s=afford(g,local(g,rint(500,4000)));return s<300?({text:"You had nothing to invest.",stats:{happiness:-3}}):({text:`You put a token ${money(g,s)} in.`,money:-s,flags:{startup:s}});} },
      { label:"Join them instead",run:()=>({text:"You quit your job and joined as a co-founder.",fire:true,stats:{happiness:+12,smarts:+5},flags:{startup:1,founder:true}}) },
      { label:"Politely decline", run:()=>({text:"You passed. The friendship survived, mostly.",stats:{happiness:-2}}) },
    ]}},
{ id:"startup_outcome", priority:true, min:24, max:60, w:6, once:true, req:g=>F(g).startup, choice:{
    text:"The startup you backed has an offer on the table from a bigger company.",
    choices:[
      { label:"Push to sell",   run:g=>{const s=F(g).startup||0;return chance(0.55)?({text:"The sale went through. Your stake paid out handsomely.",money:+Math.round(s*rint(6,25)),stats:{happiness:+26},flags:{startup:0}}):({text:"The deal collapsed and the company folded.",stats:{happiness:-20},flags:{startup:0}});} },
      { label:"Hold for growth",run:g=>{const s=F(g).startup||0;return chance(0.3)?({text:"🚀 They held on and went enormous. Your stake was life-changing.",money:+Math.round(s*rint(30,120)),fame:+10,stats:{happiness:+35},flags:{startup:0}}):({text:"They held on and ran out of money eighteen months later.",stats:{happiness:-22},flags:{startup:0}});} },
      { label:"Sell your stake now",run:g=>{const s=F(g).startup||0;return {text:"You cashed out early for a safe, modest return.",money:+Math.round(s*rint(2,4)),stats:{happiness:+10},flags:{startup:0}};} },
    ]}},
{ id:"job_offer_rival", min:22, max:60, w:6, req:g=>!!g.job, choice:{
    text:"A rival company has offered you considerably more money.",
    choices:[
      { label:"Take the offer",   run:g=>{ if(!g.job) return {text:"By the time you decided, the job you were leaving no longer existed.",stats:{happiness:-6}};
          g.job.salary+=Math.round(g.job.salary*rint(20,55)/100); return {text:`You jumped ship for ${money(g,g.job.salary)}/yr.`,stats:{happiness:+14}};} },
      { label:"Use it to get a raise",run:g=>{ if(!g.job) return {text:"You had no job left to leverage.",stats:{happiness:-8}};
          if(!chance(0.55)) return {text:"They called your bluff. Awkward for months.",stats:{happiness:-12}};
          g.job.salary+=Math.round(g.job.salary*rint(10,25)/100); return {text:`You counter-offered and won — now ${money(g,g.job.salary)}/yr.`,stats:{happiness:+12}};} },
      { label:"Stay loyal",       run:()=>({text:"You turned it down. Your boss noticed.",stats:{happiness:+4},flags:{loyal:true}}) },
    ]}},
{ id:"whistle", min:24, max:60, w:5, once:true, req:g=>!!g.job, choice:{
    text:"You've found clear evidence your employer is defrauding customers.",
    choices:[
      { label:"Report it publicly",run:()=>chance(0.5)?({text:"You blew the whistle. You lost the job and gained a reputation.",fire:true,fame:+18,stats:{happiness:+8,smarts:+4},flags:{whistleblower:true}}):({text:"You blew the whistle and were quietly destroyed for it.",fire:true,stats:{happiness:-22}}) },
      { label:"Report internally", run:()=>chance(0.4)?({text:"They fixed it quietly and thanked you.",stats:{happiness:+10}}):({text:"It was buried, and so was your career there.",stats:{happiness:-14}}) },
      { label:"Say nothing",       run:()=>({text:"You kept your head down and your salary.",stats:{happiness:-10,smarts:+1}}) },
      { label:"Blackmail them",    run:g=>chance(0.4)?({text:"They paid for your silence.",money:+local(g,rint(20000,200000)),stats:{happiness:-8}}):({text:"They called the police. It went badly.",arrest:{name:"blackmail",sentence:[2,6]}}) },
    ]}},
{ id:"gamble_win", min:20, max:70, w:1, once:true, choice:{
    text:"You had a huge night at the bookmaker's and walked out well up.",
    choices:[
      { label:"Bank it and stop",  run:g=>({text:"You took the money and never went back.",money:+local(g,rint(2000,20000)),stats:{happiness:+12,smarts:+3}}) },
      { label:"Chase a bigger win",run:g=>chance(0.3)?({text:"You doubled it again. Dangerous fun.",money:+local(g,rint(8000,60000)),stats:{happiness:+16},flags:{gambler:true}}):({text:"You gave it all back and then some.",money:-afford(g,local(g,rint(1000,15000))),stats:{happiness:-14},flags:{gambler:true}}) },
    ]}},
{ id:"gamble_spiral", priority:true, min:24, max:75, w:5, req:g=>F(g).gambler, choice:{
    text:"The betting has stopped being fun. You're hiding it from people.",
    choices:[
      { label:"Get help",       run:()=>chance(0.7)?({text:"You got help and stopped. It was the hardest thing you've done.",stats:{happiness:+16,smarts:+4},flags:{gambler:false}}):({text:"You tried to stop and slipped again.",stats:{happiness:-12}}) },
      { label:"Tell your family",run:g=>{const r=g.rels.find(x=>x.alive&&["partner","mother","father","sibling"].includes(x.type));
          return r?({text:`You told ${r.name}. They were angry, then they helped.`,stats:{happiness:+12},relAdj:{id:r.id,d:-10},flags:{gambler:false}}):({text:"There was nobody to tell.",stats:{happiness:-10}});} },
      { label:"One more big bet",run:g=>chance(0.2)?({text:"It came in. You're convinced you can stop whenever you want.",money:+local(g,rint(5000,40000)),stats:{happiness:+10}}):({text:"You lost badly and had to borrow to cover it.",money:-afford(g,local(g,rint(3000,30000))),stats:{happiness:-20}}) },
    ]}},
{ id:"student_debt", min:22, max:40, w:3, req:g=>g.diplomas.uni, auto:g=>{ const c=local(g,rint(1200,7000)); return { text:`Your student loan repayment took ${money(g,c)} this year.`, money:-c, stats:{ happiness:-6 } }; } },
{ id:"friend_crisis", min:20, max:70, w:1, choice:{
    text:"A close friend is in serious trouble and has asked you for money.",
    choices:[
      { label:"Give what they need",run:g=>{const c=afford(g,local(g,rint(1000,15000)));
          if(c<1) return {text:"You went through your accounts twice looking for something to send. There wasn't anything.",stats:{happiness:-14}};
          return chance(0.6)?(()=>{const back=Math.round(c*0.9);return {text:`You gave them ${money(g,c)}, and they paid nearly all of it back over the following years \u2014 ${money(g,c-back)} of it never came home.`,money:-(c-back),stats:{happiness:+12}};})():({text:`You gave them ${money(g,c)} and never saw it again.`,money:-c,stats:{happiness:-6}});} },
      { label:"Offer help, not cash",run:()=>({text:"You gave them your time instead. It mattered more.",stats:{happiness:+9}}) },
      { label:"Say you can't",       run:()=>({text:"You said no. The friendship cooled.",stats:{happiness:-8}}) },
    ]}},
{ id:"housing_choice", min:24, max:55, w:5, req:g=>g.money>20000&&g.assets.houses.length===0, choice:{
    text:"You've saved enough for a deposit on a first home.",
    choices:[
      { cost:g=>`${money(g,afford(g,g.money*0.8))} \u2014 80% of your money`, label:"Buy at the top of your budget",run:g=>({text:"You stretched for somewhere you love.",money:-afford(g,Math.round(g.money*0.8)),stats:{happiness:+18},flags:{stretched:true}}) },
      { cost:g=>`${money(g,afford(g,g.money*0.45))} \u2014 45% of your money`, label:"Buy something modest",         run:g=>({text:"You bought sensibly and slept well.",money:-afford(g,Math.round(g.money*0.45)),stats:{happiness:+12,smarts:+3}}) },
      { label:"Keep renting and invest",      run:()=>({text:"You stayed renting and put the deposit to work.",stats:{happiness:+3,smarts:+5},flags:{renter:true}}) },
    ]}},
{ id:"viral", min:16, max:45, w:2, choice:{
    text:"Something you posted online is going viral right now.",
    choices:[
      { label:"Lean into it",  run:()=>chance(0.5)?({text:"You rode the wave and picked up a real following.",fame:+rint(10,22),stats:{happiness:+12}}):({text:"You overplayed it and the internet turned.",fame:+4,stats:{happiness:-16}}) },
      { label:"Monetise it",   run:g=>({text:"You squeezed some brand deals out of the moment.",money:+local(g,rint(500,25000)),fame:+8,stats:{happiness:+6}}) },
      { label:"Delete it",     run:()=>({text:"You deleted the post and let it die.",stats:{happiness:+3,smarts:+2}}) },
    ]}},
{ id:"mentor", min:22, max:50, w:5, once:true, req:g=>!!g.job, choice:{
    text:"A senior colleague has offered to mentor you properly.",
    choices:[
      { label:"Accept eagerly",   run:()=>({text:"They taught you more in a year than the job had in five.",stats:{smarts:+10,happiness:+10},flags:{mentored:true}}) },
      { label:"Accept, keep distance",run:()=>({text:"You took the advice but kept it professional.",stats:{smarts:+5,happiness:+3}}) },
      { label:"Decline",          run:()=>({text:"You said you'd figure it out yourself.",stats:{happiness:-4}}) },
    ]}},
{ id:"mentor_payoff", priority:true, min:28, max:65, w:4, once:true, req:g=>F(g).mentored&&!!g.job, auto:g=>{
    if (!g.job) return { text:"Your old mentor put your name forward, but you'd already moved on.", stats:{ happiness:+4 } };
    g.job.salary=Math.round(g.job.salary*1.3);
    return { text:"Your old mentor recommended you for something well above your level. It worked.", stats:{ happiness:+16 }, kind:"good" }; } },
{ id:"speeding", min:18, max:70, w:1, auto:g=>{ const f=local(g,rint(80,600));
    return { text:`You were caught speeding and fined ${money(g,f)}.${g.money < f ? " You didn't have it, so you owe it." : ""}`, money:-f, stats:{ happiness:-6 } }; } },
{ id:"apartment_flood", min:20, max:70, w:2, auto:g=>{ const c=local(g,rint(500,9000)); return { text:"A pipe burst and flooded your flat.", money:-afford(g,c), stats:{ happiness:-12 }, insuranceClaim:"home" }; } },

/* ============================================================
   MIDDLE AGE (36–59)
   ============================================================ */
{ id:"midlife", min:38, max:52, w:3, choice:{
    text:"You woke up at 3am wondering if this is really it.",
    choices:[
      { label:"Buy a motorcycle", run:g=>({text:"You bought a motorcycle you will ride twice a year.",money:-afford(g,local(g,rint(4000,14000))),stats:{happiness:+12,health:-2}}) },
      { label:"Start therapy",    run:g=>({text:"You started therapy. It was uncomfortable and it worked.",money:-afford(g,local(g,rint(800,4000))),stats:{happiness:+15,smarts:+3}}) },
      { label:"Change careers",   run:()=>({text:"You walked away from your career to start again.",fire:true,stats:{happiness:+10,smarts:+4},flags:{restart:true}}) },
      { label:"Ignore it",        run:()=>({text:"You went back to sleep and never mentioned it.",stats:{happiness:-8}}) },
    ]}},
{ id:"affair_offer", min:30, max:60, w:5, req:g=>g.married, choice:{
    text:"A colleague has made it very clear they're interested in you.",
    choices:[
      { label:"Pursue it",    run:()=>chance(0.45)?({text:"Nobody found out. You felt terrible anyway.",stats:{happiness:-8},flags:{affair:true}}):({text:"You were caught. It detonated your marriage.",stats:{happiness:-32},divorce:true}) },
      { label:"Shut it down", run:()=>({text:"You shut it down and told your partner. They appreciated it.",stats:{happiness:+10}}) },
      { label:"Change jobs to avoid it",run:()=>({text:"You moved teams rather than risk it.",stats:{happiness:+3,smarts:+2}}) },
    ]}},
{ id:"affair_confess", priority:true, min:32, max:65, w:5, once:true, req:g=>F(g).affair&&g.married, choice:{
    text:"The affair ended a while ago, but you've never told your partner.",
    choices:[
      { label:"Confess",     run:g=>chance(0.35)?({text:"You told them. Somehow, you rebuilt it.",stats:{happiness:+14},flags:{affair:false}}):({text:"You told them and they left.",stats:{happiness:-30},divorce:true,flags:{affair:false}}) },
      { label:"Take it to the grave",run:()=>({text:"You decided some things stay buried.",stats:{happiness:-10}}) },
    ]}},
{ id:"parent_care", min:40, max:70, w:6, req:g=>g.rels.some(r=>(r.type==="mother"||r.type==="father")&&r.alive&&r.age>72), choice:{
    text:"An ageing parent can't manage on their own any more.",
    choices:[
      { label:"Move them in with you",run:g=>{const p=g.rels.find(r=>(r.type==="mother"||r.type==="father")&&r.alive);
          return {text:`You moved ${p?p.name:"them"} in. It was hard and it was right.`,money:-afford(g,local(g,rint(1000,8000))),stats:{happiness:-4,health:-3},relAdj:p?{id:p.id,d:+25}:null};} },
      { label:"Pay for a good home",  run:g=>{const c=local(g,rint(8000,40000));
          return g.money<c?({text:"You couldn't afford the fees. The guilt was considerable.",stats:{happiness:-16}}):({text:"You found somewhere genuinely good for them.",money:-c,stats:{happiness:-2}});} },
      { label:"Let a sibling handle it",run:g=>{const s=g.rels.find(r=>r.type==="sibling"&&r.alive);
          return s?({text:`You left it to ${s.name}. They have not forgotten.`,stats:{happiness:-9},relAdj:{id:s.id,d:-28}}):({text:"There was nobody else. You did nothing, and it showed.",stats:{happiness:-18}});} },
    ]}},
{ id:"kid_trouble", min:35, max:65, w:5, req:g=>g.rels.some(r=>r.type==="child"&&r.alive&&r.age>=13&&r.age<=19), choice:{
    text:"Your teenager was caught sneaking out at 2am.",
    choices:[
      { label:"Ground them",     run:()=>({text:"You grounded them for a month. They hated you and stayed in.",stats:{happiness:-4}}) },
      { label:"Talk it through", run:g=>{const k=g.rels.find(r=>r.type==="child"&&r.alive&&r.age>=13);
          return chance(0.6)?({text:"You talked properly. Something got through.",stats:{happiness:+9},relAdj:k?{id:k.id,d:+15}:null}):({text:"You talked. They nodded and did it again next week.",stats:{happiness:-5}});} },
      { label:"Let it slide",    run:()=>({text:"You let it go. They took that as permission.",stats:{happiness:-2}}) },
    ]}},
{ id:"kid_uni", min:40, max:65, w:5, req:g=>g.rels.some(r=>r.type==="child"&&r.alive&&r.age>=17&&r.age<=20), choice:{
    text:"Your child got into a good university, but the fees are steep.",
    choices:[
      { label:"Pay it all",     run:g=>{const c=local(g,rint(15000,70000));const k=g.rels.find(r=>r.type==="child"&&r.alive&&r.age>=17);
          return g.money<c?({text:"You simply didn't have it. That conversation was awful.",stats:{happiness:-18}}):({text:"You covered every penny.",money:-c,stats:{happiness:+14},relAdj:k?{id:k.id,d:+22}:null});} },
      { label:"Split it with them",run:g=>{const c=local(g,rint(6000,28000));
          return {text:"You went halves. They took out a loan for the rest.",money:-afford(g,c),stats:{happiness:+7}};} },
      { label:"They're on their own",run:g=>{const k=g.rels.find(r=>r.type==="child"&&r.alive&&r.age>=17);
          return {text:"You told them to fund it themselves.",stats:{happiness:-8},relAdj:k?{id:k.id,d:-20}:null};} },
    ]}},
{ id:"redundancy_pkg", min:35, max:62, w:5, req:g=>!!g.job, choice:{
    text:"Your employer is offering voluntary redundancy with a payout.",
    choices:[
      { label:"Take the money",   run:g=>g.job?({text:"You took the package and walked.",money:+Math.round(g.job.salary*0.8),fire:true,stats:{happiness:+6}})
          :({text:"The offer lapsed — you were already out the door.",stats:{happiness:-8}}) },
      { label:"Take it and retrain",run:g=>g.job?({text:"You took the payout and used it to retrain completely.",money:+Math.round(g.job.salary*0.5),fire:true,stats:{smarts:+10,happiness:+10},flags:{restart:true}})
          :({text:"You retrained anyway, without the payout to soften it.",stats:{smarts:+8,happiness:-4},flags:{restart:true}}) },
      { label:"Stay put",         run:()=>({text:"You stayed. Half your team left.",stats:{happiness:-6}}) },
    ]}},
{ id:"health_scare", min:30, max:90, w:1, choice:{
    text:g=>`You've had ${pick(["a cough","a pain low down","a lump you keep checking","a headache that will not shift","blood where there should not be","a numbness in one hand","a weight loss you did not ask for"])} for ${pick(["weeks","a couple of months","most of the year","longer than you have admitted to anyone"])} now.`,
    choices:[
      { label:"See a doctor",  run:g=>{const c=local(g,900);
          return chance(0.75)?({text:"It was nothing serious. Relief, and a small bill.",money:-afford(g,c),stats:{happiness:+8},insuranceClaim:"health"})
            :({text:"They caught something early. Treatable, thankfully.",money:-afford(g,c*4),stats:{health:-10,happiness:-10},insuranceClaim:"health",flags:{diagnosed:true}});} },
      { label:"Get a second opinion",run:g=>{const c=local(g,1800);
          return {text:"Two doctors agreed: manageable, with treatment.",money:-afford(g,c),stats:{health:+4,happiness:+4},insuranceClaim:"health"};} },
      { label:"Ignore it",     run:()=>chance(0.6)?({text:"It went away on its own. Probably fine.",stats:{happiness:+2}}):({text:"It got considerably worse.",stats:{health:-22,happiness:-16},flags:{diagnosed:true}}) },
    ]}},
{ id:"diagnosis_follow", priority:true, min:32, max:92, w:5, once:true, req:g=>F(g).diagnosed, choice:{
    text:"Your treatment plan is a long one. It's wearing you down.",
    choices:[
      { label:"Follow it exactly",run:g=>{const c=local(g,rint(2000,20000));
          return {text:"You stuck to it religiously and came out the other side.",money:-afford(g,c),stats:{health:+22,happiness:+12},insuranceClaim:"health",flags:{diagnosed:false}};} },
      { label:"Do the minimum",   run:()=>({text:"You did enough to get by.",stats:{health:+6,happiness:-4}}) },
      { label:"Stop treatment",   run:()=>({text:"You stopped going. You felt free, briefly.",stats:{health:-20,happiness:+4}}) },
    ]}},
{ id:"lawsuit", min:25, max:75, w:1, once:true, choice:{
    text:"Someone is suing you over an accident they say was your fault.",
    choices:[
      { label:"Fight it in court",run:g=>{const c=local(g,rint(4000,25000));
          return chance(0.5)?({text:"You won. Costly, but vindicated.",money:-afford(g,c),stats:{happiness:+10,smarts:+3}}):({text:"You lost and paid damages on top of fees.",money:-afford(g,c*3),stats:{happiness:-20}});} },
      { label:"Settle quietly",   run:g=>{const c=local(g,rint(3000,30000));
          return {text:"You settled out of court and moved on.",money:-afford(g,c),stats:{happiness:-6}};} },
      { label:"Countersue",       run:g=>chance(0.35)?({text:"Your countersuit won. They paid you.",money:+local(g,rint(5000,60000)),stats:{happiness:+16}}):({text:"The countersuit failed spectacularly.",money:-afford(g,local(g,rint(8000,50000))),stats:{happiness:-22}}) },
    ]}},
{ id:"inheritance_fight", min:35, max:75, w:4, once:true, req:g=>g.rels.some(r=>!r.alive&&(r.type==="mother"||r.type==="father")), choice:{
    text:"Your parent's will is being contested by the rest of the family.",
    choices:[
      { label:"Fight for your share",run:g=>{const s=g.rels.find(r=>r.type==="sibling"&&r.alive);
          return chance(0.5)?({text:"You won your share. The family never really recovered.",money:+local(g,rint(10000,180000)),stats:{happiness:-6},relAdj:s?{id:s.id,d:-35}:null}):({text:"You lost, and burned the bridges anyway.",money:-afford(g,local(g,rint(2000,15000))),stats:{happiness:-18},relAdj:s?{id:s.id,d:-35}:null});} },
      { label:"Split it evenly",     run:g=>{const s=g.rels.find(r=>r.type==="sibling"&&r.alive);
          return {text:"You proposed an even split. Everyone got less and stayed family.",money:+local(g,rint(3000,50000)),stats:{happiness:+12},relAdj:s?{id:s.id,d:+20}:null};} },
      { label:"Walk away from it",   run:()=>({text:"You wanted no part of it and took nothing.",stats:{happiness:+4,smarts:+2}}) },
    ]}},
{ id:"home_repair", min:30, max:80, w:4, req:g=>g.assets.houses.length>0, choice:{
    text:`Your ${pick(["roof","boiler","foundation","wiring","plumbing"])} needs serious work.`,
    choices:[
      { label:"Do it properly",  run:g=>{const c=local(g,rint(4000,25000));
          return {text:"You paid for the proper job. No more surprises.",money:-afford(g,c),stats:{happiness:+4},insuranceClaim:"home"};} },
      { label:"Patch it cheaply",run:g=>{const c=local(g,rint(400,3000));
          return chance(0.5)?({text:"The cheap fix held.",money:-afford(g,c),stats:{happiness:+2}}):({text:"The cheap fix failed within a year and cost double.",money:-afford(g,c*5),stats:{happiness:-12}});} },
      { label:"Ignore it",       run:()=>({text:"You lived with it. The house lost value.",stats:{happiness:-8}}) },
    ]}},
{ id:"grey_hair", min:38, max:65, w:3, auto:()=>({ text:"You found your first grey hairs. Plural.", stats:{ looks:-4, happiness:-3 } }) },
{ id:"back_pain", min:45, max:95, w:3, auto:()=>({ text:"Your back went out doing something humiliating, like putting on a sock.", stats:{ health:-7, happiness:-5 } }) },
{ id:"reunion", min:28, max:60, w:2, choice:{
    text:"Your school reunion invitation arrived.",
    choices:[
      { label:"Go and enjoy it", run:()=>({text:"You went. Everyone looked older except, you assume, you.",stats:{happiness:+9}}) },
      { label:"Go to show off",  run:g=>g.money>200000?({text:"You turned up in something expensive. It was noted.",stats:{happiness:+12,looks:+2}}):({text:"You tried to show off with very little to show. Grim.",stats:{happiness:-12}}) },
      { label:"Don't go",        run:()=>({text:"You binned the invitation.",stats:{happiness:-2}}) },
    ]}},
{ id:"tax_audit", min:25, max:75, w:3, req:g=>g.money>20000, auto:g=>{ const loss=Math.round(g.money*0.08); return { text:`You were audited. You owed ${money(g,loss)} in back taxes.`, money:-loss, stats:{ happiness:-10 } }; } },

/* ============================================================
   SENIOR (60+)
   ============================================================ */
{ id:"retire_choice", min:60, max:72, w:6, once:true, choice:{
    text:"You could retire now, or keep working a few more years.",
    choices:[
      { label:"Retire now",       run:g=>({text:"You retired and never looked back.",fire:true,stats:{happiness:+18,health:+4}}) },
      { label:"Work a few more years",run:()=>({text:"You stayed on. The money was useful; the years weren't free.",stats:{happiness:-5,health:-4}}) },
      { label:"Go part-time",     run:()=>({text:"You dropped to three days a week. Best of both.",stats:{happiness:+12}}) },
    ]}},
{ id:"scam_target", min:60, max:99, w:5, choice:{
    text:"Someone called claiming to be from your bank, asking to confirm your details.",
    choices:[
      { label:"Give the details", run:g=>{const loss=Math.round(g.money*0.4);return {text:`It was a scam. They drained ${money(g,loss)}.`,money:-loss,stats:{happiness:-20}};} },
      { label:"Hang up",          run:()=>({text:"You hung up and reported it. Sharp as ever.",stats:{happiness:+5,smarts:+2}}) },
      { label:"String them along", run:()=>({text:"You wasted forty minutes of their time. Deeply satisfying.",stats:{happiness:+12,smarts:+3}}) },
    ]}},
{ id:"grandkid_ask", min:58, max:95, w:5, req:g=>g.rels.some(r=>r.type==="child"&&r.alive&&r.age>22), choice:{
    text:"Your grown-up child needs help with a house deposit.",
    choices:[
      { label:"Give it to them",  run:g=>{const c=afford(g,local(g,rint(10000,90000)));const k=g.rels.find(r=>r.type==="child"&&r.alive);
          return c<2000?({text:"You had nothing to give, and said so.",stats:{happiness:-12}}):({text:`You gave them ${money(g,c)}.`,money:-c,stats:{happiness:+16},relAdj:k?{id:k.id,d:+25}:null});} },
      { label:"Lend it",          run:g=>{const c=afford(g,local(g,rint(8000,60000)));
          return c<2000?({text:"You had nothing to lend.",stats:{happiness:-10}}):(()=>{const back=Math.round(c*0.7);return {text:`You lent them ${money(g,c)} on proper terms and got most of it back \u2014 ${money(g,c-back)} of it you never will.`,money:-(c-back),stats:{happiness:+6}};})();} },
      { label:"Say no",           run:g=>{const k=g.rels.find(r=>r.type==="child"&&r.alive);
          return {text:"You told them you'd worked for yours.",stats:{happiness:-10},relAdj:k?{id:k.id,d:-22}:null};} },
    ]}},
{ id:"will_choice", min:65, max:99, w:5, once:true, choice:{
    text:"It's time to write your will properly.",
    choices:[
      { label:"Split it evenly",  run:()=>({text:"You split everything evenly. Nobody could argue.",stats:{happiness:+8,smarts:+3}}) },
      { label:"Leave it to one person",run:g=>{const r=g.rels.find(x=>x.alive&&x.rel>70);
          return r?({text:`You left everything to ${r.name}.`,stats:{happiness:+5},relAdj:{id:r.id,d:+15}}):({text:"There was nobody obvious to leave it to.",stats:{happiness:-8}});} },
      { label:"Leave it all to charity",run:()=>({text:"You left the lot to charity. Your family found out later.",stats:{happiness:+12},flags:{philanthropist:true}}) },
      { label:"Don't bother",     run:()=>({text:"You put it off. Again.",stats:{happiness:-3}}) },
    ]}},
{ id:"hip", min:65, max:95, w:4, auto:g=>{ const c=local(g,rint(2000,26000)); return { text:`You had a ${pick(["hip","knee","shoulder"])} replacement.`, money:-afford(g,c), stats:{ health:+8, happiness:-4 }, insuranceClaim:"health" }; } },
{ id:"cruise", min:60, max:88, w:4, choice:{
    text:"A brochure arrived for a very long cruise.",
    choices:[
      { label:"Book the big one", run:g=>{const c=local(g,rint(6000,20000));
          return g.money<c?({text:"You looked at the price and put the brochure down.",stats:{happiness:-4}}):({text:"You took the trip of a lifetime.",money:-c,stats:{happiness:+26,health:+4}});} },
      { label:"Book something modest",run:g=>{const c=local(g,rint(1500,5000));
          return g.money<c?({text:"Even the cheap one was out of reach.",stats:{happiness:-4}}):({text:"You took a short trip and loved it.",money:-c,stats:{happiness:+14,health:+2}});} },
      { label:"Stay home",        run:()=>({text:"You stayed home. The garden needed doing.",stats:{happiness:+2}}) },
    ]}},
{ id:"memory", min:70, max:99, w:3, auto:()=>({ text:`You keep forgetting ${pick(["names","where you put your glasses","why you walked into the room"])}.`, stats:{ smarts:-5, happiness:-4 } }) },
{ id:"old_friend_dies", min:62, max:99, w:3, auto:()=>({ text:"Another old friend passed away. The funerals are getting closer together.", stats:{ happiness:-14 } }) },
{ id:"retire_hobby", min:60, max:95, w:3, auto:()=>({ text:`You took up ${pick(["birdwatching","pottery","competitive gardening","genealogy","open-water swimming","chess","lawn bowls"])} and became insufferable about it.`, stats:{ happiness:+9, smarts:+2 } }) },
{ id:"legacy", min:72, max:99, w:4, once:true, choice:{
    text:"You've been thinking about what you leave behind.",
    choices:[
      { label:"Write your memoirs",run:g=>chance(0.4)?({text:"You wrote it, and people actually read it.",fame:+12,money:+local(g,rint(500,30000)),stats:{happiness:+16}}):({text:"You wrote it. It sits in a drawer.",stats:{happiness:+8,smarts:+3}}) },
      { label:"Record it for family",run:()=>({text:"You recorded hours of stories for your family to keep.",stats:{happiness:+15}}) },
      { cost:g=>`${money(g,afford(g,g.money*0.4))} \u2014 40% of your money`, label:"Give money away now",run:g=>{const c=afford(g,Math.round(g.money*0.4));
          if(c<1) return {text:"You had nothing left to give away. The thought was the whole of it.",stats:{happiness:-6}};
          return {text:`You gave ${money(g,c)} away while you could still see it do good.`,money:-c,stats:{happiness:+22},flags:{philanthropist:true}};} },
      { label:"Nothing to say",   run:()=>({text:"You decided the whole idea was self-indulgent.",stats:{happiness:-4}}) },
    ]}},

/* ============================================================
   ANY AGE
   ============================================================ */
{ id:"wallet", min:14, max:90, w:1, choice:{
    text:g=>`You found ${container()} ${chance(0.5)?"outside "+outside(g):"on the pavement "+timeOfDay()}, with ${smallSum()} and an address inside.`,
    choices:[
      { label:"Return it",     run:g=>chance(0.5)?({text:"The owner gave you a reward for your honesty.",money:+local(g,rint(50,600)),stats:{happiness:+8}}):({text:"You returned it. They barely said thanks. Still — you did right.",stats:{happiness:+4}}) },
      { label:"Keep the cash", run:g=>({text:"You pocketed the cash and binned the wallet.",money:+local(g,rint(40,500)),stats:{happiness:-5}}) },
      { label:"Hand it to police",run:()=>({text:"You handed it in. It was the boring, correct thing to do.",stats:{happiness:+3,smarts:+1}}) },
    ]}},
{ id:"lottery_ticket", min:18, max:99, w:1, choice:{
    text:g=>`The jackpot has rolled over ${pick(["again","for the fourth week","to a number the papers have put on the front page","to something obscene"])}, and ${pick(["everyone at work is in a syndicate","the queue at the shop is out the door",(livingKin(g)?livingKin(g).name+" has asked you to get them a ticket":"the shop has run out of the slips"),"there is talk of nothing else"])}.`,
    choices:[
      { label:"Buy one ticket", run:g=>{const t=local(g,rint(4,12));
          if(g.money<t) return {text:"You counted it out at the counter and put the ticket back.",stats:{happiness:-3}};
          if(!chance(0.05)) return {text:`You bought a ${money(g,t)} ticket and didn't win. Obviously.`,money:-afford(g,t),stats:{happiness:-1}};
          const w=local(g,rint(50000,4000000));
          return {text:`🎉 You won ${money(g,w)} on the lottery.`,money:+w,stats:{happiness:+40},kind:"good",fx:"money",flags:{lotterywin:true}};} },
      { label:"Buy a fistful",  run:g=>{const c=afford(g,local(g,rint(40,200)));
          if(c<1) return {text:"You had nothing to buy them with.",stats:{happiness:-3}};
          if(!chance(0.12)) return {text:`You spent ${money(g,c)} on tickets and won nothing.`,money:-c,stats:{happiness:-4}};
          const w=local(g,rint(20000,900000));
          return {text:`🎉 One of them came in — ${money(g,w)}. The tickets cost you ${money(g,c)}.`,money:+(w-c),stats:{happiness:+38},kind:"good",fx:"money",flags:{lotterywin:true}};} },
      { label:"Don't play",     run:()=>({text:"You kept your money. The odds are the odds.",stats:{smarts:+1}}) },
    ]}},
{ id:"lottery_relatives", priority:true, min:19, max:99, w:6, once:true, req:g=>F(g).lotterywin, choice:{
    text:"Word got out about your win. Relatives you've never met are calling.",
    choices:[
      { cost:g=>`${money(g,afford(g,g.money*0.3))} \u2014 30% of your money`, label:"Share generously",run:g=>{const c=afford(g,Math.round(g.money*0.3));
          if(c<1) return {text:"There was nothing left to share. They did not believe you.",stats:{happiness:-10}};
          return {text:`You gave away ${money(g,c)}. You were, briefly, everyone's favourite.`,money:-c,stats:{happiness:+14}};} },
      { cost:g=>`${money(g,afford(g,g.money*0.1))} \u2014 10% of your money`, label:"Help only close family",run:g=>{const c=afford(g,Math.round(g.money*0.1));
          return {text:"You helped the people who'd have helped you.",money:-c,stats:{happiness:+10,smarts:+3}};} },
      { label:"Refuse everyone", run:()=>({text:"You said no to all of it. The phone stopped ringing.",stats:{happiness:-12}}) },
      { label:"Move away quietly",run:g=>({text:"You moved without telling anyone where.",money:-afford(g,local(g,rint(3000,20000))),stats:{happiness:+6}}) },
    ]}},
{ id:"mugged", min:14, max:90, w:1, choice:{
    text:g=>`${stranger().replace(/^a /,"A ").replace(/^s/,"S")} has cornered you ${chance(0.5)?"by "+outside(g):"on the way home"} ${weather()} and wants your things.`,
    choices:[
      { label:"Hand it over",  run:g=>{const loss=afford(g,local(g,rint(50,1200)));return {text:`You gave them everything. They ran.`,money:-loss,stats:{happiness:-10}};} },
      { label:"Fight back",    run:g=>chance(0.4)?({text:"You fought them off and kept your things.",stats:{happiness:+8,health:-6}}):({text:"You fought and came off much worse.",money:-afford(g,local(g,rint(50,1200))),stats:{health:-20,happiness:-16}}) },
      { label:"Run",           run:()=>chance(0.6)?({text:"You outran them.",stats:{happiness:-4,health:+1}}):({text:"They caught you. It went badly.",stats:{health:-14,happiness:-14}}) },
    ]}},
{ id:"neighbour_feud", min:20, max:85, w:1, choice:{
    text:"Your neighbour's tree is dropping branches onto your property.",
    choices:[
      { label:"Talk to them",    run:()=>chance(0.65)?({text:"They apologised and cut it back. Neighbourly.",stats:{happiness:+6}}):({text:"They told you where to go. Frosty ever since.",stats:{happiness:-7}}) },
      { label:"Cut it yourself", run:()=>chance(0.5)?({text:"You trimmed it. They never noticed.",stats:{happiness:+3}}):({text:"They noticed. There were letters from solicitors.",stats:{happiness:-12}}) },
      { label:"Report them",     run:()=>({text:"The council got involved. It took eleven months.",stats:{happiness:-5,smarts:+1}}) },
    ]}},
{ id:"stranger_collapse", min:14, max:90, w:1, choice:{
    text:g=>`${stranger().replace(/^a /,"A ").replace(/^s/,"S")} has gone down ${chance(0.5)?"outside "+outside(g):"in the street in front of you"}, ${timeOfDay()}.`,
    choices:[
      { label:"Give first aid", run:g=>chance(0.5+g.stats.smarts/300)?({text:"You kept them alive until the ambulance came. They lived.",stats:{happiness:+22,smarts:+3},fame:+4}):({text:"You did what you could. It wasn't enough.",stats:{happiness:-14}}) },
      { label:"Call an ambulance",run:()=>({text:"You called for help and waited with them.",stats:{happiness:+10}}) },
      { label:"Walk past",      run:()=>({text:"You told yourself someone else would stop.",stats:{happiness:-12}}) },
    ]}},
{ id:"illness", min:20, max:95, w:1, auto:()=>({ text:`You came down with ${pick(["a brutal flu","food poisoning","bronchitis","a stomach bug","shingles","a chest infection"])} and lost two weeks.`, stats:{ health:-10, happiness:-6 } }) },
{ id:"car_accident", min:17, max:90, w:4, req:g=>g.assets.cars.length>0, choice:{
    text:"You've been in a crash. The other driver ran a red light but is denying it.",
    choices:[
      { label:"Claim on insurance",run:g=>{const c=local(g,rint(1000,22000));
          return {text:"You went through insurance and let them fight it.",money:-afford(g,c),stats:{health:-12,happiness:-8},insuranceClaim:"car"};} },
      { label:"Take them to court",run:g=>chance(0.5)?({text:"You won. They paid for everything.",money:+local(g,rint(2000,30000)),stats:{health:-12,happiness:+6}}):({text:"You lost and paid your own costs too.",money:-afford(g,local(g,rint(4000,30000))),stats:{health:-12,happiness:-18}}) },
      { label:"Settle privately",  run:g=>({text:"You took cash in hand and said no more about it.",money:+local(g,rint(300,4000)),stats:{health:-12,happiness:-3}}) },
    ]}},
{ id:"burgled", min:20, max:90, w:2, auto:g=>{ const loss=afford(g,local(g,rint(500,20000))); return { text:"Your home was burgled while you were out.", money:-loss, stats:{ happiness:-20 }, insuranceClaim:"home" }; } },
{ id:"identity_theft", min:20, max:85, w:1, auto:g=>{ const loss=afford(g,Math.round(g.money*rint(5,30)/100)); return { text:`Someone stole your identity and ran up ${money(g,loss)} in debt.`, money:-loss, stats:{ happiness:-16 } }; } },
{ id:"jury", min:21, max:70, w:1, choice:{
    text:"You've been called for jury duty on a serious case.",
    choices:[
      { label:"Serve properly",  run:()=>({text:"You took it seriously. It stayed with you for years.",stats:{smarts:+7,happiness:-4}}) },
      { label:"Try to get out of it",run:()=>chance(0.5)?({text:"You got yourself excused.",stats:{happiness:+3}}):({text:"They saw straight through you and you served anyway.",stats:{happiness:-6,smarts:+3}}) },
    ]}},
{ id:"charity_ask", min:18, max:95, w:1, choice:{
    text:g=>`${pick(["A hospice","A food bank","A search and rescue crew","An air ambulance","A refuge","A children's ward","A homelessness charity","A cause you have never talked about"])} is asking, and ${pick(["they have your address","someone you know is doing the run","it is on every screen you look at","a friend has tagged you in it"])}.`,
    choices:[
      { cost:g=>`about ${money(g,afford(g,g.money*0.05+250))}`, label:"Give generously",run:g=>{const c=afford(g,Math.round(g.money*0.05)+rint(50,500));
          if(c<1) return {text:"You looked at your balance and closed the letter.",stats:{happiness:-5}};
          return {text:`You donated ${money(g,c)}.`,money:-c,stats:{happiness:+12}};} },
      { label:"Give a little",  run:g=>{const c=afford(g,local(g,rint(20,200)));
          return c<1?({text:"You had nothing spare, which was its own answer.",stats:{happiness:-4}})
                   :({text:`You gave ${money(g,c)}, which was what you could spare.`,money:-c,stats:{happiness:+6}});} },
      { label:"Volunteer instead",run:()=>({text:"You gave your time rather than your money.",stats:{happiness:+11,health:+2}}) },
      { label:"Ignore it",      run:()=>({text:"You closed the letter and moved on.",stats:{happiness:-2}}) },
    ]}},
{ id:"religion", min:14, max:90, w:1, choice:{
    text:"Someone invited you to join their church community.",
    choices:[
      { label:"Go along", run:()=>chance(0.6)?({text:"You found real community there.",stats:{happiness:+13}}):({text:"It wasn't for you, but they were kind about it.",stats:{happiness:+2}}) },
      { label:"Decline",  run:()=>({text:"You declined politely.",stats:{}}) },
    ]}},
{ id:"found_money", min:6, max:95, w:1, auto:g=>{ const amt=rint(5,220); return { text:`You found ${money(g,amt)} in an old coat pocket.`, money:+amt, stats:{ happiness:+5 } }; } },
{ id:"nice_stranger", min:8, max:95, w:2, auto:()=>({ text:`A stranger ${pick(["paid for your coffee","complimented your coat","let you go ahead in the queue","returned your dropped phone"])}. It made your week.`, stats:{ happiness:+7 } }) },
{ id:"weather", min:10, max:95, w:1, auto:()=>({ text:`A ${pick(["storm","heatwave","flood","blizzard","hurricane"])} hit your area and knocked out power for days.`, stats:{ happiness:-6, health:-2 } }) },
{ id:"award", min:22, max:80, w:3, req:g=>!!g.job&&g.jobPerf>70, auto:()=>({ text:"You won an industry award. There was a plaque and a lukewarm buffet.", stats:{ happiness:+14 }, fame:+4 }) },
{ id:"emigrate_offer", min:22, max:60, w:1, once:true, choice:{
    text:"You've been offered work abroad. It would mean leaving everything here.",
    choices:[
      { label:"Take it",      run:g=>({text:"You packed up and went. A completely different life.",money:+local(g,rint(2000,20000)),stats:{happiness:+14,smarts:+6},flags:{expat:true}}) },
      { label:"Try it for a year",run:()=>({text:"You went for a year and came home changed.",stats:{happiness:+10,smarts:+5}}) },
      { label:"Stay",         run:()=>({text:"You stayed. You wonder about it occasionally.",stats:{happiness:-5}}) },
    ]}},
/* ---- extra late-life decisions: 75+ was running dry ---- */
{ id:"give_up_driving", min:74, max:95, w:6, once:true, choice:{
    text:"Your family thinks it's time you stopped driving.",
    choices:[
      { label:"Hand over the keys", run:()=>({text:"You gave up the keys. It felt like losing a limb, then it didn't.",stats:{happiness:-6,health:+3,smarts:+2}}) },
      { label:"Take a retest",      run:()=>chance(0.5)?({text:"You passed the retest and said nothing further about it.",stats:{happiness:+14}}):({text:"You failed the retest. The decision was made for you.",stats:{happiness:-14}}) },
      { label:"Keep driving anyway",run:()=>chance(0.7)?({text:"You kept driving. Nothing happened, thankfully.",stats:{happiness:+6}}):({text:"You had a crash. Nobody died, but that was luck.",stats:{health:-20,happiness:-18}}) },
    ]}},
{ id:"assisted_living", min:76, max:99, w:6, once:true, req:g=>!g.homeless, choice:{
    text:"Managing the house alone is getting genuinely difficult.",
    choices:[
      { label:"Move somewhere supported",run:g=>({text:"You moved somewhere with help on hand. Smaller, and easier.",money:-afford(g,local(g,rint(4000,40000))),stats:{health:+8,happiness:+4}}) },
      { label:"Move in with family",     run:g=>{const k=g.rels.find(r=>r.type==="child"&&r.alive);
          return k?({text:`You moved in with ${k.name}. Complicated, but not lonely.`,stats:{happiness:+10,health:+5},relAdj:{id:k.id,d:+12}}):({text:"There was nobody to move in with.",stats:{happiness:-14}});} },
      { label:"Stay put and cope",       run:()=>({text:"You stayed in your own home and managed. Mostly.",stats:{happiness:+8,health:-8}}) },
    ]}},
{ id:"estranged_return", min:70, max:99, w:5, once:true, choice:{
    text:"Someone you fell out with decades ago has written to you.",
    choices:[
      { label:"Write back",       run:()=>chance(0.7)?({text:"You made peace after all those years. An enormous weight lifted.",stats:{happiness:+24}}):({text:"You wrote back and reopened an old wound.",stats:{happiness:-12}}) },
      { label:"Meet in person",   run:()=>chance(0.6)?({text:"You met. It was awkward, then it was fine, then it was good.",stats:{happiness:+20,health:+2}}):({text:"You met. It confirmed why you'd stopped speaking.",stats:{happiness:-14}}) },
      { label:"Don't reply",      run:()=>({text:"You put the letter in a drawer and left it there.",stats:{happiness:-6}}) },
    ]}},
{ id:"risky_op", min:72, max:99, w:6, choice:{
    text:"Surgeons have offered an operation that could help a lot — or go badly.",
    choices:[
      { label:"Have the operation",run:g=>{const c=local(g,rint(3000,30000));
          return chance(0.68)?({text:"The operation worked. You felt years younger.",money:-afford(g,c),stats:{health:+26,happiness:+16},insuranceClaim:"health"})
            :({text:"There were complications. You never fully recovered.",money:-afford(g,c),stats:{health:-24,happiness:-16},insuranceClaim:"health"});} },
      { label:"Decline it",        run:()=>({text:"You declined and chose the life you already had.",stats:{happiness:+6,health:-6}}) },
      { label:"Get another opinion",run:()=>chance(0.5)?({text:"A second surgeon found a gentler option that worked.",stats:{health:+14,happiness:+10}}):({text:"The second opinion agreed, and you'd lost a year deciding.",stats:{health:-8}}) },
    ]}},
{ id:"tell_your_story", min:70, max:99, w:5, choice:{
    text:"A grandchild has asked you what your life was actually like.",
    choices:[
      { label:"Tell them everything",run:()=>({text:"You told them the truth, including the parts you'd never said aloud.",stats:{happiness:+20,smarts:+2}}) },
      { label:"Tell the good parts", run:()=>({text:"You gave them the version with the sharp edges filed off.",stats:{happiness:+10}}) },
      { label:"Change the subject",  run:()=>({text:"You said there wasn't much to tell.",stats:{happiness:-8}}) },
    ]}},
{ id:"downsize", min:70, max:97, w:5, once:true, req:g=>g.assets.houses.length>0&&!g.homeless, choice:{
    text:"The family home is far too big for you now.",
    choices:[
      { label:"Sell and downsize",run:g=>{const h=g.assets.houses[0];
          if(!h) return { text:"You'd already let the place go.", stats:{happiness:-3} };
          return {text:`You sold the ${h.name} and moved somewhere manageable.`,money:+Math.round(h.value*0.45),stats:{happiness:+8,health:+4}};} },
      { label:"Keep it for family",run:()=>({text:"You kept it so everyone would have somewhere to come back to.",stats:{happiness:+12,health:-4}}) },
    ]}},
{ id:"final_wishes", min:75, max:99, w:5, once:true, choice:{
    text:"Your doctor wants to talk about what you'd want if things got serious.",
    choices:[
      { label:"Set it all down clearly",run:()=>({text:"You wrote down exactly what you wanted. Your family never had to guess.",stats:{happiness:+14,smarts:+3}}) },
      { label:"Talk it over with family",run:()=>({text:"You had the hard conversation together. It brought everyone closer.",stats:{happiness:+16}}) },
      { label:"Refuse to discuss it",  run:()=>({text:"You said you'd rather not think about it.",stats:{happiness:-8}}) },
    ]}},
{ id:"old_rival", min:68, max:99, w:4, choice:{
    text:"You've outlived someone you spent years competing with.",
    choices:[
      { label:"Go to the funeral",run:()=>({text:"You went, and found you mostly felt sad.",stats:{happiness:-4,smarts:+3}}) },
      { label:"Toast to them",    run:()=>({text:"You raised a glass to a worthy opponent.",stats:{happiness:+9}}) },
      { label:"Feel nothing",     run:()=>({text:"You read the notice and turned the page.",stats:{happiness:-2}}) },
    ]}},

/* ---- extra childhood decisions ---- */
{ id:"class_pet", min:6, max:11, w:5, choice:{
    text:"The teacher needs someone to look after the class hamster over the holidays.",
    choices:[
      { label:"Volunteer",  run:()=>chance(0.8)?({text:"You looked after it perfectly and were praised in assembly.",stats:{happiness:+11,smarts:+3}}):({text:"The hamster did not survive your care. Nobody blamed you out loud.",stats:{happiness:-14}}) },
      { label:"Stay quiet", run:()=>({text:"You looked at your desk until someone else put their hand up.",stats:{happiness:-2}}) },
    ]}},
{ id:"team_pick", min:7, max:13, w:3, choice:{
    text:"Teams are being picked in PE and you're one of the last left.",
    choices:[
      { label:"Play your heart out",run:g=>chance(0.4+g.stats.health/300)?({text:"You scored and nobody picked you last again.",stats:{happiness:+14,health:+4}}):({text:"You tried hard and it made no difference.",stats:{happiness:-6,health:+2}}) },
      { label:"Pretend not to care",run:()=>({text:"You acted like it didn't matter. It did.",stats:{happiness:-7}}) },
      { label:"Fake an injury",     run:()=>({text:"You sat it out with an imaginary limp.",stats:{happiness:-3,smarts:+2}}) },
    ]}},
{ id:"bad_report", min:8, max:15, w:5, choice:{
    text:"Your report card is much worse than your parents are expecting.",
    choices:[
      { label:"Show them honestly",run:()=>chance(0.6)?({text:"They were disappointed but helped you fix it.",stats:{smarts:+7,happiness:+3}}):({text:"They hit the roof and grounded you.",stats:{happiness:-12,smarts:+2}}) },
      { label:"Hide it",           run:()=>chance(0.4)?({text:"They never asked. You got away with it.",stats:{happiness:+3,smarts:-2}}):({text:"They found it. Hiding it was the real crime.",stats:{happiness:-16}}) },
      { label:"Forge the grades",  run:()=>chance(0.35)?({text:"The forgery held. You felt clever and slightly sick.",stats:{happiness:+2,smarts:+2}}):({text:"The school called. It was a whole thing.",stats:{happiness:-18}}) },
    ]}},
{ id:"friend_moves", min:6, max:14, w:3, choice:{
    text:"Your best friend's family is moving away.",
    choices:[
      { label:"Promise to write",run:()=>chance(0.45)?({text:"You actually kept it up for years.",stats:{happiness:+10}}):({text:"You wrote twice and then life happened.",stats:{happiness:-7}}) },
      { label:"Throw them a send-off",run:()=>({text:"You organised a proper goodbye. They never forgot it.",stats:{happiness:+13}}) },
      { label:"Pull away first", run:()=>({text:"You went cold before they could leave. It hurt anyway.",stats:{happiness:-11}}) },
    ]}},
/* ============================================================
   MULTI-STEP SCENES
   An entry event whose choice returns { next: "..." } hands straight
   into a follow-up question. Follow-ups are `chained` so they never
   appear on their own.
   ============================================================ */

/* --- caught shoplifting --- */
{ id:"sc_caught", min:12, max:19, w:6, once:true, choice:{
    text:"Security stops you at the door. There's something in your bag you didn't pay for.",
    choices:[
      { label:"Confess immediately", run:()=>({text:"You admitted it on the spot.",stats:{happiness:-8},next:"sc_caught_parents"}) },
      { label:"Deny everything",     run:()=>({text:"You insisted they had the wrong person.",stats:{happiness:-4},next:"sc_caught_cctv"}) },
      { label:"Run for it",          run:()=>chance(0.4)?({text:"You bolted and lost them in the car park.",stats:{happiness:+6,health:-2}}):({text:"You got about nine metres. The police were called.",stats:{happiness:-20},arrest:{name:"theft",sentence:[1,1]}}) },
    ]}},
{ id:"sc_caught_parents", chained:true, min:0, max:99, choice:{
    text:"They've called your parents. Your mother is in the car outside, and she hasn't said a word.",
    choices:[
      { label:"Apologise properly",run:()=>({text:"You apologised without excuses. She softened, eventually.",stats:{happiness:+6,smarts:+3},flags:{honest:true}}) },
      { label:"Blame your friends",run:()=>({text:"You said they'd dared you. She didn't believe a word of it.",stats:{happiness:-12}}) },
      { label:"Say nothing at all", run:()=>({text:"You stared out of the window the whole way home.",stats:{happiness:-8}}) },
    ]}},
{ id:"sc_caught_cctv", chained:true, min:0, max:99, choice:{
    text:"The manager turns the monitor round. The footage is very clear.",
    choices:[
      { label:"Admit it now",   run:()=>({text:"You caved. They let you off with a ban from the shop.",stats:{happiness:-10}}) },
      { label:"Keep denying it",run:()=>({text:"You kept lying to a screen showing you doing it. They called the police.",stats:{happiness:-22},arrest:{name:"theft",sentence:[1,2]}}) },
    ]}},

/* --- the car --- */
{ id:"sc_car", min:18, max:80, w:6, req:g=>g.assets.cars.length>0, choice:{
    text:"Your car has died at the side of the road, and it's raining.",
    choices:[
      { label:"Call a garage",  run:()=>({text:"A garage towed it away and promised a quote by Tuesday.",stats:{happiness:-4},next:"sc_car_quote"}) },
      { label:"Try to fix it yourself",run:g=>chance(0.35+g.stats.smarts/300)?({text:"You got it running again with a screwdriver and spite.",stats:{happiness:+14,smarts:+3}}):({text:"You made it considerably worse.",money:-afford(g,local(g,rint(300,3000))),stats:{happiness:-10}}) },
      { label:"Abandon it",     run:g=>{const c=g.assets.cars[0];
          if(!c) return { text:"The car was already gone.", stats:{happiness:-3} };
          g.assets.cars=g.assets.cars.filter(x=>x.id!==c.id);
          return {text:`You left the ${c.name} where it was and got the bus home.`,stats:{happiness:-8}};} },
    ]}},
{ id:"sc_car_quote", chained:true, min:0, max:99, choice:{
    text:"The quote comes in at roughly double what the car is worth.",
    choices:[
      { label:"Pay it anyway",  run:g=>({text:"You paid it. The car ran beautifully for another decade.",money:-afford(g,local(g,rint(1500,9000))),stats:{happiness:+6,health:0}}) },
      { label:"Get a second quote",run:g=>chance(0.6)?({text:"The second garage did it for a third of the price.",money:-afford(g,local(g,rint(400,2500))),stats:{happiness:+10,smarts:+3}}):({text:"The second quote was worse, and you'd wasted a fortnight.",money:-afford(g,local(g,rint(1500,9000))),stats:{happiness:-8}}) },
      { label:"Scrap it",       run:g=>{const c=g.assets.cars[0];if(c)g.assets.cars=g.assets.cars.filter(x=>x.id!==c.id);
          return {text:"You scrapped it and took the cheque.",money:+local(g,rint(80,600)),stats:{happiness:-6}};} },
    ]}},

/* --- the job offer --- */
{ id:"sc_offer", min:20, max:62, w:1, req:g=>!g.job&&!g.special&&g.age>=20, choice:{
    text:"After weeks of interviews, they've finally made you an offer.",
    choices:[
      { label:"Hear the number", run:()=>({text:"They named a figure.",next:"sc_offer_number"}) },
      { label:"Withdraw — bad feeling",run:()=>({text:"You pulled out. Something about the place was off.",stats:{happiness:+2,smarts:+2}}) },
    ]}},
{ id:"sc_offer_number", chained:true, min:0, max:99, choice:{
    text:"It's noticeably below what the role is worth, and they know it.",
    choices:[
      { label:"Negotiate hard", run:g=>chance(0.5+g.stats.smarts/300)?({text:"They moved. You started well above their first offer.",next:"sc_offer_start",flags:{negotiator:true}}):({text:"They withdrew the offer entirely.",stats:{happiness:-16}}) },
      { label:"Accept it",      run:()=>({text:"You took it, and quietly resented the number for a year.",next:"sc_offer_start"}) },
      { label:"Walk away",      run:()=>({text:"You turned it down and kept looking.",stats:{happiness:-6,smarts:+2}}) },
    ]}},
{ id:"sc_offer_start", chained:true, min:0, max:99, choice:{
    text:"First week. Your new manager asks how you'd like to be managed.",
    choices:[
      { label:"Be honest",   run:()=>({text:"You told them plainly. It set the tone for years.",stats:{happiness:+10,smarts:+3}}) },
      { label:"Say whatever they want to hear",run:()=>({text:"You gave the safe answer and learned nothing.",stats:{happiness:-2}}) },
    ]}},

/* --- the argument --- */
{ id:"sc_row", min:20, max:80, w:1, req:g=>g.rels.some(r=>r.type==="partner"&&r.alive), choice:{
    text:"A small disagreement with your partner is escalating fast.",
    choices:[
      { label:"Push the point",run:()=>({text:"You refused to let it go.",next:"sc_row_cruel"}) },
      { label:"Back down",     run:g=>{const p=g.rels.find(r=>r.type==="partner"&&r.alive);
          return {text:"You let it go. It wasn't worth it.",stats:{happiness:-3},relAdj:p?{id:p.id,d:+4}:null};} },
      { label:"Walk out",      run:g=>{const p=g.rels.find(r=>r.type==="partner"&&r.alive);
          return {text:"You took your coat and left mid-sentence.",stats:{happiness:-10},relAdj:p?{id:p.id,d:-14}:null};} },
    ]}},
{ id:"sc_row_cruel", chained:true, min:0, max:99, choice:{
    text:"They say something genuinely cruel — the kind of thing you can't unhear.",
    choices:[
      { label:"Say something worse",run:g=>{const p=g.rels.find(r=>r.type==="partner"&&r.alive);
          return {text:"You went further than they did, and you both knew it.",stats:{happiness:-16},relAdj:p?{id:p.id,d:-30}:null};} },
      { label:"Tell them it hurt", run:g=>{const p=g.rels.find(r=>r.type==="partner"&&r.alive);
          return chance(0.65)?({text:"They apologised properly. It brought you closer.",stats:{happiness:+12},relAdj:p?{id:p.id,d:+18}:null}):({text:"They doubled down.",stats:{happiness:-14},relAdj:p?{id:p.id,d:-18}:null});} },
      { label:"Say nothing",       run:()=>({text:"You filed it away with the others.",stats:{happiness:-10}}) },
    ]}},

/* --- the mugging --- */
{ id:"sc_mug", min:15, max:80, w:1, choice:{
    text:g=>`${pick(["Two people","Three lads","A group of them","Two blokes"])} have blocked the pavement ahead ${chance(0.55)?"by "+outside(g):timeOfDay()} and are walking towards you.`,
    choices:[
      { label:"Stand your ground",run:()=>({text:"You stopped and squared up.",next:"sc_mug_knife"}) },
      { label:"Cross the road",   run:g=>chance(0.7)?({text:"They carried on past. Probably nothing.",stats:{happiness:-2}}):({text:"They followed and took your wallet.",money:-afford(g,local(g,rint(40,700))),stats:{happiness:-12}}) },
      { label:"Turn and walk back",run:()=>({text:"You went the long way home and felt foolish and safe.",stats:{happiness:-3}}) },
    ]}},
{ id:"sc_mug_knife", chained:true, min:0, max:99, choice:{
    text:"One of them shows you a knife.",
    choices:[
      { label:"Give them everything",run:g=>({text:"You handed it over. They ran.",money:-afford(g,local(g,rint(50,900))),stats:{happiness:-14}}) },
      { label:"Fight",               run:g=>chance(0.3)?({text:"You got the knife off him. You still don't know how.",stats:{happiness:+10,health:-10}}):({text:"You were stabbed in the arm and robbed anyway.",money:-afford(g,local(g,rint(50,900))),stats:{health:-30,happiness:-22}}) },
      { label:"Scream for help",     run:g=>chance(0.55)?({text:"Lights came on across the street and they bolted.",stats:{happiness:+4,health:-2}}):({text:"Nobody came. They took everything.",money:-afford(g,local(g,rint(50,900))),stats:{health:-12,happiness:-18}}) },
    ]}},

/* --- the survey --- */
{ id:"sc_house", min:24, max:65, w:5, req:g=>g.money>40000&&g.assets.houses.length===0, choice:{
    text:"You've had an offer accepted on a house. The survey has come back.",
    choices:[
      { label:"Read the survey properly",run:()=>({text:"You read all forty pages.",next:"sc_house_damp"}) },
      { cost:g=>`${money(g,afford(g,g.money*0.6))}\u2013${money(g,afford(g,g.money*0.75))}`, label:"Skim it and proceed",     run:g=>chance(0.5)?({text:"It was fine. You moved in.",money:-afford(g,Math.round(g.money*0.6)),stats:{happiness:+16}}):({text:"You moved in and discovered the roof six weeks later.",money:-afford(g,Math.round(g.money*0.75)),stats:{happiness:-14}}) },
    ]}},
{ id:"sc_house_damp", chained:true, min:0, max:99, choice:{
    text:"There's rising damp through the whole ground floor. The seller says they'll not budge on price.",
    choices:[
      { label:"Walk away",       run:()=>({text:"You walked away and kept your deposit.",stats:{happiness:-6,smarts:+5}}) },
      { cost:g=>`${money(g,afford(g,g.money*0.45))} \u2014 45% of your money`, label:"Renegotiate hard",run:g=>chance(0.55)?({text:"They knocked a serious amount off. You bought it.",money:-afford(g,Math.round(g.money*0.45)),stats:{happiness:+18,smarts:+4}}):({text:"They pulled out and relisted it.",stats:{happiness:-12}}) },
      { cost:g=>`${money(g,afford(g,g.money*0.7))} \u2014 70% of your money`, label:"Buy it anyway",   run:g=>({text:"You bought it and spent two years fighting the damp.",money:-afford(g,Math.round(g.money*0.7)),stats:{happiness:-8}}) },
    ]}},

/* --- the cover-up --- */
{ id:"sc_lie", min:22, max:62, w:5, req:g=>!!g.job, choice:{
    text:"Your boss asks you to leave something out of a report.",
    choices:[
      { label:"Do as asked",     run:()=>({text:"You left it out.",next:"sc_lie_auditor"}) },
      { label:"Refuse outright", run:()=>chance(0.5)?({text:"They backed down and never asked again.",stats:{happiness:+10,smarts:+3}}):({text:"You were frozen out of everything that mattered after that.",stats:{happiness:-14}}) },
      { label:"Ask for it in writing",run:()=>({text:"They dropped it immediately. Nobody puts that in writing.",stats:{happiness:+12,smarts:+6}}) },
    ]}},
{ id:"sc_lie_auditor", chained:true, min:0, max:99, choice:{
    text:"An auditor is now asking you directly, on the record, whether anything was omitted.",
    choices:[
      { label:"Tell the truth",  run:()=>({text:"You told them everything. Your boss was gone within a month; so were you.",fire:true,stats:{happiness:+6,smarts:+4},flags:{whistleblower:true}}) },
      { label:"Cover for your boss",run:()=>chance(0.5)?({text:"It held. Your boss owes you, and knows it.",stats:{happiness:-6}}):({text:"It didn't hold, and your name was on the report.",fire:true,stats:{happiness:-24},flags:{disgraced:true}}) },
    ]}},

/* --- the collapse --- */
{ id:"sc_collapse", min:16, max:85, w:1, choice:{
    text:g=>`${stranger().replace(/^a /,"A ").replace(/^s/,"S")} ahead of you in ${pick(["the queue","the aisle","the ticket hall","the line at the counter"])} goes down hard and is not moving.`,
    choices:[
      { label:"Start CPR",      run:g=>chance(0.45+g.stats.smarts/300)?({text:"You got him breathing again before the ambulance arrived.",stats:{happiness:+18,smarts:+3},next:"sc_collapse_hospital"}):({text:"You did everything you could. It wasn't enough.",stats:{happiness:-20}}) },
      { label:"Call an ambulance",run:()=>({text:"You called it in and kept everyone back.",stats:{happiness:+8}}) },
      { label:"Leave it to others",run:()=>({text:"Someone else stepped in. You left.",stats:{happiness:-10}}) },
    ]}},
{ id:"sc_collapse_hospital", chained:true, min:0, max:99, choice:{
    text:"His family have tracked you down and want to thank you in person.",
    choices:[
      { label:"Go and meet them",run:()=>({text:"You met them. It was overwhelming, and one of the better days of your life.",stats:{happiness:+22},fame:+5}) },
      { label:"Decline politely",run:()=>({text:"You said it wasn't necessary and wished them well.",stats:{happiness:+8}}) },
      { label:"Do a press interview",run:()=>({text:"The local paper ran it. You were briefly a minor hero.",stats:{happiness:+12},fame:+14}) },
    ]}},

/* --- the party --- */
{ id:"sc_party", min:16, max:40, w:3, choice:{
    text:"Someone at the party is handing round something stronger than drink.",
    choices:[
      { label:"Take some",   run:()=>({text:"You took it.",next:"sc_party_after"}) },
      { label:"Pass",        run:()=>({text:"You passed and topped up your drink instead.",stats:{happiness:+2,health:+1}}) },
      { label:"Leave",       run:()=>({text:"You made your excuses and went home early.",stats:{happiness:-3,health:+2}}) },
    ]}},
{ id:"sc_party_after", chained:true, min:0, max:99, choice:{
    text:"It's 4am and you feel genuinely awful. Someone offers you more.",
    choices:[
      { label:"Take it",     run:()=>({text:"You kept going until morning. It cost you the rest of the week.",stats:{health:-16,happiness:-8},flags:{party:true}}) },
      { label:"Go home",     run:()=>({text:"You got a taxi home and slept for fourteen hours.",stats:{health:-6,happiness:+2}}) },
      { label:"Never again", run:()=>({text:"You decided that was the end of that, and it was.",stats:{health:-4,happiness:+8,smarts:+3}}) },
    ]}},
/* ============================================================
   CONTEXTUAL EVENTS
   These only fire because of something you already did — a career you
   built, a fortune you made, a record you earned.
   ============================================================ */

/* --- your own headline move comes back around --- */
{ id:"sp_repeat_big", min:16, max:80, w:9, priority:true,
  req:g=>g.special && bigOf(g) && g.fame >= bigOf(g).minFame,
  choice:{
    text:g=>{ const b = bigOf(g); return `Your team has a window open. They want to know if you're up for another ${b && b.noun ? b.noun : "run at it"}.`; },
    choices:[
      { label:g=>bigOf(g) ? bigOf(g).label : "Do it", run:()=>({ text:"You told them to book it.", doBig:true }) },
      { label:"Hold out and build hype first", run:()=>({ text:"You made them wait. The anticipation did you favours.", stats:{happiness:+4}, buzz:+18 }) },
      { label:"Turn it down — you're tired", run:()=>({ text:"You passed. Your team were not thrilled.", stats:{happiness:+8, health:+5}, fame:-3 }) },
    ]}},

/* --- the cost of being famous --- */
{ id:"sp_burnout", min:18, max:75, w:6, req:g=>g.special && g.fame >= 50, choice:{
    text:"You haven't had a week off in three years and it's showing.",
    choices:[
      { label:"Take a year out",   run:()=>({ text:"You disappeared for a year. Your health came back; your profile slipped.", stats:{health:+18,happiness:+16}, fame:-rint(8,16) }) },
      { label:"Push through it",   run:()=>chance(0.5)?({text:"You pushed through and got away with it.",stats:{health:-10,happiness:-8}}):({text:"You collapsed mid-schedule and it made the papers.",stats:{health:-24,happiness:-20},fame:-rint(3,8)}) },
      { label:"Cut back quietly",  run:()=>({ text:"You thinned the diary without announcing it.", stats:{health:+9,happiness:+8}, fame:-4 }) },
    ]}},
{ id:"sp_paparazzi", min:16, max:80, w:6, req:g=>g.fame >= 55, choice:{
    text:"Photographers are camped outside your house again.",
    choices:[
      { label:"Ignore them",       run:()=>({ text:"You stopped looking out of the window.", stats:{happiness:-6} }) },
      { label:"Confront them",     run:g=>chance(0.45)?({text:"The clip went everywhere. You looked unhinged.",fame:+rint(5,12),stats:{happiness:-14}}):({text:"You lost your temper and were sued for it.",money:-local(g,rint(5000,60000)),stats:{happiness:-18}}) },
      { label:"Move somewhere private", run:g=>({ text:"You bought your way behind a gate.", money:-afford(g,local(g,rint(60000,900000))), stats:{happiness:+12} }) },
    ]}},
{ id:"sp_endorse", min:18, max:75, w:7, req:g=>g.fame >= 55, choice:{
    text:"A brand wants to put your face on something.",
    choices:[
      { label:"Take the money",    run:g=>({ text:"You signed the deal.", money:+Math.round(rint(40000,900000)*(1+g.fame/60)), stats:{happiness:+8}, fame:+2 }) },
      { label:"Only if you use it",run:g=>chance(0.6)?({text:"You held out for a product you actually liked.",money:+Math.round(rint(20000,400000)*(1+g.fame/60)),stats:{happiness:+14}}):({text:"You held out and the deal went elsewhere.",stats:{happiness:-6}}) },
      { label:"Refuse on principle",run:()=>({ text:"You turned it down. It cost you a fortune and you slept fine.", stats:{happiness:+10}, buzz:+6 }) },
    ]}},
{ id:"sp_award", min:18, max:80, w:6, req:g=>g.special && g.fame >= 40, choice:{
    text:"You've been nominated for a major award in your field.",
    choices:[
      { label:"Go, and prepare a speech", run:()=>chance(0.4)?({text:"You won. The speech was good, too.",fame:+rint(6,15),stats:{happiness:+24}}):({text:"You lost, on camera, holding a speech you never gave.",fame:+rint(1,4),stats:{happiness:-10}}) },
      { label:"Go and enjoy the night",   run:()=>({ text:"You went, lost, and had a wonderful time anyway.", fame:+rint(2,6), stats:{happiness:+12} }) },
      { label:"Don't attend",             run:()=>({ text:"You stayed home. The empty seat was noted.", fame:-2, stats:{happiness:+2} }) },
    ]}},
{ id:"sp_protege", min:30, max:85, w:5, req:g=>g.special && g.fame >= 45, choice:{
    text:"A young hopeful has asked you to mentor them.",
    choices:[
      { label:"Take them on",  run:()=>chance(0.55)?({text:"They became a star and never stopped crediting you.",fame:+rint(4,10),stats:{happiness:+18}}):({text:"They took what they needed and vanished.",stats:{happiness:-10}}) },
      { label:"Give them an hour", run:()=>({ text:"You gave them one honest hour of advice.", stats:{happiness:+8} }) },
      { label:"Refuse",        run:()=>({ text:"You told them the industry owed nobody anything.", stats:{happiness:-4} }) },
    ]}},
{ id:"sp_manager", min:20, max:80, w:5, once:true, req:g=>g.special && g.fame >= 35, choice:{
    text:"Your accountant has found a hole in the books. Your manager has been helping themselves.",
    choices:[
      { label:"Sue them",   run:g=>chance(0.55)?({text:"You won and recovered most of it.",money:+Math.min(9000000,Math.round(g.money*0.25)+rint(20000,400000)),stats:{happiness:+6}}):({text:"The case dragged for years and you lost.",money:-afford(g,local(g,rint(20000,300000))),stats:{happiness:-20}}) },
      { label:"Fire them quietly", run:()=>({ text:"You cut them loose without a word to anyone.", stats:{happiness:-6} }) },
      { label:"Let it go",  run:()=>({ text:"You decided the fight would cost more than the money.", stats:{happiness:-12} }) },
    ]}},
{ id:"sp_biopic", min:45, max:95, w:5, once:true, req:g=>g.fame >= 75, choice:{
    text:"A studio wants to make a film about your life.",
    choices:[
      { label:"Sell the rights",  run:g=>({ text:"You sold your story.", money:+local(g,rint(400000,6000000)), fame:+rint(6,14), stats:{happiness:+10} }) },
      { label:"Only with control",run:()=>chance(0.5)?({text:"You kept final cut and it was honest and good.",fame:+rint(10,20),stats:{happiness:+20}}):({text:"Negotiations collapsed over control.",stats:{happiness:-8}}) },
      { label:"Refuse",           run:()=>({ text:"You said your life was not a product.", stats:{happiness:+6} }) },
    ]}},

/* --- what money attracts --- */
{ id:"rich_gala", min:25, max:90, w:5, req:g=>g.money > 2000000, choice:{
    text:"You've been invited to a charity gala where the donations are public.",
    choices:[
      { cost:g=>`${money(g,afford(g,g.money*0.06))} \u2014 6% of your money`, label:"Donate lavishly", run:g=>({ text:"You gave enough that the room turned to look.", money:-afford(g,g.money*0.06), fame:+rint(3,9), stats:{happiness:+14} }) },
      { cost:g=>`${money(g,afford(g,g.money*0.01))} \u2014 1% of your money`, label:"Donate modestly", run:g=>({ text:"You gave a sensible amount and left early.", money:-afford(g,g.money*0.01), stats:{happiness:+6} }) },
      { label:"Don't go",        run:()=>({ text:"You skipped it. Someone noticed you skipped it.", stats:{happiness:-3} }) },
    ]}},
{ id:"rich_claim", min:25, max:90, w:5, req:g=>g.money > 5000000, choice:{
    text:"Someone you barely remember is claiming you owe them a share of what you've built.",
    choices:[
      { label:"Fight it",   run:g=>chance(0.68)?({text:"You fought it off. The legal bill still hurt.",money:-afford(g,local(g,rint(30000,400000))),stats:{happiness:-6}}):({text:"They won a share of it.",money:-afford(g,g.money*0.2),stats:{happiness:-22}}) },
      { cost:g=>`${money(g,afford(g,g.money*0.07))} \u2014 7% of your money`, label:"Settle",     run:g=>({ text:"You paid to make it disappear.", money:-afford(g,g.money*0.07), stats:{happiness:-8} }) },
      { label:"Ignore it",  run:()=>chance(0.5)?({text:"They gave up.",stats:{happiness:+4}}):({text:"They took it to court and it got ugly and public.",fame:+4,stats:{happiness:-18}}) },
    ]}},

/* --- what a record follows you with --- */
{ id:"crim_accomplice", min:18, max:70, w:7, req:g=>g.criminalRecord >= 2 && !g.prison, choice:{
    text:"Someone you did time with is putting a crew together for one more job.",
    choices:[
      { label:"You're in",   run:g=>chance(0.42)?({text:"It went clean. Your cut was substantial.",money:+local(g,rint(20000,400000)),stats:{happiness:+10}}):({text:"It went wrong from the first minute.",arrest:{name:"armed robbery",sentence:[6,14]}}) },
      { label:"Drive only",  run:g=>chance(0.62)?({text:"You drove, took a smaller cut, and were home by two.",money:+local(g,rint(5000,80000)),stats:{happiness:+6}}):({text:"You were picked up two streets away.",arrest:{name:"robbery",sentence:[3,8]}}) },
      { label:"Walk away",   run:()=>({ text:"You told them you were done. They didn't take it well.", stats:{happiness:-4} }) },
    ]}},
{ id:"crim_watch", min:18, max:75, w:6, req:g=>g.criminalRecord >= 3 && !g.prison, choice:{
    text:"There's an unmarked car outside your place most mornings now.",
    choices:[
      { label:"Keep your head down", run:()=>({ text:"You went straight for a while. The car eventually stopped coming.", stats:{happiness:-5, smarts:+3} }) },
      { label:"Move cities",         run:g=>({ text:"You packed up and left the postcode behind.", money:-afford(g,local(g,rint(2000,30000))), stats:{happiness:+4} }) },
      { label:"Do a job anyway",     run:g=>chance(0.25)?({text:"You pulled it off under their noses.",money:+local(g,rint(5000,120000)),stats:{happiness:+14}}):({text:"They were waiting for exactly this.",arrest:{name:"burglary",sentence:[4,10]}}) },
    ]}},

/* --- what owning things brings --- */
{ id:"prop_developer", min:25, max:90, w:5, req:g=>g.assets.houses.length > 0, choice:{
    text:"A developer wants to buy your property for well over what it's worth.",
    choices:[
      { label:"Sell to them", run:g=>{ const h=g.assets.houses[0];
          if(!h) return { text:"By the time you decided, you had nothing left to sell them.", stats:{happiness:-4} };
          g.assets.houses=g.assets.houses.filter(x=>x.id!==h.id);
          return { text:`You sold the ${h.name} well above market.`, money:+Math.round(h.value*1.45), stats:{happiness:+10} }; } },
      { label:"Hold out for more", run:g=>{ const h=g.assets.houses[0];
          if(!h) return { text:"The property was gone before the deal closed.", stats:{happiness:-4} };
          if(!chance(0.45)) return { text:"They walked away and bought next door instead.", stats:{happiness:-8} };
          g.assets.houses=g.assets.houses.filter(x=>x.id!==h.id);
          return { text:`You squeezed them and they paid it.`, money:+Math.round(h.value*1.9), stats:{happiness:+16} }; } },
      { label:"Refuse to sell", run:()=>({ text:"You told them it wasn't for sale at any price.", stats:{happiness:+6} }) },
    ]}},

/* --- what a career leaves your children --- */
{ id:"kid_follows", min:38, max:85, w:5, once:true,
  req:g=>g.special && g.rels.some(r=>r.type==="child"&&r.alive&&r.age>=17&&r.age<=28),
  choice:{
    text:g=>`Your child wants to follow you into ${sdef(g) ? sdef(g).name.toLowerCase() : "the business"}.`,
    choices:[
      { label:"Open every door you can", run:g=>{ const k=g.rels.find(r=>r.type==="child"&&r.alive&&r.age>=17);
          return chance(0.55)?({text:"They made it, and everyone said it was nepotism anyway.",stats:{happiness:+18},relAdj:k?{id:k.id,d:+20}:null})
            :({text:"The doors opened and they still couldn't do it. That was worse.",stats:{happiness:-14},relAdj:k?{id:k.id,d:-10}:null});} },
      { label:"Tell them to earn it",    run:g=>{ const k=g.rels.find(r=>r.type==="child"&&r.alive&&r.age>=17);
          return {text:"You told them you'd give advice and nothing else.",stats:{happiness:+6},relAdj:k?{id:k.id,d:-8}:null};} },
      { label:"Talk them out of it",     run:g=>{ const k=g.rels.find(r=>r.type==="child"&&r.alive&&r.age>=17);
          return {text:"You told them honestly what it costs. They listened.",stats:{happiness:+4},relAdj:k?{id:k.id,d:+10}:null};} },
    ]}},

/* --- what a long career at one job brings --- */
{ id:"job_headhunt", min:24, max:64, w:6, req:g=>g.job && g.job.rung >= 2 && g.yearsInJob >= 3, choice:{
    text:"A headhunter has been leaving messages. They won't say who for.",
    choices:[
      { label:"Hear them out", run:g=>{ if(!g.job) return {text:"You had no job left to leave.",stats:{happiness:-4}};
          const b=Math.round(g.job.salary*rint(25,60)/100); g.job.salary+=b;
          return { text:`They matched you to something better. Now on ${money(g,g.job.salary)}/yr.`, stats:{happiness:+14} }; } },
      { label:"Use it as leverage", run:g=>{ if(!g.job) return {text:"There was nothing to leverage.",stats:{happiness:-6}};
          if(!chance(0.5)) return { text:"Your employer shrugged. Now they know you're looking.", stats:{happiness:-12} };
          const b=Math.round(g.job.salary*rint(10,28)/100); g.job.salary+=b;
          return { text:`Your employer moved to keep you — now on ${money(g,g.job.salary)}/yr.`, stats:{happiness:+10} }; } },
      { label:"Delete the message", run:()=>({ text:"You never called back.", stats:{happiness:-2}, flags:{loyal:true} }) },
    ]}},
/* ============================================================
   HOUSING, THE STREET, AND WHAT IT DOES TO YOU
   ============================================================ */
{ id:"house_moveout", chained:true, min:0, max:99, choice:{
    text:"You're earning now, and your parents have started dropping hints about the spare room.",
    choices:[
      { label:"Get your own place", run:g=>{ g.withParents=false; g.missedRent=0;
          return { text:"You found a flat and moved out properly.", money:-afford(g,local(g,rint(1500,6000))), stats:{happiness:+14} }; } },
      { label:"Move in with friends", run:g=>{ g.withParents=false; g.missedRent=0;
          return { text:"You took a room in a shared house. Cheap and loud.", money:-afford(g,local(g,rint(400,2200))), stats:{happiness:+10} }; } },
      { label:"Stay and pay them rent", run:g=>{ const p=g.rels.find(r=>(r.type==="mother"||r.type==="father")&&r.alive);
          return { text:"You stayed, and started paying your parents rent.", money:-afford(g,local(g,rint(1000,4000))), stats:{happiness:+2}, relAdj:p?{id:p.id,d:+8}:null }; } },
    ]}},

{ id:"house_kickout", chained:true, min:0, max:99, choice:{
    text:"Your parents have had enough. No job, no rent, no plan — they want you out by the end of the month.",
    choices:[
      { label:"Beg to stay a bit longer", run:g=>{ const p=g.rels.find(r=>(r.type==="mother"||r.type==="father")&&r.alive);
          if(chance(0.45)) return { text:"They gave you six more months. Six.", stats:{happiness:-4}, relAdj:p?{id:p.id,d:-10}:null };
          g.withParents=false;
          if(g.money < 2500*g.country.mult) return { text:"They didn't budge. You left with a bag and no plan.", stats:{happiness:-18}, softLand:true };
          return { text:"They didn't budge. You scraped together a deposit and left.", money:-afford(g,local(g,rint(1000,4000))), stats:{happiness:-12} }; } },
      { label:"Take any job going", run:g=>{ g.withParents=false; g.missedRent=0;
          return { text:"You took the first job you could find and moved out with your head up.", stats:{happiness:+8}, takeAnyJob:true }; } },
      { label:"Walk out with nothing", run:g=>{ g.withParents=false;
          if(g.money >= 2500*g.country.mult) return { text:"You walked out on your own terms and found a room.", money:-afford(g,local(g,rint(800,2500))), stats:{happiness:+4} };
          g.homeless=true; g.yearsHomeless=0;
          return { text:"You walked out with nothing but pride, and slept in a stairwell that night.", stats:{happiness:-25,health:-8}, kind:"bad" }; } },
    ]}},

/* --- life on the street --- */
{ id:"hl_bashed", min:14, max:90, w:9, req:g=>g.homeless && !g.assets.houses.length, choice:{
    text:"Three lads have decided you're a target. One of them is holding a bottle.",
    choices:[
      { label:"Fight back",  run:g=>chance(0.3+g.stats.health/400)?({text:"You hurt one of them badly enough that they all ran.",stats:{health:-rint(6,16),happiness:+6}}):({text:"They put you in hospital and took what little you had.",money:-afford(g,local(g,rint(20,400))),stats:{health:-rint(25,45),happiness:-20},kind:"bad"}) },
      { label:"Curl up and take it", run:g=>({text:"You covered your head until they got bored.",stats:{health:-rint(14,28),happiness:-16},kind:"bad"}) },
      { label:"Run",         run:g=>chance(0.55)?({text:"You got away, leaving your bag behind.",stats:{health:-4,happiness:-10}}):({text:"They caught you at the underpass.",stats:{health:-rint(20,38),happiness:-18},kind:"bad"}) },
    ]}},

{ id:"hl_drugs", once:true, min:14, max:80, w:6, req:g=>g.homeless && !g.assets.houses.length && !g.addiction, choice:{
    text:"Someone under the bridge offers you something that will make the night go faster.",
    choices:[
      { label:"Take it",   run:g=>{ addictHook(g,"drugs"); return { text:"You took it. For a few hours nothing hurt.", stats:{happiness:+14,health:-8}, kind:"bad" }; } },
      { label:"Refuse",    run:()=>({ text:"You said no. It was a long, cold night.", stats:{happiness:-8,health:-3} }) },
      { label:"Take it and sell the rest", run:g=>chance(0.5)?({text:"You made a bit of money moving it on.",money:+local(g,rint(200,3000)),stats:{happiness:+4},addictKind:"drugs"}):({text:"You were caught with enough to charge you.",arrest:{name:"drug dealing",sentence:[2,6]}}) },
    ]}},

{ id:"hl_drink", once:true, min:16, max:85, w:5, req:g=>g.homeless && !g.assets.houses.length && !g.addiction, choice:{
    text:"There's a bottle going round and it's the warmest thing available.",
    choices:[
      { label:"Drink",     run:g=>{ addictHook(g,"alcohol"); return { text:"You drank until you could sleep.", stats:{happiness:+9,health:-6}, kind:"bad" }; } },
      { label:"Pass",      run:()=>({ text:"You passed it along and shivered instead.", stats:{happiness:-6, health:-2} }) },
    ]}},

{ id:"hl_shelter", min:14, max:95, w:8, req:g=>g.homeless && !g.assets.houses.length, choice:{
    text:"A shelter has a bed free, but they have rules and a curfew.",
    choices:[
      { label:"Take the bed", run:g=>({ text:"You slept indoors, ate properly, and someone asked your name.", stats:{health:+rint(6,16),happiness:+14} }) },
      { label:"Ask about their housing programme", run:g=>chance(0.35)?({text:"They found you a place. You have an address again.",stats:{happiness:+30,health:+10},endHomeless:true,kind:"good"}):({text:"The waiting list was two years long.",stats:{happiness:-8}}) },
      { label:"Stay out",    run:()=>({ text:"You didn't fancy the rules. It rained all night.", stats:{health:-8,happiness:-6} }) },
    ]}},

{ id:"hl_work", min:16, max:70, w:8, req:g=>g.homeless && !g.assets.houses.length, choice:{
    text:"A man in a van is offering cash work, no questions asked.",
    choices:[
      { label:"Get in the van", run:g=>chance(0.6)?({text:"Hard, honest work and cash at the end of the day.",money:+local(g,rint(400,4000)),stats:{health:-5,happiness:+10}}):({text:"He worked you for a week and never paid you.",stats:{happiness:-18,health:-10},kind:"bad"}) },
      { label:"Ask to see the site first", run:g=>chance(0.5)?({text:"It was legitimate. You worked a good season.",money:+local(g,rint(1500,9000)),stats:{happiness:+14}}):({text:"He drove off when you started asking questions.",stats:{happiness:-4}}) },
      { label:"Walk away",      run:()=>({ text:"You didn't like the look of him.", stats:{smarts:+2} }) },
    ]}},

{ id:"hl_family", min:16, max:80, w:7, req:g=>g.homeless && !g.assets.houses.length && g.rels.some(r=>r.alive&&["mother","father","sibling"].includes(r.type)), choice:{
    text:"You could swallow your pride and call your family.",
    choices:[
      { label:"Call them", run:g=>{ const p=g.rels.find(r=>r.alive&&["mother","father","sibling"].includes(r.type));
          if(chance(0.6)) return { text:`${p?p.name:"They"} came and got you. You slept in a real bed that night.`, stats:{happiness:+26,health:+10}, endHomeless:true, relAdj:p?{id:p.id,d:+18}:null, kind:"good" };
          return { text:`${p?p.name:"They"} said they'd warned you, and hung up.`, stats:{happiness:-22}, relAdj:p?{id:p.id,d:-14}:null, kind:"bad" }; } },
      { label:"Don't", run:()=>({ text:"You couldn't bring yourself to dial it.", stats:{happiness:-10} }) },
    ]}},

{ id:"hl_moved_on", min:14, max:90, w:6, req:g=>g.homeless && !g.assets.houses.length, auto:g=>({ text:`The police moved you on again and your things went in the back of a van.`, stats:{ happiness:-12, health:-4 }, kind:"bad" }) },

/* --- addiction, wherever it found you --- */
{ id:"ad_offered", once:true, min:16, max:70, w:2, req:g=>!g.addiction && !g.homeless && (g.stats.happiness < 35 || g.fame > 60), choice:{
    text:"At the end of a very bad week, someone offers you a way to stop feeling it.",
    choices:[
      { label:"Just this once", run:g=>{ addictHook(g,"drugs"); return { text:"Just this once turned out to be a phrase you'd use a lot.", stats:{happiness:+12}, kind:"bad" }; } },
      { label:"Drink instead",  run:g=>{ addictHook(g,"alcohol"); return { text:"You drank yourself through it instead.", stats:{happiness:+8,health:-4}, kind:"bad" }; } },
      { label:"Go home",        run:()=>({ text:"You went home and slept it off.", stats:{happiness:-4,health:+2} }) },
    ]}},

{ id:"ad_intervention", min:18, max:80, w:8, priority:true, req:g=>g.addiction && g.addiction.level >= 2, choice:{
    text:g=>`The people left in your life have sat you down about the ${g.addiction && g.addiction.kind === "alcohol" ? "drinking" : "using"}.`,
    choices:[
      { label:"Agree to get help", run:g=>chance(0.55)?({text:"You went, and it took. It was the hardest year of your life.",stats:{happiness:+18,health:+14},clearAddiction:true,kind:"good"}):({text:"You went, and you relapsed within months.",stats:{happiness:-14},kind:"bad"}) },
      { label:"Promise to cut down", run:g=>chance(0.25)?({text:"Somehow, you actually did.",stats:{happiness:+10,health:+6},clearAddiction:true}):({text:"You promised, and nothing changed.",stats:{happiness:-8}}) },
      { label:"Tell them to mind their own business", run:g=>{ const r=g.rels.find(x=>x.alive&&x.rel>50);
          return { text:"You told them where to go. A few of them stopped calling.", stats:{happiness:-16}, relAdj:r?{id:r.id,d:-30}:null, kind:"bad" }; } },
    ]}},

{ id:"ad_bottom", min:18, max:85, w:6, req:g=>g.addiction && g.addiction.level >= 3, choice:{
    text:"You woke up somewhere you don't remember getting to, and something has to change.",
    choices:[
      { label:"Check yourself in", run:g=>chance(0.6)?({text:"You checked in that morning and never used again.",stats:{happiness:+22,health:+18},clearAddiction:true,kind:"good"}):({text:"You checked in, then checked out after four days.",stats:{happiness:-10}}) },
      { label:"Keep going",        run:g=>chance(0.35)?({text:"You kept going. It nearly killed you.",stats:{health:-30,happiness:-18},kind:"bad"}):({text:"You kept going and got away with it, again.",stats:{health:-14}}) },
    ]}},
];