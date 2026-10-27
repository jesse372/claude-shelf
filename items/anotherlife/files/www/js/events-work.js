/* ============================================================
   AnotherLife — events that belong to the work you actually do

   Targeting (handled in the engine's pool filter):
     job:"fire"            exactly that job
     jobAny:["fire",...]   any of those jobs
     sector:"Healthcare"   anyone in that line of work
     working:true          anyone with a job at all
   Plus `req` as usual for anything finer.

   The point of these is consequence. A firefighter should be able to lose a
   year to burns and come back on compensation — or not come back. Results may
   carry `leave:{years,reason,comp}` to sign you off work, and `die:"cause"`.
   ============================================================ */
import { pick, rint, chance, money, afford, local } from "./util.js";

const F = g => g.flags || (g.flags = {});
const mate = g => g.rels.find(r => r.alive && (r.type === "friend" || r.type === "bestfriend")) || null;

export const WORK = [

/* ---------------- FIRE ---------------- */
{ id:"w_fire_roof", jobAny:["fire","fire_station","fire_airport","fire_wild"], min:19, max:60, w:6, choice:{
    text:"You're inside a house fire and the roof above you is about to go.",
    choices:[
      { label:"Push on to the back bedroom", run:g=>chance(0.62)
          ? ({ text:"You found her under the window and carried her out. The roof went in behind you.", fame:+rint(4,14), stats:{happiness:+26,health:-22}, kind:"good", fx:"hit" })
          : (chance(0.80)
             ? ({ text:"It came down across your back. Burns to thirty percent of you, and months in a unit.", stats:{health:-34,happiness:-18}, leave:{years:1,reason:"burns",comp:0.7}, kind:"bad", fx:"hit" })
             : ({ text:"It came down on top of you and the crew could not get to you in time.", fx:"hit", die:"burns sustained in a house fire" })) },
      { label:"Get out and fight it from outside", run:g=>chance(0.75)
          ? ({ text:"You backed out and put it out through the window. Textbook, and nobody thanked you.", stats:{happiness:-4,health:-4} })
          : ({ text:"You backed out a second too late and took a lungful. Two weeks on oxygen.", stats:{health:-18,happiness:-10}, kind:"bad" }) },
      { label:"Send the probationer in", run:g=>chance(0.5)
          ? ({ text:"He came out with the dog and grinned about it for a year.", stats:{happiness:+6} })
          : ({ text:"He came out burnt. You signed the statement and you still think about it.", stats:{happiness:-26}, kind:"bad" }) },
    ]}},
{ id:"w_fire_smoke", jobAny:["fire","fire_station","fire_airport","fire_wild","fire_hazmat"], min:19, max:62, w:5, auto:g=>chance(0.5)
    ? ({ text:"A bad one on the industrial estate. You were on air for four hours and slept in the appliance bay.", stats:{health:-8,happiness:-4} })
    : ({ text:"A quiet run of shifts — chip pans, lift rescues and a cat that did not want rescuing.", stats:{happiness:+6} }) },
{ id:"w_fire_lungs", jobAny:["fire","fire_station","fire_wild"], min:38, max:65, w:4, once:true, req:g=>g.yearsInJob>=8, choice:{
    text:"The medical has flagged your lungs. Twenty years of other people's smoke.",
    choices:[
      { label:"Take the desk job", run:g=>({ text:"You took the safety officer's post. Quieter, and you hated it for a while.", stats:{health:+8,happiness:-8} }) },
      { label:"Fight the finding", run:g=>chance(0.45)
          ? ({ text:"You passed the re-test and stayed operational.", stats:{happiness:+12,health:-4} })
          : ({ text:"You failed it twice and were retired on medical grounds.", fire:true, stats:{happiness:-22}, money:+local(g,rint(20000,90000)) }) },
      { label:"Retire", run:g=>({ text:"You went out on a full pension with your lungs half gone.", fire:true, money:+local(g,rint(30000,120000)), stats:{happiness:-6} }) },
    ]}},
{ id:"w_fire_wild", job:"fire_wild", min:18, max:55, w:6, choice:{
    text:"The wind has turned and the fire is now between your crew and the road.",
    choices:[
      { label:"Deploy shelters", run:g=>chance(0.94)
          ? ({ text:"You lay under foil while it went over you. Everyone got up afterwards.", stats:{health:-16,happiness:-20}, fx:"hit" })
          : ({ text:"It burned over hotter than the shelters are rated for.", fx:"hit", die:"a burnover on the fireline" }) },
      { label:"Run for the black", run:g=>chance(0.93)
          ? ({ text:"You made the burnt ground with seconds in it.", stats:{health:-10,happiness:-12} })
          : ({ text:"You did not make the black.", fx:"hit", die:"a wildfire burnover" }) },
      { label:"Cut a line and hold", run:()=>chance(0.6)
          ? ({ text:"You held it. The crew boss put you up for something.", fame:+rint(2,7), stats:{happiness:+16,health:-8} })
          : ({ text:"The line did not hold and you lost the vehicles.", stats:{happiness:-14,health:-6} }) },
    ]}},

/* ---------------- POLICE ---------------- */
{ id:"w_pol_stop", jobAny:["police","police_highway","police_det","police_riot"], min:19, max:60, w:6, choice:{
    text:"A routine stop and the driver's hand has gone under the seat.",
    choices:[
      { label:"Draw", run:g=>chance(0.62)
          ? ({ text:"It was a phone. You were cleared, and reviewed, and it stayed with you.", stats:{happiness:-16} })
          : ({ text:"It was not a phone. You were faster.", fame:+rint(2,8), stats:{happiness:-24,health:-6}, fx:"police" }) },
      { label:"Step back and call it in", run:g=>chance(0.7)
          ? ({ text:"Armed response took it off you. Everyone went home.", stats:{happiness:+8,smarts:+5} })
          : ({ text:"He was out of the car before backup arrived and you took a bad one.", stats:{health:-30,happiness:-18}, leave:{years:1,reason:"injuries on duty",comp:0.75}, kind:"bad", fx:"hit" }) },
      { label:"Reach in", run:()=>chance(0.90)
          ? ({ text:"You had his wrist before he had the grip. It went in the report as nothing.", stats:{happiness:+10,health:-4} })
          : ({ text:"He had it first.", fx:"hit", die:"gunshot wounds received on duty" }) },
    ]}},
{ id:"w_pol_corrupt", jobAny:["police","police_det","police_highway"], min:22, max:58, w:4, once:true, choice:{
    text:"An envelope has been left in your locker and everyone on the shift knows whose it is.",
    choices:[
      { label:"Take it", run:g=>chance(0.6)
          ? ({ text:"You took it, and then you took the next one.", money:+local(g,rint(4000,30000)), stats:{happiness:-8}, flags:{bentcopper:true} })
          : ({ text:"Anti-corruption had been watching the locker for a month.", fire:true, arrest:{name:"corruption",sentence:[2,5]}, stats:{happiness:-30} }) },
      { label:"Hand it in", run:g=>chance(0.5)
          ? ({ text:"You handed it in. Two officers were arrested and nobody spoke to you for a year.", stats:{happiness:-10,smarts:+8}, fame:+rint(1,5) })
          : ({ text:"You handed it in and it went nowhere, except round the station.", stats:{happiness:-16} }) },
      { label:"Put it back and say nothing", run:()=>({ text:"You put it back exactly where you found it and kept your head down.", stats:{happiness:-6,smarts:+3} }) },
    ]}},
{ id:"w_pol_death", jobAny:["police","police_det","police_riot","police_highway"], min:20, max:60, w:4, auto:g=>chance(0.5)
    ? ({ text:"A child death on your shift. You wrote it up, went home, and did not talk about it.", stats:{happiness:-20,health:-4}, kind:"bad" })
    : ({ text:"You talked a man off a bridge at four in the morning. He is still alive.", stats:{happiness:+22}, kind:"good" }) },
{ id:"w_pol_det_case", job:"police_det", min:24, max:62, w:5, choice:{
    text:"The case has gone cold and the family still ring you every week.",
    choices:[
      { label:"Work it on your own time", run:g=>chance(0.45)
          ? ({ text:"You found the thread nobody pulled. He got life.", fame:+rint(6,18), stats:{happiness:+28,health:-8}, kind:"good" })
          : ({ text:"Two years of your own weekends and it stayed cold.", stats:{happiness:-14,health:-6} }) },
      { label:"Hand it to the review team", run:()=>({ text:"You handed over everything you had. They did nothing with it.", stats:{happiness:-8} }) },
      { label:"Tell them to stop ringing", run:()=>({ text:"You said it as kindly as you could. It did not come out kindly.", stats:{happiness:-14} }) },
    ]}},

/* ---------------- AMBULANCE ---------------- */
{ id:"w_para_save", jobAny:["para","para_critical","para_air"], min:19, max:62, w:6, choice:{
    text:"Cardiac arrest in a stairwell, and the stairs are too narrow for the chair.",
    choices:[
      { label:"Work him where he is", run:g=>chance(0.5)
          ? ({ text:"You got him back on the fourth shock. He walked out of hospital nine days later.", stats:{happiness:+30,health:-6}, fame:+rint(1,6), kind:"good" })
          : ({ text:"You worked him for forty minutes on a concrete landing and called it there.", stats:{happiness:-18}, kind:"bad" }) },
      { label:"Carry him down first", run:()=>chance(0.4)
          ? ({ text:"You got him to the truck and he made it.", stats:{happiness:+22,health:-12}, kind:"good" })
          : ({ text:"You lost him on the stairs and did your back carrying him.", stats:{happiness:-20,health:-16}, kind:"bad" }) },
    ]}},
{ id:"w_para_assault", jobAny:["para","para_critical","para_transport"], min:19, max:60, w:5, choice:{
    text:"The patient's friend has decided the ambulance took too long and is coming at you.",
    choices:[
      { label:"Get behind the truck", run:()=>chance(0.75)
          ? ({ text:"You put the vehicle between you and waited for police.", stats:{happiness:-8,smarts:+4} })
          : ({ text:"He got round it. You were off for months with a fractured orbit.", stats:{health:-26,happiness:-20}, leave:{years:1,reason:"an assault on duty",comp:0.7}, kind:"bad", fx:"hit" }) },
      { label:"Stand your ground", run:()=>chance(0.45)
          ? ({ text:"He backed off. Your hands shook for the rest of the shift.", stats:{happiness:-10,health:-2} })
          : ({ text:"It went badly and you were hospitalised by the man whose brother you were treating.", stats:{health:-30,happiness:-24}, leave:{years:1,reason:"an assault on duty",comp:0.7}, kind:"bad", fx:"hit" }) },
      { label:"Keep treating the patient", run:()=>({ text:"You did not look up. Somebody pulled him off you eventually.", stats:{health:-14,happiness:-14}, kind:"bad" }) },
    ]}},
{ id:"w_para_burnout", sector:"Emergency Services", min:26, max:60, w:4, once:true, req:g=>g.yearsInJob>=6, choice:{
    text:"You have stopped being able to sleep the night after a shift.",
    choices:[
      { label:"See the occupational psychologist", run:()=>({ text:"You went. It helped more than you expected and you told nobody.", stats:{happiness:+18,smarts:+4}, kind:"good" }) },
      { label:"Drink it off", run:g=>chance(0.5)
          ? ({ text:"It worked for about a year.", stats:{happiness:+4,health:-12} })
          : ({ text:"It stopped working and started costing you things.", stats:{happiness:-18,health:-16}, addictKind:"alcohol", kind:"bad" }) },
      { label:"Transfer to a quieter station", run:()=>({ text:"You moved somewhere slower and got your evenings back.", stats:{happiness:+12} }) },
      { label:"Hand in your notice", run:g=>({ text:"You walked away from it entirely.", fire:true, stats:{happiness:+6,health:+8} }) },
    ]}},

/* ---------------- OTHER DANGEROUS TRADES ---------------- */
{ id:"w_mine_collapse", jobAny:["miner","driller","rig_worker"], min:18, max:60, w:5, choice:{
    text:"There's been a fall on the level below and two of the crew are the wrong side of it.",
    choices:[
      { label:"Go in after them", run:g=>chance(0.55)
          ? ({ text:"You got both of them out. The company gave you a watch.", fame:+rint(3,12), stats:{happiness:+24,health:-18}, kind:"good", fx:"hit" })
          : (chance(0.9)
             ? ({ text:"The second fall caught your legs. You will not go underground again.", stats:{health:-34,happiness:-22}, leave:{years:2,reason:"crush injuries",comp:0.65}, kind:"bad", fx:"hit" })
             : ({ text:"The second fall caught all three of you.", fx:"hit", die:"a roof collapse underground" })) },
      { label:"Wait for the rescue team", run:()=>chance(0.5)
          ? ({ text:"They got them out in four hours. Waiting was the right call and it did not feel like it.", stats:{happiness:-12} })
          : ({ text:"They got to them too late. You were told there was nothing you could have done.", stats:{happiness:-24}, kind:"bad" }) },
    ]}},
{ id:"w_rig_blowout", jobAny:["rig_worker","driller","refinery","oil"], min:18, max:58, w:4, choice:{
    text:"The well is kicking and the shear rams have not closed.",
    choices:[
      { label:"Stay and fight it", run:g=>chance(0.93)
          ? ({ text:"You killed the well. Everyone on that deck owes you and nobody says so.", money:+local(g,rint(5000,40000)), fame:+rint(2,8), stats:{happiness:+18,health:-14} })
          : ({ text:"It got away from you.", fx:"hit", die:"a blowout on the rig" }) },
      { label:"Muster and abandon", run:()=>({ text:"You mustered. The rig burned for nine days and you watched it from a boat.", stats:{happiness:-16,health:-4} }) },
    ]}},
{ id:"w_build_fall", sector:"Trades", min:18, max:62, w:5, choice:{
    text:"The scaffold board you are standing on is not tied and you have just felt it move.",
    choices:[
      { label:"Grab the standard", run:()=>chance(0.7)
          ? ({ text:"You caught the upright and hung there swearing until someone got a ladder.", stats:{health:-6,happiness:-8} })
          : ({ text:"You went through three lifts of scaffold and landed badly. Pelvis, mostly.", stats:{health:-32,happiness:-20}, leave:{years:1,reason:"a fall at work",comp:0.65}, kind:"bad", fx:"hit" }) },
      { label:"Ride it down", run:()=>chance(0.92)
          ? ({ text:"You rode the board down onto the netting. It should not have worked.", stats:{health:-14,happiness:+4} })
          : ({ text:"There was no netting on that elevation.", fx:"hit", die:"a fall from height at work" }) },
      { label:"Refuse to work until it's tied", run:g=>chance(0.6)
          ? ({ text:"The site manager tied it and stopped speaking to you. You kept all your bones.", stats:{happiness:+6,smarts:+6} })
          : ({ text:"You were off the job by Friday for being difficult.", fire:true, stats:{happiness:-12,smarts:+5} }) },
    ]}},
{ id:"w_elec_shock", jobAny:["electrician","linesman","lift_engineer"], min:18, max:62, w:4, choice:{
    text:"Somebody has re-energised the circuit you are working on.",
    choices:[
      { label:"Let go", run:()=>chance(0.95)
          ? ({ text:"You came off it with burnt hands and a permanent opinion about lock-off procedure.", stats:{health:-18,happiness:-10}, fx:"hit" })
          : ({ text:"You could not let go of it.", fx:"hit", die:"electrocution at work" }) },
      { label:"Nothing — you locked it off yourself", run:()=>({ text:"Your own lock was on it. Nothing happened, which is the entire point of the lock.", stats:{smarts:+8,happiness:+8}, kind:"good" }) },
    ]}},
{ id:"w_fish_overboard", jobAny:["fisher","trawler_skip","deckhand"], min:18, max:60, w:5, choice:{
    text:"A wave has taken a crewman over the side in the dark.",
    choices:[
      { label:"Go in after him", run:g=>chance(0.93)
          ? ({ text:"You got a line on him. Both of you were blue by the time you came up.", fame:+rint(2,9), stats:{happiness:+26,health:-22}, kind:"good" })
          : ({ text:"You went in and neither of you came back up.", die:"drowning in a rescue attempt at sea" }) },
      { label:"Turn the boat and put a light on him", run:()=>chance(0.65)
          ? ({ text:"You had him alongside in four minutes. Textbook.", stats:{happiness:+20,smarts:+6}, kind:"good" })
          : ({ text:"You never found him. The search went on until first light.", stats:{happiness:-28}, kind:"bad" }) },
    ]}},
{ id:"w_pilot_engine", jobAny:["pilot","pilot_cargo","pilot_bush","heli_pilot"], min:22, max:62, w:4, choice:{
    text:"You have lost an engine and you are heavier than you would like.",
    choices:[
      { label:"Fly the aircraft", run:g=>chance(0.97)
          ? ({ text:"You flew it, ran the drills and put it down. The passengers never knew.", fame:+rint(1,6), stats:{happiness:+20,smarts:+6}, kind:"good" })
          : ({ text:"It got away from you on short final.", die:"an aircraft accident" }) },
      { label:"Declare and divert", run:()=>({ text:"You declared, diverted and filled in forms for a fortnight.", stats:{happiness:+8,smarts:+4} }) },
    ]}},

/* ---------------- HEALTHCARE ---------------- */
{ id:"w_med_mistake", sector:"Healthcare", min:22, max:64, w:5, req:g=>!!g.job, choice:{
    text:"You have given the wrong dose and the patient has deteriorated.",
    choices:[
      { label:"Declare it immediately", run:g=>chance(0.7)
          ? ({ text:"You declared it, they corrected it, and the patient was fine. The investigation cleared you.", stats:{happiness:-10,smarts:+8} })
          : ({ text:"You declared it and were suspended while it went to a panel.", stats:{happiness:-24}, leave:{years:1,reason:"a suspension pending investigation",comp:0.5}, kind:"bad" }) },
      { label:"Fix it quietly", run:g=>chance(0.5)
          ? ({ text:"You corrected it before anyone noticed and never slept properly again.", stats:{happiness:-16,health:-4} })
          : ({ text:"The notes did not match and it was found anyway. Struck off.", fire:true, stats:{happiness:-34}, kind:"bad" }) },
    ]}},
{ id:"w_med_shift", sector:"Healthcare", min:21, max:64, w:5, req:g=>!!g.job, auto:g=>pick([
    ({ text:"A fourteen-hour shift, two arrests and a man who called you by his daughter's name all night.", stats:{health:-8,happiness:-6} }),
    ({ text:"A woman you looked after for three weeks went home, and came back to say thank you.", stats:{happiness:+18}, kind:"good" }),
    ({ text:"You worked Christmas again. Somebody brought a tin of biscuits and it was genuinely enough.", stats:{happiness:+6,health:-4} }),
  ]) },
{ id:"w_med_sued", sector:"Healthcare", min:26, max:64, w:3, once:true, req:g=>!!g.job&&g.job.rung>=1, choice:{
    text:"A family is suing you personally over an outcome nobody could have changed.",
    choices:[
      { label:"Fight it", run:g=>chance(0.65)
          ? ({ text:"You were vindicated after two years of it.", stats:{happiness:-14,smarts:+8} })
          : ({ text:"You lost, and so did your indemnity premium.", money:-afford(g,local(g,rint(10000,120000))), stats:{happiness:-26}, kind:"bad" }) },
      { label:"Settle", run:g=>({ text:"You settled without admission. It still felt like one.", money:-afford(g,local(g,rint(5000,60000))), stats:{happiness:-16} }) },
    ]}},

/* ---------------- EVERY OTHER JOB ---------------- */
{ id:"w_promotion_pass", working:true, min:20, max:64, w:4, req:g=>g.job&&g.job.rung<2, choice:{
    text:"Somebody less good than you has been given the job you applied for.",
    choices:[
      { label:"Ask why, properly", run:g=>chance(0.55)
          ? ({ text:"You asked well and they told you the truth. Next round was yours.", stats:{smarts:+8,happiness:+6}, flags:{askedwhy:true} })
          : ({ text:"You were told it was 'not your time' by somebody who could not look at you.", stats:{happiness:-14} }) },
      { label:"Start applying elsewhere", run:g=>chance(0.5)
          ? ({ text:"You had a better offer within three months and took it.", money:+local(g,rint(2000,15000)), stats:{happiness:+14} })
          : ({ text:"Nothing came of it and you had to stay, having told people you were leaving.", stats:{happiness:-12} }) },
      { label:"Let it go", run:()=>({ text:"You let it go, mostly.", stats:{happiness:-6,smarts:+2} }) },
    ]}},
{ id:"w_rsi", working:true, min:28, max:64, w:3, once:true, req:g=>g.yearsInJob>=6, choice:{
    text:"Something in your wrist has been getting worse for a year and you have been ignoring it.",
    choices:[
      { label:"See someone about it", run:g=>({ text:"Splints, exercises and a proper chair. It settled down.", money:-afford(g,local(g,rint(200,2000))), stats:{health:+6,happiness:+6} }) },
      { label:"Keep ignoring it", run:g=>chance(0.5)
          ? ({ text:"It settled on its own, eventually.", stats:{health:-4} })
          : ({ text:"It got bad enough to need surgery and three months off.", stats:{health:-16,happiness:-12}, leave:{years:1,reason:"a repetitive strain injury",comp:0.6}, kind:"bad" }) },
    ]}},
{ id:"w_restructure", working:true, min:22, max:64, w:4, choice:{
    text:"There is a restructure and your role is 'under consultation'.",
    choices:[
      { label:"Fight for your job", run:g=>chance(0.5)
          ? ({ text:"You made the case and kept it, with more work attached.", stats:{happiness:+6,health:-6} })
          : ({ text:"You made the case and lost anyway.", fire:true, money:+local(g,rint(2000,30000)), stats:{happiness:-18} }) },
      { label:"Volunteer for redundancy", run:g=>({ text:"You took the package and the weight came off you in the car park.", fire:true, money:+local(g,rint(4000,60000)), stats:{happiness:+10} }) },
      { label:"Keep your head down", run:()=>chance(0.6)
          ? ({ text:"It went past you and took two others.", stats:{happiness:-8} })
          : ({ text:"It did not go past you.", fire:true, stats:{happiness:-20} }) },
    ]}},
];

