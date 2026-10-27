/* ============================================================
   AnotherLife — woven events

   Everything here composes its prompt rather than hard-coding it, and most of
   it is keyed to something true about this particular character: what they
   keep doing (g.habits), the work they do, a choice they made decades ago
   (g.flags), somebody they actually know, their age, their city.

   A fixed prompt is the same sentence in every life ever played. These are
   not. See weave.js for the rule about slots reading naturally together.
   ============================================================ */
import { pick, rint, chance, money, afford, local } from "./util.js";
import { someone, stranger, neighbour, outside, inside, timeOfDay, weather, season,
         smallObject, smallSum, container, livingKin, anyName,
         pastime, doesOften, standing } from "./weave.js";

const F = g => g.flags || (g.flags = {});
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const adj = (r, d) => r ? { id: r.id, d } : null;

export const WOVEN = [

/* ---------------- keyed to what you keep doing ---------------- */
{ id:"v_gym_regular", min:16, max:70, w:5, req:g=>doesOften(g,"gym",4), choice:{
    text:g=>`${pick(["Somebody at the gym","The lad who is always on the bench when you get there","A trainer you have never spoken to","Someone twice your size"])} has ${pick(["offered you something that will help","asked what you are taking","told you your form is going to finish you","said you should be competing"])}.`,
    choices:[
      { label:"Take the shortcut", run:g=>chance(0.55)
          ? ({ text:"You got where you wanted in a third of the time and your bloods were a horror show.", stats:{looks:+14,health:-16,happiness:+8} })
          : ({ text:"It did nothing except cost you money and sleep.", money:-afford(g,local(g,rint(200,3000))), stats:{health:-8,happiness:-6} }) },
      { label:"Ask them to show you properly", run:()=>({ text:"They showed you. It was the single most useful hour you ever spent in there.", stats:{health:+12,smarts:+5,happiness:+10}, kind:"good" }) },
      { label:"Keep yourself to yourself", run:()=>({ text:"You put your headphones back in.", stats:{happiness:+2} }) },
    ]}},
{ id:"v_reader", min:12, max:90, w:5, req:g=>doesOften(g,"library",4), auto:g=>({
    text:`You have read ${pick(["everything they have on the Roman army","your way through the crime shelf twice","a book about grief that you were not ready for","the same novel four times","forty years of one newspaper on microfilm"])}, and ${pick(["nobody in your life knows","it has quietly changed what you think","you have started writing things down","the librarian now puts things aside for you"])}.`,
    stats:{ smarts:+rint(5,12), happiness:+rint(2,8) }, kind:"good" }) },
{ id:"v_party_toll", min:18, max:55, w:5, req:g=>doesOften(g,"party",5), choice:{
    text:g=>`You have been out ${pick(["every weekend since March","more nights than you have been in","four nights this week"])} and ${pick(["your face has started to show it","somebody at work said something","you cannot remember Thursday","your bank has sent you a summary you did not want"])}.`,
    choices:[
      { label:"Knock it on the head", run:()=>({ text:"You stopped for six months and everything got quietly better.", stats:{health:+14,looks:+8,happiness:+4}, kind:"good" }) },
      { label:"Carry on", run:g=>chance(0.5)
          ? ({ text:"You had the best year of your life and paid for it later.", stats:{happiness:+18,health:-14,looks:-6} })
          : ({ text:"It stopped being fun somewhere around August and you kept going anyway.", stats:{happiness:-14,health:-12}, addictKind:"alcohol" }) },
      { label:"Only with the people you like", run:()=>({ text:"You cut it down to the ones who were actually your friends.", stats:{happiness:+12,health:+4}, kind:"good" }) },
    ]}},
{ id:"v_meditator", min:16, max:95, w:4, req:g=>doesOften(g,"meditate",4), auto:()=>({
    text:`${pick(["Something loosened that had been tight for years.","You noticed you had stopped bracing for things.","You sat with something you had been avoiding and it was smaller than you thought.","You got very good at doing nothing and it turned out to be the whole point."])}`,
    stats:{ happiness:+rint(8,18), health:+rint(1,6) }, kind:"good" }) },
{ id:"v_thrillseeker", min:18, max:60, w:4, req:g=>doesOften(g,"skydive",2)||doesOften(g,"hunting",3), choice:{
    text:g=>`${pick(["The club","The people you do it with","Somebody who films it all"])} want you to try ${pick(["something with considerably less margin","a jump nobody in the group has done","it at night","the one that killed somebody last year"])}.`,
    choices:[
      { label:"Do it", run:g=>chance(0.78)
          ? ({ text:"You did it and nothing has ever felt like that since.", fame:+rint(1,7), stats:{happiness:+26,health:-6}, kind:"good" })
          : ({ text:"It went wrong in the air and you woke up in a bed with a lot of pins in you.", stats:{health:-32,happiness:-14}, kind:"bad", fx:"hit" }) },
      { label:"Film it from the ground", run:()=>({ text:"You filmed it. The clip did better than anything you ever did yourself.", fame:+rint(2,9), stats:{happiness:+6} }) },
      { label:"Say no", run:()=>({ text:"You said no, and the group treated you differently afterwards.", stats:{happiness:-6,smarts:+4} }) },
    ]}},
{ id:"v_volunteer", min:14, max:90, w:4, req:g=>doesOften(g,"volunteer",3), auto:g=>{
    const s = someone(g);
    return { text:`${pick([`A woman you help every week called you ${pick(["her angel","the only person who turns up","family"])}.`,
                           `The place you volunteer put your name on something.`,
                           `${s.name} started coming with you.`,
                           `You realised you had been doing it longer than anyone else there.`])}`,
             stats:{ happiness:+rint(10,20) }, kind:"good", relAdj:adj(s.rel,+8) };} },

/* ---------------- keyed to the work you do ---------------- */
{ id:"v_work_stranger", working:true, min:18, max:68, w:5, choice:{
    text:g=>`${cap(stranger())} has recognised you from work ${chance(0.5)?"in "+outside(g):inside()} and wants to talk about it.`,
    choices:[
      { label:"Give them the time", run:g=>({ text:`They told you what it meant to them. You thought about it for weeks.`, stats:{happiness:+16} , kind:"good"}) },
      { label:"Say you're off duty", run:()=>({ text:"You said you were off duty. They understood, and you felt like a coward anyway.", stats:{happiness:-6} }) },
      { label:"Pretend it isn't you", run:()=>chance(0.6)
          ? ({ text:"They apologised for the mistake and you got your afternoon back.", stats:{happiness:+2,smarts:+3} })
          : ({ text:"They knew exactly who you were and said so, loudly.", stats:{happiness:-10} }) },
    ]}},
{ id:"v_work_night", working:true, min:18, max:68, w:5, auto:g=>({
    text:`${pick(["A long one.","The shift from hell.","One of the quiet ones.","The sort of day you do not mention at home."])} ${pick([`You finished ${timeOfDay()}`,`You were still there ${timeOfDay()}`,`You got out early for once`,`Somebody covered the end of it for you`])} and ${pick(["drove home without the radio on","slept in the car for twenty minutes first","ate standing up","went straight to bed in your clothes","sat outside the house for a while before going in"])}.`,
    stats:{ health:-rint(1,6), happiness:rint(-6,4) } }) },
{ id:"v_work_leaving", working:true, min:20, max:66, w:4, req:g=>g.yearsInJob>=3, choice:{
    text:g=>{ const s=someone(g,["friend","bestfriend","colleague"]);
      return `${s.name}, who you have worked beside for years, is leaving.`; },
    choices:[
      { label:"Say the thing you've never said", run:g=>{ const s=someone(g,["friend","bestfriend","colleague"]);
          return { text:`You told them what they had meant to it. Neither of you was any good at it and it landed anyway.`, stats:{happiness:+16}, relAdj:adj(s.rel,+22), kind:"good" };} },
      { label:"Sign the card", run:()=>({ text:"You signed the card with everyone else and wrote something forgettable.", stats:{happiness:-4} }) },
      { label:"Ask if they're hiring", run:g=>chance(0.4)
          ? ({ text:"They put a word in and you were out within the year, on better money.", money:+local(g,rint(2000,18000)), stats:{happiness:+14} })
          : ({ text:"They said they would and never did.", stats:{happiness:-6} }) },
    ]}},

/* ---------------- keyed to who you know ---------------- */
{ id:"v_kin_favour", min:16, max:90, w:1, req:g=>!!livingKin(g), choice:{
    text:g=>{ const k=livingKin(g);
      return `${k.name} has asked you for ${pick(["money","a place to stay","an alibi","a kidney, and is not joking","help with something they will not explain","a loan they have not called a loan"])}.`; },
    choices:[
      { label:"Say yes without asking why", run:g=>{ const k=livingKin(g);
          return chance(0.55)
            ? ({ text:`You said yes. ${k?k.name:"They"} never forgot it.`, money:-afford(g,local(g,rint(200,6000))), stats:{happiness:+10}, relAdj:adj(k,+26) })
            : ({ text:`You said yes and it cost you more than you had.`, money:-afford(g,local(g,rint(1000,20000))), stats:{happiness:-12}, relAdj:adj(k,+8) });} },
      { label:"Ask why first", run:g=>{ const k=livingKin(g);
          return ({ text:`You asked. The answer was worse than you expected and you helped anyway.`, money:-afford(g,local(g,rint(200,4000))), stats:{happiness:+4,smarts:+6}, relAdj:adj(k,+14) });} },
      { label:"Say no", run:g=>{ const k=livingKin(g);
          return ({ text:`You said no. It was the right answer and it cost you ${pick(["Christmas","a decade","the relationship","more than you thought it would"])}.`, stats:{happiness:-16,smarts:+5}, relAdj:adj(k,-30) });} },
    ]}},
{ id:"v_neighbour", min:18, max:90, w:1, choice:{
    text:g=>`${cap(neighbour())} has ${pick(["started a fire in the garden every night","put a fence up two feet onto your side","been playing the same song since Tuesday","stopped answering the door","asked if you would keep an eye on the place","been feeding your cat things it should not have"])}.`,
    choices:[
      { label:"Knock on the door", run:g=>chance(0.6)
          ? ({ text:pick(["They explained, and you ended up staying for two hours.","It turned out to be something sad and you were glad you asked.","They apologised and brought round something baked."]), stats:{happiness:+12}, kind:"good" })
          : ({ text:pick(["It escalated on the doorstep.","They denied all of it with the evidence behind them.","You were told to mind your own business."]), stats:{happiness:-10} }) },
      { label:"Put it in writing", run:()=>chance(0.5)
          ? ({ text:"The letter worked and neither of you mentioned it again.", stats:{happiness:+4,smarts:+4} })
          : ({ text:"The letter went up in the window of their front room for everyone to read.", stats:{happiness:-12} }) },
      { label:"Leave it", run:()=>({ text:"You left it, and it became the thing you thought about every time you parked.", stats:{happiness:-6} }) },
    ]}},

/* ---------------- keyed to your age ---------------- */
{ id:"v_twenties", min:20, max:29, w:6, choice:{
    text:g=>`Everyone you know is ${pick(["getting engaged","buying somewhere","moving abroad","having babies","going back to study","getting very good at something"])} and you are ${pick(["not","pretending to be pleased about it","waiting for something to start","working out what you actually want","broke"])}.`,
    choices:[
      { label:"Go after what you actually want", run:g=>chance(0.55)
          ? ({ text:"You went after it. It took years and it was the right call.", stats:{happiness:+20,smarts:+8} , kind:"good"})
          : ({ text:"You went after it and it did not work, and you learned what you were made of.", stats:{happiness:-8,smarts:+12} }) },
      { label:"Do what they're doing", run:()=>({ text:"You did what everyone else was doing and it was fine. It was fine.", stats:{happiness:+4} }) },
      { label:"Wait", run:()=>({ text:"You waited. Some of it came to you and some of it went past.", stats:{happiness:-4,smarts:+4} }) },
    ]}},
{ id:"v_forties", min:40, max:54, w:3, choice:{
    text:g=>`${pick(["You have started",`It has occurred to you that you have started`])} ${pick(["saying the things your parents said","finding the music unbearable","reading the obituaries","planning holidays around beds","enjoying a quiet Friday more than a loud one","being the oldest person in the room"])}.`,
    choices:[
      { label:"Lean into it", run:()=>({ text:"You leaned into it and stopped apologising for any of it.", stats:{happiness:+16,smarts:+4}, kind:"good" }) },
      { label:"Fight it", run:g=>chance(0.5)
          ? ({ text:pick(["You got properly fit for the first time in twenty years.","You learned something difficult on purpose.","You went and did the thing you kept saying you would."]), stats:{health:+12,happiness:+14}, money:-afford(g,local(g,rint(200,6000))), kind:"good" })
          : ({ text:pick(["You bought something ridiculous and enjoyed it less than you expected.","It read as a crisis to everyone but you."]), money:-afford(g,local(g,rint(2000,40000))), stats:{happiness:-6} }) },
      { label:"Ignore it", run:()=>({ text:"You ignored it, which worked until it didn't.", stats:{happiness:-2} }) },
    ]}},
{ id:"v_old_visit", min:68, max:99, w:6, choice:{
    text:g=>{ const k=livingKin(g);
      return `${k ? k.name+" has" : "Somebody has"} started ${pick(["visiting more often","talking about 'options'","looking at your post","mentioning a place that has a garden","asking who has the keys"])}.`; },
    choices:[
      { label:"Tell them you're staying put", run:g=>{ const k=livingKin(g);
          return ({ text:"You said it plainly and they backed off, for now.", stats:{happiness:+10}, relAdj:adj(k,-8) });} },
      { label:"Go and look at the place", run:g=>chance(0.5)
          ? ({ text:"It was better than you expected and the food was hot. You put your name down.", stats:{happiness:+8,health:+6} })
          : ({ text:"You sat in the day room for an hour and could not get out fast enough.", stats:{happiness:-14} }) },
      { label:"Sort your affairs out", run:g=>({ text:"You wrote it all down, told them where it was, and slept better for it.", stats:{happiness:+14,smarts:+6}, kind:"good" }) },
    ]}},

/* ---------------- callbacks: things you did years ago ---------------- */
{ id:"v_callback_tattoo", min:28, max:80, w:4, once:true, req:g=>doesOften(g,"tattoo",1), auto:g=>({
    text:`${pick(["The tattoo has not aged well.","Somebody asked what the tattoo was meant to be.","You caught the tattoo in a mirror and did not recognise the person who chose it."])} ${pick(["You are keeping it.","You looked up what it would cost to take off.","It is a good story now, which is something."])}`,
    stats:{ happiness:rint(-6,8), looks:rint(-4,2) } }) },
{ id:"v_callback_scrappy", min:20, max:70, w:4, once:true, req:g=>!!F(g).scrappy, choice:{
    text:g=>`It has happened again — ${chance(0.5)?"in "+outside(g):inside()} — and you can feel yourself going the same way you did at school.`,
    choices:[
      { label:"Walk away this time", run:()=>({ text:"You walked away, and it was harder than swinging would have been.", stats:{happiness:+14,smarts:+10}, kind:"good" }) },
      { label:"Do what you've always done", run:g=>chance(0.5)
          ? ({ text:"It ended it immediately, the way it always has.", stats:{happiness:+6,health:-6} })
          : ({ text:"It ended with a caution and a conversation you did not enjoy.", arrest:{name:"affray",sentence:[1,2]}, stats:{happiness:-14} }) },
    ]}},
{ id:"v_callback_pushover", min:20, max:70, w:4, once:true, req:g=>!!F(g).pushover, choice:{
    text:g=>`Somebody is taking advantage of you again, and you recognise the feeling from being ${rint(8,13)} years old.`,
    choices:[
      { label:"Say something, finally", run:()=>({ text:"You said it. Badly, and much too loudly, and it worked.", stats:{happiness:+20,smarts:+8}, flags:{pushover:false}, kind:"good" }) },
      { label:"Let it go again", run:()=>({ text:"You let it go again, and hated yourself for the rest of the week.", stats:{happiness:-14} }) },
    ]}},
{ id:"v_callback_philanthropist", min:40, max:95, w:4, once:true, req:g=>!!F(g).philanthropist, auto:g=>({
    text:`${pick(["A letter arrived from somebody you gave money to.","A stranger stopped you to say what it paid for.","You saw your name on something and walked past without mentioning it."])}`,
    stats:{ happiness:+rint(14,24) }, kind:"good" }) },
{ id:"v_callback_migrant", migrant:true, min:30, max:85, w:4, auto:g=>({
    text:`${pick([`You dreamed in ${g.heritage} again.`,`Somebody asked where you were from and you gave the short answer.`,`You caught the smell of something from ${g.heritage} in ${g.city} and had to stand still for a minute.`,`Your accent has gone somewhere in the middle and belongs nowhere.`])}`,
    stats:{ happiness:rint(-8,6), smarts:+2 } }) },

/* ---------------- the texture of an ordinary year ---------------- */
{ id:"v_ordinary", min:16, max:99, w:2, auto:g=>{
    const s = someone(g);
    return { text:pick([
      `You spent most of ${season()} ${pick(["fixing something that kept breaking","waiting on a phone call","in a dispute about a bill","reading in the bath","avoiding one specific person"])}.`,
      `${s.name} ${pick(["turned up unannounced","rang at a bad time and stayed on for an hour","asked you for nothing, which was new","told you something you will not repeat"])}.`,
      `You got very good at ${pick(["making one meal","a card game","doing nothing on a Sunday","parking","a specific route home"])} this year.`,
      `${cap(stranger())} ${pick(["held a door and said something that stuck with you","gave you directions you did not need","complimented something you were self-conscious about"])} ${chance(0.5)?"at "+outside(g):"one morning"}.`,
      `A thing you had been dreading ${pick(["turned out to be nothing","happened, and was survivable","got cancelled"])}.`,
      `You ${pick(["ate the same thing every day for a month","stopped answering the phone","started walking a longer way round","let the garden go","tidied one drawer and no others"])}, ${pick(["for no reason you could name","because it was easier","and nobody noticed"])}.`,
    ]), stats:{ happiness:rint(-4,7) } };} },
{ id:"v_weather_year", min:10, max:99, w:2, auto:g=>({
    text:`${pick([`The ${pick(["wettest","hottest","coldest","windiest"])} ${season()} anyone could remember.`,`${cap(season())} came late and then all at once.`,`It did not stop raining in ${g.city} for six weeks.`])} ${pick(["The roof took it badly.","Everyone talked about nothing else.","You rather liked it.","It put everything back by a month."])}`,
    stats:{ happiness:rint(-6,6), health:rint(-3,2) } }) },
];

