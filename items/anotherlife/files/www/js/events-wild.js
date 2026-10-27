/* ============================================================
   AnotherLife — wild events
   Two sets in one file:
     • the absurd but broadly harmless ones, always available
     • those marked `adult: true`, which only fire when the 18+ switch
       is on AND the character is 18 or over (both checked in the engine)
   ============================================================ */
import { pick, rint, chance, money, an, afford, local } from "./util.js";

/* Flags, same helper the other event files use. Without this every `req` that
   reads a flag throws, safe() swallows it, and the event silently never fires
   — which looks like a fix and isn't. */
const F = g => g.flags || (g.flags = {});

export const WILD = [
/* ============================================================
   THE ABSURD
   ============================================================ */
{ id:"w_lightning", min:8, max:90, w:1, choice:{
    text:"You've now been struck by lightning twice. The second one was on a clear day.",
    choices:[
      { label:"Sell your story", run:g=>({ text:"The tabloids paid for it. You are officially The Lightning Person.", money:+local(g,rint(500,9000)), fame:+rint(4,11), stats:{health:-12} }) },
      { label:"Never go outside again", run:()=>({ text:"You became a committed indoor person.", stats:{health:-8,happiness:-6,smarts:+4} }) },
      { label:"Buy a lottery ticket immediately", run:g=>chance(0.14)?({text:"Statistically absurd. You won.",money:+local(g,rint(40000,900000)),stats:{happiness:+35}}):({text:"Nothing. The universe gives with one hand and takes with the other.",stats:{health:-10,happiness:-4}}) },
    ]}},
{ id:"w_meteor", min:6, max:95, w:1, choice:{
    text:"Something hit your garden at four in the morning. It's still warm, and it isn't from here.",
    choices:[
      { label:"Sell it to a collector", run:g=>({ text:"A private collector paid a genuinely silly amount for a rock.", money:+local(g,rint(15000,300000)), stats:{happiness:+18} }) },
      { label:"Donate it to a museum", run:()=>({ text:"It's in a display case with your name under it.", fame:+rint(4,10), stats:{happiness:+16,smarts:+4} }) },
      { label:"Keep it on the mantelpiece", run:()=>({ text:"It sits there. You point it out to everyone who visits.", stats:{happiness:+11} }) },
    ]}},
{ id:"w_ikea", min:10, max:80, w:1, choice:{
    text:"You have been accidentally locked in a furniture warehouse overnight.",
    choices:[
      { label:"Live your best life", run:()=>({ text:"You slept in six different beds and ate an entire bag of meatballs.", stats:{happiness:+20,health:-3} }) },
      { label:"Call for help", run:()=>({ text:"Security found you at 3am crying next to a wardrobe.", stats:{happiness:-6} }) },
      { label:"Film it", run:()=>({ text:"The video did numbers. You are now 'warehouse guy'.", fame:+rint(6,16), stats:{happiness:+12} }) },
    ]}},
{ id:"w_cult", min:16, max:75, w:1, once:true, choice:{
    text:"The friendly people who invited you for dinner have started talking about the Founder.",
    choices:[
      { label:"Leave immediately", run:()=>({ text:"You left through a window. They still send letters.", stats:{happiness:-4,smarts:+5} }) },
      { label:"Stay for the free food", run:g=>chance(0.5)?({text:"You ate free for two years and never joined anything.",money:+local(g,rint(200,3000)),stats:{happiness:+8,smarts:+3}}):({text:"You woke up three months later having signed over your car.",money:-afford(g,local(g,rint(2000,30000))),stats:{happiness:-16}}) },
      { cost:g=>`${money(g,afford(g,g.money*0.5))} \u2014 50% of your money`, label:"Join properly", run:g=>({ text:"You gave them a great deal of money and a great deal of your thirties.", money:-afford(g,Math.round(g.money*0.5)), stats:{happiness:+10,smarts:-8}, flags:{cult:true} }) },
    ]}},
{ id:"w_cult_out", min:20, max:85, w:6, priority:true, req:g=>g.flags&&g.flags.cult, choice:{
    text:"You've started to notice the Founder has three houses and you have none.",
    choices:[
      { label:"Walk out", run:()=>({ text:"You left. Deprogramming took years but you got there.", stats:{happiness:+18,smarts:+8}, flags:{cult:false} }) },
      { label:"Try to take over", run:g=>chance(0.3)?({text:"Astonishingly, you are now the Founder.",money:+local(g,rint(50000,900000)),fame:+12,stats:{happiness:+20}}):({text:"You were cast out with nothing but a robe.",stats:{happiness:-20},flags:{cult:false}}) },
      { label:"Stay", run:()=>({ text:"You decided the Founder had earned those houses.", stats:{happiness:+4,smarts:-6} }) },
    ]}},
{ id:"w_doppel", min:14, max:85, w:1, choice:{
    text:"Police have arrested you for something done by a man who looks exactly like you.",
    choices:[
      { label:"Fight it in court", run:g=>chance(0.75)?({text:"Cleared, eventually. You've met your double and you don't like him.",money:-afford(g,local(g,rint(1000,20000))),stats:{happiness:-8,smarts:+3}}):({text:"The jury couldn't tell you apart. You served his sentence.",arrest:{name:"mistaken identity",sentence:[2,5]}}) },
      { label:"Find him yourself", run:()=>chance(0.55)?({text:"You tracked him down and handed him over. The police were embarrassed.",fame:+rint(5,14),stats:{happiness:+16}}):({text:"You never found him. He's still out there, being you badly.",stats:{happiness:-12}}) },
    ]}},
{ id:"w_deadmistake", min:20, max:90, w:1, once:true, choice:{
    text:"A clerical error has declared you legally dead. Your accounts are frozen.",
    choices:[
      { label:"Fight the paperwork", run:g=>({ text:"Eleven months of forms later, you were alive again.", money:-afford(g,local(g,rint(500,9000))), stats:{happiness:-16,smarts:+6} }) },
      { label:"Attend your own funeral", run:()=>({ text:"You stood at the back. The turnout was disappointing.", stats:{happiness:-10,smarts:+4} }) },
      { label:"Lean into it", run:g=>({ text:"You lived off-grid for a year. No tax, no bills, no existence.", money:+local(g,rint(2000,40000)), stats:{happiness:+8,health:-8} }) },
    ]}},
{ id:"w_goose", min:5, max:80, w:1, auto:()=>({ text:`You were attacked by a goose and, being honest about it, you lost.`, stats:{ health:-rint(3,9), happiness:-6 } }) },
{ id:"w_meme", min:12, max:60, w:1, choice:{
    text:"A photo of you pulling an unfortunate face has become a meme.",
    choices:[
      { label:"Monetise it", run:g=>({ text:"You sold merchandise of your own humiliation.", money:+local(g,rint(1000,60000)), fame:+rint(8,18), stats:{happiness:+8} }) },
      { label:"Sue", run:g=>chance(0.35)?({text:"You won a settlement. The meme got bigger.",money:+local(g,rint(3000,50000)),fame:+10,stats:{happiness:+4}}):({text:"You lost, and the lawsuit became part of the meme.",money:-afford(g,local(g,rint(2000,20000))),fame:+14,stats:{happiness:-14}}) },
      { label:"Ride it out", run:()=>({ text:"You said nothing. In eighteen months everyone forgot.", fame:+4, stats:{happiness:-6} }) },
    ]}},
{ id:"w_swapped", min:16, max:70, w:1, once:true, choice:{
    text:"A DNA test has revealed you were swapped at birth.",
    choices:[
      { label:"Find your birth family", run:g=>chance(0.6)?({text:"You met them. It was overwhelming and mostly good.",stats:{happiness:+20}}):({text:"You met them. Some doors are better left shut.",stats:{happiness:-18}}) },
      { label:"Tell nobody", run:()=>({ text:"You put the results in a drawer and carried on.", stats:{happiness:-10,smarts:+3} }) },
      { label:"Sue the hospital", run:g=>chance(0.5)?({text:"They settled rather than go to court.",money:+local(g,rint(20000,600000)),stats:{happiness:+12}}):({text:"It was too long ago. You paid your own costs.",money:-afford(g,local(g,rint(2000,25000))),stats:{happiness:-12}}) },
    ]}},
{ id:"w_haunted", min:22, max:85, w:2, req:g=>g.assets.houses.length>0, choice:{
    text:"Something in the house keeps moving furniture at night.",
    choices:[
      { label:"Get it exorcised", run:g=>({ text:"A man with a bell charged you handsomely. It stopped, or you stopped noticing.", money:-afford(g,local(g,rint(400,6000))), stats:{happiness:+8} }) },
      { label:"Sell up", run:g=>{ const h=g.assets.houses[0]; if(!h) return {text:"You'd already left.",stats:{happiness:-3}};
          g.assets.houses=g.assets.houses.filter(x=>x.id!==h.id);
          return { text:`You sold the ${h.name} to a very cheerful couple and said nothing.`, money:+Math.round(h.value*0.8), stats:{happiness:+6} }; } },
      { label:"Live with it", run:()=>({ text:"You started saying goodnight to it. It seemed to help.", stats:{happiness:+4,health:-3} }) },
    ]}},
{ id:"w_carboot", min:18, max:85, w:1, choice:{
    text:"That ugly vase you sold for pocket change at a car boot sale has just appeared on the news.",
    choices:[
      { label:"Try to get it back", run:g=>chance(0.2)?({text:"The buyer took pity and split the proceeds with you.",money:+local(g,rint(20000,300000)),stats:{happiness:+22}}):({text:"They told you where to go, and legally they were right.",stats:{happiness:-20}}) },
      { label:"Laugh about it", run:()=>({ text:"You told the story at every dinner party for thirty years.", stats:{happiness:+6,smarts:+3} }) },
    ]}},
{ id:"w_lift", min:12, max:85, w:1, auto:g=>({ text:`You were stuck in a lift for ${rint(4,31)} hours with a stranger who would not stop talking.`, stats:{ happiness:-9, smarts:+2 } }) },
{ id:"w_writein", min:25, max:80, w:1, once:true, choice:{
    text:"Someone put your name on the ballot for mayor as a joke. You are now polling second.",
    choices:[
      { label:"Actually campaign", run:g=>chance(0.4)?({text:"🏛️ You won. The joke got extremely serious.",money:+local(g,rint(20000,90000)),fame:+rint(15,30),stats:{happiness:+22}}):({text:"You lost by a hair and it stung more than you expected.",fame:+8,stats:{happiness:-10}}) },
      { label:"Withdraw", run:()=>({ text:"You withdrew. The winner was worse.", stats:{happiness:-4} }) },
      { label:"Campaign as a joke", run:()=>chance(0.25)?({text:"You won on a manifesto of free chips. You had to actually do it.",fame:+rint(12,26),stats:{happiness:+14,smarts:-3}}):({text:"You came third and had a wonderful time.",fame:+6,stats:{happiness:+12}}) },
    ]}},
{ id:"w_dream", min:16, max:80, w:1, choice:{
    text:"You woke up with a complete, working invention in your head.",
    choices:[
      { label:"Build it", run:g=>chance(0.35)?({text:"It worked. Someone bought the patent.",money:+local(g,rint(30000,2000000)),fame:+rint(5,15),stats:{happiness:+25}}):({text:"It did not work, and cost you a fortune in parts.",money:-afford(g,local(g,rint(1000,30000))),stats:{happiness:-10,smarts:+5}}) },
      { label:"Write it down and forget it", run:()=>({ text:"The notebook is in a drawer somewhere.", stats:{happiness:-3,smarts:+2} }) },
    ]}},
{ id:"w_cryptid", min:10, max:80, w:1, auto:()=>({ text:`Grainy footage of you walking home has been posted as evidence of a local cryptid.`, stats:{ happiness:+7 }, fame:+rint(2,6) }) },
{ id:"w_hotdog", min:16, max:70, w:1, choice:{
    text:"There is a competitive eating contest at the fair. First prize is real money.",
    choices:[
      { label:"Enter", run:g=>chance(0.35)?({text:"🌭 You won. You have never felt worse or prouder.",money:+local(g,rint(500,12000)),fame:+rint(3,9),stats:{happiness:+16,health:-10}}):({text:"You did not win, and you were unwell for two days.",stats:{health:-12,happiness:-6}}) },
      { label:"Watch", run:()=>({ text:"You watched, appalled and delighted.", stats:{happiness:+5} }) },
    ]}},
{ id:"w_pigeon", min:8, max:85, w:1, auto:()=>({ text:`You befriended a pigeon. It now waits for you and you have named it ${pick(["Colin","Duchess","Steve","Reginald","Nugget"])}.`, stats:{ happiness:+9 } }) },
{ id:"w_buried", min:14, max:85, w:2, req:g=>g.assets.houses.length>0, auto:g=>{ const amt=rint(2000,180000);
    return { text:`You dug up the garden and found a tin of cash buried by a previous owner.`, money:+amt, stats:{ happiness:+20 } }; } },
{ id:"w_bodyfound", min:16, max:85, w:1, choice:{
    text:"You have found a body while out walking. This is now your day.",
    choices:[
      { label:"Call the police and stay", run:()=>({ text:"You gave a statement and thought about it for years.", stats:{happiness:-14,smarts:+3} }) },
      { label:"Call anonymously and leave", run:()=>chance(0.7)?({text:"You phoned it in from a call box and went home.",stats:{happiness:-10}}):({text:"They traced the call and you spent a long night explaining yourself.",stats:{happiness:-18}}) },
    ]}},

/* ============================================================
   18+ — only when the switch is on and the character is an adult
   ============================================================ */
{ id:"a_vegas", min:18, max:70, w:5, adult:true, once:true, choice:{
    text:"You've woken up in a hotel room with a hangover, a stranger, and a marriage certificate.",
    choices:[
      { label:"Make a go of it", run:g=>{ const p={id:'ad'+Date.now(),type:'partner',gender:g.gender==='male'?'female':'male',age:Math.max(18,g.age+rint(-6,6)),alive:true,name:pick(["Roxy","Dallas","Jesse","Sasha","Vince","Marlene"])+" "+pick(["Kane","Deluca","Ford","Rossi"]),rel:rint(45,80)};
          g.rels.push(p); g.married=true;
          return { text:`You stayed married to ${p.name}. Against all sense, it worked for a while.`, stats:{happiness:+18} }; } },
      { label:"Annul it quietly", run:g=>({ text:"Lawyers made it disappear before anyone found out.", money:-afford(g,local(g,rint(600,9000))), stats:{happiness:-8} }) },
      { label:"Tell absolutely everyone", run:()=>({ text:"It became the story people introduce you with.", fame:+rint(3,9), stats:{happiness:+10} }) },
    ]}},
{ id:"a_tattoo", min:18, max:65, w:5, adult:true, choice:{
    text:"You've woken with a tattoo you have no memory of getting. It is in a bold font.",
    choices:[
      { label:"Read it", run:()=>({ text:`It says "${pick(["NO REGERTS","PROPERTY OF NOBODY","LIVE LAGH LOVE","BORN TO LOSE","MUM'S SPAGHETTI"])}". It is misspelled.`, stats:{looks:-rint(4,12),happiness:-8} }) },
      { label:"Get it removed", run:g=>({ text:"Laser removal was more painful and more expensive than the tattoo.", money:-afford(g,local(g,rint(800,7000))), stats:{looks:+4,happiness:-4} }) },
      { label:"Get a matching one", run:()=>({ text:"You committed to the bit. People respect it, sort of.", stats:{happiness:+12,looks:-4} }) },
    ]}},
{ id:"a_boss", min:20, max:60, w:5, adult:true, req:g=>!!g.job, choice:{
    text:"The office party got out of hand and you ended up going home with your boss.",
    choices:[
      { label:"Never speak of it", run:()=>chance(0.55)?({text:"Neither of you mentioned it again. Ever.",stats:{happiness:-6}}):({text:"Everyone found out by Tuesday.",stats:{happiness:-18}}) },
      { label:"Ask for a raise", run:g=>{ if(!g.job) return {text:"You no longer worked there anyway.",stats:{happiness:-6}};
          if(chance(0.45)){ g.job.salary=Math.round(g.job.salary*1.25); return { text:`You got the raise. You both know why. Now on ${money(g,g.job.salary)}/yr.`, stats:{happiness:+8} }; }
          return { text:"HR got involved and it was not on your side.", fire:true, stats:{happiness:-22} }; } },
      { label:"Resign", run:()=>({ text:"You left rather than face the Monday meeting.", fire:true, stats:{happiness:-10,smarts:+3} }) },
    ]}},
{ id:"a_onlyfans", min:18, max:55, w:5, adult:true, once:true, choice:{
    text:"A friend keeps telling you there's serious money in selling content online.",
    choices:[
      { label:"Start an account", run:g=>{ const good=chance(0.35+g.stats.looks/300);
          return good?({text:"It took off. The money was real and so was the exposure.",money:+local(g,rint(8000,400000)),fame:+rint(8,22),stats:{happiness:+12}})
                     :({text:"You made about eleven pounds and told nobody.",money:+local(g,rint(5,400)),stats:{happiness:-10}}); } },
      { label:"Do it anonymously", run:g=>chance(0.45)?({text:"Faceless, profitable, and nobody in your life ever knew.",money:+local(g,rint(3000,120000)),stats:{happiness:+10}}):({text:"Someone recognised a tattoo. It got around.",money:+local(g,rint(1000,20000)),stats:{happiness:-16}}) },
      { label:"Absolutely not", run:()=>({ text:"You told them you'd rather work.", stats:{happiness:+2} }) },
    ]}},
{ id:"a_bender", min:18, max:60, w:5, adult:true, choice:{
    text:"Someone has produced a bag of something and the night has taken a turn.",
    choices:[
      { label:"All in", run:g=>chance(0.7)?({text:"You lost a weekend and most of a Tuesday.",money:-afford(g,local(g,rint(200,4000))),stats:{health:-16,happiness:+8},addictKind:"drugs"}):({text:"You ended up in A&E with your heart doing something wrong.",stats:{health:-32,happiness:-14},addictKind:"drugs"}) },
      { label:"Just a bit", run:()=>({ text:"You had some and went home at a reasonable hour, which nobody let you forget.", stats:{health:-6,happiness:+6} }) },
      { label:"Get everyone out", run:()=>({ text:"You cleared the flat and lost two friends over it.", stats:{happiness:-6,health:+2} }) },
    ]}},
{ id:"a_spiked", min:18, max:50, w:4, adult:true, choice:{
    text:"Two sips into your drink the room has started moving in a way it should not.",
    choices:[
      { label:"Find your friends", run:g=>chance(0.7)?({text:"They got you out and sat with you all night.",stats:{health:-10,happiness:-8}}):({text:"You couldn't find anyone. You woke up somewhere unfamiliar.",money:-afford(g,local(g,rint(50,900))),stats:{health:-20,happiness:-24}}) },
      { label:"Tell the bar staff", run:()=>({ text:"They took it seriously, called you a taxi and kept the glass.", stats:{health:-8,happiness:-4,smarts:+3} }) },
      { label:"Push through it", run:()=>({ text:"That was a mistake and the next day proved it.", stats:{health:-24,happiness:-16} }) },
    ]}},
{ id:"a_sugar", min:19, max:55, w:4, adult:true, req:g=>g.money<20000*g.country.mult, choice:{
    text:"Someone considerably older and richer has made you a very direct offer.",
    choices:[
      { label:"Accept the arrangement", run:g=>({ text:"The money solved a great deal and cost something harder to name.", money:+local(g,rint(20000,300000)), stats:{happiness:-6,looks:+4} }) },
      { label:"Take dinner only", run:g=>({ text:"You ate extremely well and gave nothing away.", money:+local(g,rint(200,4000)), stats:{happiness:+6,smarts:+3} }) },
      { label:"Decline", run:()=>({ text:"You said no and paid your own rent, somehow.", stats:{happiness:+4} }) },
    ]}},
{ id:"a_leak", min:18, max:60, w:4, adult:true, req:g=>g.fame>=25, choice:{
    text:"Private photographs of you are being shopped around.",
    choices:[
      { label:"Get lawyers on it", run:g=>chance(0.6)?({text:"Injunction granted. It never ran.",money:-afford(g,local(g,rint(5000,80000))),stats:{happiness:-8}}):({text:"It ran anyway. The lawyers still billed you.",money:-afford(g,local(g,rint(5000,80000))),fame:+rint(8,20),stats:{happiness:-26}}) },
      { label:"Get ahead of it", run:()=>({ text:"You posted them yourself with a statement. It defused entirely.", fame:+rint(6,16), stats:{happiness:-6,smarts:+5} }) },
      { label:"Say nothing", run:()=>chance(0.5)?({text:"It fizzled out.",stats:{happiness:-8}}):({text:"It ran everywhere for a fortnight.",fame:+rint(10,24),stats:{happiness:-24}}) },
    ]}},
{ id:"a_bouncer", min:18, max:50, w:4, adult:true, choice:{
    text:"A bouncer the size of a door has decided you're not coming in, and has said so rudely.",
    choices:[
      { label:"Argue", run:()=>chance(0.25)?({text:"He laughed and let you in. Nobody knows why.",stats:{happiness:+10}}):({text:"You were removed in a way that involved the pavement.",stats:{health:-rint(8,20),happiness:-12}}) },
      { label:"Swing at him", run:g=>chance(0.15)?({text:"You landed one and immediately regretted it.",stats:{health:-rint(20,40),happiness:-10}}):({text:"You missed. The police arrived before you hit the ground.",arrest:{name:"assault",sentence:[1,3]}}) },
      { label:"Go somewhere else", run:()=>({ text:"You went to the worse bar down the road and had a better night.", stats:{happiness:+7} }) },
    ]}},
{ id:"a_sti", min:18, max:60, w:4, adult:true, choice:{
    text:"Something isn't right and you've been putting off doing anything about it.",
    choices:[
      { label:"Get tested", run:g=>chance(0.65)?({text:"All clear, and an overdue lesson about being careful.",stats:{happiness:+8,smarts:+4}}):({text:"Treatable, caught early, and a course of antibiotics.",money:-afford(g,local(g,rint(100,2000))),stats:{health:-8,happiness:-12}}) },
      { label:"Ignore it", run:()=>chance(0.45)?({text:"It went away. You got lucky and you know it.",stats:{happiness:-4}}):({text:"It did not go away, and by the time you went it was worse.",stats:{health:-22,happiness:-18}}) },
    ]}},
{ id:"a_festival", min:18, max:45, w:4, adult:true, choice:{
    text:"It's day three of the festival and you have not slept since Thursday.",
    choices:[
      { label:"Keep going", run:g=>chance(0.7)?({text:"You saw the sunrise and cried at a band you don't even like.",stats:{health:-14,happiness:+18}}):({text:"You collapsed in the medical tent and woke up on a drip.",stats:{health:-30,happiness:-10}}) },
      { label:"Sleep in the tent", run:()=>({ text:"You slept fourteen hours and felt human again.", stats:{health:+6,happiness:+8} }) },
      { label:"Go home early", run:()=>({ text:"You left on Saturday like a coward, and slept in your own bed like a genius.", stats:{health:+10,happiness:+4} }) },
    ]}},
{ id:"a_swingers", min:24, max:60, w:3, adult:true, req:g=>g.married, choice:{
    text:"The couple you have dinner with have proposed something that isn't dinner.",
    choices:[
      { label:"Both of you say yes", run:g=>{ const p=g.rels.find(r=>r.type==="partner"&&r.alive);
          return chance(0.45)?({text:"It was fine. Genuinely, unexpectedly fine.",stats:{happiness:+14},relAdj:p?{id:p.id,d:+8}:null})
                             :({text:"It was not fine, and it took months to talk about properly.",stats:{happiness:-18},relAdj:p?{id:p.id,d:-25}:null}); } },
      { label:"Decline together", run:g=>{ const p=g.rels.find(r=>r.type==="partner"&&r.alive);
          return { text:"You laughed about it in the car the whole way home.", stats:{happiness:+10}, relAdj:p?{id:p.id,d:+10}:null }; } },
      { label:"Say yes without asking", run:g=>{ const p=g.rels.find(r=>r.type==="partner"&&r.alive);
          return { text:"You did not ask first. That was the actual problem.", stats:{happiness:-22}, relAdj:p?{id:p.id,d:-35}:null, divorce:chance(0.4) }; } },
    ]}},
{ id:"a_blackmail", min:20, max:70, w:3, adult:true, choice:{
    text:"Someone has something on you and has named a figure.",
    choices:[
      { cost:g=>`${money(g,afford(g,g.money*0.25))}\u2013${money(g,afford(g,g.money*0.4))}`, label:"Pay them", run:g=>chance(0.4)?({text:"They took the money and vanished.",money:-afford(g,Math.round(g.money*0.25)),stats:{happiness:-14}}):({text:"They took the money and came back six months later.",money:-afford(g,Math.round(g.money*0.4)),stats:{happiness:-24}}) },
      { label:"Call their bluff", run:g=>chance(0.55)?({text:"Nothing happened. There was never anything to publish.",stats:{happiness:+12,smarts:+5}}):({text:"They published. It was every bit as bad as threatened.",fame:+rint(5,15),stats:{happiness:-28}}) },
      { label:"Go to the police", run:()=>chance(0.65)?({text:"They were arrested. It came out anyway, but on your terms.",stats:{happiness:+6,smarts:+4}}):({text:"The police could do nothing and now they were angry with you.",stats:{happiness:-18}}) },
    ]}},
{ id:"a_woke_abroad", min:18, max:55, w:3, adult:true, auto:g=>{ const c=pick(["Riga","Bratislava","Tijuana","Magaluf","Reykjavík","Marrakesh"]);
    return { text:`You woke up in ${c}. You do not remember agreeing to go to ${c}.`, money:-afford(g,local(g,rint(300,4000))), stats:{ health:-8, happiness:+6 } }; } },
{ id:"a_glassed", min:18, max:55, w:3, adult:true, auto:()=>({ text:`A row in a bar ended with a glass and stitches. You started it, if you're honest.`, stats:{ health:-rint(12,26), looks:-rint(2,8), happiness:-12 }, kind:"bad" }) },
/* --- 18+ : consequences that grow out of the vice systems --- */
{ id:"a_dealer_offer", min:18, max:60, w:5, adult:true, once:true, req:g=>!!F(g).usedDrugs, choice:{
    text:"Your dealer has noticed you know a lot of people, and has offered you a way to make the habit pay for itself.",
    choices:[
      { label:"Start moving weight", run:g=>({ text:"You started serving people. The money was immediate and the sleep was not.", money:+local(g,rint(3000,60000)), stats:{happiness:+6}, flags:{dealing:true} }) },
      { label:"Just take a discount", run:g=>({ text:"You took the discount and kept your name off everything.", money:+local(g,rint(200,2000)), stats:{smarts:+3} }) },
      { label:"Stop going round", run:()=>({ text:"You found a new dealer. The old one still texts.", stats:{happiness:-3} }) },
    ]}},
{ id:"a_dealer_caught", min:19, max:65, w:6, adult:true, priority:true, req:g=>g.flags&&g.flags.dealing, choice:{
    text:"The man above you has been arrested, and detectives are working down the list.",
    choices:[
      { label:"Get out now", run:g=>({ text:"You dropped the phone in a canal and never went back.", stats:{happiness:-8,smarts:+6}, flags:{dealing:false} }) },
      { label:"Sit tight", run:g=>chance(0.45)?({text:"He said nothing. You got away with it.",stats:{happiness:+10}}):({text:"He named you within a fortnight.",arrest:{name:"conspiracy to supply",sentence:[5,12]},flags:{dealing:false}}) },
      { label:"Talk first", run:g=>chance(0.6)?({text:"You gave them him and walked with a caution. You cannot go home again.",stats:{happiness:-16},flags:{dealing:false,grass:true}}):({text:"They didn't need you, and now everyone knows you offered.",arrest:{name:"supplying",sentence:[4,9]},flags:{dealing:false,grass:true}}) },
    ]}},
{ id:"a_grassed", min:20, max:70, w:5, adult:true, once:true, req:g=>g.flags&&g.flags.grass, auto:g=>({
    text:`Word got round about what you did. Someone put a brick through the window.`, stats:{ health:-rint(4,14), happiness:-18 }, kind:"bad" }) },
{ id:"a_regular", min:18, max:55, w:5, adult:true, req:g=>!!F(g).soldsex, choice:{
    text:"One of your regulars wants to take you off the game entirely and keep you.",
    choices:[
      { label:"Take the offer", run:g=>{ const p={id:'reg'+Date.now(),type:'partner',gender:g.gender==='male'?'female':'male',age:Math.max(30,g.age+rint(5,25)),alive:true,name:pick(["Gerald","Marion","Vivienne","Roland","Cassandra"])+" "+pick(["Ashcroft","Veyne","Prideaux"]),rel:rint(50,75)};
          g.rels.push(p);
          return { text:`You moved in with ${p.name}. Comfortable, and complicated.`, money:+local(g,rint(5000,90000)), stats:{happiness:+10} }; } },
      { label:"Keep it professional", run:g=>({ text:"You told him it was work. He kept booking anyway.", money:+local(g,rint(2000,20000)), stats:{happiness:+4} }) },
      { label:"Stop seeing him", run:()=>({ text:"You blocked the number. It felt safer.", stats:{happiness:-4,smarts:+3} }) },
    ]}},
{ id:"a_recognised", min:18, max:55, w:5, adult:true, req:g=>!!F(g).soldsex, choice:{
    text:"A booking has walked in and it's somebody who knows you.",
    choices:[
      { label:"Carry on as if it's normal", run:g=>({ text:"You both agreed, without saying so, that this never happened.", money:+local(g,rint(200,3000)), stats:{happiness:-10} }) },
      { label:"Walk out", run:()=>({ text:"You left without being paid and were sick in the stairwell.", stats:{happiness:-16} }) },
      { label:"Charge him double", run:g=>chance(0.6)?({text:"He paid it. He was never going to say anything.",money:+local(g,rint(600,8000)),stats:{happiness:+6,smarts:+4}}):({text:"He told people. It got back to everyone.",stats:{happiness:-24}}) },
    ]}},
{ id:"a_coke_work", min:22, max:60, w:5, adult:true, req:g=>!!g.job&&g.addiction, choice:{
    text:"You've started doing lines in the toilets at work to get through the afternoon.",
    choices:[
      { label:"Keep it up", run:g=>chance(0.5)?({text:"You were the most productive person in the building for eight months.",stats:{happiness:+8,health:-14}}):({text:"You were found out and marched off the premises.",fire:true,stats:{happiness:-22}}) },
      { label:"Only at weekends", run:()=>({ text:"You drew a line you would move several times.", stats:{health:-6,happiness:+2} }) },
      { label:"Tell someone", run:()=>chance(0.55)?({text:"Occupational health put you on a programme and kept your job open.",stats:{happiness:+14,health:+8},clearAddiction:true}):({text:"You told the wrong person.",fire:true,stats:{happiness:-18}}) },
    ]}},
{ id:"a_cartel", min:20, max:60, w:4, adult:true, once:true, req:g=>g.flags&&g.flags.dealing, choice:{
    text:"People considerably further up the chain want you to take a shipment across a border.",
    choices:[
      { label:"Do the run", run:g=>chance(0.5)?({text:"You drove eleven hours with your hands shaking and got paid properly.",money:+local(g,rint(40000,400000)),stats:{happiness:+10,health:-8}}):({text:"They had a dog at the checkpoint.",arrest:{name:"drug trafficking",sentence:[10,25]}}) },
      { label:"Send someone else", run:g=>chance(0.6)?({text:"Your driver made it. You took a cut for arranging it.",money:+local(g,rint(10000,120000)),stats:{happiness:-4}}):({text:"Your driver was caught, and gave them your name inside a day.",arrest:{name:"drug trafficking",sentence:[8,20]}}) },
      { label:"Refuse", run:()=>chance(0.6)?({text:"They accepted it. You are, however, off the list.",stats:{happiness:-6},flags:{dealing:false}}):({text:"They did not accept it, and made that clear.",stats:{health:-rint(15,35),happiness:-18}}) },
    ]}},
{ id:"a_bad_batch", min:18, max:60, w:4, adult:true, req:g=>g.addiction&&g.addiction.kind==="drugs", choice:{
    text:"Word is going round that there's a bad batch out. Two people are already dead.",
    choices:[
      { label:"Test what you've got", run:()=>chance(0.75)?({text:"Yours was clean. You carried on, more carefully.",stats:{smarts:+4,happiness:+2}}):({text:"Yours was cut with something that should not be in it. You binned it and shook for a day.",stats:{health:-8,happiness:-6}}) },
      { label:"Use it anyway", run:g=>chance(0.68)?({text:"You got away with it.",stats:{health:-12,happiness:+8}}):({text:"You stopped breathing on a bathroom floor.",stats:{health:-40,happiness:-20},kind:"bad"}) },
      { label:"Stop for a while", run:()=>({ text:"You went a month without. It was the longest you'd managed in years.", stats:{health:+12,happiness:-4} }) },
    ]}},
];