/* ============================================================
   INHERITED SHAREHOLDER — you own part of what a parent built, but not
   the running of it. Whether that changes is the whole point.
   ============================================================ */
export const SUCCESSION = [
{ id:"s_board_watch", min:16, max:80, w:5, req:g=>!!g.stake, auto:g=>({
    text:`${g.stake.emoji} ${pick([
      `The board sent you the annual report with a compliments slip and nothing else.`,
      `You were invited to the ${g.stake.name} Christmas do and sat at the wrong end of the table.`,
      `Somebody at ${g.stake.name} referred to you in a meeting as "the family".`,
      `You read about a decision at ${g.stake.name} in the paper, like everyone else.`,
      `A director you have never met sent you a card on the anniversary of the death.`])}`,
    stats:{ happiness:-rint(2,8), smarts:+2 } }) },

{ id:"s_board_offer", min:24, max:70, w:5, once:true,
  req:g=>!!g.stake && !g.stake.inTrust && g.stats.smarts>=62 && (g.stats.smarts+g.fame)>=75, choice:{
    text:g=>`The board at ${g.stake.name} has asked to meet you. Two of them think you should be running it.`,
    choices:[
      { label:"Take the chair", run:g=>chance(0.72)
          ? ({ text:`They voted you in. Your ${pick(["father","mother"])}'s company is yours to run, and everyone in the room knows how you got there.`,
               takeChair:true, stats:{happiness:+30,smarts:+6}, fame:+rint(4,14), kind:"good", fx:"cheer" })
          : ({ text:"The vote went against you by one. You will not be asked again.", stats:{happiness:-24} }) },
      { label:"Ask for a seat, not the chair", run:g=>({ text:"You took a non-executive seat and learned how it actually works from the inside.", stats:{smarts:+14,happiness:+10}, kind:"good", flags:{boardseat:true} }) },
      { label:"Say no", run:g=>({ text:"You said no. The dividends kept coming and your name stayed off the letterhead.", stats:{happiness:+4,smarts:+3} }) },
    ]}},

{ id:"s_board_campaign", min:22, max:70, w:4, req:g=>!!g.stake && !g.stake.inTrust, choice:{
    text:g=>`Nobody is going to hand you ${g.stake.name}. You could go and take it.`,
    choices:[
      { label:"Buy up more of it", run:g=>{ const c=afford(g,Math.round(g.stake.valuation*0.6));
          if (c < 1000) return { text:"You went to the bank and came back without the money.", stats:{happiness:-10} };
          return chance(0.6)
            ? ({ text:"You bought your way to control, one seat at a time.", money:-c, takeChair:true, stats:{happiness:+24,smarts:+8}, kind:"good", fx:"cheer" })
            : ({ text:"You spent it and the family holding still wasn't enough.", money:-c, stats:{happiness:-18} });} },
      { label:"Learn the business first", run:g=>({ text:pick([
            "You took a job three rungs down under a different surname and nobody worked it out for two years.",
            "You did the qualifications properly and were, eventually, unarguable."]),
          stats:{smarts:+16,happiness:+6}, flags:{earnedit:true}, kind:"good" }) },
      { label:"Make peace with it", run:()=>({ text:"You let it be somebody else's company and got on with your own life.", stats:{happiness:+12} }) },
    ]}},

{ id:"s_board_earned", min:26, max:72, w:6, once:true, req:g=>!!g.stake && !!F(g).earnedit, choice:{
    text:g=>`They cannot argue with you any more. ${g.stake.name} needs a chief executive and you are the obvious one.`,
    choices:[
      { label:"Take it", run:g=>({ text:"You took it on merit, in front of people who had watched you do the work.", takeChair:true, fame:+rint(6,16), stats:{happiness:+34}, kind:"good", fx:"cheer" }) },
      { label:"Put somebody better in", run:g=>({ text:"You backed a better candidate and kept the shares. It was the right call and it cost you nothing but the title.", stats:{happiness:+16,smarts:+10}, kind:"good" }) },
    ]}},

{ id:"s_buyout", min:18, max:85, w:4, once:true, req:g=>!!g.stake && !g.stake.inTrust, choice:{
    text:g=>`Somebody wants to buy your stake in ${g.stake.name}. The offer is above what it is worth.`,
    choices:[
      { label:"Sell", run:g=>({ text:`You sold the last of it. There is nothing of ${g.stake.name} in your name now.`, sellStake:1.25, stats:{happiness:-8}, fx:"money" }) },
      { label:"Refuse", run:g=>({ text:"You refused, and a year later they came back higher.", stats:{happiness:+8,smarts:+4} }) },
      { label:"Sell half", run:g=>({ text:"You took some off the table and kept a foot in the door.", money:+Math.round(g.stake.valuation*0.55), stats:{happiness:+6}, sellStake:0 }) },
    ]}},

{ id:"s_bad_year", min:16, max:85, w:4, req:g=>!!g.stake, auto:g=>chance(0.5)
    ? ({ text:`${g.stake.emoji} ${g.stake.name} had a bad year. The dividend was suspended and nobody rang to tell you.`, stats:{happiness:-12}, kind:"bad" })
    : ({ text:`${g.stake.emoji} ${g.stake.name} had the year of its life. Your share of it went up sharply.`, stats:{happiness:+14}, kind:"good" }) },
];