/* ============================================================
   Gated by circumstance — the strongest lever on making two lives
   different. A rich childless ex-con and a broke parent of four should not
   be drawing from the same deck.
   ============================================================ */
const kids = g => g.rels.filter(r => r.type === "child" && r.alive);
const partner = g => g.rels.find(r => r.type === "partner" && r.alive) || null;
const rich = g => g.money > 400000;
const skint = g => g.money < 2000;

export const CIRCUMSTANCE = [

/* ---- money, at both ends ---- */
{ id:"c_rich_ask", min:25, max:90, w:6, req:rich, choice:{
    text:g=>{ const s=someone(g); return `${s.name} has worked out roughly what you are worth and has ${pick(["a proposal","a favour to ask","an investment opportunity","a sob story","an invoice they think you should cover"])}.`; },
    choices:[
      { label:"Write the cheque", run:g=>{ const s=someone(g);
          return chance(0.5)
            ? ({ text:"It did what they said it would, and they paid you back with interest you did not ask for.", money:-afford(g,local(g,rint(5000,80000))), stats:{happiness:+10}, relAdj:adj(s.rel,+18) })
            : ({ text:"It went exactly where you thought it would go.", money:-afford(g,local(g,rint(5000,120000))), stats:{happiness:-12}, relAdj:adj(s.rel,-10) });} },
      { label:"Offer advice instead", run:()=>({ text:"You gave them an hour and a contact instead of a cheque. They wanted the cheque.", stats:{happiness:-4,smarts:+6} }) },
      { label:"Stop taking their calls", run:g=>{ const s=someone(g); return ({ text:"You let it ring out until they stopped trying.", stats:{happiness:-8}, relAdj:adj(s.rel,-24) });} },
    ]}},
{ id:"c_skint_choice", min:18, max:80, w:6, req:skint, choice:{
    text:g=>`There is ${pick(["the electric","the rent","a fine with a date on it","the food shop","a bill you have hidden"])} and ${pick(["not enough for both","nothing in the account until Thursday","a number you have stopped looking at"])}.`,
    choices:[
      { label:"Ask somebody", run:g=>{ const k=livingKin(g);
          return k && chance(0.6)
            ? ({ text:`${k.name} sent it over without making you explain.`, money:+local(g,rint(100,1500)), stats:{happiness:+6}, relAdj:adj(k,-6) })
            : ({ text:"You could not make yourself ask, in the end.", stats:{happiness:-14} });} },
      { label:"Sell something", run:g=>({ text:pick(["You sold the thing you said you never would.","You took a box of it to a shop that offered a third of its worth.","It went online at eight in the morning and was gone by nine."]), money:+local(g,rint(80,2000)), stats:{happiness:-10} }) },
      { label:"Let it slide", run:g=>chance(0.5)
          ? ({ text:"Nothing happened for three months and then it all happened at once.", stats:{happiness:-16} })
          : ({ text:"You got away with it, this time.", stats:{happiness:-4,smarts:+3} }) },
      { label:"Pick up extra hours", run:g=>({ text:"You worked every hour going and it just about covered it.", money:+local(g,rint(200,2500)), stats:{health:-8,happiness:-4} }) },
    ]}},

/* ---- being a parent, or not ---- */
{ id:"c_kid_trouble", min:28, max:75, w:6, req:g=>kids(g).some(k=>k.age>=11&&k.age<=19), choice:{
    text:g=>{ const k=pick(kids(g).filter(x=>x.age>=11&&x.age<=19));
      return `${k.name} has ${pick(["been suspended","been brought home by the police","stopped speaking to anyone in the house","been caught with something","been bullying somebody","stopped going in at all"])}.`; },
    choices:[
      { label:"Come down hard", run:g=>{ const k=pick(kids(g));
          return chance(0.45)
            ? ({ text:"It stopped immediately and they did not forgive you for a year.", stats:{happiness:-6}, relAdj:adj(k,-18) })
            : ({ text:"It made it worse and pushed the whole thing underground.", stats:{happiness:-16}, relAdj:adj(k,-26) });} },
      { label:"Find out what's actually going on", run:g=>{ const k=pick(kids(g));
          return chance(0.65)
            ? ({ text:"You sat in the car outside the house and got the truth out of them.", stats:{happiness:+16,smarts:+6}, relAdj:adj(k,+24), kind:"good" })
            : ({ text:"You asked and got nothing, for months.", stats:{happiness:-10}, relAdj:adj(k,+4) });} },
      { label:"Get someone else involved", run:g=>({ text:pick(["A counsellor got further in an hour than you had in a year.","The school were useless.","Their aunt got through to them."]), money:-afford(g,local(g,rint(100,3000))), stats:{happiness:+6} }) },
    ]}},
{ id:"c_childless", min:38, max:70, w:2, once:true, req:g=>kids(g).length===0, choice:{
    text:g=>`${pick(["Somebody asked, again, when you were going to have children.","You did the sums and realised the window has closed or is closing.","A friend's child called you by the wrong name and you minded more than you expected."])}`,
    choices:[
      { label:"Make your peace with it", run:()=>({ text:"You made your peace with it, mostly, and stopped explaining yourself to people.", stats:{happiness:+14,smarts:+6}, kind:"good" }) },
      { label:"Look into the options", run:g=>chance(0.4)
          ? ({ text:"It worked, against the odds and the cost.", money:-afford(g,local(g,rint(3000,40000))), stats:{happiness:+26}, kind:"good" })
          : ({ text:"It did not work, and it took years and everything you had.", money:-afford(g,local(g,rint(3000,50000))), stats:{happiness:-20} }) },
      { label:"Put it into something else", run:()=>({ text:pick(["You put it into other people's children and were the best thing in several of their lives.","You put it into the work and got very good at it.","You put it into a dog, frankly."]), stats:{happiness:+16}, kind:"good" }) },
    ]}},

/* ---- coupled, or not ---- */
{ id:"c_partner_drift", min:24, max:80, w:1, req:g=>!!partner(g), choice:{
    text:g=>{ const p=partner(g);
      return `You and ${p.name} have ${pick(["stopped talking about anything that matters","been living like flatmates since the spring","had the same argument four times","not been away together in years","started going to bed at different times"])}.`; },
    choices:[
      { label:"Say it out loud", run:g=>{ const p=partner(g);
          return chance(0.6)
            ? ({ text:`You said it. ${p?p.name:"They"} had been thinking it too, and it got better from there.`, stats:{happiness:+20}, relAdj:adj(p,+26), kind:"good" })
            : ({ text:`You said it and it turned out to be the beginning of the end.`, stats:{happiness:-18}, relAdj:adj(p,-20) });} },
      { label:"Book something", run:g=>({ text:pick(["A weekend away fixed more than it had any right to.","You went away and had the argument somewhere more expensive."]), money:-afford(g,local(g,rint(300,4000))), stats:{happiness:+rint(-4,16)} }) },
      { label:"Let it lie", run:g=>({ text:"You let it lie. It stayed exactly where you left it.", stats:{happiness:-8}, relAdj:adj(partner(g),-8) }) },
    ]}},
{ id:"c_single_long", min:30, max:75, w:5, req:g=>!partner(g), choice:{
    text:g=>`${pick(["You have been on your own for a long time now.","Another wedding, another table with the single people on it.","Somebody set you up without asking and you went along with it."])}`,
    choices:[
      { label:"Actually try", run:g=>chance(0.45)
          ? ({ text:"You met somebody worth the effort.", stats:{happiness:+24}, kind:"good" })
          : ({ text:"You tried for a year and it was mostly admin.", stats:{happiness:-8,smarts:+4} }) },
      { label:"Enjoy it", run:()=>({ text:pick(["You got very good at your own company.","You did exactly what you wanted for a decade and regret none of it.","You filled the house with things you chose."]), stats:{happiness:+18}, kind:"good" }) },
      { label:"Get a dog", run:g=>({ text:"You got a dog. It was the correct decision.", money:-afford(g,local(g,rint(200,1500))), stats:{happiness:+20}, addPet:"Dog", kind:"good" }) },
    ]}},

/* ---- a record follows you ---- */
{ id:"c_record", min:20, max:70, w:6, req:g=>g.criminalRecord>0, choice:{
    text:g=>`${pick(["A form has asked the question.","Somebody has looked you up.","The job offer has come with a check attached.","Your name came up in a conversation you were not in."])}`,
    choices:[
      { label:"Tell the truth", run:g=>chance(0.55)
          ? ({ text:"You told them, and they took it better than you had spent a week imagining.", stats:{happiness:+16,smarts:+5}, kind:"good" })
          : ({ text:"You told them and the offer evaporated inside a day.", stats:{happiness:-18} }) },
      { label:"Leave it off", run:g=>chance(0.5)
          ? ({ text:"Nobody checked. You waited two years for somebody to check.", stats:{happiness:-6} })
          : ({ text:"Somebody checked.", fire:true, stats:{happiness:-22} }) },
      { label:"Get it looked at", run:g=>({ text:pick(["A solicitor got it filtered off, eventually.","It was spent, and you had not known."]), money:-afford(g,local(g,rint(200,4000))), stats:{happiness:+12,smarts:+6} }) },
    ]}},

/* ---- what your body is doing ---- */
{ id:"c_unfit", min:30, max:80, w:5, req:g=>g.stats.health<45, choice:{
    text:g=>`${pick(["The stairs have started to mean something.","A photograph caught you at the wrong angle and you have not stopped thinking about it.","Somebody offered you a seat.","The doctor used the word 'concerning'."])}`,
    choices:[
      { label:"Do something about it", run:g=>chance(0.6)
          ? ({ text:"You turned it round over about eighteen months. Nobody clapped and it was still the best thing you did.", stats:{health:+22,happiness:+14}, kind:"good" })
          : ({ text:"You started four times and stopped four times.", stats:{health:+4,happiness:-8} }) },
      { label:"Ignore it", run:()=>({ text:"You ignored it, which is a decision even when it doesn't feel like one.", stats:{health:-10,happiness:-4} }) },
    ]}},
{ id:"c_beautiful", min:16, max:55, w:5, req:g=>g.stats.looks>=80, choice:{
    text:g=>`${pick(["You have been offered something on the strength of how you look.","Somebody assumed something about you, again.","A stranger took a photograph of you without asking."])}`,
    choices:[
      { label:"Use it", run:g=>({ text:pick(["It opened a door that was shut to better people and you walked through it.","You took the money and thought about it later."]), money:+local(g,rint(500,20000)), fame:+rint(1,8), stats:{happiness:+8} }) },
      { label:"Refuse on principle", run:()=>({ text:"You refused, and were called difficult by people who had never been offered anything.", stats:{happiness:+6,smarts:+8} }) },
      { label:"Nothing", run:()=>({ text:"You said nothing and it kept happening.", stats:{happiness:-6} }) },
    ]}},
{ id:"c_clever", min:16, max:70, w:1, req:g=>g.stats.smarts>=85, choice:{
    text:g=>`${pick(["Somebody has asked you to fix something nobody else can.","You have spotted an error that a lot of people are about to be embarrassed by.","You are being asked to explain it again, more slowly, to the person paid more than you."])}`,
    choices:[
      { label:"Fix it and say nothing", run:g=>({ text:"You fixed it quietly and somebody else was thanked for it.", stats:{smarts:+6,happiness:-8} }) },
      { label:"Fix it and make sure they know", run:g=>chance(0.55)
          ? ({ text:"They knew. It changed how you were treated.", money:+local(g,rint(500,12000)), stats:{happiness:+16} })
          : ({ text:"They knew, and resented you for it.", stats:{happiness:-10,smarts:+4} }) },
      { label:"Let it fail", run:()=>({ text:"You let it fail and watched it from the back of the room.", stats:{happiness:+4,smarts:+2} }) },
    ]}},
];
