/* ============================================================
   AnotherLife — the first fifteen years

   Childhood used to run on 53 events, so chickenpox turned up in 88% of
   lives and any two childhoods shared a third of their content. Ages 0-4
   had between zero and five events to draw on at all.

   Banded deliberately: what happens to you at three should not be able to
   happen to you at thirteen. Anything that reads the same at both ages is
   in the wrong file.
   ============================================================ */
import { pick, rint, chance, money, afford, local } from "./util.js";

const alive = (g, type) => g.rels.find(r => r.type === type && r.alive) || null;
const parent = g => alive(g, "mother") || alive(g, "father");
const sib    = g => g.rels.find(r => r.type === "sibling" && r.alive) || null;
const adj    = (r, d) => r ? { id: r.id, d } : null;
const pocket = (g, lo, hi) => local(g, rint(lo, hi));

export const CHILDHOOD = [

/* ============================================================
   0-2 — you are mostly a passenger
   ============================================================ */
{ id:"k_colic", min:0, max:1, w:4, auto:g=>({ text:`You screamed every evening from six until nine for three months. ${parent(g) ? parent(g).name + " stopped counting the days." : "Nobody in the house slept."}`, stats:{ health:-2 } }) },
{ id:"k_sleep_through", min:0, max:1, w:4, auto:()=>({ text:"You slept through the night for the first time. It was treated as a national holiday.", stats:{ health:+4, happiness:+4 }, kind:"good" }) },
{ id:"k_first_tooth", min:0, max:1, w:4, auto:()=>({ text:"Your first tooth came through and you bit everything you could reach.", stats:{ health:+2 } }) },
{ id:"k_hospital_scare", min:0, max:2, w:3, auto:g=>({ text:`A temperature nobody liked the look of, and a night under hospital lights. ${parent(g) ? parent(g).name + " did not sit down once." : "It passed."}`, stats:{ health:-6, happiness:-3 }, kind:"bad" }) },
{ id:"k_favourite_toy", min:1, max:3, w:5, auto:()=>({ text:`You became inseparable from ${pick(["a threadbare rabbit","a plastic dinosaur","one specific spoon","a blanket with the label picked off","a toy phone with no battery"])}. It went everywhere.`, stats:{ happiness:+6 } }) },
{ id:"k_lost_toy", min:1, max:4, w:3, req:g=>g.age>=2, auto:()=>({ text:`The favourite ${pick(["rabbit","dinosaur","blanket","duck"])} was left in a supermarket trolley and never recovered. You are told you did not speak for a day.`, stats:{ happiness:-8 } }) },
{ id:"k_nursery_start", min:2, max:3, w:4, auto:g=>chance(0.5)
    ? ({ text:"You were dropped at nursery, cried for four minutes, and then discovered the sandpit.", stats:{ happiness:+5, smarts:+3 }, kind:"good" })
    : ({ text:"You were dropped at nursery and cried the entire day. They rang to say it was normal.", stats:{ happiness:-6, smarts:+2 } }) },
{ id:"k_word_no", min:1, max:2, w:4, auto:()=>({ text:'You worked out what "no" does and used it roughly four hundred times a day.', stats:{ smarts:+4, happiness:+3 } }) },
{ id:"k_stairs", min:1, max:2, w:3, auto:()=>({ text:"You got up the stairs unsupervised and were found sitting at the top looking delighted.", stats:{ health:-2, happiness:+5 } }) },
{ id:"k_swallowed", min:1, max:4, w:3, auto:()=>({ text:`You swallowed ${pick(["a 2p coin","a button","half a crayon","a small magnet","a piece of Lego"])}. There was an X-ray and a lot of waiting.`, stats:{ health:-5, happiness:-3 }, kind:"bad" }) },
/* `req` is evaluated when the year's pool is built, but an earlier event in
   the same year can kill the grandparent before this one fires — so the
   handler cannot assume req still holds. It threw, safe() swallowed it, and
   the event silently did nothing. Handlers must stand on their own. */
{ id:"k_grandparent_spoil", min:2, max:6, w:4, req:g=>!!(alive(g,"grandmother")||alive(g,"grandfather")), auto:g=>{
    const gp = alive(g,"grandmother") || alive(g,"grandfather");
    if (!gp) return { text:"You were fed things you were not allowed and sent home at bedtime, wired.", stats:{ happiness:+7 }, kind:"good" };
    return { text:`${gp.name} fed you things you were not allowed and sent you home at bedtime, wired.`, stats:{ happiness:+9 }, relAdj:adj(gp,+8), kind:"good" };} },
{ id:"k_haircut", min:2, max:5, w:3, auto:()=>({ text:`Your first haircut. ${pick(["You screamed the shop down.","You sat perfectly still and were given a sticker.","Someone got carried away with the fringe and there are photographs."])}`, stats:{ looks:+rint(-3,4) } }) },

/* ============================================================
   3-5 — small, opinionated, largely unreasonable
   ============================================================ */
{ id:"k_imaginary_rules", min:3, max:6, w:4, auto:()=>({ text:`You invented a rule that ${pick(["the carpet was lava","the third stair was forbidden","nobody could say the word 'orange'","you could only enter rooms backwards"])} and enforced it rigorously.`, stats:{ smarts:+4, happiness:+5 } }) },
{ id:"k_dressing", min:3, max:6, w:2, choice:{
    text:"You have chosen your own clothes and the result is not good.",
    choices:[
      { label:"Refuse to change", run:()=>({ text:"You went out dressed as a small crisis and enjoyed every second.", stats:{ happiness:+8, looks:-3 } }) },
      { label:"Let them fix it",  run:()=>({ text:"You were quietly restyled on the doorstep.", stats:{ looks:+3, happiness:-2 } }) },
      { label:"Negotiate the hat",run:()=>({ text:"A compromise was reached. The hat stayed.", stats:{ happiness:+5, smarts:+3 } }) },
    ]}},
{ id:"k_park_lost", min:3, max:7, w:2, choice:{
    text:"You have lost sight of whoever brought you to the park.",
    choices:[
      { label:"Stay exactly still", run:g=>({ text:`You stood perfectly still and were found in ninety seconds. ${parent(g)?parent(g).name+" has told that story ever since.":"It was fine."}`, stats:{ smarts:+6, happiness:-2 } }) },
      { label:"Go looking",         run:()=>chance(0.5)?({ text:"You found them by the gate, entirely by luck.", stats:{ happiness:+3 } }):({ text:"You got considerably more lost. There was an announcement.", stats:{ happiness:-10, smarts:+2 } }) },
      { label:"Find an adult",      run:()=>({ text:"You found a woman with a pram and told her your whole name and street. It worked.", stats:{ smarts:+8, happiness:+2 }, kind:"good" }) },
    ]}},
{ id:"k_birthday_party", min:4, max:9, w:2, choice:{
    text:"It's your birthday and you get to choose the party.",
    choices:[
      { label:"Everyone in the class", run:g=>({ text:"Thirty children in a hired hall. Your parents aged visibly.", money:-afford(g,pocket(g,60,300)), stats:{ happiness:+12 } }) },
      { label:"Just two friends",      run:()=>({ text:"Three of you, a film and too much cake. It was perfect.", stats:{ happiness:+14 } }) },
      { label:"Something enormous",    run:g=>chance(0.6)
          ? ({ text:`A ${pick(["bouncy castle","magician","petting zoo","soft-play centre"])}. You talked about it for a year.`, money:-afford(g,pocket(g,150,600)), stats:{ happiness:+18 } })
          : ({ text:`The ${pick(["magician","bouncy castle","pony"])} did not turn up. There was a lot of standing about.`, money:-afford(g,pocket(g,150,600)), stats:{ happiness:-10 } }) },
    ]}},
{ id:"k_wall_drawing", min:3, max:6, w:2, choice:{
    text:"There is a drawing on the hallway wall and it is unmistakably yours.",
    choices:[
      { label:"Own up",        run:g=>({ text:"You admitted it immediately and were sent to bed early, but not shouted at.", stats:{ happiness:-3, smarts:+4 }, relAdj:adj(parent(g),+5) }) },
      { label:"Blame the dog", run:g=>chance(0.3)?({ text:"Astonishingly, this worked.", stats:{ happiness:+6, smarts:+3 } }):({ text:"The dog cannot reach that high and everyone knew it.", stats:{ happiness:-8 }, relAdj:adj(parent(g),-6) }) },
      { label:"Blame a sibling", run:g=>{ const s=sib(g);
          return s ? (chance(0.4)?({ text:`${s.name} took the blame and has not forgotten.`, stats:{ happiness:+4 }, relAdj:adj(s,-14) })
                                 :({ text:`${s.name} produced an alibi. You went to bed early.`, stats:{ happiness:-8 }, relAdj:adj(s,-8) }))
                    : ({ text:"You blamed a sibling you do not have. This did not go well.", stats:{ happiness:-6 } });} },
    ]}},
{ id:"k_nativity", min:4, max:8, w:4, auto:()=>({ text:`You were cast as ${pick(["the innkeeper","a sheep","the back of a camel","a narrator with one line","the star, literally"])} in the school play and delivered it with total commitment.`, stats:{ happiness:+7, looks:+1 } }) },
{ id:"k_bedtime_stall", min:3, max:7, w:4, auto:()=>({ text:`You perfected the bedtime stall: ${pick(["one more story","a glass of water","a suddenly urgent question about death","needing the toilet again","a noise in the wall"])}. It bought you eleven minutes a night.`, stats:{ smarts:+5, happiness:+3 } }) },
{ id:"k_dark", min:3, max:8, w:2, choice:{
    text:"You have decided there is something behind the wardrobe.",
    choices:[
      { label:"Get in with a parent", run:g=>({ text:"You slept sideways across their bed for a month.", stats:{ happiness:+6, health:-2 }, relAdj:adj(parent(g),+4) }) },
      { label:"Demand the light on", run:()=>({ text:"A landing light was negotiated and honour was satisfied.", stats:{ happiness:+4 } }) },
      { label:"Look behind it",      run:()=>chance(0.7)?({ text:"You looked. Nothing. You felt enormous.", stats:{ happiness:+10, smarts:+4 } }):({ text:"You looked, saw a coat, and did not sleep properly for a week.", stats:{ happiness:-8 } }) },
    ]}},
{ id:"k_sweets_checkout", min:3, max:8, w:2, choice:{
    text:"There are sweets at the checkout and you have made your position clear.",
    choices:[
      { label:"Full meltdown",     run:g=>chance(0.45)?({ text:"You won. Everyone in the queue lost.", stats:{ happiness:+7 }, relAdj:adj(parent(g),-6) }):({ text:"You were carried out horizontally, still negotiating.", stats:{ happiness:-9 } }) },
      { label:"Ask nicely",        run:()=>chance(0.6)?({ text:"It worked, which taught you something more valuable than the sweets.", stats:{ happiness:+8, smarts:+4 }, kind:"good" }):({ text:"You asked nicely and were still told no. A formative injustice.", stats:{ happiness:-4, smarts:+3 } }) },
      { label:"Pocket them",       run:()=>chance(0.5)?({ text:"You got away with it and felt sick about it for a week.", stats:{ happiness:-4, smarts:+2 } }):({ text:"You were caught at the door and made to hand them back and apologise.", stats:{ happiness:-11 } }) },
    ]}},
{ id:"k_puddle", min:3, max:7, w:4, auto:()=>({ text:`You found ${pick(["the deepest puddle in the county","a patch of mud with real potential","a puddle that turned out to be a pothole"])} and went in up to the thigh. The wellies never recovered.`, stats:{ happiness:+8, health:-1 } }) },
{ id:"k_beach_first", min:3, max:9, w:3, auto:g=>({ text:`Your first proper day at the sea. ${pick(["You were terrified of the waves and then could not be got out of them.","You ate a sandwich that was ninety percent sand.","You buried a parent up to the neck and left them there."])}`, money:-afford(g,pocket(g,20,140)), stats:{ happiness:+12, health:+3 }, kind:"good" }) },
{ id:"k_why", min:3, max:5, w:4, auto:()=>({ text:'You entered the "why" phase and took it to places nobody was ready for. Somebody had to look up how clouds work.', stats:{ smarts:+7, happiness:+3 } }) },
{ id:"k_pet_funeral", min:4, max:10, w:3, auto:()=>({ text:`A ${pick(["goldfish","hamster","stick insect","snail you had named"])} died and was buried in the garden with full honours and a lolly-stick cross.`, stats:{ happiness:-7, smarts:+3 } }) },
{ id:"k_swimming", min:4, max:9, w:2, choice:{
    text:"Swimming lessons. The deep end is being discussed.",
    choices:[
      { label:"Jump in",       run:()=>chance(0.65)?({ text:"You jumped, you surfaced, you were a swimmer from that moment.", stats:{ health:+8, happiness:+12 }, kind:"good" }):({ text:"You went under, were fished out, and did not go near water for two years.", stats:{ health:-4, happiness:-12 } }) },
      { label:"Cling to the side", run:()=>({ text:"You held the rail for six weeks and then let go on your own terms.", stats:{ health:+5, happiness:+4 } }) },
      { label:"Refuse entirely",   run:()=>({ text:"You sat on the bench in a towel every week for a term.", stats:{ happiness:-5, health:-2 } }) },
    ]}},

/* ============================================================
   6-8 — school is now the whole world
   ============================================================ */
{ id:"k_reading_group", min:6, max:9, w:4, auto:g=>chance(0.5)
    ? ({ text:`You were moved up a reading group and told ${sib(g)?sib(g).name:"everyone"} about it repeatedly.`, stats:{ smarts:+7, happiness:+6 }, kind:"good" })
    : ({ text:"You were moved down a reading group and understood exactly what it meant.", stats:{ smarts:+2, happiness:-9 } }) },
{ id:"k_best_friend", min:5, max:10, w:5, auto:()=>({ text:`You and ${pick(["Danny","Priya","Aoife","Marcus","Yusuf","Tilly","Bea","Kwame"])} became inseparable over ${pick(["a shared hatred of a teacher","one packet of stickers","being the last two picked","a den behind the bike sheds"])}.`, stats:{ happiness:+12 }, kind:"good" }) },
{ id:"k_lunchbox", min:5, max:10, w:4, choice:{
    text:"Your lunchbox is being discussed by the table and not kindly.",
    choices:[
      { label:"Defend it loudly",  run:()=>({ text:"You told them exactly what it was and that it was better than theirs. Two of them asked to try it.", stats:{ happiness:+9, smarts:+3 }, kind:"good" }) },
      { label:"Eat it facing away",run:()=>({ text:"You turned your back to the table for the rest of the term.", stats:{ happiness:-10 } }) },
      { label:"Ask for what everyone else has", run:g=>({ text:"You asked for the boring stuff and got it. Something small was lost.", stats:{ happiness:+2 }, relAdj:adj(parent(g),-3) }) },
    ]}},
{ id:"k_sports_day", min:6, max:11, w:5, choice:{
    text:"Sports day. The whole school is watching and so is your family.",
    choices:[
      { label:"Go flat out",  run:()=>chance(0.4)?({ text:"You won your race and it is the single best thing that has ever happened.", stats:{ happiness:+18, health:+5 }, kind:"good" }):({ text:"You went out too fast, faded, and came fifth. It stayed with you.", stats:{ happiness:-7, health:+4 } }) },
      { label:"Help someone slower", run:()=>({ text:"You slowed down to run in with the kid at the back. A teacher noticed and told everyone.", stats:{ happiness:+13, smarts:+3 }, kind:"good" }) },
      { label:"Fake a limp",  run:()=>({ text:"You sat it out with a mysterious ankle. Nobody was fooled, including you.", stats:{ happiness:-6 } }) },
    ]}},
{ id:"k_tooth_money", min:6, max:9, w:4, auto:g=>({ text:`Another tooth, another visit from the tooth fairy — ${money(g,local(g,rint(1,5)))} under the pillow, and a growing suspicion about the handwriting.`, money:+local(g,rint(1,5)), stats:{ happiness:+5, smarts:+2 } }) },
{ id:"k_bike", min:5, max:9, w:5, choice:{
    text:"The stabilisers are coming off today.",
    choices:[
      { label:"Let them hold on", run:g=>({ text:`${parent(g)?parent(g).name:"They"} let go forty metres before telling you. You were already riding.`, stats:{ happiness:+16, health:+4 }, relAdj:adj(parent(g),+8), kind:"good" }) },
      { label:"Do it alone",      run:()=>chance(0.55)?({ text:"You taught yourself on the grass, fell about nine times, and got it.", stats:{ happiness:+14, health:+2, smarts:+4 }, kind:"good" }):({ text:"You came off hard on the gravel and needed a lot of cleaning up.", stats:{ health:-10, happiness:-8 } }) },
      { label:"Not today",        run:()=>({ text:"You put it off for another summer.", stats:{ happiness:-3 } }) },
    ]}},
{ id:"k_show_and_tell", min:5, max:9, w:4, auto:g=>({ text:`You took ${pick(["a fossil","a foreign coin","a photo of a dog you met once","a plaster cast of a footprint","your grandad's medal"])} in for show and tell and spoke about it for far longer than allotted.`, stats:{ smarts:+5, happiness:+7 } }) },
{ id:"k_wet_pants", min:5, max:7, w:3, auto:()=>({ text:"You did not ask to go in time and the whole class knew. It took a year to stop being mentioned.", stats:{ happiness:-13 }, kind:"bad" }) },
{ id:"k_collection", min:6, max:11, w:4, auto:()=>({ text:`You started collecting ${pick(["football stickers","shiny stones","Pokémon cards","bottle tops","erasers shaped like food"])} with an intensity that alarmed people.`, stats:{ happiness:+8, smarts:+3 } }) },
{ id:"k_swap_regret", min:6, max:12, w:4, choice:{
    text:"Someone wants to swap something of theirs for the best thing you own.",
    choices:[
      { label:"Do the swap",   run:()=>chance(0.4)?({ text:"You got the better end of it and knew straight away.", stats:{ happiness:+10, smarts:+5 } }):({ text:"You were comprehensively robbed and thought about it for months.", stats:{ happiness:-11, smarts:+5 } }) },
      { label:"Hold out for more", run:()=>chance(0.5)?({ text:"You held firm and they came back with more. First deal you ever won.", stats:{ smarts:+8, happiness:+8 }, kind:"good" }):({ text:"They walked off and swapped with someone else.", stats:{ happiness:-5, smarts:+3 } }) },
      { label:"Refuse",        run:()=>({ text:"You kept it. It is still in a box somewhere.", stats:{ happiness:+3 } }) },
    ]}},
{ id:"k_teacher_favourite", min:6, max:11, w:4, auto:()=>({ text:`${pick(["Mrs Aldridge","Mr Okonkwo","Miss Ferreira","Mr Vance","Mrs Doyle"])} decided you were worth the effort and it changed how you saw yourself.`, stats:{ smarts:+9, happiness:+9 }, kind:"good" }) },
{ id:"k_teacher_hates", min:6, max:12, w:3, auto:()=>({ text:`${pick(["Mr Hollis","Mrs Crane","Miss Pratt","Mr Doughty"])} took against you in week one and never revised the position.`, stats:{ smarts:-3, happiness:-9 }, kind:"bad" }) },
{ id:"k_school_trip", min:6, max:12, w:5, choice:{
    text:`A school trip to ${pick(["a castle","a working farm","the science museum","a Roman fort","a chocolate factory"])}. You get one pound for the gift shop.`,
    choices:[
      { label:"Spend it all at once", run:g=>({ text:`You bought ${pick(["a rubber","a pencil with the name of the castle on it","a bag of rock","a keyring"])} and it was gone by eleven.`, money:-afford(g,pocket(g,1,4)), stats:{ happiness:+7 } }) },
      { label:"Save it",  run:()=>({ text:"You brought it home unspent and felt quietly superior on the coach.", stats:{ smarts:+5, happiness:+3 } }) },
      { label:"Lose it",  run:()=>({ text:"It went somewhere between the coach and the entrance and the day was ruined.", stats:{ happiness:-9 } }) },
    ]}},
{ id:"k_class_hamster", min:6, max:11, w:3, choice:{
    text:"You have been chosen to take the class hamster home for half term.",
    choices:[
      { label:"Guard it with your life", run:()=>({ text:"You returned it fatter but alive and were treated as a hero.", stats:{ happiness:+12, smarts:+3 }, kind:"good" }) },
      { label:"Let it out for a run",    run:()=>chance(0.6)?({ text:"It had the best week of its life and so did you.", stats:{ happiness:+10 } }):({ text:"It got behind the kitchen units. Its return took two days and a plumber.", stats:{ happiness:-12 } }) },
      { label:"Say no",                  run:()=>({ text:"You said no. Someone else got the glory.", stats:{ happiness:-4 } }) },
    ]}},

/* ============================================================
   9-11 — you start noticing where you stand
   ============================================================ */
{ id:"k_group_project", min:9, max:14, w:5, choice:{
    text:"You've been put in a group and one of them is doing nothing at all.",
    choices:[
      { label:"Do the whole thing", run:()=>({ text:"You did all four parts, got the top mark, and shared it with three people who hadn't opened the folder.", stats:{ smarts:+8, happiness:-6 } }) },
      { label:"Tell the teacher",   run:()=>chance(0.5)?({ text:"Names were taken and the marks were split properly.", stats:{ smarts:+4, happiness:+6 } }):({ text:"You were called a snitch for a fortnight.", stats:{ happiness:-10 } }) },
      { label:"Let it fail",        run:()=>({ text:"You handed in something poor to prove a point. The point was not taken.", stats:{ smarts:-3, happiness:-5 } }) },
    ]}},
{ id:"k_first_crush", min:9, max:13, w:5, choice:{
    text:"There's someone in your year you've started thinking about more than seems reasonable.",
    choices:[
      { label:"Tell a friend",  run:()=>chance(0.5)?({ text:"They kept it. That's how you learned who your friends were.", stats:{ happiness:+8 } }):({ text:"It was round the whole year by lunchtime.", stats:{ happiness:-14 } }) },
      { label:"Say something",  run:()=>chance(0.35)?({ text:"They said it back. You were unbearable for a month.", stats:{ happiness:+18, looks:+2 }, kind:"good" }):({ text:"They were kind about it, which was somehow worse.", stats:{ happiness:-10 } }) },
      { label:"Tell nobody ever", run:()=>({ text:"You took it to the grave, or at least to the end of term.", stats:{ happiness:-3, smarts:+3 } }) },
    ]}},
{ id:"k_sleepover_fallout", min:8, max:13, w:4, choice:{
    text:"Three of you at a sleepover, and two of you are getting on better than three of you can.",
    choices:[
      { label:"Side with one",   run:()=>({ text:"You picked, and the friendship you didn't pick never fully came back.", stats:{ happiness:-6, smarts:+4 } }) },
      { label:"Keep the peace",  run:()=>chance(0.6)?({ text:"You held it together until morning and everyone forgot by Monday.", stats:{ happiness:+7, smarts:+6 }, kind:"good" }):({ text:"It went off at two in the morning and someone's dad had to drive over.", stats:{ happiness:-9 } }) },
      { label:"Ring home",       run:()=>({ text:"You asked to be collected early. Nobody mentioned it, which was its own comment.", stats:{ happiness:-5 } }) },
    ]}},
{ id:"k_pocket_money", min:8, max:14, w:5, choice:{
    text:"You've been offered pocket money in exchange for jobs around the house.",
    choices:[
      { label:"Take every job",   run:g=>({ text:`You washed, dried, hoovered and walked the neighbour's dog. ${money(g,local(g,rint(20,120)))} by the end of the summer.`, money:+local(g,rint(20,120)), stats:{ smarts:+6, happiness:+5 }, relAdj:adj(parent(g),+8), kind:"good" }) },
      { label:"Negotiate a rate", run:()=>chance(0.55)?({ text:"You argued the rate up and learned something permanent about asking.", stats:{ smarts:+10, happiness:+7 }, kind:"good" }):({ text:"You pushed too hard and the whole arrangement was withdrawn.", stats:{ happiness:-8, smarts:+4 } }) },
      { label:"Not interested",   run:()=>({ text:"You decided the money wasn't worth the hoovering.", stats:{ happiness:+2 } }) },
    ]}},
{ id:"k_growth_spurt", min:10, max:14, w:4, auto:()=>({ text:`You went up ${pick(["four inches","half a foot","a whole trouser size"])} in a year and spent it apologising for your own elbows.`, stats:{ health:+4, looks:+rint(-4,6), happiness:-2 } }) },
{ id:"k_last_picked", min:8, max:13, w:4, auto:()=>({ text:"You were last to be picked again, and this time you did the maths on how often it had happened.", stats:{ happiness:-11, smarts:+3 }, kind:"bad" }) },
{ id:"k_instrument", min:7, max:13, w:4, choice:{
    text:"You can learn an instrument at school. There's a list.",
    choices:[
      { label:"Something loud",  run:()=>({ text:`You chose the ${pick(["drums","trumpet","trombone"])}. The house has not been quiet since.`, stats:{ happiness:+11, smarts:+5 } }) },
      { label:"Something proper",run:()=>chance(0.5)?({ text:`You stuck at the ${pick(["violin","piano","cello"])} past the horrible bit and came out the other side able to play.`, stats:{ smarts:+10, happiness:+8 }, kind:"good" }):({ text:"You gave it up after two terms and the instrument went under a bed.", stats:{ smarts:+3, happiness:-4 } }) },
      { label:"Not for you",     run:()=>({ text:"You looked at the list and walked past it.", stats:{ happiness:+1 } }) },
    ]}},
{ id:"k_bike_gang", min:9, max:13, w:4, auto:g=>({ text:`You and three others spent an entire summer on bikes with no particular destination, mostly around ${g.city}. Nobody knew where any of you were and nobody minded.`, stats:{ happiness:+14, health:+5 }, kind:"good" }) },
{ id:"k_shoplift_dare", min:10, max:14, w:3, choice:{
    text:"Someone has dared you to walk out of the corner shop with something.",
    choices:[
      { label:"Do it",     run:g=>chance(0.55)?({ text:"You did it and felt worse than you expected all the way home.", stats:{ happiness:-6, smarts:+2 } }):({ text:"The shopkeeper knew your surname and rang your house before you got there.", stats:{ happiness:-16 }, relAdj:adj(parent(g),-14) }) },
      { label:"Refuse",    run:()=>({ text:"You said no in front of everyone, which cost something and was worth it.", stats:{ happiness:+5, smarts:+7 }, kind:"good" }) },
      { label:"Pay for it and pretend", run:()=>({ text:"You bought it and let them think you hadn't. Everyone went home happy.", stats:{ smarts:+9, happiness:+6 } }) },
    ]}},
{ id:"k_parents_argue", min:6, max:15, w:4, req:g=>alive(g,"mother")&&alive(g,"father"), auto:()=>({ text:"You lay awake listening to raised voices downstairs and learned to tell the difference between the kinds.", stats:{ happiness:-12, smarts:+4 }, kind:"bad" }) },
{ id:"k_moved_house", min:4, max:14, w:3, auto:g=>chance(0.5)
    ? ({ text:`The family moved across ${g.city}. New room, new bus, everyone you knew twenty minutes further away.`, stats:{ happiness:-9, smarts:+4 } })
    : ({ text:`The family moved and your new room was, for the first time, your own.`, stats:{ happiness:+8 } }) },
{ id:"k_library_card", min:7, max:13, w:4, auto:()=>({ text:`You got your own library card and took out ${pick(["six books about sharks","the same book eleven times","an atlas you could barely carry","every book on Ancient Egypt they had"])}.`, stats:{ smarts:+10, happiness:+6 }, kind:"good" }) },

/* ============================================================
   12-15 — the ground shifts
   ============================================================ */
{ id:"k_big_school", min:11, max:12, w:6, choice:{
    text:"First week at the big school. Nobody knows where anything is and everyone is pretending they do.",
    choices:[
      { label:"Find the quiet ones", run:()=>({ text:"You found two people as lost as you were and that was that sorted for five years.", stats:{ happiness:+14, smarts:+3 }, kind:"good" }) },
      { label:"Aim for the loud table", run:()=>chance(0.45)?({ text:"You talked your way in and spent five years slightly on edge about it.", stats:{ happiness:+9, looks:+2 } }):({ text:"You hovered near them for a term and were never quite let in.", stats:{ happiness:-11 } }) },
      { label:"Keep your head down", run:()=>({ text:"You got through the first year almost unnoticed, which was the plan.", stats:{ happiness:+2, smarts:+6 } }) },
    ]}},
{ id:"k_puberty", min:11, max:15, w:5, auto:()=>({ text:`${pick(["Your voice broke halfway through reading aloud in class.","You grew out of every pair of shoes you owned in one term.","Your face declared war on you and won the opening battles.","You became suddenly, awkwardly aware of being looked at."])}`, stats:{ looks:+rint(-8,6), happiness:-6, health:+2 } }) },
{ id:"k_phone", min:11, max:15, w:5, choice:{
    text:"Everyone in your year has a phone. You have made this known.",
    choices:[
      { label:"Push hard for one", run:g=>chance(0.55)?({ text:"You got one, on conditions, and broke the conditions within a fortnight.", money:-afford(g,pocket(g,40,300)), stats:{ happiness:+13 } }):({ text:"You were told to wait a year and it felt like a sentence.", stats:{ happiness:-10 }, relAdj:adj(parent(g),-6) }) },
      { label:"Earn it yourself",  run:g=>({ text:`You saved for it — ${pick(["a paper round","washing cars","a summer of babysitting"])} — and it meant considerably more.`, money:+local(g,rint(30,200)), stats:{ smarts:+9, happiness:+11 }, kind:"good" }) },
      { label:"Let it go",         run:()=>({ text:"You decided you did not care, and were mostly telling the truth.", stats:{ happiness:+2, smarts:+4 } }) },
    ]}},
{ id:"k_group_chat", min:12, max:16, w:5, choice:{
    text:"Something unkind about someone in your year is going round the group chat.",
    choices:[
      { label:"Join in",     run:()=>({ text:"You added one line. It did as much damage as any of the others and you knew it.", stats:{ happiness:-8, smarts:-2 } }) },
      { label:"Say stop",    run:()=>chance(0.5)?({ text:"You said stop and, surprisingly, it stopped.", stats:{ happiness:+12, smarts:+6 }, kind:"good" }):({ text:"You said stop and became the next subject.", stats:{ happiness:-14 } }) },
      { label:"Screenshot it for a teacher", run:()=>({ text:"It ended, properly, and nobody ever found out who sent it in.", stats:{ happiness:+9, smarts:+8 }, kind:"good" }) },
      { label:"Leave the chat", run:()=>({ text:"You left without a word. Three people asked why and you didn't answer.", stats:{ happiness:+3, smarts:+4 } }) },
    ]}},
{ id:"k_detention_first", min:11, max:16, w:4, auto:()=>({ text:`Your first detention, for ${pick(["talking","the wrong shoes","an essay you never wrote","laughing at the wrong moment","a haircut deemed extreme"])}. It was less dramatic than you'd been led to believe.`, stats:{ happiness:-4, smarts:+2 } }) },
{ id:"k_part_time", min:13, max:16, w:5, choice:{
    text:"There's a Saturday job going.",
    choices:[
      { label:"Take it", run:g=>({ text:`${pick(["Stacking shelves","A paper round","Washing up in a café","Sweeping a barber's floor"])} for ${money(g,local(g,rint(200,900)))} over the year. It was the first money that was properly yours.`, money:+local(g,rint(200,900)), stats:{ smarts:+8, happiness:+7, health:-2 }, kind:"good" }) },
      { label:"Take it, hate it", run:g=>({ text:"You lasted five weeks and learned exactly what you did not want to do for a living.", money:+local(g,rint(40,200)), stats:{ smarts:+7, happiness:-5 } }) },
      { label:"Not yet", run:()=>({ text:"You kept your Saturdays. It was arguably the right call.", stats:{ happiness:+6 } }) },
    ]}},
{ id:"k_first_party", min:13, max:16, w:5, choice:{
    text:"Someone's parents are away and half the year is going.",
    choices:[
      { label:"Go and stay late", run:()=>chance(0.5)?({ text:"It was the best night of your life so far and you told nobody the details.", stats:{ happiness:+16, health:-3 } }):({ text:"It got out of hand, the police came, and everyone's parents found out at once.", stats:{ happiness:-12, health:-4 } }) },
      { label:"Go, leave early",  run:()=>({ text:"You put in an hour, said the right things to the right people, and were home by ten.", stats:{ happiness:+8, smarts:+4 } }) },
      { label:"Don't go",         run:()=>({ text:"You stayed in and heard about it for a fortnight.", stats:{ happiness:-7 } }) },
    ]}},
{ id:"k_exam_streaming", min:12, max:15, w:4, auto:g=>chance(0.5)
    ? ({ text:"You were put in the top set and spent the year quietly terrified of being found out.", stats:{ smarts:+9, happiness:-3 } })
    : ({ text:"You were put in a lower set and something in you stopped trying quite as hard.", stats:{ smarts:-4, happiness:-8 } }) },
{ id:"k_role_model", min:11, max:16, w:4, auto:g=>{ const s=sib(g);
    return { text: s ? `You started copying ${s.name} — the music, the walk, the opinions — about six months behind.`
                     : `You attached yourself to somebody two years above and copied everything they did for a year.`,
             stats:{ happiness:+6, looks:+3, smarts:+2 }, relAdj:adj(s,+10) };} },
{ id:"k_caught_lying", min:9, max:16, w:4, choice:{
    text:"You have been caught in something that started small and got away from you.",
    choices:[
      { label:"Come clean, all of it", run:g=>({ text:"You told the whole thing. It was a bad hour and a good decision.", stats:{ happiness:-5, smarts:+8 }, relAdj:adj(parent(g),+10) }) },
      { label:"Admit the small part",  run:g=>chance(0.5)?({ text:"The small part was enough and the rest stayed buried.", stats:{ smarts:+5 } }):({ text:"The rest came out a week later and was ten times worse for the delay.", stats:{ happiness:-13 }, relAdj:adj(parent(g),-16) }) },
      { label:"Deny everything",       run:g=>({ text:"You held the line. They stopped believing things you said for about a year.", stats:{ happiness:-8 }, relAdj:adj(parent(g),-12) }) },
    ]}},
{ id:"k_first_funeral", min:8, max:16, w:3, auto:()=>({ text:`Your first funeral. ${pick(["You were surprised by how much people laughed.","Nobody explained anything and you worked most of it out from faces.","You were given a job to do and were grateful for it."])}`, stats:{ happiness:-10, smarts:+7 } }) },
{ id:"k_talent_found", min:10, max:16, w:4, auto:()=>({ text:`Somebody noticed you were unusually good at ${pick(["drawing","running","arguing","maths","fixing things","remembering everything"])} and said so out loud. You never forgot it.`, stats:{ smarts:+7, happiness:+11 }, kind:"good" }) },
{ id:"k_online_stranger", min:11, max:16, w:3, choice:{
    text:"Someone you've never met has been messaging you a lot and asking questions.",
    choices:[
      { label:"Block them", run:()=>({ text:"You blocked and reported and did not think about it again for years.", stats:{ smarts:+9, happiness:+3 }, kind:"good" }) },
      { label:"Tell someone", run:g=>({ text:"You showed a parent. It was awkward for ten minutes and then handled.", stats:{ smarts:+8, happiness:+2 }, relAdj:adj(parent(g),+8), kind:"good" }) },
      { label:"Keep talking",  run:()=>chance(0.5)?({ text:"It turned out to be a bored fifteen-year-old two towns over.", stats:{ happiness:+2 } }):({ text:"It got strange enough that you stopped on your own, and it sat with you.", stats:{ happiness:-14, smarts:+4 } }) },
    ]}},
{ id:"k_summer_endless", min:6, max:15, w:5, auto:g=>({ text:`One of those summers — ${pick(["a hosepipe and a slope","a bag of ice lollies and nowhere to be","a tent in the garden for a fortnight","the same three songs on repeat"])}. Ask you at eighty and this is what you'll describe.`, stats:{ happiness:+13, health:+3 }, kind:"good" }) },
];
